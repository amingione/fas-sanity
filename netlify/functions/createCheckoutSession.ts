import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'

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

  const lineItems = cart
    .map((item: any) => {
      const quantity = Number(item?.quantity || 1)
      if (!Number.isFinite(quantity) || quantity <= 0) return null

      const image = typeof item?.image === 'string' && item.image.trim() ? [item.image.trim()] : []
      const metadata: Stripe.MetadataParam = {}
      if (item?._id) metadata.sanity_product_id = String(item._id)
      if (item?.productId) metadata.sanity_product_id = String(item.productId)
      if (item?.sku) metadata.sku = String(item.sku)

      if (item?.stripePriceId) {
        return {
          price: String(item.stripePriceId),
          quantity,
        }
      }

      const price = Number(item?.price)
      if (!Number.isFinite(price) || price < 0) return null

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item?.title || item?.name || 'Item',
            images: image,
            metadata: Object.keys(metadata).length ? metadata : undefined,
          },
          unit_amount: Math.round(price * 100),
          tax_behavior: 'exclusive',
        },
        quantity,
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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      shipping_options: shippingOptions,
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
