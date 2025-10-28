import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import Stripe from 'stripe'
import {createClient, type SanityClient} from '@sanity/client'

export type RefundBackfillOptions = {
  limit?: number
  dryRun?: boolean
  orderId?: string
  paymentIntentId?: string
  logger?: (message: string) => void
}

export type RefundBackfillResult = {
  dryRun: boolean
  totalRefundsEvaluated: number
  applied: number
  ordersConsidered: number
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  paymentIntentId?: string
  chargeId?: string
  stripeSessionId?: string
  amountRefunded?: number
  lastRefundId?: string
  lastRefundStatus?: string
  paymentStatus?: string
}

function ensureEnvLoaded() {
  const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
  for (const filename of ENV_FILES) {
    const filePath = path.resolve(process.cwd(), filename)
    if (fs.existsSync(filePath)) {
      dotenv.config({path: filePath, override: false})
    }
  }
}

let cachedStripe: Stripe | null = null
let cachedSanity: SanityClient | null = null

function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe
  const stripeSecret = process.env.STRIPE_SECRET_KEY
  if (!stripeSecret) {
    throw new Error('Missing STRIPE_SECRET_KEY in environment.')
  }
  cachedStripe = new Stripe(stripeSecret, {
    apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
  })
  return cachedStripe
}

function getSanity(): SanityClient {
  if (cachedSanity) return cachedSanity
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
    ''
  const dataset =
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET ||
    process.env.NEXT_PUBLIC_SANITY_DATASET ||
    'production'
  const token = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

  if (!projectId || !dataset || !token) {
    throw new Error(
      'Missing Sanity configuration. Ensure SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN are set.'
    )
  }

  cachedSanity = createClient({
    projectId,
    dataset,
    apiVersion: '2024-04-10',
    token,
    useCdn: false,
  })
  return cachedSanity
}

function normalizeId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

function formatOrderRef(order: OrderDoc): string {
  return order.orderNumber ? `${order.orderNumber} (${order._id})` : order._id
}

function shouldProcessRefund(order: OrderDoc, refund: Stripe.Refund): boolean {
  if (!order.lastRefundId) return true
  if (order.lastRefundId !== refund.id) return true
  const normalizedStatus = (order.lastRefundStatus || '').toLowerCase()
  if (normalizedStatus !== (refund.status || '').toLowerCase()) return true
  const recordedAmount = typeof order.amountRefunded === 'number' ? order.amountRefunded : undefined
  const refundAmount =
    typeof refund.amount === 'number' && Number.isFinite(refund.amount) ? refund.amount / 100 : undefined
  if (refundAmount !== undefined && recordedAmount !== undefined) {
    const delta = Math.abs(refundAmount - recordedAmount)
    if (delta >= 0.01) return true
  }
  return false
}

async function fetchOrders(options: RefundBackfillOptions): Promise<OrderDoc[]> {
  const sanity = getSanity()
  const params: Record<string, any> = {}
  const conditions: string[] = ['_type == "order"']

  if (options.orderId) {
    const normalized = normalizeId(options.orderId)
    if (!normalized) return []
    conditions.push('_id in $orderIds')
    params.orderIds = [normalized, `drafts.${normalized}`]
  } else if (options.paymentIntentId) {
    conditions.push('paymentIntentId == $paymentIntentId')
    params.paymentIntentId = options.paymentIntentId
  } else {
    conditions.push('(defined(paymentIntentId) || defined(chargeId))')
    conditions.push(
      '(!defined(lastRefundId) || lastRefundId == "" || !defined(lastRefundStatus) || lastRefundStatus == "" || (!defined(amountRefunded) || amountRefunded == 0) || paymentStatus in ["refunded","partially_refunded"])'
    )
  }

  const limit =
    options.limit && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : 25
  params.limit = limit

  const query = `*[${conditions.join(' && ')}] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    paymentIntentId,
    chargeId,
    stripeSessionId,
    amountRefunded,
    lastRefundId,
    lastRefundStatus,
    paymentStatus
  }`

  return sanity.fetch<OrderDoc[]>(query, params)
}

async function listRefunds(order: OrderDoc, logger?: (message: string) => void): Promise<Stripe.Refund[]> {
  const stripe = getStripe()
  const ids = [order.paymentIntentId, order.chargeId].filter(Boolean) as string[]

  for (const id of ids) {
    try {
      const params: Stripe.RefundListParams = id.startsWith('pi_')
        ? {payment_intent: id, limit: 100}
        : {charge: id, limit: 100}
      const results = await stripe.refunds.list(params)
      if (results.data.length) return results.data
    } catch (err) {
      logger?.(
        `⚠️ Unable to list refunds for ${formatOrderRef(order)} (${id}): ${(err as any)?.message || err}`
      )
    }
  }

  return []
}

export async function runRefundBackfill(
  rawOptions: RefundBackfillOptions = {}
): Promise<RefundBackfillResult> {
  ensureEnvLoaded()
  const options: RefundBackfillOptions = {
    dryRun: Boolean(rawOptions.dryRun),
    limit: rawOptions.limit,
    orderId: rawOptions.orderId?.trim(),
    paymentIntentId: rawOptions.paymentIntentId?.trim(),
    logger: rawOptions.logger,
  }

  const orders = await fetchOrders(options)
  if (!orders.length) {
    options.logger?.('No orders require refund backfill.')
    return {
      dryRun: Boolean(options.dryRun),
      totalRefundsEvaluated: 0,
      applied: 0,
      ordersConsidered: 0,
    }
  }

  const stripeModule = await import('../../functions/stripeWebhook')
  const handleRefundWebhookEvent = (stripeModule as any).handleRefundWebhookEvent as
    | ((event: Stripe.Event) => Promise<void>)
    | undefined
  if (typeof handleRefundWebhookEvent !== 'function') {
    throw new Error('stripeWebhook handleRefundWebhookEvent is unavailable.')
  }

  const apiVersion = '2024-06-20'
  let processedRefunds = 0
  let applied = 0

  for (const order of orders) {
    const refunds = await listRefunds(order, options.logger)
    if (!refunds.length) continue

    refunds.sort((a, b) => (a.created || 0) - (b.created || 0))

    for (const refund of refunds) {
      processedRefunds += 1
      if (!shouldProcessRefund(order, refund)) continue

      const status = (refund.status || '').toLowerCase()
      const eventType =
        status === 'failed'
          ? 'refund.failed'
          : status === 'succeeded'
            ? 'refund.created'
            : 'refund.updated'

      const amount =
        typeof refund.amount === 'number' && Number.isFinite(refund.amount)
          ? refund.amount / 100
          : undefined
      const message = `${formatOrderRef(order)} • refund ${refund.id || 'unknown'} • status=${status || 'n/a'}${
        amount !== undefined ? ` • amount=${amount.toFixed(2)}` : ''
      }`

      if (options.dryRun) {
        options.logger?.(`[dry-run] ${message}`)
        continue
      }

      const event: Stripe.Event = {
        id: `evt_backfill_${refund.id || order._id}_${Date.now()}`,
        object: 'event',
        api_version: apiVersion,
        created: refund.created || Math.floor(Date.now() / 1000),
        data: {
          object: refund,
        } as any,
        livemode: Boolean((refund as any)?.livemode),
        pending_webhooks: 0,
        request: {
          id: null,
          idempotency_key: null,
        },
        type: eventType,
      }

      await handleRefundWebhookEvent(event)
      applied += 1
      options.logger?.(`✅ ${message}`)
    }
  }

  if (options.dryRun) {
    options.logger?.(`Dry run complete. ${processedRefunds} refunds evaluated.`)
  } else {
    options.logger?.(
      `Backfill complete. ${applied} refund events applied (${processedRefunds} evaluated).`
    )
  }

  return {
    dryRun: Boolean(options.dryRun),
    totalRefundsEvaluated: processedRefunds,
    applied,
    ordersConsidered: orders.length,
  }
}
