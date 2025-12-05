import type {Handler} from '@netlify/functions'
import type {VendorPricingTier} from '../../shared/vendorPricing'
import {
  ensureSanityClient,
  mapWholesaleProductPricing,
  resolveEffectiveTier,
  resolveVendor,
  WHOLESALE_PRODUCT_BY_SLUG_QUERY,
  WHOLESALE_PRODUCTS_BY_CATEGORY_QUERY,
  WHOLESALE_PRODUCTS_QUERY,
  type WholesaleProduct,
} from '../lib/wholesale'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const parseTier = (value?: string | null): VendorPricingTier | undefined => {
  const normalized = value?.toString().trim().toLowerCase()
  if (!normalized) return undefined
  return ['standard', 'preferred', 'platinum', 'custom'].includes(normalized as VendorPricingTier)
    ? (normalized as VendorPricingTier)
    : undefined
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: corsHeaders}
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, headers: corsHeaders, body: JSON.stringify({error: 'Method not allowed'})}
  }

  try {
    const client = ensureSanityClient()
    const params = event.queryStringParameters || {}
    const vendor = await resolveVendor({
      vendorId: params.vendorId,
      vendorEmail: params.vendorEmail,
      authorization: event.headers?.authorization || null,
    })
    if (!vendor) {
      return {statusCode: 401, headers: corsHeaders, body: JSON.stringify({error: 'Vendor authorization required'})}
    }

    const {tier, customDiscount} = resolveEffectiveTier(vendor, parseTier(params.pricingTier))
    const availableOnly = params.available === 'true'
    const categoryId = params.categoryId
    const slug = params.slug

    if (slug) {
      const product = await client.fetch<WholesaleProduct | null>(WHOLESALE_PRODUCT_BY_SLUG_QUERY, {slug})
      if (!product) {
        return {statusCode: 404, headers: corsHeaders, body: JSON.stringify({error: 'Product not found'})}
      }
      const enriched = mapWholesaleProductPricing(product, tier, customDiscount)
      if (availableOnly && !enriched.inStock) {
        return {statusCode: 404, headers: corsHeaders, body: JSON.stringify({error: 'Product not available'})}
      }
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          product: enriched,
          vendor: {_id: vendor._id, tier, email: vendor.portalAccess?.email || vendor.primaryContact?.email},
        }),
      }
    }

    const query = categoryId ? WHOLESALE_PRODUCTS_BY_CATEGORY_QUERY : WHOLESALE_PRODUCTS_QUERY
    const variables = categoryId ? {categoryId} : {}
    const raw = await client.fetch<WholesaleProduct[]>(query, variables)
    const products = raw
      .map((product) => mapWholesaleProductPricing(product, tier, customDiscount))
      .filter((product) => (availableOnly ? product.inStock : true))

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        products,
        vendor: {_id: vendor._id, tier, email: vendor.portalAccess?.email || vendor.primaryContact?.email},
      }),
    }
  } catch (error) {
    console.error('[wholesale-catalog] failed', error)
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return {statusCode: 500, headers: corsHeaders, body: JSON.stringify({error: message})}
  }
}

export default handler
