/**
 * GET /api/vendor/contracts
 *
 * Returns contracts that FAS has marked as visible to the authenticated vendor.
 * Vendors can view (not edit) their contracts — FAS staff manages them in Studio.
 *
 * Query params:
 *   limit        - max results (default: 20, max: 100)
 *   offset       - pagination offset (default: 0)
 *   contractType - filter by contract type (optional)
 *   status       - filter by status (optional)
 *
 * Response 200: { contracts: VendorContractSummary[], total: number, limit: number, offset: number }
 * Response 401/403: { error: string }
 */

import type {APIRoute} from 'astro'
import {requireVendorAuth, handleAuthError, jsonOk, jsonError} from '@/lib/vendorAuth'
import {sanityClient} from '@/sanity/lib/client'

const VALID_CONTRACT_TYPES = new Set([
  'wholesale_agreement',
  'nda',
  'pricing_terms',
  'service_agreement',
  'po_terms',
  'return_policy',
  'other',
])

const VALID_STATUSES = new Set([
  'draft',
  'pending_signature',
  'active',
  'expired',
  'terminated',
])

interface VendorContractSummary {
  _id: string
  title: string
  contractType: string
  status: string
  effectiveDate?: string
  expirationDate?: string
  autoRenew?: boolean
  signedAt?: string
  signedByName?: string
  description?: string
  contractFile?: {
    asset?: {
      url?: string
    }
  }
}

// Base filter: vendor match + visibleToVendor flag
const BASE_FILTER = `_type == "vendorContract" && vendorRef._ref == $vendorId && visibleToVendor == true`

const CONTRACTS_ALL_QUERY = `{
  "contracts": *[${BASE_FILTER}] | order(effectiveDate desc) [$offset...$end] {
    _id,
    title,
    contractType,
    status,
    effectiveDate,
    expirationDate,
    autoRenew,
    signedAt,
    signedByName,
    description,
    "contractFile": contractFile { "asset": asset-> { url } }
  },
  "total": count(*[${BASE_FILTER}])
}`

const CONTRACTS_TYPED_QUERY = `{
  "contracts": *[${BASE_FILTER} && contractType == $contractType] | order(effectiveDate desc) [$offset...$end] {
    _id,
    title,
    contractType,
    status,
    effectiveDate,
    expirationDate,
    autoRenew,
    signedAt,
    signedByName,
    description,
    "contractFile": contractFile { "asset": asset-> { url } }
  },
  "total": count(*[${BASE_FILTER} && contractType == $contractType])
}`

const CONTRACTS_STATUS_QUERY = `{
  "contracts": *[${BASE_FILTER} && status == $status] | order(effectiveDate desc) [$offset...$end] {
    _id,
    title,
    contractType,
    status,
    effectiveDate,
    expirationDate,
    autoRenew,
    signedAt,
    signedByName,
    description,
    "contractFile": contractFile { "asset": asset-> { url } }
  },
  "total": count(*[${BASE_FILTER} && status == $status])
}`

const CONTRACTS_TYPED_STATUS_QUERY = `{
  "contracts": *[${BASE_FILTER} && contractType == $contractType && status == $status] | order(effectiveDate desc) [$offset...$end] {
    _id,
    title,
    contractType,
    status,
    effectiveDate,
    expirationDate,
    autoRenew,
    signedAt,
    signedByName,
    description,
    "contractFile": contractFile { "asset": asset-> { url } }
  },
  "total": count(*[${BASE_FILTER} && contractType == $contractType && status == $status])
}`

export const GET: APIRoute = async ({request}) => {
  try {
    const {vendor} = await requireVendorAuth(request)

    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const contractType = url.searchParams.get('contractType') ?? null
    const status = url.searchParams.get('status') ?? null

    const limit = Math.min(parseInt(limitParam ?? '20', 10) || 20, 100)
    const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0)

    if (contractType !== null && !VALID_CONTRACT_TYPES.has(contractType)) {
      return jsonError(
        `Invalid contractType. Valid values: ${[...VALID_CONTRACT_TYPES].join(', ')}`,
        400,
      )
    }
    if (status !== null && !VALID_STATUSES.has(status)) {
      return jsonError(`Invalid status. Valid values: ${[...VALID_STATUSES].join(', ')}`, 400)
    }

    // Select query variant
    let query: string
    const params: Record<string, unknown> = {
      vendorId: vendor._id,
      offset,
      end: offset + limit,
    }

    if (contractType && status) {
      query = CONTRACTS_TYPED_STATUS_QUERY
      params.contractType = contractType
      params.status = status
    } else if (contractType) {
      query = CONTRACTS_TYPED_QUERY
      params.contractType = contractType
    } else if (status) {
      query = CONTRACTS_STATUS_QUERY
      params.status = status
    } else {
      query = CONTRACTS_ALL_QUERY
    }

    const result = await sanityClient.fetch<{contracts: VendorContractSummary[]; total: number}>(
      query,
      params,
    )

    return jsonOk({
      contracts: result.contracts ?? [],
      total: result.total ?? 0,
      limit,
      offset,
    })
  } catch (err) {
    return handleAuthError(err)
  }
}

export const POST: APIRoute = () =>
  new Response(JSON.stringify({error: 'Method not allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  })
