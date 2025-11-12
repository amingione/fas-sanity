// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import {handleRefundWebhookEvent} from './stripeWebhook'

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
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY
const stripe =
  stripeSecretKey &&
  new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
  })

const sanityToken = process.env.SANITY_API_TOKEN
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
  paymentStatus?: string
  totalAmount?: number
  amountRefunded?: number
  paymentIntentId?: string
  chargeId?: string
  currency?: string
  invoiceRef?: {_id?: string | null} | null
}

type InvoiceDoc = {
  _id: string
  invoiceNumber?: string
  status?: string
  total?: number
  amountSubtotal?: number
  amountTax?: number
  currency?: string
  paymentIntentId?: string
  chargeId?: string
  orderRef?: {_id?: string | null; paymentIntentId?: string | null; chargeId?: string | null} | null
}

const eventTypeForRefund = (status?: string): Stripe.Event.Type => {
  const normalized = (status || '').toLowerCase()
  if (normalized === 'failed') return 'refund.failed'
  if (normalized === 'pending') return 'refund.updated'
  return 'refund.created'
}

const parseAmount = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return undefined
}

const hasStripeIdentifiers = (input: {paymentIntentId?: string; chargeId?: string}) =>
  Boolean((input.paymentIntentId || '').trim() || (input.chargeId || '').trim())

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

  try {
    const body = JSON.parse(event.body || '{}')
    const rawOrderId = typeof body?.orderId === 'string' ? body.orderId : ''
    const rawInvoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    const rawAmountCents =
      typeof body?.amountCents === 'number'
        ? body.amountCents
        : typeof body?.amountCents === 'string' && body.amountCents.trim()
          ? Number(body.amountCents)
          : undefined
    const normalizedAmountCents =
      typeof rawAmountCents === 'number' && Number.isFinite(rawAmountCents)
        ? Math.round(rawAmountCents)
        : undefined
    const amountInput =
      typeof normalizedAmountCents === 'number'
        ? normalizedAmountCents / 100
        : parseAmount(body?.amount)
    const orderId = rawOrderId ? normalizeSanityId(rawOrderId) : ''
    const invoiceId = rawInvoiceId ? normalizeSanityId(rawInvoiceId) : ''

    if (!orderId && !invoiceId) {
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Provide orderId or invoiceId'}),
      }
    }

    let order: OrderDoc | null = null
    let invoice: InvoiceDoc | null = null

    if (orderId) {
      order = await sanity.fetch<OrderDoc | null>(
        `*[_type == "order" && _id in $ids][0]{
          _id,
          orderNumber,
          paymentStatus,
          totalAmount,
          amountRefunded,
          paymentIntentId,
          chargeId,
          currency,
          invoiceRef->{ _id }
        }`,
        {ids: idVariants(orderId)},
      )
      if (!order?._id) {
        return {
          statusCode: 404,
          headers: {...cors, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Order not found'}),
        }
      }
    }

    if (invoiceId) {
      invoice = await sanity.fetch<InvoiceDoc | null>(
        `*[_type == "invoice" && _id in $ids][0]{
          _id,
          invoiceNumber,
          status,
          total,
          amountSubtotal,
          amountTax,
          currency,
          paymentIntentId,
          chargeId,
          orderRef->{ _id, paymentIntentId, chargeId }
        }`,
        {ids: idVariants(invoiceId)},
      )
      if (!invoice?._id) {
        return {
          statusCode: 404,
          headers: {...cors, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Invoice not found'}),
        }
      }
      if (!order && invoice?.orderRef?._id) {
        const linkedOrder = await sanity.fetch<OrderDoc | null>(
          `*[_type == "order" && _id in $ids][0]{
            _id,
            orderNumber,
            paymentStatus,
            totalAmount,
            amountRefunded,
            paymentIntentId,
            chargeId,
            currency,
            invoiceRef->{ _id }
          }`,
          {ids: idVariants(invoice.orderRef._id)},
        )
        if (linkedOrder?._id) {
          order = linkedOrder
        }
      }
    }

    const paymentIntentCandidate =
      order?.paymentIntentId ||
      invoice?.paymentIntentId ||
      (invoice?.orderRef?.paymentIntentId as string | null | undefined) ||
      null
    const chargeCandidate =
      order?.chargeId ||
      invoice?.chargeId ||
      (invoice?.orderRef?.chargeId as string | null | undefined) ||
      null

    const paymentIntentId = paymentIntentCandidate ? paymentIntentCandidate.trim() : undefined
    const chargeId = chargeCandidate ? chargeCandidate.trim() : undefined

    if (!hasStripeIdentifiers({paymentIntentId, chargeId})) {
      return {
        statusCode: 422,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'No Stripe payment identifiers found for this document'}),
      }
    }

    const allowableStatuses = [
      'paid',
      'fulfilled',
      'shipped',
      'closed',
      'refunded',
      'partially_refunded',
    ]
    const orderStatus = (order?.paymentStatus || '').toLowerCase()
    const invoiceStatus = (invoice?.status || '').toLowerCase()

    if (order && order.paymentStatus && !allowableStatuses.includes(orderStatus)) {
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          error: `Order payment status "${order.paymentStatus}" does not allow refunds`,
        }),
      }
    }
    if (!order && invoice && invoice.status && !allowableStatuses.includes(invoiceStatus)) {
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: `Invoice status "${invoice.status}" does not allow refunds`}),
      }
    }

    const availableAmount = (() => {
      const total = order?.totalAmount ?? invoice?.total ?? invoice?.amountSubtotal ?? undefined
      const already = order?.amountRefunded ?? 0
      if (typeof total === 'number' && total > 0) {
        const remaining = total - (typeof already === 'number' ? already : 0)
        return remaining > 0 ? remaining : 0
      }
      return undefined
    })()

    let amountCents: number | undefined
    if (amountInput !== undefined) {
      if (amountInput <= 0) {
        return {
          statusCode: 400,
          headers: {...cors, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Refund amount must be positive'}),
        }
      }
      if (availableAmount !== undefined && amountInput - availableAmount > 0.01) {
        return {
          statusCode: 400,
          headers: {...cors, 'Content-Type': 'application/json'},
          body: JSON.stringify({
            error: `Refund amount exceeds remaining balance (${availableAmount.toFixed(2)})`,
          }),
        }
      }
      amountCents = Math.round(amountInput * 100)
    }

    const metadata: Record<string, string> = {}
    if (order?._id) metadata.sanity_order_id = order._id
    if (invoice?._id) metadata.sanity_invoice_id = invoice._id
    if (invoice?.invoiceNumber) metadata.invoice_number = invoice.invoiceNumber
    if (order?.orderNumber) metadata.order_number = order.orderNumber
    if (reason) metadata.sanity_refund_reason = reason

    const refundParams: Stripe.RefundCreateParams = {
      reason: 'requested_by_customer',
      metadata,
    }
    if (paymentIntentId) {
      refundParams.payment_intent = paymentIntentId
    } else if (chargeId) {
      refundParams.charge = chargeId
    }
    if (typeof amountCents === 'number') {
      refundParams.amount = amountCents
    }
    refundParams.expand = ['charge', 'payment_intent']

    const refund = await stripe.refunds.create(refundParams)

    // best-effort immediate sync using shared webhook handler
    try {
      const eventPayload = {
        id: `evt_refund_${refund.id}_${Date.now()}`,
        object: 'event',
        api_version: '2024-06-20',
        created: refund.created || Math.floor(Date.now() / 1000),
        data: {object: refund},
        livemode: Boolean((refund as any)?.livemode),
        pending_webhooks: 0,
        request: {id: null, idempotency_key: null},
        type: eventTypeForRefund(refund.status),
      } as unknown as Stripe.Event
      await handleRefundWebhookEvent(eventPayload)
    } catch (err) {
      console.warn('createRefund: failed to invoke local refund handler', err)
    }

    return {
      statusCode: 200,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        ok: true,
        refundId: refund.id,
        stripeStatus: refund.status,
        amount: typeof refund.amount === 'number' ? refund.amount / 100 : null,
        currency:
          refund.currency?.toUpperCase() ||
          (order?.currency ? String(order.currency).toUpperCase() : undefined) ||
          (invoice?.currency ? String(invoice.currency).toUpperCase() : undefined) ||
          null,
      }),
    }
  } catch (err: any) {
    console.error('createRefund error', err)
    const message = err?.message || 'Refund failed'
    return {
      statusCode: 500,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: message}),
    }
  }
}

export default handler
