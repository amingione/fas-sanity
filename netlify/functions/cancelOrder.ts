import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { createClient } from '@sanity/client'
import { randomUUID } from 'crypto'
import { updateCustomerProfileForOrder } from '../lib/customerSnapshot'

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:3333,http://localhost:8888').split(',')

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
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY
const stripe =
  stripeSecretKey &&
  new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20' as unknown as Stripe.StripeConfig['apiVersion'],
  })

const sanityToken = process.env.SANITY_API_TOKEN || process.env.PUBLIC_SANITY_WRITE_TOKEN
const sanity = sanityToken
  ? createClient({
      projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
      dataset: process.env.SANITY_STUDIO_DATASET!,
      apiVersion: '2024-04-10',
      token: sanityToken,
      useCdn: false,
    })
  : null

const normalizeSanityId = (value: string): string => value.replace(/^drafts\./, '').trim()

const idVariants = (id: string): string[] => {
  const clean = normalizeSanityId(id)
  return clean.startsWith('drafts.') ? [clean.slice(7), clean] : [clean, `drafts.${clean}`]
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  paymentIntentId?: string
  chargeId?: string
  paymentStatus?: string
  status?: string
  totalAmount?: number
  invoiceRef?: { _id: string } | null
  customerRef?: { _ref?: string } | null
  customerEmail?: string
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string | undefined
  const cors = makeCors(origin)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  if (!stripe || !sanity) {
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Stripe or Sanity not configured' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const orderIdRaw = typeof body?.orderId === 'string' ? body.orderId : ''
    const reasonRaw = typeof body?.reason === 'string' ? body.reason : ''
    const orderId = normalizeSanityId(orderIdRaw)
    if (!orderId) {
      return {
        statusCode: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing orderId' }),
      }
    }

    const order = await sanity.fetch<OrderDoc | null>(
      `*[_type == "order" && _id in $ids][0]{
        _id,
        orderNumber,
        paymentIntentId,
        chargeId,
        paymentStatus,
        status,
        totalAmount,
        invoiceRef->{ _id },
        customerRef,
        customerEmail
      }`,
      { ids: idVariants(orderId) }
    )

    if (!order?._id) {
      return {
        statusCode: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Order not found' }),
      }
    }

    if (order.status === 'cancelled' && (order.paymentStatus === 'refunded' || order.paymentStatus === 'canceled')) {
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, stripeAction: 'noop', message: 'Order already cancelled' }),
      }
    }

    const reason = reasonRaw.trim()

    let paymentIntent: Stripe.PaymentIntent | null = null
    if (order.paymentIntentId) {
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId, { expand: ['latest_charge', 'charges.data'] })
      } catch (err) {
        console.warn('cancelOrder: failed to retrieve payment intent', err)
      }
    }

    let chargeId = order.chargeId
    const intentCharges = (paymentIntent as any)?.charges?.data as Stripe.Charge[] | undefined
    if (!chargeId && intentCharges?.length) {
      chargeId = intentCharges[0]?.id || undefined
    }

    let stripeAction: 'refunded' | 'canceled' | null = null
    const refundMetadata = reason ? { sanity_cancellation_note: reason } : undefined

    const intentStatus = paymentIntent?.status || order.paymentStatus || ''

    const shouldRefund =
      Boolean(chargeId) &&
      (!intentStatus ||
        ['succeeded', 'processing', 'requires_capture'].includes(intentStatus) ||
        paymentIntent?.amount_received === paymentIntent?.amount)

    if (shouldRefund && chargeId) {
      await stripe.refunds.create({
        charge: chargeId,
        reason: 'requested_by_customer',
        metadata: refundMetadata,
      })
      stripeAction = 'refunded'
    } else if (order.paymentIntentId) {
      await stripe.paymentIntents.cancel(order.paymentIntentId, {
        cancellation_reason: 'requested_by_customer',
      })
      stripeAction = 'canceled'
    } else if (chargeId) {
      await stripe.refunds.create({
        charge: chargeId,
        reason: 'requested_by_customer',
        metadata: refundMetadata,
      })
      stripeAction = 'refunded'
    } else {
      return {
        statusCode: 422,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Order is not linked to a Stripe charge or payment intent' }),
      }
    }

    const now = new Date().toISOString()
    const orderPatch: Record<string, any> = {
      status: 'cancelled',
      paymentStatus: stripeAction === 'refunded' ? 'refunded' : 'canceled',
      stripeLastSyncedAt: now,
    }
    if (reason) {
      orderPatch.paymentFailureMessage = reason
    }

    const logEntry = {
      _type: 'shippingLogEntry',
      _key: randomUUID(),
      status: 'order_cancelled',
      message: reason ? `Cancelled via Studio: ${reason}` : 'Cancelled via Studio',
      createdAt: now,
    }

    try {
      await sanity
        .patch(order._id)
        .set(orderPatch)
        .setIfMissing({ shippingLog: [] })
        .append('shippingLog', [logEntry])
        .commit({ autoGenerateArrayKeys: true })
    } catch (err) {
      console.warn('cancelOrder: failed to update order document', err)
    }

    if (order.invoiceRef?._id) {
      const invoicePatch: Record<string, any> = {
        stripeLastSyncedAt: now,
        status: stripeAction === 'refunded' ? 'refunded' : 'cancelled',
        stripeInvoiceStatus: stripeAction === 'refunded' ? 'refunded_via_sanity' : 'cancelled_via_sanity',
      }
      try {
        await sanity.patch(order.invoiceRef._id).set(invoicePatch).commit({ autoGenerateArrayKeys: true })
      } catch (err) {
        console.warn('cancelOrder: failed to update invoice document', err)
      }
    }

    try {
      await updateCustomerProfileForOrder({
        sanity,
        orderId: order._id,
        customerId: order.customerRef?._ref,
        email: order.customerEmail,
      })
    } catch (err) {
      console.warn('cancelOrder: failed to update customer profile', err)
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        orderId: order._id,
        stripeAction,
      }),
    }
  } catch (err: any) {
    console.error('cancelOrder error', err)
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to cancel order',
        detail: err?.message || String(err),
      }),
    }
  }
}

export default handler
