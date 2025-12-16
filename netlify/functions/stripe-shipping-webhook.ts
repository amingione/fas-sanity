import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

const stripeSecret =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_API_KEY ||
  process.env.STRIPE_SK ||
  process.env.VITE_STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_SHIPPING
const sanityProjectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const sanityDataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const sanityToken =
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_ACCESS_TOKEN ||
  ''

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20'

const stripe = stripeSecret ? new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION}) : null

const sanity =
  sanityProjectId && sanityDataset && sanityToken
    ? createClient({
        projectId: sanityProjectId,
        dataset: sanityDataset,
        apiVersion: '2024-10-01',
        token: sanityToken,
        useCdn: false,
      })
    : null

const JSON_HEADERS = {'Content-Type': 'application/json'}

type FulfillmentUpdate = {
  trackingNumber?: string
  trackingUrl?: string
  carrier?: string
  shippedAt?: string
  status?: 'shipped' | 'delivered'
  labelUrl?: string
}

const mapCarrier = (raw?: string | null) => {
  const val = (raw || '').toLowerCase()
  if (val.includes('usps')) return 'USPS'
  if (val.includes('ups')) return 'UPS'
  if (val.includes('fedex')) return 'FedEx'
  if (val.includes('dhl')) return 'DHL'
  return raw || 'Other'
}

const extractLabelPayload = (object: any): FulfillmentUpdate & {orderIdCandidate?: string} => {
  const trackingNumber =
    object?.tracking_number ||
    object?.trackingNumber ||
    object?.tracking?.number ||
    object?.shipment?.tracking_number
  const trackingUrl =
    object?.tracking_url ||
    object?.trackingUrl ||
    object?.tracking?.url ||
    object?.shipment?.tracking_url
  const carrier = mapCarrier(
    object?.carrier ||
      object?.shipping_carrier ||
      object?.shipment?.carrier ||
      object?.shipping_carrier_name,
  )
  const shippedAt =
    (object?.created || object?.created_at || object?.ship_date
      ? new Date(
          (object.created || object.created_at || object.ship_date) * 1000 ||
            object.created_at ||
            object.ship_date,
        ).toISOString()
      : undefined) || new Date().toISOString()
  const labelUrl =
    object?.label_url || object?.labelUrl || object?.files?.label_pdf || object?.label?.pdf
  const orderIdCandidate =
    object?.metadata?.orderId ||
    object?.metadata?.order_id ||
    object?.metadata?.sanityOrderId ||
    object?.metadata?.sanity_order_id ||
    object?.order_id ||
    object?.order

  return {
    trackingNumber,
    trackingUrl,
    carrier,
    shippedAt,
    status: 'shipped',
    labelUrl,
    orderIdCandidate,
  }
}

const findOrderId = async ({
  paymentIntentId,
  checkoutSessionId,
  orderIdCandidate,
  customerEmail,
}: {
  paymentIntentId?: string
  checkoutSessionId?: string
  orderIdCandidate?: string
  customerEmail?: string
}): Promise<string | null> => {
  if (!sanity) return null

  if (orderIdCandidate) {
    const exists = await sanity.fetch<string | null>('*[_type == "order" && _id == $id][0]._id', {
      id: orderIdCandidate.replace(/^drafts\./, ''),
    })
    if (exists) return exists
  }

  if (paymentIntentId) {
    const orderId = await sanity.fetch<string | null>(
      '*[_type == "order" && paymentIntentId == $pid][0]._id',
      {pid: paymentIntentId},
    )
    if (orderId) return orderId
  }

  if (checkoutSessionId) {
    const orderId = await sanity.fetch<string | null>(
      '*[_type == "order" && stripeSessionId == $sid][0]._id',
      {sid: checkoutSessionId},
    )
    if (orderId) return orderId
  }

  if (customerEmail) {
    const orderId = await sanity.fetch<string | null>(
      `*[_type == "order" && lower(email) == lower($email)]
        | order(_createdAt desc)[0]._id`,
      {email: customerEmail},
    )
    if (orderId) return orderId
  }

  return null
}

const patchOrderFulfillment = async (orderId: string, update: FulfillmentUpdate) => {
  if (!sanity) return
  const patch = sanity
    .patch(orderId)
    .setIfMissing({fulfillment: {status: 'unfulfilled'}})
    .set({
      'fulfillment.status': update.status || 'shipped',
      trackingNumber: update.trackingNumber,
      trackingUrl: update.trackingUrl,
      carrier: update.carrier,
      shippedAt: update.shippedAt || new Date().toISOString(),
    })

  if (update.labelUrl) {
    patch.set({shippingLabelUrl: update.labelUrl})
  }

  try {
    await patch.commit({autoGenerateArrayKeys: true})
    return true
  } catch (err) {
    console.error('[stripe-shipping-webhook] patch failed, retrying', err)
    try {
      await patch.commit({autoGenerateArrayKeys: true})
      return true
    } catch (err2) {
      console.error('[stripe-shipping-webhook] patch failed twice', err2)
      return false
    }
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: JSON_HEADERS}
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }
  if (!stripe || !webhookSecret) {
    console.error('[stripe-shipping-webhook] missing stripe key or webhook secret')
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Server not configured'}),
    }
  }

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature']
  if (!sig) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Missing signature'}),
    }
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body || '', sig, webhookSecret)
  } catch (err: any) {
    console.error('[stripe-shipping-webhook] invalid signature', err?.message)
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Invalid signature'}),
    }
  }

  const object: any = stripeEvent.data?.object || {}
  const labelData = extractLabelPayload(object)
  const paymentIntentId =
    object?.payment_intent ||
    object?.paymentIntent ||
    object?.metadata?.payment_intent ||
    object?.metadata?.paymentIntent
  const checkoutSessionId =
    object?.metadata?.checkout_session_id ||
    object?.metadata?.stripe_session_id ||
    object?.metadata?.checkoutSessionId
  const customerEmail =
    object?.customer_details?.email ||
    object?.metadata?.email ||
    object?.to_address?.email ||
    object?.shipping?.email ||
    object?.receipt_email

  let orderId = await findOrderId({
    paymentIntentId,
    checkoutSessionId,
    orderIdCandidate: labelData.orderIdCandidate,
    customerEmail,
  })

  if (!orderId) {
    console.warn('[stripe-shipping-webhook] order not found', {
      type: stripeEvent.type,
      paymentIntentId,
      checkoutSessionId,
      orderIdCandidate: labelData.orderIdCandidate,
      customerEmail,
    })
    // Do not fail the webhook; acknowledge to Stripe.
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({received: true, unmatched: true}),
    }
  }

  const ok = await patchOrderFulfillment(orderId, labelData)
  if (!ok) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Failed to update order'}),
    }
  }

  return {statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({received: true, orderId})}
}

export {handler}
