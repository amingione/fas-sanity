import type {Handler} from '@netlify/functions'
import type {VendorPricingTier} from '../../shared/vendorPricing'
import {
  calculateTotals,
  priceWholesaleCart,
  resolveEffectiveTier,
  resolveVendor,
  type WholesaleCartItemInput,
} from '../lib/wholesale'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
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

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: corsHeaders}
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: corsHeaders, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const body = parseBody(event.body || null)
    const items = Array.isArray(body?.items) ? (body.items as WholesaleCartItemInput[]) : []
    if (!items.length) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Cart is empty'})}
    }

    const vendor = await resolveVendor({
      vendorId: body.vendorId,
      vendorEmail: body.vendorEmail,
      authorization: event.headers?.authorization || null,
    })
    if (!vendor) {
      return {statusCode: 401, headers: corsHeaders, body: JSON.stringify({error: 'Vendor authorization required'})}
    }

    const {tier, customDiscount} = resolveEffectiveTier(vendor, parseTier(body.pricingTier))
    const shipping = Number.isFinite(Number(body.shipping)) ? Number(body.shipping) : undefined
    const taxRate = Number.isFinite(Number(body.taxRate)) ? Number(body.taxRate) : undefined
    const cart = await priceWholesaleCart(items, {tier, customDiscount})
    const totals = calculateTotals(cart, {
      shipping,
      taxRate,
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        cart,
        totals,
        vendor: {_id: vendor._id, tier, email: vendor.portalAccess?.email || vendor.primaryContact?.email},
      }),
    }
  } catch (error) {
    console.error('[wholesale-cart] failed', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return {statusCode: 500, headers: corsHeaders, body: JSON.stringify({error: message})}
  }
}

export default handler
