import {randomUUID} from 'crypto'
import type {Handler} from '@netlify/functions'
import type {VendorPricingTier} from '../../shared/vendorPricing'
import {
  calculateTotals,
  ensureSanityClient,
  generateWholesaleOrderNumber,
  priceWholesaleCart,
  resolveEffectiveTier,
  resolveVendor,
  WHOLESALE_ORDER_HISTORY_QUERY,
  type PricedWholesaleCartItem,
  type WholesaleCartItemInput,
} from '../lib/wholesale'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const parseTier = (value?: string | null): VendorPricingTier | undefined => {
  const normalized = value?.toString().trim().toLowerCase()
  if (!normalized) return undefined
  return ['standard', 'preferred', 'platinum', 'custom'].includes(normalized as VendorPricingTier)
    ? (normalized as VendorPricingTier)
    : undefined
}

const parseBody = (raw: string | null): any => {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const buildOrderCart = (items: PricedWholesaleCartItem[]) =>
  items.map((item) => ({
    _type: 'orderCartItem',
    _key: randomUUID(),
    name: item.name,
    sku: item.sku,
    productRef: {_type: 'reference', _ref: item.productId},
    quantity: item.quantity,
    price: item.unitPrice,
    lineTotal: item.lineTotal,
    total: item.lineTotal,
  }))

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: corsHeaders}

  const method = (event.httpMethod || 'GET').toUpperCase()
  const body = parseBody(event.body || null)

  try {
    const vendor = await resolveVendor({
      vendorId: event.queryStringParameters?.vendorId || body.vendorId,
      vendorEmail: event.queryStringParameters?.vendorEmail || body.vendorEmail,
      authorization: event.headers?.authorization || null,
    })
    if (!vendor) {
      return {statusCode: 401, headers: corsHeaders, body: JSON.stringify({error: 'Vendor authorization required'})}
    }

    if (method === 'GET') {
      const client = ensureSanityClient()
      const orders = await client.fetch(WHOLESALE_ORDER_HISTORY_QUERY, {vendorId: vendor._id})
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({orders, vendor: {_id: vendor._id}}),
      }
    }

    if (method !== 'POST') {
      return {statusCode: 405, headers: corsHeaders, body: JSON.stringify({error: 'Method not allowed'})}
    }

    const items = Array.isArray(body?.cart) ? (body.cart as WholesaleCartItemInput[]) : []
    if (!items.length) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Cart is empty'})}
    }

    const hasWriteToken =
      process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN || process.env.SANITY_ACCESS_TOKEN
    if (!hasWriteToken) {
      return {
        statusCode: 503,
        headers: corsHeaders,
        body: JSON.stringify({error: 'Server missing Sanity write token'}),
      }
    }

    const {tier, customDiscount} = resolveEffectiveTier(vendor, parseTier(body.pricingTier))
    const shipping = Number.isFinite(Number(body.shipping)) ? Number(body.shipping) : undefined
    const taxRate = Number.isFinite(Number(body.taxRate)) ? Number(body.taxRate) : undefined
    const cart = await priceWholesaleCart(items, {tier, customDiscount})
    const totals = calculateTotals(cart, {shipping, taxRate})
    const client = ensureSanityClient()

    const orderNumber = await generateWholesaleOrderNumber(client)
    const nowIso = new Date().toISOString()
    const orderDoc = {
      _type: 'order',
      orderNumber,
      orderType: 'wholesale',
      status: 'paid',
      currency: 'USD',
      wholesaleDetails: {
        workflowStatus: 'requested',
      },
      customerName: vendor.companyName,
      customerEmail: vendor.portalAccess?.email || vendor.primaryContact?.email,
      customerRef: {_type: 'reference', _ref: vendor._id},
      cart: buildOrderCart(cart),
      amountSubtotal: totals.subtotal,
      amountTax: totals.tax,
      amountShipping: totals.shipping,
      totalAmount: totals.total,
      createdAt: nowIso,
    }

    const created = await client.create(orderDoc, {autoGenerateArrayKeys: true})

    await client
      .patch(vendor._id)
      .setIfMissing({totalOrders: 0, totalRevenue: 0, currentBalance: 0})
      .set({lastOrderDate: nowIso})
      .inc({totalOrders: 1, totalRevenue: totals.total, currentBalance: totals.total})
      .commit({autoGenerateArrayKeys: true})

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        order: {
          _id: created._id,
          orderNumber: created.orderNumber,
          totalAmount: created.totalAmount,
          status: created.status,
          workflowStatus: created.wholesaleDetails?.workflowStatus || null,
        },
      }),
    }
  } catch (error) {
    console.error('[wholesale-orders] failed', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return {statusCode: 500, headers: corsHeaders, body: JSON.stringify({error: message})}
  }
}

export default handler
