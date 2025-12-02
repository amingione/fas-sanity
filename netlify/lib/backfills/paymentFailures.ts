// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient, type SanityClient} from '@sanity/client'
import {buildStripeSummary} from '../../lib/stripeSummary'
import Stripe from 'stripe'
import {requireStripeSecretKey} from '../stripeEnv'

type CliLikeOptions = {
  dryRun?: boolean
  limit?: number
  orderId?: string
  orderNumber?: string
  paymentIntentId?: string
  logger?: (message: string) => void
}

export type PaymentFailuresBackfillOptions = CliLikeOptions

export type PaymentFailuresBackfillResult = {
  dryRun: boolean
  total: number
  updated: number
  skipped: number
  filters: {
    orderId?: string
    orderNumber?: string
    paymentIntentId?: string
  }
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
  status?: string
  paymentFailureCode?: string
  paymentFailureMessage?: string
  invoiceRef?: {_ref?: string}
}

type PaymentFailureDiagnostics = {
  code?: string
  message?: string
}

type SessionFailureResult = {
  diagnostics: PaymentFailureDiagnostics
  paymentStatus: string
  orderStatus: 'cancelled' | 'expired'
  invoiceStatus: 'cancelled' | 'expired'
  invoiceStripeStatus: string
}

const TARGET_PAYMENT_STATUSES = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'requires_capture',
  'processing',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'past_due',
  'requires_source',
  'requires_source_action',
  'requires_customer_action',
]

let cachedStripe: Stripe | null = null
let cachedSanity: SanityClient | null = null

function ensureEnvLoaded() {
  const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
  for (const filename of ENV_FILES) {
    const filePath = path.resolve(process.cwd(), filename)
    if (fs.existsSync(filePath)) {
      dotenv.config({path: filePath, override: false})
    }
  }
}

function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe
  const secret = requireStripeSecretKey()
  cachedStripe = new Stripe(secret, {
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
      'Missing Sanity configuration (SANITY_STUDIO_PROJECT_ID / SANITY_STUDIO_DATASET / SANITY_API_TOKEN).',
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

function normalizeSanityId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

async function fetchOrders(options: PaymentFailuresBackfillOptions): Promise<OrderDoc[]> {
  const sanity = getSanity()
  const params: Record<string, any> = {}
  const conditions: string[] = ['_type == "order"']

  if (options.orderId) {
    const normalized = normalizeSanityId(options.orderId)
    if (!normalized) return []
    conditions.push('_id in $orderIds')
    params.orderIds = [normalized, `drafts.${normalized}`]
  } else if (options.orderNumber) {
    conditions.push('orderNumber == $orderNumber')
    params.orderNumber = options.orderNumber.trim().toUpperCase()
  } else if (options.paymentIntentId) {
    conditions.push('paymentIntentId == $paymentIntentId')
    params.paymentIntentId = options.paymentIntentId
  } else {
    conditions.push('(defined(paymentIntentId) || defined(stripeSessionId))')
    conditions.push(
      '(!defined(paymentFailureCode) || paymentFailureCode == "" || !defined(paymentFailureMessage) || paymentFailureMessage == "")',
    )
    conditions.push('(!defined(paymentStatus) || paymentStatus in $statuses)')
    params.statuses = TARGET_PAYMENT_STATUSES
  }

  const limit =
    options.limit && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : undefined

  const limitSuffix = limit ? `[0...$limit]` : ''
  if (limit) params.limit = limit

  const query = `*[${conditions.join(' && ')}] | order(_createdAt asc)${limitSuffix}{
    _id,
    orderNumber,
    paymentIntentId,
    chargeId,
    stripeSessionId,
    amountRefunded,
    lastRefundId,
    lastRefundStatus,
    paymentStatus,
    status,
    paymentFailureCode,
    paymentFailureMessage,
    invoiceRef
  }`

  return sanity.fetch<OrderDoc[]>(query, params)
}

async function fetchPaymentIntent(order: OrderDoc, logger?: (message: string) => void) {
  const stripe = getStripe()
  const tried: string[] = []

  if (order.paymentIntentId) {
    tried.push(order.paymentIntentId)
    try {
      return await stripe.paymentIntents.retrieve(order.paymentIntentId)
    } catch (err) {
      logger?.(
        `⚠️ Unable to load PaymentIntent ${order.paymentIntentId} (${order.orderNumber || order._id}): ${
          (err as any)?.message || err
        }`,
      )
    }
  }

  if (order.stripeSessionId) {
    tried.push(order.stripeSessionId)
    try {
      const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId, {
        expand: ['payment_intent'],
      })
      const paymentIntent = session.payment_intent
      if (typeof paymentIntent === 'object' && paymentIntent && 'id' in paymentIntent) {
        return paymentIntent as Stripe.PaymentIntent
      }
      if (typeof paymentIntent === 'string') {
        try {
          return await stripe.paymentIntents.retrieve(paymentIntent)
        } catch (err) {
          logger?.(
            `⚠️ Failed retrieving PI ${paymentIntent} referenced by ${order.orderNumber || order._id}: ${
              (err as any)?.message || err
            }`,
          )
        }
      }
    } catch (err) {
      logger?.(
        `⚠️ Unable to load Checkout session ${order.stripeSessionId} (${order.orderNumber || order._id}): ${
          (err as any)?.message || err
        }`,
      )
    }
  }

  if (tried.length === 0) {
    logger?.(`⚠️ ${order.orderNumber || order._id}: no Stripe identifiers available.`)
  }
  return null
}

async function fetchCheckoutSession(id: string, logger?: (message: string) => void) {
  if (!id) return null
  const stripe = getStripe()
  try {
    return await stripe.checkout.sessions.retrieve(id, {expand: ['payment_intent']})
  } catch (err) {
    logger?.(`⚠️ Unable to load Checkout session ${id}: ${(err as any)?.message || err}`)
    return null
  }
}

function resolveCheckoutExpirationDiagnostics(
  session: Stripe.Checkout.Session,
): SessionFailureResult {
  const email =
    (
      session.customer_details?.email ||
      session.customer_email ||
      (session.metadata || {})['customer_email'] ||
      ''
    )
      ?.toString()
      .trim() || ''
  const expiresAt =
    typeof session.expires_at === 'number'
      ? new Date(session.expires_at * 1000).toISOString()
      : null

  let message = 'Checkout session expired before payment was completed.'
  if (email) message = `${message} Customer: ${email}.`
  if (expiresAt) message = `${message} Expired at ${expiresAt}.`
  message = `${message} (session ${session.id})`

  return {
    diagnostics: {
      code: 'checkout.session.expired',
      message,
    },
    paymentStatus: 'expired',
    orderStatus: 'expired',
    invoiceStatus: 'expired',
    invoiceStripeStatus: 'checkout.session.expired',
  }
}

async function resolvePaymentFailureDiagnostics(
  pi: Stripe.PaymentIntent,
  logger?: (message: string) => void,
): Promise<PaymentFailureDiagnostics> {
  const stripe = getStripe()
  const failure = pi.last_payment_error
  const additionalCodes = new Set<string>()

  const declineCode = (failure?.decline_code || '').trim() || undefined
  const docUrl = (failure?.doc_url || '').trim() || undefined

  let failureCode = (failure?.code || '').trim() || undefined
  let failureMessage = (failure?.message || pi.cancellation_reason)?.trim() || undefined

  if (declineCode) {
    if (!failureCode) failureCode = declineCode
    else if (failureCode !== declineCode) additionalCodes.add(declineCode)
  }

  const shouldLoadCharge =
    Boolean(stripe) && (typeof pi.latest_charge === 'string' || !failureCode || !failureMessage)

  if (shouldLoadCharge) {
    try {
      let charge: Stripe.Charge | null = null
      if (typeof pi.latest_charge === 'string') {
        charge = await stripe.charges.retrieve(pi.latest_charge)
      } else {
        const chargeList = await stripe.charges.list({payment_intent: pi.id, limit: 1})
        charge = chargeList?.data?.[0] || null
      }

      if (charge) {
        const outcomeReason = (charge.outcome?.reason || '').trim()
        const chargeFailureCode = (charge.failure_code || '').trim()
        const networkStatus = (charge.outcome?.network_status || '').trim()
        const sellerMessage = (charge.outcome?.seller_message || '').trim()
        const chargeFailureMessage = (charge.failure_message || '').trim()

        if (outcomeReason) {
          if (failureCode && failureCode !== outcomeReason) {
            additionalCodes.add(failureCode)
          }
          failureCode = outcomeReason
        } else if (!failureCode && chargeFailureCode) {
          failureCode = chargeFailureCode
        } else if (failureCode && chargeFailureCode && failureCode !== chargeFailureCode) {
          additionalCodes.add(chargeFailureCode)
        }

        if (networkStatus && networkStatus !== failureCode) {
          additionalCodes.add(networkStatus)
        }

        if (!failureMessage && (sellerMessage || chargeFailureMessage)) {
          failureMessage = sellerMessage || chargeFailureMessage || undefined
        } else if (failureMessage) {
          const lowerMessage = failureMessage.toLowerCase()
          if (sellerMessage && !lowerMessage.includes(sellerMessage.toLowerCase())) {
            failureMessage = `${failureMessage} (${sellerMessage})`
          } else if (
            chargeFailureMessage &&
            !lowerMessage.includes(chargeFailureMessage.toLowerCase())
          ) {
            failureMessage = `${failureMessage} (${chargeFailureMessage})`
          }
        }
      }
    } catch (err) {
      logger?.(
        `⚠️ Failed to load charge for payment failure details: ${(err as any)?.message || err}`,
      )
    }
  }

  const codes = Array.from(
    new Set(
      [failureCode, ...additionalCodes].filter(
        (code): code is string => typeof code === 'string' && Boolean(code.trim()),
      ),
    ),
  )

  if (codes.length === 0) {
    failureCode = undefined
  } else {
    failureCode = codes.join(' | ')
  }

  if (docUrl) {
    if (failureMessage) failureMessage = `${failureMessage} (${docUrl})`
    else failureMessage = docUrl
  }

  if (failureMessage) {
    const lowerMessage = failureMessage.toLowerCase()
    const codesNotMentioned = codes.filter((code) => !lowerMessage.includes(code.toLowerCase()))
    if (codesNotMentioned.length > 0) {
      failureMessage = `${failureMessage} (codes: ${codesNotMentioned.join(', ')})`
    }
  } else if (codes.length > 0) {
    failureMessage = `Payment failed (codes: ${codes.join(', ')})`
  }

  return {code: failureCode, message: failureMessage}
}

async function findInvoiceId(order: OrderDoc, paymentIntentId?: string): Promise<string | null> {
  const sanity = getSanity()
  if (order.invoiceRef?._ref) {
    const normalized = normalizeSanityId(order.invoiceRef._ref)
    if (normalized) return normalized
  }

  if (paymentIntentId) {
    const byPI = await sanity.fetch<string | null>(
      `*[_type == "invoice" && paymentIntentId == $pi][0]._id`,
      {pi: paymentIntentId},
    )
    if (byPI) return normalizeSanityId(byPI) || byPI
  }

  if (order.orderNumber) {
    const byOrderNumber = await sanity.fetch<string | null>(
      `*[_type == "invoice" && (
        orderNumber == $orderNumber ||
        orderRef._ref == $orderId ||
        orderRef->_ref == $orderId
      )][0]._id`,
      {orderNumber: order.orderNumber, orderId: order._id},
    )
    if (byOrderNumber) return normalizeSanityId(byOrderNumber) || byOrderNumber
  }

  return null
}

async function updateInvoice(
  invoiceId: string,
  diagnostics: PaymentFailureDiagnostics,
  options: {
    paymentStatus?: string
    invoiceStatus?: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'cancelled' | 'expired'
    invoiceStripeStatus?: string
    dryRun?: boolean
    paymentIntent?: Stripe.PaymentIntent | null
    session?: Stripe.Checkout.Session | null
    logger?: (message: string) => void
  } = {},
) {
  const sanity = getSanity()
  const {
    paymentStatus,
    invoiceStatus,
    invoiceStripeStatus,
    dryRun,
    paymentIntent,
    session,
    logger,
  } = options
  const patch: Record<string, any> = {}
  let hasChanges = false

  if (diagnostics.code) {
    patch.paymentFailureCode = diagnostics.code
    hasChanges = true
  }
  if (diagnostics.message) {
    patch.paymentFailureMessage = diagnostics.message
    hasChanges = true
  }
  if (invoiceStatus) {
    patch.status = invoiceStatus
    hasChanges = true
  } else if (paymentStatus === 'canceled') {
    patch.status = 'cancelled'
    hasChanges = true
  }
  if (invoiceStripeStatus) {
    patch.stripeInvoiceStatus = invoiceStripeStatus
    hasChanges = true
  }
  const summary = buildStripeSummary({
    paymentIntent,
    session,
    failureCode: diagnostics.code,
    failureMessage: diagnostics.message,
  })
  if (Object.keys(summary).length > 0) {
    patch.stripeSummary = summary
    hasChanges = true
  }

  if (!hasChanges) return
  patch.stripeLastSyncedAt = new Date().toISOString()

  if (dryRun) {
    logger?.(`   • Invoice ${invoiceId}: (dry run) would patch ${JSON.stringify(patch)}`)
    return
  }

  await sanity.patch(invoiceId).set(patch).commit({autoGenerateArrayKeys: true})
  logger?.(`   • Invoice ${invoiceId}: payment failure details updated`)
}

async function processOrder(
  order: OrderDoc,
  options: PaymentFailuresBackfillOptions,
): Promise<{changed: boolean; skippedReason?: string}> {
  const logger = options.logger
  const label = order.orderNumber || order._id
  logger?.(`Processing ${label}…`)

  const paymentIntent = await fetchPaymentIntent(order, logger)
  let session: Stripe.Checkout.Session | null = null
  let diagnostics: PaymentFailureDiagnostics | null = null
  let paymentStatus: string | undefined
  let orderStatus: 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'expired' | undefined
  let invoiceStatus:
    | 'pending'
    | 'paid'
    | 'refunded'
    | 'partially_refunded'
    | 'cancelled'
    | 'expired'
    | undefined
  let invoiceStripeStatus: string | undefined

  if (paymentIntent) {
    diagnostics = await resolvePaymentFailureDiagnostics(paymentIntent, logger)
    const normalizedPiStatus = (paymentIntent.status || '').toLowerCase()
    paymentStatus =
      normalizedPiStatus &&
      !['succeeded', 'processing', 'requires_capture'].includes(normalizedPiStatus)
        ? 'failed'
        : normalizedPiStatus || undefined
    if (normalizedPiStatus === 'canceled') {
      orderStatus = 'cancelled'
      invoiceStatus = 'cancelled'
    }
    invoiceStripeStatus = 'payment_intent.payment_failed'
  } else if (order.stripeSessionId) {
    session = await fetchCheckoutSession(order.stripeSessionId, logger)
    if (!session) {
      logger?.('   • Skipped (checkout session not found)')
      return {changed: false, skippedReason: 'session_not_found'}
    }
    const sessionResult = resolveCheckoutExpirationDiagnostics(session)
    diagnostics = sessionResult.diagnostics
    paymentStatus = sessionResult.paymentStatus
    orderStatus = sessionResult.orderStatus
    invoiceStatus = sessionResult.invoiceStatus
    invoiceStripeStatus = sessionResult.invoiceStripeStatus
  } else {
    logger?.('   • Skipped (payment intent not found)')
    return {changed: false, skippedReason: 'no_payment_intent'}
  }

  if (!diagnostics) {
    logger?.('   • Skipped (no diagnostics available)')
    return {changed: false, skippedReason: 'no_diagnostics'}
  }

  const existingCode = (order.paymentFailureCode || '').trim()
  const existingMessage = (order.paymentFailureMessage || '').trim()

  const orderPatch: Record<string, any> = {}
  let hasChanges = false

  if (diagnostics.code && diagnostics.code !== existingCode) {
    orderPatch.paymentFailureCode = diagnostics.code
    hasChanges = true
  }
  if (diagnostics.message && diagnostics.message !== existingMessage) {
    orderPatch.paymentFailureMessage = diagnostics.message
    hasChanges = true
  }

  if (paymentStatus && paymentStatus !== order.paymentStatus) {
    orderPatch.paymentStatus = paymentStatus
    hasChanges = true
  }
  if (orderStatus && orderStatus !== order.status) {
    orderPatch.status = orderStatus
    hasChanges = true
  }
  const summary = buildStripeSummary({
    paymentIntent,
    session,
    failureCode: diagnostics.code,
    failureMessage: diagnostics.message,
  })
  if (Object.keys(summary).length > 0) {
    orderPatch.stripeSummary = summary
    hasChanges = true
  }

  if (!hasChanges) {
    logger?.('   • No new diagnostics to apply')
    return {changed: false, skippedReason: 'no_changes'}
  }

  orderPatch.stripeLastSyncedAt = new Date().toISOString()

  const sanity = getSanity()

  if (options.dryRun) {
    logger?.(`   • (dry run) would patch order with ${JSON.stringify(orderPatch)}`)
  } else {
    await sanity.patch(order._id).set(orderPatch).commit({autoGenerateArrayKeys: true})
    logger?.('   • Order updated')
  }

  const invoiceId = await findInvoiceId(order, paymentIntent?.id)
  if (invoiceId) {
    await updateInvoice(invoiceId, diagnostics, {
      paymentStatus,
      invoiceStatus,
      invoiceStripeStatus,
      paymentIntent,
      session,
      dryRun: options.dryRun,
      logger,
    })
  }

  return {changed: true}
}

export async function runPaymentFailuresBackfill(
  rawOptions: PaymentFailuresBackfillOptions = {},
): Promise<PaymentFailuresBackfillResult> {
  ensureEnvLoaded()
  const options: PaymentFailuresBackfillOptions = {
    dryRun: Boolean(rawOptions.dryRun),
    limit: rawOptions.limit,
    orderId: rawOptions.orderId?.trim(),
    orderNumber: rawOptions.orderNumber?.trim(),
    paymentIntentId: rawOptions.paymentIntentId?.trim(),
    logger: rawOptions.logger,
  }

  const orders = await fetchOrders(options)
  if (!orders.length) {
    if (options.orderId || options.orderNumber || options.paymentIntentId) {
      options.logger?.('No matching orders found for the provided filter.')
    } else {
      options.logger?.('No orders need payment failure backfill.')
    }
    return {
      dryRun: options.dryRun ?? false,
      total: 0,
      updated: 0,
      skipped: 0,
      filters: {
        orderId: options.orderId,
        orderNumber: options.orderNumber,
        paymentIntentId: options.paymentIntentId,
      },
    }
  }

  options.logger?.(`Found ${orders.length} order${orders.length === 1 ? '' : 's'} to process.`)
  let updated = 0
  let skipped = 0

  for (const order of orders) {
    try {
      const {changed} = await processOrder(order, options)
      if (changed) updated += 1
      else skipped += 1
    } catch (err) {
      skipped += 1
      options.logger?.(
        `❌ Error processing ${order.orderNumber || order._id}: ${(err as any)?.message || err}`,
      )
    }
  }

  const suffix = options.dryRun ? ' (dry run)' : ''
  options.logger?.(
    `Done. Updated ${updated}/${orders.length} order${orders.length === 1 ? '' : 's'}${suffix}.`,
  )

  return {
    dryRun: Boolean(options.dryRun),
    total: orders.length,
    updated,
    skipped,
    filters: {
      orderId: options.orderId,
      orderNumber: options.orderNumber,
      paymentIntentId: options.paymentIntentId,
    },
  }
}
