import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'
import {randomUUID} from 'crypto'

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
  ? new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION})
  : null

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

type ShippingRate = {
  rateId?: string
  carrier?: string
  carrierId?: string
  carrierCode?: string
  service?: string
  serviceCode?: string
  packageCode?: string
  packagingWeight?: number
  packagingWeightUnit?: string
  length?: number
  width?: number
  height?: number
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
  const rawCartId =
    typeof payload.cartId === 'string'
      ? payload.cartId
      : typeof payload.cart_id === 'string'
        ? payload.cart_id
        : ''
  const cartId = rawCartId.trim() || `cart_${randomUUID()}`
  const cartType =
    typeof payload.cartType === 'string'
      ? payload.cartType.trim()
      : typeof payload.cart_type === 'string'
        ? payload.cart_type.trim()
        : 'storefront'
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
      if (productWeight) {
        metadata.weight = productWeight.toString()
        metadata.weight_unit = 'pound'
        metadata.weight_lbs = productWeight.toString()
      }
      const dims = resolveProductDimensions(product)
      if (dims) {
        metadata.length = dims.length.toString()
        metadata.width = dims.width.toString()
        metadata.height = dims.height.toString()
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
  pushMeta('package_code', shippingRate.packageCode)
  pushMeta('packaging_weight', shippingRate.packagingWeight)
  pushMeta('packaging_weight_unit', shippingRate.packagingWeightUnit)
  pushMeta('length', shippingRate.length)
  pushMeta('width', shippingRate.width)
  pushMeta('height', shippingRate.height)
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

  const itemCount = normalizedCart.reduce((total, item) => total + item.quantity, 0)
  const subtotalEstimate = normalizedCart.reduce((total, item) => {
    if (typeof item.price !== 'number') return total
    return total + item.price * item.quantity
  }, 0)
  const shippingEstimate = Number(shippingRate.amount || 0) || 0
  const estimatedTotal = subtotalEstimate + shippingEstimate

  const sessionMetadata: Stripe.MetadataParam = {
    cart_id: cartId,
    cart_type: cartType || 'storefront',
    item_count: String(itemCount),
    est_total: estimatedTotal.toFixed(2),
  }

  const baseUrl = (process.env.PUBLIC_SITE_URL || 'https://fasmotorsports.com').replace(/\/+$/, '')

  const captureMethod: 'automatic' = 'automatic'
  const paymentIntentMetadata: Stripe.MetadataParam = {
    cart_id: cartId,
    ship_status: 'unshipped',
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: cartId,
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
      billing_address_collection: 'required',
      phone_number_collection: {enabled: true},
      success_url: `${baseUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
    })

    if (sanity) {
      const nowIso = new Date().toISOString()
      const cartSnapshot = cart.map((item: any) => {
        if (!item || typeof item !== 'object') return null
        const quantity = resolveCartQuantity(item.quantity)
        const productId = normalizeSanityId(item?._id || item?.productId)
        const price = typeof item?.price === 'number' ? item.price : undefined
        const total = price !== undefined ? price * quantity : undefined
        const entry: Record<string, any> = {
          name: item?.title || item?.name || item?.sku || 'Item',
          sku: typeof item?.sku === 'string' ? item.sku.trim() : undefined,
          id: item?._id || item?.productId,
          image: typeof item?.image === 'string' ? item.image.trim() : undefined,
          price,
          quantity,
          total,
        }
        if (productId) {
          entry.productRef = {_type: 'reference', _ref: productId}
        }
        return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined))
      })
      const cleanCart = cartSnapshot.filter(Boolean)
      try {
        await sanity.createIfNotExists({
          _id: cartId,
          _type: 'checkoutSession',
          sessionId: session.id,
          status: session.status || 'open',
          createdAt: nowIso,
        })
        await sanity
          .patch(cartId)
          .set({
            sessionId: session.id,
            status: session.status || 'open',
            createdAt: nowIso,
            expiresAt: session.expires_at
              ? new Date(session.expires_at * 1000).toISOString()
              : undefined,
            customerEmail: customerEmail || undefined,
            cart: cleanCart.length ? cleanCart : undefined,
            amountSubtotal: subtotalEstimate || undefined,
            amountShipping: shippingEstimate || undefined,
            totalAmount: estimatedTotal || undefined,
            currency: 'USD',
            stripeCheckoutUrl: session.url || undefined,
          })
          .setIfMissing({recoveryEmailSent: false, recovered: false})
          .commit({autoGenerateArrayKeys: true})
      } catch (err) {
        console.warn('createCheckoutSession: failed to persist cart snapshot', err)
      }
    }

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
