// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'

const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:3333,http://localhost:8888'
).split(',')

const normalizeOrigin = (origin?: string) => {
  if (!origin) return DEFAULT_ORIGINS[0]
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
}

const makeCors = (origin?: string) => {
  const allowOrigin = normalizeOrigin(origin)
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const stripe =
  stripeSecretKey &&
  new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
  })

const sanityToken = process.env.SANITY_API_TOKEN
const sanity =
  sanityToken &&
  createClient({
    projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
    dataset: process.env.SANITY_STUDIO_DATASET!,
    apiVersion: process.env.SANITY_STUDIO_API_VERSION || '2024-04-10',
    token: sanityToken,
    useCdn: false,
  })

const idVariants = (id: string): string[] => {
  const trimmed = id.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('drafts.')) {
    return [trimmed.slice(7), trimmed]
  }
  return [trimmed, `drafts.${trimmed}`]
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  paymentIntentId?: string
  paymentStatus?: string
  paymentCaptureStrategy?: 'auto' | 'manual'
  paymentCaptured?: boolean
  fulfillment?: {status?: string}
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string | undefined
  const cors = makeCors(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!stripe || !sanity) {
    return {
      statusCode: 500,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Stripe or Sanity not configured'}),
    }
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON body'}),
    }
  }

  const orderIdInput = typeof payload.orderId === 'string' ? payload.orderId.trim() : ''
  if (!orderIdInput) {
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'orderId is required'}),
    }
  }

  const order = await sanity.fetch<OrderDoc | null>(
    `*[_type == "order" && _id in $ids][0]{
      _id,
      orderNumber,
      paymentIntentId,
      paymentStatus,
      paymentCaptureStrategy,
      paymentCaptured,
      fulfillment
    }`,
    {ids: idVariants(orderIdInput)},
  )

  if (!order?._id) {
    return {
      statusCode: 404,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Order not found'}),
    }
  }

  if (order.paymentCaptureStrategy !== 'manual') {
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Order does not require manual capture'}),
    }
  }

  if (order.paymentCaptured) {
    return {
      statusCode: 200,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({message: 'Payment already captured'}),
    }
  }

  if (!order.paymentIntentId) {
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Order is missing payment intent'}),
    }
  }

  try {
    const paymentIntent = await stripe.paymentIntents.capture(order.paymentIntentId)
    const capturedAmount = paymentIntent.amount_received || paymentIntent.amount || 0
    const nowIso = new Date().toISOString()

    await sanity
      .patch(order._id)
      .set({
        paymentCaptured: true,
        paymentCapturedAt: nowIso,
        paymentStatus: 'paid',
        'fulfillment.status':
          order.fulfillment?.status && order.fulfillment.status !== 'awaiting_capture'
            ? order.fulfillment.status
            : 'ready_to_ship',
      })
      .commit({autoGenerateArrayKeys: true})

    return {
      statusCode: 200,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        paymentIntentId: paymentIntent.id,
        amountCaptured: (capturedAmount || 0) / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
      }),
    }
  } catch (error: any) {
    console.error('captureOrderPayment failed', error)
    return {
      statusCode: 500,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: error?.message || 'Failed to capture payment'}),
    }
  }
}
