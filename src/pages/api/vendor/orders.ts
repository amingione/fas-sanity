/**
 * GET /api/vendor/orders
 *
 * Returns paginated wholesale orders for the authenticated vendor.
 * Orders are stored as vendorOrder documents in Sanity.
 *
 * Query params:
 *   limit   - max results (default: 20, max: 100)
 *   offset  - pagination offset (default: 0)
 *   status  - filter by order status (optional)
 *
 * Response 200: { orders: VendorOrderSummary[], total: number, limit: number, offset: number }
 * Response 401/403: { error: string }
 */

import type {APIRoute} from 'astro'
import {requireVendorAuth, requirePermission, handleAuthError, jsonOk, jsonError} from '@/lib/vendorAuth'
import {sanityClient} from '@/sanity/lib/client'

const VALID_STATUSES = new Set(['pending', 'processing', 'partially_fulfilled', 'fulfilled', 'cancelled'])

interface VendorOrderSummary {
  _id: string
  orderNumber: string
  status: string
  createdAt: string
  currency: string
  amountSubtotal: number
  amountTax: number
  amountShipping: number
  totalAmount: number
  itemCount: number
  notes?: string
}

// GROQ — paginated vendor orders with cart item count
const VENDOR_ORDERS_QUERY = `{
  "orders": *[
    _type == "vendorOrder" &&
    vendor._ref == $vendorId
    ${`\$status != null`} => [status == $status]
  ] | order(createdAt desc) [$offset...$end] {
    _id,
    orderNumber,
    status,
    createdAt,
    currency,
    amountSubtotal,
    amountTax,
    amountShipping,
    totalAmount,
    "itemCount": count(cart),
    notes
  },
  "total": count(*[_type == "vendorOrder" && vendor._ref == $vendorId])
}`

// Separate queries for filtered vs unfiltered (GROQ doesn't support optional filters cleanly)
const VENDOR_ORDERS_FILTERED_QUERY = `{
  "orders": *[
    _type == "vendorOrder" &&
    vendor._ref == $vendorId &&
    status == $status
  ] | order(createdAt desc) [$offset...$end] {
    _id,
    orderNumber,
    status,
    createdAt,
    currency,
    amountSubtotal,
    amountTax,
    amountShipping,
    totalAmount,
    "itemCount": count(cart),
    notes
  },
  "total": count(*[_type == "vendorOrder" && vendor._ref == $vendorId && status == $status])
}`

const VENDOR_ORDERS_ALL_QUERY = `{
  "orders": *[
    _type == "vendorOrder" &&
    vendor._ref == $vendorId
  ] | order(createdAt desc) [$offset...$end] {
    _id,
    orderNumber,
    status,
    createdAt,
    currency,
    amountSubtotal,
    amountTax,
    amountShipping,
    totalAmount,
    "itemCount": count(cart),
    notes
  },
  "total": count(*[_type == "vendorOrder" && vendor._ref == $vendorId])
}`

export const GET: APIRoute = async ({request}) => {
  try {
    const {vendor, token} = await requireVendorAuth(request)
    requirePermission(token, 'view_own_orders')

    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const status = url.searchParams.get('status') ?? null

    const limit = Math.min(parseInt(limitParam ?? '20', 10) || 20, 100)
    const offset = Math.max(parseInt(offsetParam ?? '0', 10) || 0, 0)

    if (status !== null && !VALID_STATUSES.has(status)) {
      return jsonError(`Invalid status filter. Valid values: ${[...VALID_STATUSES].join(', ')}`, 400)
    }

    const result = await sanityClient.fetch<{orders: VendorOrderSummary[]; total: number}>(
      status ? VENDOR_ORDERS_FILTERED_QUERY : VENDOR_ORDERS_ALL_QUERY,
      {vendorId: vendor._id, offset, end: offset + limit, ...(status ? {status} : {})},
    )

    return jsonOk({
      orders: result.orders ?? [],
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
