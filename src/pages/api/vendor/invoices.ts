/**
 * GET /api/vendor/invoices
 *
 * Returns paginated invoices for the authenticated vendor.
 * Requires the view_payments permission scope.
 *
 * Query params:
 *   limit   - max results (default: 20, max: 100)
 *   offset  - pagination offset (default: 0)
 *   status  - filter by invoice status (optional)
 *
 * Response 200: { invoices: VendorInvoiceSummary[], total: number, limit: number, offset: number }
 * Response 401/403: { error: string }
 */

import type {APIRoute} from 'astro'
import {requireVendorAuth, requirePermission, handleAuthError, jsonOk, jsonError} from '@/lib/vendorAuth'
import {sanityClient} from '@/sanity/lib/client'

const VALID_STATUSES = new Set([
  'draft',
  'pending',
  'sent',
  'paid',
  'partially_paid',
  'overdue',
  'cancelled',
])

interface VendorInvoiceSummary {
  _id: string
  invoiceNumber?: string
  orderNumber?: string
  status: string
  invoiceDate?: string
  dueDate?: string
  currency: string
  subtotal?: number
  total?: number
  amountPaid?: number
  amountDue?: number
  trackingNumber?: string
}

const INVOICES_ALL_QUERY = `{
  "invoices": *[
    _type == "invoice" &&
    vendorRef._ref == $vendorId
  ] | order(invoiceDate desc) [$offset...$end] {
    _id,
    invoiceNumber,
    orderNumber,
    status,
    invoiceDate,
    dueDate,
    currency,
    subtotal,
    total,
    amountPaid,
    amountDue,
    trackingNumber
  },
  "total": count(*[_type == "invoice" && vendorRef._ref == $vendorId])
}`

const INVOICES_FILTERED_QUERY = `{
  "invoices": *[
    _type == "invoice" &&
    vendorRef._ref == $vendorId &&
    status == $status
  ] | order(invoiceDate desc) [$offset...$end] {
    _id,
    invoiceNumber,
    orderNumber,
    status,
    invoiceDate,
    dueDate,
    currency,
    subtotal,
    total,
    amountPaid,
    amountDue,
    trackingNumber
  },
  "total": count(*[_type == "invoice" && vendorRef._ref == $vendorId && status == $status])
}`

export const GET: APIRoute = async ({request}) => {
  try {
    const {vendor, token} = await requireVendorAuth(request)
    requirePermission(token, 'view_payments')

    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const status = url.searchParams.get('status') ?? null

    const limit = Math.min(parseInt(limitParam ?? '20', 10) || 20, 100)
    const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0)

    if (status !== null && !VALID_STATUSES.has(status)) {
      return jsonError(`Invalid status filter. Valid values: ${[...VALID_STATUSES].join(', ')}`, 400)
    }

    const result = await sanityClient.fetch<{invoices: VendorInvoiceSummary[]; total: number}>(
      status ? INVOICES_FILTERED_QUERY : INVOICES_ALL_QUERY,
      {vendorId: vendor._id, offset, end: offset + limit, ...(status ? {status} : {})},
    )

    return jsonOk({
      invoices: result.invoices ?? [],
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
