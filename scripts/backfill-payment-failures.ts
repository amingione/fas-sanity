#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import Stripe from 'stripe'
import { createClient } from '@sanity/client'

type CliOptions = {
  dryRun: boolean
  limit?: number
  orderId?: string
  orderNumber?: string
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  paymentIntentId?: string
  stripeSessionId?: string
  paymentStatus?: string
  status?: string
  paymentFailureCode?: string
  paymentFailureMessage?: string
  invoiceRef?: { _ref?: string }
}

type PaymentFailureDiagnostics = {
  code?: string
  message?: string
}

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false })
  }
}

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_KEY) {
  console.error('Missing STRIPE_SECRET_KEY in environment. Aborting.')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_KEY)

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
  console.error('Missing Sanity configuration (SANITY_STUDIO_PROJECT_ID / SANITY_STUDIO_DATASET / SANITY_API_TOKEN).')
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

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2)
  const getValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag)
    if (idx === -1) return undefined
    const value = args[idx + 1]
    if (!value || value.startsWith('--')) return undefined
    return value
  }

  const dryRun = args.includes('--dry-run')
  const limitValue = getValue('--limit')
  const orderId = getValue('--order')
  const orderNumber = getValue('--order-number')

  let limit: number | undefined
  if (limitValue) {
    const parsed = Number.parseInt(limitValue, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      console.error(`Invalid --limit value "${limitValue}" (expected positive integer).`)
      process.exit(1)
    }
    limit = parsed
  }

  return {
    dryRun,
    limit,
    orderId: orderId ? normalizeSanityId(orderId) : undefined,
    orderNumber: orderNumber ? orderNumber.trim().toUpperCase() : undefined,
  }
}

function normalizeSanityId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

async function fetchOrders(options: CliOptions): Promise<OrderDoc[]> {
  const params: Record<string, any> = {}
  const conditions: string[] = ['_type == "order"']

  if (options.orderId) {
    conditions.push('_id in $orderIds')
    params.orderIds = [options.orderId, `drafts.${options.orderId}`]
  } else if (options.orderNumber) {
    conditions.push('orderNumber == $orderNumber')
    params.orderNumber = options.orderNumber
  } else {
    conditions.push('(defined(paymentIntentId) || defined(stripeSessionId))')
    conditions.push('(!defined(paymentFailureCode) || paymentFailureCode == "" || !defined(paymentFailureMessage) || paymentFailureMessage == "")')
    conditions.push('(!defined(paymentStatus) || paymentStatus in $statuses)')
    params.statuses = TARGET_PAYMENT_STATUSES
  }

  const query = `*[${conditions.join(' && ')}] | order(_createdAt asc){
    _id,
    orderNumber,
    paymentIntentId,
    stripeSessionId,
    paymentStatus,
    status,
    paymentFailureCode,
    paymentFailureMessage,
    invoiceRef
  }`

  const docs = await sanity.fetch<OrderDoc[]>(query, params)
  if (!docs.length) return []
  if (options.limit && options.limit > 0) {
    return docs.slice(0, options.limit)
  }
  return docs
}

async function fetchPaymentIntent(order: OrderDoc): Promise<Stripe.PaymentIntent | null> {
  const tried: string[] = []

  if (order.paymentIntentId) {
    tried.push(order.paymentIntentId)
    try {
      return await stripe.paymentIntents.retrieve(order.paymentIntentId)
    } catch (err) {
      console.warn(`⚠️  Unable to load PaymentIntent ${order.paymentIntentId} (${order.orderNumber || order._id}):`, (err as any)?.message || err)
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
          console.warn(`⚠️  Failed retrieving PI ${paymentIntent} referenced by ${order.orderNumber || order._id}:`, (err as any)?.message || err)
        }
      }
    } catch (err) {
      console.warn(`⚠️  Unable to load Checkout session ${order.stripeSessionId} (${order.orderNumber || order._id}):`, (err as any)?.message || err)
    }
  }

  if (tried.length === 0) {
    console.warn(`⚠️  ${order.orderNumber || order._id}: no Stripe identifiers available.`)
  }
  return null
}

async function fetchCheckoutSession(id: string): Promise<Stripe.Checkout.Session | null> {
  if (!id) return null
  if (!stripe) return null
  try {
    return await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] })
  } catch (err) {
    console.warn(`⚠️  Unable to load Checkout session ${id}:`, (err as any)?.message || err)
    return null
  }
}

type SessionFailureResult = {
  diagnostics: PaymentFailureDiagnostics
  paymentStatus: string
  orderStatus: 'cancelled'
  invoiceStatus: 'cancelled'
  invoiceStripeStatus: string
}

function resolveCheckoutExpirationDiagnostics(session: Stripe.Checkout.Session): SessionFailureResult {
  const email =
    (session.customer_details?.email ||
      session.customer_email ||
      (session.metadata || {})['customer_email'] ||
      '')?.toString().trim() || ''
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
    paymentStatus: (session.payment_status || 'expired') as string,
    orderStatus: 'cancelled',
    invoiceStatus: 'cancelled',
    invoiceStripeStatus: 'checkout.session.expired',
  }
}

async function resolvePaymentFailureDiagnostics(pi: Stripe.PaymentIntent): Promise<PaymentFailureDiagnostics> {
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
    Boolean(stripe) &&
    (typeof pi.latest_charge === 'string' || !failureCode || !failureMessage)

  if (shouldLoadCharge) {
    try {
      let charge: Stripe.Charge | null = null
      if (typeof pi.latest_charge === 'string') {
        charge = await stripe.charges.retrieve(pi.latest_charge)
      } else {
        const chargeList = await stripe.charges.list({ payment_intent: pi.id, limit: 1 })
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
      console.warn('⚠️  Failed to load charge for payment failure details', (err as any)?.message || err)
    }
  }

  const codes = Array.from(
    new Set(
      [failureCode, ...additionalCodes].filter(
        (code): code is string => typeof code === 'string' && Boolean(code.trim())
      )
    )
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

  return { code: failureCode, message: failureMessage }
}

async function findInvoiceId(order: OrderDoc, paymentIntentId?: string): Promise<string | null> {
  if (order.invoiceRef?._ref) {
    const normalized = normalizeSanityId(order.invoiceRef._ref)
    if (normalized) return normalized
  }

  if (paymentIntentId) {
    const byPI = await sanity.fetch<string | null>(
      `*[_type == "invoice" && paymentIntentId == $pi][0]._id`,
      { pi: paymentIntentId }
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
      { orderNumber: order.orderNumber, orderId: order._id }
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
    invoiceStatus?: 'pending' | 'paid' | 'refunded' | 'cancelled'
    invoiceStripeStatus?: string
    dryRun?: boolean
  } = {}
) {
  const { paymentStatus, invoiceStatus, invoiceStripeStatus, dryRun } = options
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

  if (!hasChanges) return
  patch.stripeLastSyncedAt = new Date().toISOString()

  if (dryRun) {
    console.log(`   • Invoice ${invoiceId}: (dry run) would patch`, patch)
    return
  }

  await sanity.patch(invoiceId).set(patch).commit({ autoGenerateArrayKeys: true })
  console.log(`   • Invoice ${invoiceId}: payment failure details updated`)
}

async function processOrder(order: OrderDoc, options: CliOptions): Promise<boolean> {
  const label = order.orderNumber || order._id
  console.log(`Processing ${label}…`)

  const paymentIntent = await fetchPaymentIntent(order)
  let session: Stripe.Checkout.Session | null = null
  let diagnostics: PaymentFailureDiagnostics | null = null
  let paymentStatus: string | undefined
  let orderStatus: 'pending' | 'paid' | 'fulfilled' | 'cancelled' | undefined
  let invoiceStatus: 'pending' | 'paid' | 'refunded' | 'cancelled' | undefined
  let invoiceStripeStatus: string | undefined

  if (paymentIntent) {
    diagnostics = await resolvePaymentFailureDiagnostics(paymentIntent)
    paymentStatus = paymentIntent.status || undefined
    if (paymentStatus === 'canceled') {
      orderStatus = 'cancelled'
      invoiceStatus = 'cancelled'
    }
    invoiceStripeStatus = 'payment_intent.payment_failed'
  } else if (order.stripeSessionId) {
    session = await fetchCheckoutSession(order.stripeSessionId)
    if (!session) {
      console.log('   • Skipped (checkout session not found)')
      return false
    }
    const sessionResult = resolveCheckoutExpirationDiagnostics(session)
    diagnostics = sessionResult.diagnostics
    paymentStatus = sessionResult.paymentStatus
    orderStatus = sessionResult.orderStatus
    invoiceStatus = sessionResult.invoiceStatus
    invoiceStripeStatus = sessionResult.invoiceStripeStatus
  } else {
    console.log('   • Skipped (payment intent not found)')
    return false
  }

  if (!diagnostics) {
    console.log('   • Skipped (no diagnostics available)')
    return false
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

  if (!hasChanges) {
    console.log('   • No new diagnostics to apply')
    return false
  }

  orderPatch.stripeLastSyncedAt = new Date().toISOString()

  if (options.dryRun) {
    console.log('   • (dry run) would patch order with', orderPatch)
  } else {
    await sanity.patch(order._id).set(orderPatch).commit({ autoGenerateArrayKeys: true })
    console.log('   • Order updated')
  }

  const invoiceId = await findInvoiceId(order, paymentIntent?.id)
  if (invoiceId) {
    await updateInvoice(invoiceId, diagnostics, {
      paymentStatus,
      invoiceStatus,
      invoiceStripeStatus,
      dryRun: options.dryRun,
    })
  }

  return true
}

async function main() {
  const options = parseCliOptions()
  const orders = await fetchOrders(options)

  if (!orders.length) {
    if (options.orderId || options.orderNumber) {
      console.log('No matching orders found for the provided filter.')
    } else {
      console.log('No orders need payment failure backfill.')
    }
    return
  }

  console.log(`Found ${orders.length} order${orders.length === 1 ? '' : 's'} to process.`)
  let updated = 0

  for (const order of orders) {
    try {
      const changed = await processOrder(order, options)
      if (changed) updated += 1
    } catch (err) {
      console.error(`❌ Error processing ${order.orderNumber || order._id}:`, (err as any)?.message || err)
    }
  }

  const suffix = options.dryRun ? ' (dry run)' : ''
  console.log(`Done. Updated ${updated}/${orders.length} order${orders.length === 1 ? '' : 's'}${suffix}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
