import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

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
const stripe = stripeSecret
  ? new Stripe(stripeSecret, {apiVersion: '2024-11-20.acacia' as any})
  : null

const sanityProjectId = process.env.SANITY_STUDIO_PROJECT_ID
const sanityDataset = process.env.SANITY_STUDIO_DATASET
const sanity =
  sanityProjectId && sanityDataset
    ? createClient({
        projectId: sanityProjectId,
        dataset: sanityDataset,
        apiVersion: process.env.SANITY_API_VERSION || '2024-04-10',
        token: process.env.SANITY_API_TOKEN,
        useCdn: false,
      })
    : null

type ShippingRate = {
  rateId?: string
  carrier?: string
  carrierId?: string
  carrierCode?: string
  service?: string
  serviceCode?: string
  amount?: number
  deliveryDays?: number | null
}

const normalizeSanityId = (value?: string | null): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
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

const resolveCartQuantity = (value?: unknown): number => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 1
  return Math.max(1, Math.round(num))
}

async function determineCaptureStrategy(cart: any[]): Promise<'auto' | 'manual'> {
  if (!sanity || !cart.length) return 'auto'
  const ids = Array.from(
    new Set(
      cart
        .map((item) => {
          const refId =
            typeof item?.productId === 'string'
              ? item.productId
              : typeof item?._id === 'string'
                ? item._id
                : typeof item?.productRef?._ref === 'string'
                  ? item.productRef._ref
                  : undefined
          return normalizeSanityId(refId)
        })
        .filter(Boolean) as string[],
    ),
  )
  if (!ids.length) return 'auto'

  type ProductDoc = {
    _id: string
    paymentCaptureStrategy?: 'auto' | 'manual'
    customPaint?: {enabled?: boolean}
    shippingConfig?: {handlingTime?: number}
    serviceDeliveryModel?: string
    productType?: string
  }

  try {
    const products = await sanity.fetch<ProductDoc[]>(
      `*[_type == "product" && _id in $ids]{
        _id,
        paymentCaptureStrategy,
        customPaint{enabled},
        shippingConfig{handlingTime},
        serviceDeliveryModel,
        productType
      }`,
      {ids},
    )

    const requiresManual = products.some((product) => {
      if (!product) return false
      if (product.paymentCaptureStrategy === 'manual') return true
      if (product.paymentCaptureStrategy === 'auto') return false
      const handling = Number(product.shippingConfig?.handlingTime || 0)
      const hasCustomPaint = Boolean(product.customPaint?.enabled)
      const isMailIn = product.serviceDeliveryModel === 'mail-in-service'
      const isService = product.productType === 'service'
      return hasCustomPaint || handling > 3 || isMailIn || isService
    })

    return requiresManual ? 'manual' : 'auto'
  } catch (err) {
    console.warn('createCheckoutSession: failed to determine capture strategy', err)
    return 'auto'
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

  const cart = Array.isArray(payload.cart) ? payload.cart : []
  const shippingRate: ShippingRate | undefined = payload.shippingRate
  const customerEmail =
    typeof payload.customerEmail === 'string' ? payload.customerEmail.trim() : undefined

  if (!cart.length || !shippingRate) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing cart or shippingRate'}),
    }
  }

  type NormalizedCartItem = {
    name: string
    quantity: number
    price?: number
    stripePriceId?: string
    images: string[]
    metadata: Stripe.MetadataParam
    sanityProductId?: string
  }

  const normalizedCart = cart
    .map((item: any): NormalizedCartItem | null => {
      if (!item || typeof item !== 'object') return null
      const quantity = resolveCartQuantity(item.quantity)
      const images =
        typeof item?.image === 'string' && item.image.trim() ? [item.image.trim()] : []
      const metadata: Stripe.MetadataParam = {}
      const sanityProductId =
        normalizeSanityId(
          item?._id ||
            item?.productId ||
            item?.product?._id ||
            item?.productRef?._ref ||
            item?.product?._ref,
        ) || undefined
      if (sanityProductId) metadata.sanity_product_id = sanityProductId
      const sku = typeof item?.sku === 'string' && item.sku.trim() ? item.sku.trim() : undefined
      if (sku) metadata.sku = sku
      const stripePriceId = item?.stripePriceId ? String(item.stripePriceId) : undefined
      const price = Number(item?.price)
      if (!stripePriceId && (!Number.isFinite(price) || price < 0)) return null
      return {
        name: item?.title || item?.name || 'Item',
        quantity,
        price: Number.isFinite(price) && price >= 0 ? price : undefined,
        stripePriceId,
        images,
        metadata,
        sanityProductId,
      }
    })
    .filter(Boolean) as NormalizedCartItem[]

  if (!normalizedCart.length) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'No valid line items in cart'}),
    }
  }

  const productIds = Array.from(
    new Set(
      normalizedCart
        .map((item) => item.sanityProductId)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  let productMap = new Map<string, ProductShippingSnapshot>()
  if (productIds.length && sanity) {
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
        {ids: productIds},
      )
      productMap = new Map((products || []).map((product) => [product._id, product]))
    } catch (err) {
      console.warn('createCheckoutSession: failed to load product shipping data', err)
    }
  }

  const weightSummary = normalizedCart.reduce((total, item) => {
    if (!item.sanityProductId) return total
    const product = productMap.get(item.sanityProductId)
    const weight = resolveProductWeight(product)
    if (!weight) return total
    return total + weight * item.quantity
  }, 0)

  type DimensionsSummary = {length: number; width: number; height: number}
  const dimensionsSummary = normalizedCart.reduce<DimensionsSummary | null>((acc, item) => {
    if (!item.sanityProductId) return acc
    const product = productMap.get(item.sanityProductId)
    const dims = resolveProductDimensions(product)
    if (!dims) return acc
    const next = acc || {length: 0, width: 0, height: 0}
    next.length = Math.max(next.length, dims.length)
    next.width = Math.max(next.width, dims.width)
    next.height += dims.height * item.quantity
    return next
  }, null)

  const lineItems = normalizedCart
    .map((item) => {
      if (item.stripePriceId) {
        return {
          price: item.stripePriceId,
          quantity: item.quantity,
        }
      }
      if (typeof item.price !== 'number') return null
      const unitAmount = Math.round(item.price * 100)
      if (!Number.isFinite(unitAmount) || unitAmount < 0) return null
      const product = item.sanityProductId ? productMap.get(item.sanityProductId) : undefined
      const metadata: Stripe.MetadataParam = {...item.metadata}
      const productWeight = resolveProductWeight(product)
      if (productWeight) metadata.weight_lbs = productWeight.toString()
      const dims = resolveProductDimensions(product)
      if (dims) {
        metadata.length_in = dims.length.toString()
        metadata.width_in = dims.width.toString()
        metadata.height_in = dims.height.toString()
      }
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: product?.title || item.name || 'Item',
            images: item.images,
            metadata: Object.keys(metadata).length ? metadata : undefined,
          },
          unit_amount: unitAmount,
          tax_behavior: 'exclusive',
        },
        quantity: item.quantity,
      }
    })
    .filter(Boolean) as Stripe.Checkout.SessionCreateParams.LineItem[]

  if (!lineItems.length) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'No valid line items in cart'}),
    }
  }

  const amountCents = Math.round(Number(shippingRate.amount || 0) * 100)
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid shipping amount'}),
    }
  }

  const deliveryDays = Number(shippingRate.deliveryDays)
  const deliveryEstimate =
    Number.isFinite(deliveryDays) && deliveryDays > 0
      ? {
          minimum: {unit: 'business_day' as const, value: Math.max(1, Math.floor(deliveryDays))},
          maximum: {unit: 'business_day' as const, value: Math.max(1, Math.ceil(deliveryDays + 2))},
        }
      : undefined

  const shippingMetadata: Stripe.MetadataParam = {}
  const pushMeta = (key: string, value: unknown) => {
    if (value === undefined || value === null) return
    const raw = typeof value === 'number' ? value.toString() : `${value}`
    if (raw.trim()) shippingMetadata[key] = raw.trim()
  }

  pushMeta('easypost_rate_id', shippingRate.rateId)
  pushMeta('carrier_id', shippingRate.carrierId || shippingRate.carrierCode)
  pushMeta('service_code', shippingRate.serviceCode)
  pushMeta('carrier', shippingRate.carrier)
  pushMeta('service', shippingRate.service)
  pushMeta('shipping_amount', (Number(shippingRate.amount || 0) || 0).toFixed(2))
  if (weightSummary > 0) {
    pushMeta('total_weight_lbs', Number(weightSummary.toFixed(2)))
  }
  if (dimensionsSummary) {
    pushMeta('package_length_in', Number(dimensionsSummary.length.toFixed(2)))
    pushMeta('package_width_in', Number(dimensionsSummary.width.toFixed(2)))
    pushMeta('package_height_in', Number(dimensionsSummary.height.toFixed(2)))
  }

  const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
    {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {amount: amountCents, currency: 'usd'},
        display_name: `${shippingRate.carrier || 'Shipping'} ${shippingRate.service || ''}`.trim(),
        delivery_estimate: deliveryEstimate,
        metadata: shippingMetadata,
      },
    },
  ]

  const sessionMetadata: Stripe.MetadataParam = {
    easypost_rate_id: shippingRate.rateId || '',
    shipping_carrier: shippingRate.carrier || '',
    shipping_service: shippingRate.service || '',
    shipping_amount: (Number(shippingRate.amount || 0) || 0).toFixed(2),
  }
  if (weightSummary > 0) {
    const roundedWeight = Number(weightSummary.toFixed(2)).toString()
    sessionMetadata.shipping_total_weight_lbs = roundedWeight
    sessionMetadata.shipping_chargeable_lbs = roundedWeight
  }
  if (dimensionsSummary) {
    sessionMetadata.shipping_package_length_in = Number(dimensionsSummary.length.toFixed(2)).toString()
    sessionMetadata.shipping_package_width_in = Number(dimensionsSummary.width.toFixed(2)).toString()
    sessionMetadata.shipping_package_height_in = Number(dimensionsSummary.height.toFixed(2)).toString()
  }

  try {
    sessionMetadata.cart = JSON.stringify(
      cart.map((item: any) => ({
        sku: item?.sku,
        productId: item?._id || item?.productId,
        quantity: item?.quantity,
        price: item?.price,
      })),
    )
  } catch {
    // Ignore serialization errors
  }

  const baseUrl = (process.env.PUBLIC_SITE_URL || 'https://fasmotorsports.com').replace(/\/+$/, '')

  const captureStrategy = await determineCaptureStrategy(cart as any[])
  const captureMethod: 'automatic' | 'manual' =
    captureStrategy === 'manual' ? 'manual' : 'automatic'
  const paymentIntentMetadata: Stripe.MetadataParam = {
    capture_strategy: captureStrategy,
    requires_manual_capture: captureStrategy === 'manual' ? 'true' : 'false',
  }
  sessionMetadata.capture_strategy = captureStrategy

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      shipping_options: shippingOptions,
      payment_intent_data: {
        capture_method: captureMethod,
        metadata: paymentIntentMetadata,
      },
      metadata: sessionMetadata,
      success_url: `${baseUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
    })

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({sessionId: session.id, url: session.url}),
    }
  } catch (err: any) {
    console.error('createCheckoutSession error:', err)
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Failed to create checkout'}),
    }
  }
}
