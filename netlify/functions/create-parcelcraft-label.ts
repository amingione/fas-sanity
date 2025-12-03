import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

const stripeSecret =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_API_KEY ||
  process.env.STRIPE_SK ||
  process.env.VITE_STRIPE_SECRET_KEY
const sanityProjectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const sanityDataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const sanityToken =
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_ACCESS_TOKEN ||
  ''
const shipFrom = {
  name: process.env.SHIP_FROM_NAME,
  phone: process.env.SHIP_FROM_PHONE,
  email: process.env.SHIP_FROM_EMAIL,
  address: {
    line1: process.env.SHIP_FROM_ADDRESS1,
    line2: process.env.SHIP_FROM_ADDRESS2,
    city: process.env.SHIP_FROM_CITY,
    state: process.env.SHIP_FROM_STATE,
    postal_code: process.env.SHIP_FROM_POSTAL,
    country: process.env.SHIP_FROM_COUNTRY || 'US',
  },
}

const stripe = stripeSecret ? new Stripe(stripeSecret, {apiVersion: '2023-10-16'}) : null
const sanity =
  sanityProjectId && sanityDataset && sanityToken
    ? createClient({projectId: sanityProjectId, dataset: sanityDataset, token: sanityToken, apiVersion: '2024-10-01', useCdn: false})
    : null

const JSON_HEADERS = {'Content-Type': 'application/json'}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: JSON_HEADERS}
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({error: 'Method not allowed'})}
  }

  if (!stripe || !sanity) {
    return {statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({error: 'Server not configured'})}
  }

  let payload: any = {}
  try {
    payload = event.body ? JSON.parse(event.body) : {}
  } catch {
    return {statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({error: 'Invalid JSON'})}
  }

  const orderId = (payload.orderId || '').replace(/^drafts\./, '')
  const serviceCode = payload.serviceCode || payload.shippingServiceCode || payload.shippingRateId
  const packageWeightOz = Number(payload.weightOz || payload.weight_oz || payload.weight || 16)
  const dimensions = payload.dimensions || payload.package || {}

  if (!orderId) {
    return {statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({error: 'orderId required'})}
  }

  try {
    const order = await sanity.fetch(
      `*[_type == "order" && _id == $id][0]{
        _id,
        paymentIntentId,
        stripeSessionId,
        shippingAddress,
        shippingCarrier,
        fulfillment,
        shippingMetadata
      }`,
      {id: orderId},
    )

    if (!order) {
      return {statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({error: 'Order not found'})}
    }

    const addr = order.shippingAddress || {}
    if (!addr?.addressLine1 || !addr?.city || !addr?.state || !addr?.postalCode || !addr?.country) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({error: 'Shipping address incomplete'}),
      }
    }

    const shipTo: Stripe.ShippingV2.ShippingAddressCreateParams = {
      name: addr.name || addr.fullName || addr.contactName || 'Recipient',
      phone: addr.phone || undefined,
      address: {
        line1: addr.addressLine1,
        line2: addr.addressLine2 || undefined,
        city: addr.city,
        state: addr.state,
        postal_code: addr.postalCode,
        country: addr.country || 'US',
      },
    }

    const packageParams: Stripe.ShippingV2.ShippingLabelCreateParams.Package = {
      weight: {
        unit: 'ounce',
        value: Number.isFinite(packageWeightOz) && packageWeightOz > 0 ? packageWeightOz : 16,
      },
      dimensions: {
        unit: 'inch',
        length: Number(dimensions.length) || 10,
        width: Number(dimensions.width) || 8,
        height: Number(dimensions.height) || 4,
      },
    }

    const labelParams: Stripe.ShippingV2.ShippingLabelCreateParams = {
      carrier: 'parcelcraft',
      service: serviceCode || undefined,
      ship_from: shipFrom as any,
      ship_to: shipTo,
      packages: [packageParams],
      metadata: {
        orderId,
        payment_intent: order.paymentIntentId || '',
        stripe_session_id: order.stripeSessionId || '',
      },
    }

    let label: Stripe.ShippingV2.ShippingLabel
    try {
      label = await (stripe as any).shipping.labels.create(labelParams)
    } catch (err: any) {
      console.error('[create-parcelcraft-label] stripe label create failed', err)
      return {
        statusCode: 502,
        headers: JSON_HEADERS,
        body: JSON.stringify({error: err?.message || 'Stripe shipping label failed'}),
      }
    }

    const trackingNumber =
      (label as any)?.tracking_number || (label as any)?.trackingNumber || label?.tracking_number
    const trackingUrl =
      (label as any)?.tracking_url || (label as any)?.trackingUrl || label?.tracking_url
    const carrier =
      (label as any)?.carrier || (label as any)?.shipping_carrier || (label as any)?.service_details
    const labelUrl =
      (label as any)?.label_url ||
      (label as any)?.labelUrl ||
      (label as any)?.files?.label_pdf ||
      undefined
    const shippedAt = label?.created ? new Date(label.created * 1000).toISOString() : new Date().toISOString()

    await sanity
      .patch(orderId)
      .setIfMissing({fulfillment: {status: 'unfulfilled'}})
      .set({
        'fulfillment.status': 'shipped',
        'fulfillment.trackingNumber': trackingNumber || null,
        'fulfillment.trackingUrl': trackingUrl || null,
        'fulfillment.carrier': carrier || 'Parcelcraft',
        'fulfillment.shippedAt': shippedAt,
        'shippingCarrier': carrier || 'Parcelcraft',
      })
      .set({'shippingMetadata.labelUrl': labelUrl || null})
      .commit({autoGenerateArrayKeys: true})

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        trackingNumber,
        trackingUrl,
        carrier,
        labelUrl,
        shippedAt,
        orderId,
        labelId: (label as any)?.id,
      }),
    }
  } catch (error: any) {
    console.error('[create-parcelcraft-label] failed', error)
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: error?.message || 'Unknown error'}),
    }
  }
}

export {handler}
