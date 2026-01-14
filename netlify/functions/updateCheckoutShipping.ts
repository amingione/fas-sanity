import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'
import {
  getEasyPostClient,
  resolveDimensions,
  resolveWeight,
  type DimensionsInput,
  type WeightInput,
} from '../lib/easypostClient'
import {getEasyPostFromAddress} from '../lib/ship-from'
import {getEasyPostParcelMissingFields} from '../lib/easypostValidation'

const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')

function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) o = origin
    else if (DEFAULT_ORIGINS.includes(origin)) o = origin
  }
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe = stripeSecret ? new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION}) : null

const sanityProjectId = process.env.SANITY_STUDIO_PROJECT_ID
const sanityDataset = process.env.SANITY_STUDIO_DATASET
const sanity =
  sanityProjectId && sanityDataset
    ? createClient({
        projectId: sanityProjectId,
        dataset: sanityDataset,
        apiVersion: process.env.SANITY_STUDIO_API_VERSION || '2024-04-10',
        token: process.env.SANITY_API_TOKEN,
        useCdn: false,
      })
    : null

type StripeAddress = {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

type ShippingDetails = {
  address?: StripeAddress
  name?: string
}

type ProductShippingSnapshot = {
  _id: string
  title?: string
  shippingWeight?: number | null
  shippingConfig?: {
    weight?: number | null
    dimensions?: {length?: number | null; width?: number | null; height?: number | null} | null
  } | null
}

const toPositiveNumber = (value?: unknown): number | null => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

const resolveProductWeight = (product?: ProductShippingSnapshot | null): number | null => {
  if (!product) return null
  const configWeight = toPositiveNumber(product.shippingConfig?.weight)
  if (configWeight !== null) return configWeight
  return toPositiveNumber(product.shippingWeight)
}

const resolveProductDimensions = (
  product?: ProductShippingSnapshot | null,
): {length: number; width: number; height: number} | null => {
  if (!product) return null
  const dims = product.shippingConfig?.dimensions
  if (!dims) return null
  const length = toPositiveNumber(dims.length)
  const width = toPositiveNumber(dims.width)
  const height = toPositiveNumber(dims.height)
  if (length === null || width === null || height === null) return null
  return {length, width, height}
}

/**
 * Calculate package weight and dimensions from Stripe line items
 */
async function calculatePackageDetailsFromLineItems(
  lineItems: Stripe.LineItem[],
): Promise<{weight: WeightInput; dimensions: DimensionsInput}> {
  const defaultDims = {
    length: Number(process.env.DEFAULT_PACKAGE_LENGTH_IN || 12),
    width: Number(process.env.DEFAULT_PACKAGE_WIDTH_IN || 9),
    height: Number(process.env.DEFAULT_PACKAGE_HEIGHT_IN || 4),
  }

  let totalWeight = 0
  let maxLength = defaultDims.length
  let maxWidth = defaultDims.width
  let maxHeight = 0

  const productIds = new Set<string>()
  for (const item of lineItems) {
    const product = item.price?.product as Stripe.Product | string | undefined
    if (typeof product === 'object' && product?.metadata?.sanity_product_id) {
      productIds.add(product.metadata.sanity_product_id)
    }
  }

  let productMap = new Map<string, ProductShippingSnapshot>()
  if (productIds.size && sanity) {
    try {
      const products = await sanity.fetch<ProductShippingSnapshot[]>(
        `*[_type == "product" && _id in $ids]{
          _id,
          title,
          shippingWeight,
          shippingConfig{
            weight,
            dimensions{
              length,
              width,
              height
            }
          }
        }`,
        {ids: Array.from(productIds)},
      )
      productMap = new Map((products || []).map((product) => [product._id, product]))
    } catch (err) {
      console.warn('updateCheckoutShipping: failed to load product shipping data', err)
    }
  }

  for (const item of lineItems) {
    const quantity = item.quantity || 1
    const product = item.price?.product as Stripe.Product | string | undefined
    let productWeight: number | null = null
    let productDims: {length: number; width: number; height: number} | null = null

    if (typeof product === 'object' && product?.metadata) {
      const sanityProductId = product.metadata.sanity_product_id
      if (sanityProductId) {
        const sanityProduct = productMap.get(sanityProductId)
        productWeight = resolveProductWeight(sanityProduct)
        productDims = resolveProductDimensions(sanityProduct)
      }

      // Fallback to metadata if available
      if (!productWeight && product.metadata.weight) {
        productWeight = toPositiveNumber(product.metadata.weight)
      }
      if (!productDims && product.metadata.length && product.metadata.width && product.metadata.height) {
        const len = toPositiveNumber(product.metadata.length)
        const wid = toPositiveNumber(product.metadata.width)
        const ht = toPositiveNumber(product.metadata.height)
        if (len && wid && ht) {
          productDims = {length: len, width: wid, height: ht}
        }
      }
    }

    if (productWeight) {
      totalWeight += productWeight * quantity
    }

    if (productDims) {
      maxLength = Math.max(maxLength, productDims.length)
      maxWidth = Math.max(maxWidth, productDims.width)
      maxHeight += productDims.height * quantity
    }
  }

  const fallbackWeight = Number(process.env.DEFAULT_PACKAGE_WEIGHT_LBS || 5) || 1
  const finalWeight = totalWeight > 0 ? totalWeight : fallbackWeight
  const finalHeight = maxHeight > 0 ? maxHeight : defaultDims.height

  return {
    weight: {value: finalWeight, unit: 'pound'},
    dimensions: {
      length: maxLength,
      width: maxWidth,
      height: finalHeight,
      unit: 'inch',
    },
  }
}

/**
 * Convert Stripe address to EasyPost address format
 */
function stripeAddressToEasyPost(address: StripeAddress): {
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
} | null {
  if (!address.line1 || !address.city || !address.state || !address.postal_code || !address.country) {
    return null
  }
  return {
    street1: address.line1,
    street2: address.line2,
    city: address.city,
    state: address.state,
    zip: address.postal_code,
    country: address.country,
  }
}

/**
 * Format EasyPost rate as Stripe shipping option with Parcelcraft-compatible metadata
 */
function formatRateAsStripeShippingOption(rate: any): Stripe.Checkout.SessionCreateParams.ShippingOption {
  const amount = Number.parseFloat(rate?.rate || '0')
  const amountCents = Math.round(amount * 100)

  // Calculate delivery estimate from delivery_days
  const deliveryDays = typeof rate?.delivery_days === 'number' ? rate.delivery_days : null
  const deliveryEstimate = deliveryDays
    ? {
        minimum: {unit: 'business_day' as const, value: Math.max(1, deliveryDays - 1)},
        maximum: {unit: 'business_day' as const, value: deliveryDays + 1},
      }
    : undefined

  // Parcelcraft-compatible metadata
  const metadata: Stripe.MetadataParam = {
    easypost_rate_id: rate?.id || '',
    carrier: rate?.carrier || '',
    carrier_id: rate?.carrier_account_id || '',
    service: rate?.service || '',
    service_code: rate?.service_code || '',
  }

  return {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: {amount: amountCents, currency: 'usd'},
      display_name: `${rate?.carrier_display_name || rate?.carrier || 'Shipping'} ${rate?.service || ''}`.trim(),
      delivery_estimate: deliveryEstimate,
      metadata,
    },
  }
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!stripe) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Stripe not configured'}),
    }
  }

  let payload: Record<string, any> = {}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON'}),
    }
  }

  const checkoutSessionId = typeof payload.checkoutSessionId === 'string' ? payload.checkoutSessionId.trim() : ''
  const shippingDetails: ShippingDetails = payload.shippingDetails || {}

  if (!checkoutSessionId) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing checkoutSessionId'}),
    }
  }

  if (!shippingDetails.address) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing shipping address'}),
    }
  }

  try {
    // Retrieve checkout session to get line items
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ['line_items.data.price.product'],
    })

    if (session.mode !== 'payment') {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Session must be in payment mode'}),
      }
    }

    if (session.ui_mode !== 'embedded') {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Session must be in embedded mode'}),
      }
    }

    const lineItems = session.line_items?.data || []
    if (!lineItems.length) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'No line items in session'}),
      }
    }

    // Calculate package details from line items
    const packageDetails = await calculatePackageDetailsFromLineItems(lineItems)
    const weight = resolveWeight(packageDetails.weight, null)
    const dimensions = resolveDimensions(packageDetails.dimensions, null)

    // Convert Stripe address to EasyPost format
    const shipTo = stripeAddressToEasyPost(shippingDetails.address)
    if (!shipTo) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invalid shipping address'}),
      }
    }

    const shipFrom = getEasyPostFromAddress()

    // Create EasyPost parcel
    const parcel = {
      length: dimensions.length,
      width: dimensions.width,
      height: dimensions.height,
      weight: Math.max(1, Number(weight.ounces.toFixed(2))),
    }

    const missingParcel = getEasyPostParcelMissingFields(parcel)
    if (missingParcel.length) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: `Missing parcel fields: ${missingParcel.join(', ')}`}),
      }
    }

    // Get EasyPost rates
    const client = getEasyPostClient()
    const shipment = await client.Shipment.create({
      to_address: shipTo,
      from_address: shipFrom,
      parcel,
    } as any)

    const rates = Array.isArray(shipment?.rates) ? shipment.rates : []
    if (!rates.length) {
      return {
        statusCode: 500,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'No shipping rates available'}),
      }
    }

    // Format rates as Stripe shipping options
    const shippingOptions = rates
      .map((rate: any) => formatRateAsStripeShippingOption(rate))
      .filter((option) => option.shipping_rate_data.fixed_amount.amount > 0)
      .slice(0, 10) // Limit to 10 options

    // Update checkout session with shipping options
    // Note: Stripe expects 'shipping' not 'shipping_details' when updating
    const updatedSession = await stripe.checkout.sessions.update(checkoutSessionId, {
      shipping_options: shippingOptions,
      shipping: shippingDetails.address
        ? {
            name: shippingDetails.name,
            address: shippingDetails.address,
          }
        : undefined,
    })

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        success: true,
        shippingOptions: shippingOptions.length,
        sessionId: updatedSession.id,
      }),
    }
  } catch (err: any) {
    console.error('updateCheckoutShipping error:', err)
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Failed to update shipping'}),
    }
  }
}
