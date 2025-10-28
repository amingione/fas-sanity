#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

type CliOptions = {
  limit: number
  dryRun: boolean
  orderId?: string
  paymentIntentId?: string
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

const ENV_FILES = [
  '.env.development.local',
  '.env.local',
  '.env.development',
  '.env',
]

for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function parseArgs(argv: string[]): CliOptions {
  let limit = 25
  let dryRun = false
  let orderId: string | undefined
  let paymentIntentId: string | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg) continue
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true
      continue
    }
    if (arg === '--limit') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --limit')
      }
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value "${value}" (expected positive number)`)
      }
      limit = Math.floor(parsed)
      i += 1
      continue
    }
    if (arg === '--order') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --order')
      }
      orderId = value.trim()
      i += 1
      continue
    }
    if (arg === '--pi' || arg === '--payment-intent' || arg === '--paymentIntent') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --payment-intent')
      }
      paymentIntentId = value.trim()
      i += 1
      continue
    }
  }

  return {limit, dryRun, orderId, paymentIntentId}
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

async function fetchOrders(
  sanity: ReturnType<typeof createClient>,
  options: CliOptions,
): Promise<OrderDoc[]> {
  const params: Record<string, any> = {limit: options.limit}
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
      '(!defined(lastRefundId) || lastRefundId == "" || !defined(lastRefundStatus) || lastRefundStatus == "" || (!defined(amountRefunded) || amountRefunded == 0) || paymentStatus in ["refunded","partially_refunded"])',
    )
  }

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

async function listRefunds(stripe: Stripe, order: OrderDoc): Promise<Stripe.Refund[]> {
  const ids = [
    order.paymentIntentId,
    order.chargeId,
  ].filter(Boolean) as string[]

  for (const id of ids) {
    try {
      const params: Stripe.RefundListParams = id.startsWith('pi_')
        ? {payment_intent: id, limit: 100}
        : {charge: id, limit: 100}
      const results = await stripe.refunds.list(params)
      if (results.data.length) return results.data
    } catch (err) {
      console.warn(`⚠️  Unable to list refunds for ${formatOrderRef(order)} (${id}):`, (err as any)?.message || err)
    }
  }

  return []
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))

    const stripeSecret = process.env.STRIPE_SECRET_KEY
    if (!stripeSecret) {
      console.error('Missing STRIPE_SECRET_KEY in environment.')
      process.exit(1)
    }

    const stripe = new Stripe(stripeSecret, {
      apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
    })

    const sanityProjectId =
      process.env.SANITY_STUDIO_PROJECT_ID ||
      process.env.SANITY_PROJECT_ID ||
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
      ''
    const sanityDataset =
      process.env.SANITY_STUDIO_DATASET ||
      process.env.SANITY_DATASET ||
      process.env.NEXT_PUBLIC_SANITY_DATASET ||
      'production'
    const sanityToken = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

    if (!sanityProjectId || !sanityDataset || !sanityToken) {
      console.error(
        'Missing Sanity configuration. Ensure SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN are set.',
      )
      process.exit(1)
    }

    const sanity = createClient({
      projectId: sanityProjectId,
      dataset: sanityDataset,
      apiVersion: '2024-04-10',
      token: sanityToken,
      useCdn: false,
    })

    const orders = await fetchOrders(sanity, options)
    if (!orders.length) {
      console.log('No orders require refund backfill.')
      return
    }

    const stripeModule = await import('../netlify/functions/stripeWebhook')
    const handleRefundWebhookEvent = stripeModule.handleRefundWebhookEvent
    if (typeof handleRefundWebhookEvent !== 'function') {
      throw new Error('stripeWebhook handleRefundWebhookEvent is unavailable.')
    }

    const apiVersion = '2024-06-20'

    let processed = 0
    let updated = 0

    for (const order of orders) {
      const refunds = await listRefunds(stripe, order)
      if (!refunds.length) {
        continue
      }

      refunds.sort((a, b) => (a.created || 0) - (b.created || 0))

      for (const refund of refunds) {
        processed += 1
        if (!shouldProcessRefund(order, refund)) {
          continue
        }

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
          console.log(`[dry-run] ${message}`)
          continue
        }

        const event: Stripe.Event = {
          id: `evt_backfill_${refund.id || order._id}_${Date.now()}`,
          object: 'event',
          api_version: apiVersion,
          created: refund.created || Math.floor(Date.now() / 1000),
          data: {
            object: refund,
          },
          livemode: Boolean((refund as any)?.livemode),
          pending_webhooks: 0,
          request: {
            id: null,
            idempotency_key: null,
          },
          type: eventType,
        }

        await handleRefundWebhookEvent(event)
        updated += 1
        console.log(`✅ ${message}`)
      }
    }

    if (options.dryRun) {
      console.log(`Dry run complete. ${processed} refunds evaluated.`)
    } else {
      console.log(`Backfill complete. ${updated} refund events applied (${processed} evaluated).`)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
