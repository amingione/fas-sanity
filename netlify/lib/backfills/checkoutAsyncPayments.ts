import Stripe from 'stripe'
import {createClient, type SanityClient} from '@sanity/client'

type BackfillStatus = 'all' | 'success' | 'failure'

export type CheckoutAsyncBackfillOptions = {
  dryRun?: boolean
  limit?: number
  status?: BackfillStatus
  sessionId?: string
  orderId?: string
  logger?: (message: string) => void
}

export type CheckoutAsyncBackfillResult = {
  total: number
  processed: number
  skipped: number
  dryRun: boolean
  statusFilter: BackfillStatus
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
  'expired',
]

function normalizeSanityId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

function formatOrderRef(doc: OrderDoc): string {
  return doc.orderNumber ? `${doc.orderNumber} (${doc._id})` : doc._id
}

function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY in environment.')
  }
  return new Stripe(key, {
    apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
  })
}

function createSanityClient(): SanityClient {
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
      'Missing Sanity configuration (SANITY_STUDIO_PROJECT_ID / SANITY_STUDIO_DATASET / SANITY_API_TOKEN).',
    )
  }

  return createClient({
    projectId,
    dataset,
    apiVersion: '2024-04-10',
    token,
    useCdn: false,
  })
}

async function loadWebhookHandlers() {
  const {handleCheckoutAsyncPaymentSucceeded, handleCheckoutAsyncPaymentFailed} = await import(
    '../../functions/stripeWebhook'
  )
  return {handleCheckoutAsyncPaymentSucceeded, handleCheckoutAsyncPaymentFailed}
}

async function fetchOrders(
  sanity: SanityClient,
  options: CheckoutAsyncBackfillOptions,
): Promise<OrderDoc[]> {
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : 200
  const conditions = [
    '_type == "order"',
    'stripeSource == "checkout.session"',
    'defined(stripeSessionId)',
  ]
  const params: Record<string, unknown> = {limit}

  if (options.sessionId) {
    conditions.push('stripeSessionId == $sessionId')
    params.sessionId = options.sessionId
  } else if (options.orderId) {
    const normalized = normalizeSanityId(options.orderId)
    if (!normalized) return []
    conditions.push('_id in $orderIds')
    params.orderIds = [normalized, `drafts.${normalized}`]
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

type Outcome = 'success' | 'failure' | 'pending' | 'expired'

function determineOutcome(
  session: Stripe.Checkout.Session,
  paymentIntent: Stripe.PaymentIntent | null,
): Outcome {
  const sessionStatus = (session.status || '').toLowerCase()
  const sessionPaymentStatus = (session.payment_status || '').toLowerCase()
  const paymentIntentStatus = (paymentIntent?.status || '').toLowerCase()

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

export async function runCheckoutAsyncPaymentsBackfill(
  rawOptions: CheckoutAsyncBackfillOptions = {},
): Promise<CheckoutAsyncBackfillResult> {
  const options: CheckoutAsyncBackfillOptions = {
    dryRun: Boolean(rawOptions.dryRun),
    status: rawOptions.status || 'all',
    limit: rawOptions.limit,
    sessionId: rawOptions.sessionId?.trim() || undefined,
    orderId: rawOptions.orderId?.trim() || undefined,
    logger: rawOptions.logger,
  }

  const stripe = createStripeClient()
  const sanity = createSanityClient()

  const orders = await fetchOrders(sanity, options)
  if (!orders.length) {
    options.logger?.('No matching orders found.')
    return {
      dryRun: Boolean(options.dryRun),
      processed: 0,
      skipped: 0,
      total: 0,
      statusFilter: options.status || 'all',
      sessionId: options.sessionId,
      orderId: options.orderId,
    }
  }

  options.logger?.(`Found ${orders.length} order(s) to evaluate.`)

  const handlers = options.dryRun ? null : await loadWebhookHandlers()

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
      options.logger?.(
        `⚠️ Unable to load checkout session ${order.stripeSessionId} for ${formatOrderRef(order)}: ${
          (err as any)?.message || err
        }`,
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
      options.logger?.(
        `- Skipping ${formatOrderRef(order)}: checkout session ${session.id} already expired.`,
      )
      skipped += 1
      continue
    }
    if (outcome === 'pending') {
      options.logger?.(
        `- Skipping ${formatOrderRef(order)}: payment still pending (session status ${
          session.payment_status || 'unknown'
        }).`,
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
      options.logger?.(
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
      options.logger?.(
        `- Skipping ${formatOrderRef(order)}: already marked cancelled (session ${session.id}).`,
      )
      skipped += 1
      continue
    }

    const prefix = options.dryRun ? '[dry-run] ' : ''
    const outcomeLabel = outcome === 'success' ? 'success' : 'failure'
    options.logger?.(
      `- ${prefix}Applying async ${outcomeLabel} for ${formatOrderRef(order)} (session ${session.id}).`,
    )

    if (!options.dryRun) {
      if (!handlers) {
        throw new Error('Stripe webhook helpers failed to load.')
      }
      const metadata = (session.metadata || {}) as Record<string, string>
      const eventCreated = Math.floor(Date.now() / 1000)
      if (outcome === 'success') {
        await handlers.handleCheckoutAsyncPaymentSucceeded(session, {
          paymentIntent,
          metadata,
          eventType: 'checkout.session.async_payment_succeeded',
          invoiceStripeStatus: 'checkout.session.async_payment_succeeded',
          label: 'Async payment succeeded (backfill)',
          message: `Backfill: Checkout session ${session.id} async payment succeeded`,
          eventCreated,
        })
      } else {
        await handlers.handleCheckoutAsyncPaymentFailed(session, {
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

  options.logger?.(`Finished. Processed ${processed} order(s); skipped ${skipped}.`)

  return {
    dryRun: Boolean(options.dryRun),
    processed,
    skipped,
    total: orders.length,
    statusFilter: options.status || 'all',
    sessionId: options.sessionId,
    orderId: options.orderId,
  }
}
