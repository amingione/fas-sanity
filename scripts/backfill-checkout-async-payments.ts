#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const resolved = path.resolve(process.cwd(), filename)
  if (fs.existsSync(resolved)) {
    dotenv.config({path: resolved, override: false})
  }
}

type StripeWebhookModule = typeof import('../netlify/functions/stripeWebhook')

type CliOptions = {
  dryRun: boolean
  limit: number
  status: 'all' | 'success' | 'failure'
  sessionId?: string
  orderId?: string
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  stripeSessionId?: string
  paymentStatus?: string
  status?: string
  stripeCheckoutStatus?: string
  stripePaymentIntentStatus?: string
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2)
  let dryRun = false
  let limit = 200
  let status: CliOptions['status'] = 'all'
  let sessionId: string | undefined
  let orderId: string | undefined

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true
    } else if (arg === '--limit') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value "${value}" (expected positive integer)`)
      }
      limit = parsed
      i += 1
    } else if (arg === '--status') {
      const value = (args[i + 1] || '').toLowerCase()
      if (!value) throw new Error('Missing value for --status')
      if (!['all', 'success', 'failure'].includes(value)) {
        throw new Error('Expected --status to be one of: all, success, failure')
      }
      status = value as CliOptions['status']
      i += 1
    } else if (arg === '--session') {
      sessionId = (args[i + 1] || '').trim() || undefined
      i += 1
    } else if (arg === '--order') {
      orderId = normalizeSanityId(args[i + 1])
      i += 1
    }
  }

  return {dryRun, limit, status, sessionId, orderId}
}

function normalizeSanityId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_KEY) {
  console.error('Missing STRIPE_SECRET_KEY in environment. Aborting.')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_KEY, {
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
const sanityToken = process.env.SANITY_API_TOKEN

if (!sanityProjectId || !sanityDataset || !sanityToken) {
  console.error(
    'Missing Sanity configuration (SANITY_STUDIO_PROJECT_ID / SANITY_STUDIO_DATASET / SANITY_API_TOKEN).',
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

const TARGET_PAYMENT_STATUSES = [
  'processing',
  'requires_action',
  'requires_payment_method',
  'requires_confirmation',
  'requires_capture',
  'requires_customer_action',
  'async_payment_in_progress',
  'pending',
  'open',
  'unpaid',
  'failed',
  'canceled',
  'cancelled',
  'incomplete',
  'incomplete_expired',
]

async function fetchOrders(options: CliOptions): Promise<OrderDoc[]> {
  const conditions = ['_type == "order"', 'stripeSource == "checkout.session"', 'defined(stripeSessionId)']
  const params: Record<string, any> = {limit: options.limit}

  if (options.sessionId) {
    conditions.push('stripeSessionId == $sessionId')
    params.sessionId = options.sessionId
  } else if (options.orderId) {
    conditions.push('_id in $orderIds')
    params.orderIds = [options.orderId, `drafts.${options.orderId}`]
  } else {
    conditions.push(
      '(!defined(paymentStatus) || paymentStatus == "" || paymentStatus in $targetStatuses)',
    )
    params.targetStatuses = TARGET_PAYMENT_STATUSES
  }

  const query = `*[${conditions.join(' && ')}] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    stripeSessionId,
    paymentStatus,
    status,
    stripeCheckoutStatus,
    stripePaymentIntentStatus
  }`

  return sanity.fetch<OrderDoc[]>(query, params)
}

function formatOrderRef(order: OrderDoc): string {
  return order.orderNumber ? `${order.orderNumber} (${order._id})` : order._id
}

function determineOutcome(
  session: Stripe.Checkout.Session,
  paymentIntent: Stripe.PaymentIntent | null,
): 'success' | 'failure' | 'pending' | 'expired' {
  const sessionStatus = (session.status || '').toString().toLowerCase()
  const sessionPaymentStatus = (session.payment_status || '').toString().toLowerCase()
  const paymentIntentStatus = (paymentIntent?.status || '').toString().toLowerCase()

  if (sessionStatus === 'expired') return 'expired'
  if (
    ['paid', 'succeeded', 'complete', 'no_payment_required'].includes(sessionPaymentStatus) ||
    ['succeeded', 'requires_capture'].includes(paymentIntentStatus)
  ) {
    return 'success'
  }
  if (
    ['unpaid', 'failed', 'canceled', 'cancelled'].includes(sessionPaymentStatus) ||
    ['canceled', 'cancelled'].includes(paymentIntentStatus) ||
    (paymentIntentStatus === 'requires_payment_method' && sessionPaymentStatus === 'unpaid')
  ) {
    return 'failure'
  }
  return 'pending'
}

async function main() {
  const options = parseOptions()
  let webhookHandlers: StripeWebhookModule | undefined
  if (!options.dryRun) {
    webhookHandlers = await import('../netlify/functions/stripeWebhook')
  }
  const orders = await fetchOrders(options)
  if (!orders.length) {
    console.log('No matching orders found.')
    return
  }

  console.log(`Found ${orders.length} order(s) to evaluate.`)

  let processed = 0
  let skipped = 0

  for (const order of orders) {
    if (!order.stripeSessionId) {
      skipped += 1
      continue
    }

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
        expand: ['payment_intent'],
      })
    } catch (err) {
      console.warn(
        `⚠️  Unable to load checkout session ${order.stripeSessionId} for ${formatOrderRef(order)}:`,
        (err as any)?.message || err,
      )
      skipped += 1
      continue
    }

    const paymentIntent =
      typeof session.payment_intent === 'object' && session.payment_intent
        ? (session.payment_intent as Stripe.PaymentIntent)
        : null

    const outcome = determineOutcome(session, paymentIntent)

    const orderStatus = (order.paymentStatus || '').toLowerCase()
    if (outcome === 'expired') {
      console.log(
        `- Skipping ${formatOrderRef(order)}: checkout session ${session.id} already expired.`,
      )
      skipped += 1
      continue
    }
    if (outcome === 'pending') {
      console.log(
        `- Skipping ${formatOrderRef(order)}: payment still pending (session status ${session.payment_status || 'unknown'}).`,
      )
      skipped += 1
      continue
    }
    if (options.status === 'success' && outcome !== 'success') {
      skipped += 1
      continue
    }
    if (options.status === 'failure' && outcome !== 'failure') {
      skipped += 1
      continue
    }
    if (outcome === 'success' && orderStatus === 'paid') {
      console.log(
        `- Skipping ${formatOrderRef(order)}: already marked paid (session ${session.id}).`,
      )
      skipped += 1
      continue
    }
    if (
      outcome === 'failure' &&
      ['cancelled', 'canceled', 'failed'].includes(orderStatus) &&
      (order.status || '').toLowerCase() === 'cancelled'
    ) {
      console.log(
        `- Skipping ${formatOrderRef(order)}: already marked cancelled (session ${session.id}).`,
      )
      skipped += 1
      continue
    }

    const prefix = options.dryRun ? '[dry-run] ' : ''
    const outcomeLabel = outcome === 'success' ? 'success' : 'failure'
    console.log(
      `- ${prefix}Applying async ${outcomeLabel} for ${formatOrderRef(order)} (session ${session.id}).`,
    )

    if (!options.dryRun) {
      if (!webhookHandlers) {
        throw new Error('Stripe webhook helpers failed to load')
      }
      const metadata = (session.metadata || {}) as Record<string, string>
      const eventCreated = Math.floor(Date.now() / 1000)
      if (outcome === 'success') {
        await webhookHandlers.handleCheckoutAsyncPaymentSucceeded(session, {
          paymentIntent,
          metadata,
          eventType: 'checkout.session.async_payment_succeeded',
          invoiceStripeStatus: 'checkout.session.async_payment_succeeded',
          label: 'Async payment succeeded (backfill)',
          message: `Backfill: Checkout session ${session.id} async payment succeeded`,
          eventCreated,
        })
      } else {
        await webhookHandlers.handleCheckoutAsyncPaymentFailed(session, {
          paymentIntent,
          metadata,
          eventType: 'checkout.session.async_payment_failed',
          invoiceStripeStatus: 'checkout.session.async_payment_failed',
          label: 'Async payment failed (backfill)',
          message: `Backfill: Checkout session ${session.id} async payment failed`,
          eventCreated,
        })
      }
    }

    processed += 1
  }

  console.log(`Finished. Processed ${processed} order(s); skipped ${skipped}.`)
}

main().catch((err) => {
  console.error('Backfill failed:', (err as any)?.message || err)
  process.exit(1)
})
