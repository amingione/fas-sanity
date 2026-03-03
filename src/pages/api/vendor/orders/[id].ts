/**
 * GET /api/vendor/orders/[id]
 *
 * Returns a single vendorOrder document for the authenticated vendor.
 * Enforces vendor ownership — vendors can only access their own orders.
 *
 * Param: id — Sanity document _id
 *
 * Response 200: { order: VendorOrderDetail }
 * Response 401/403/404: { error: string }
 */

import type {APIRoute} from 'astro'
import {requireVendorAuth, requirePermission, handleAuthError, jsonOk, jsonError} from '@/lib/vendorAuth'
import {sanityClient} from '@/sanity/lib/client'

interface CartItem {
  _key: string
  name?: string
  sku?: string
  quantity?: number
  price?: number
  total?: number
  productRef?: {_ref: string}
}

interface VendorOrderDetail {
  _id: string
  orderNumber: string
  status: string
  createdAt: string
  currency: string
  amountSubtotal: number
  amountTax: number
  amountShipping: number
  totalAmount: number
  cart: CartItem[]
  notes?: string
  vendor?: {
    _id: string
    companyName: string
  }
}

// GROQ — single order, enforces vendor ownership via filter
const VENDOR_ORDER_DETAIL_QUERY = `*[
  _type == "vendorOrder" &&
  _id == $orderId &&
  vendor._ref == $vendorId
][0]{
  _id,
  orderNumber,
  status,
  createdAt,
  currency,
  amountSubtotal,
  amountTax,
  amountShipping,
  totalAmount,
  cart[] {
    _key,
    name,
    sku,
    quantity,
    price,
    total,
    productRef
  },
  notes,
  "vendor": vendor-> { _id, companyName }
}`

export const GET: APIRoute = async ({request, params}) => {
  try {
    const {vendor, token} = await requireVendorAuth(request)
    requirePermission(token, 'view_own_orders')

    const orderId = params.id
    if (!orderId || typeof orderId !== 'string' || orderId.trim().length === 0) {
      return jsonError('Order ID is required', 400)
    }

    const order = await sanityClient.fetch<VendorOrderDetail | null>(VENDOR_ORDER_DETAIL_QUERY, {
      orderId: orderId.trim(),
      vendorId: vendor._id,
    })

    if (!order) {
      return jsonError('Order not found', 404)
    }

    return jsonOk({order})
  } catch (err) {
    return handleAuthError(err)
  }
}

export const POST: APIRoute = () =>
  new Response(JSON.stringify({error: 'Method not allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  })
