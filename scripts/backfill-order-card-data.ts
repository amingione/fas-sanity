#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'

type NormalizedContactAddress = {
  name?: string
  email?: string
  phone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  paymentIntentId?: string
  stripeSessionId?: string
  cardBrand?: string
  cardLast4?: string
  receiptUrl?: string
  stripeCustomerId?: string
  customerEmail?: string
  customerRef?: {_ref: string}
  billingAddress?: NormalizedContactAddress
}

type CliOptions = {
  limit?: number
  dryRun: boolean
  id?: string
}

const PAYMENT_INTENT_EXPAND_FIELDS: string[] = [
  'charges.data.payment_method_details',
  'charges.data.billing_details',
  'latest_charge.payment_method_details',
  'latest_charge.billing_details',
]

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function parseCliOptions(argv: string[]): CliOptions {
  let limit: number | undefined
  let dryRun = false
  let id: string | undefined
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true
      continue
    }
    if (arg === '--id') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --id')
      }
      id = value.trim()
      i += 1
      continue
    }
    if (arg === '--limit') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --limit')
      }
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value "${value}"`)
      }
      limit = Math.floor(parsed)
      i += 1
      continue
    }
  }
  return {limit, dryRun, id}
}

function createSanityClient() {
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
  const token = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN || ''
  if (!projectId || !dataset || !token) {
    throw new Error('Missing Sanity credentials (projectId/dataset/token).')
  }
  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-04-10',
    useCdn: false,
  })
}

function createStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.')
  }
  return new Stripe(key, {
    apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
  })
}

function normalizeStripeContactAddress(
  address?: Stripe.Address | null,
  contact?: {name?: string | null; email?: string | null; phone?: string | null},
): NormalizedContactAddress | undefined {
  if (!address) return undefined
  const normalized: NormalizedContactAddress = {}
  if (contact?.name) normalized.name = contact.name
  if (contact?.email) normalized.email = contact.email
  if (contact?.phone) normalized.phone = contact.phone
  if (address.line1) normalized.addressLine1 = address.line1
  if (address.line2) normalized.addressLine2 = address.line2
  if (address.city) normalized.city = address.city
  if (address.state) normalized.state = address.state
  if (address.postal_code) normalized.postalCode = address.postal_code
  if (address.country) normalized.country = address.country
  return normalized
}

function resolveStripeCustomerId(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id.trim() || undefined
  }
  return undefined
}

async function findCustomerId(
  sanity: ReturnType<typeof createSanityClient>,
  order: OrderDoc,
  stripeCustomerId?: string,
): Promise<string | null> {
  if (order.customerRef?._ref) return order.customerRef._ref
  if (stripeCustomerId) {
    const byStripe = await sanity.fetch<string | null>(
      '*[_type == "customer" && stripeCustomerId == $id][0]._id',
      {id: stripeCustomerId},
    )
    if (byStripe) return byStripe
  }
  const email = (order.customerEmail || '').trim().toLowerCase()
  if (email) {
    const byEmail = await sanity.fetch<string | null>(
      '*[_type == "customer" && defined(email) && lower(email) == $email][0]._id',
      {email},
    )
    if (byEmail) return byEmail
  }
  return null
}

const idVariants = (id?: string): string[] => {
  if (!id) return []
  const clean = id.trim()
  if (!clean) return []
  const variants = new Set<string>([clean])
  if (clean.startsWith('drafts.')) variants.add(clean.replace('drafts.', ''))
  else variants.add(`drafts.${clean}`)
  return Array.from(variants)
}

const ORDER_QUERY_BASE = `*[_type == "order" && (defined(paymentIntentId) || defined(stripeSessionId)) && (
  !defined(cardBrand) || cardBrand == "" ||
  !defined(cardLast4) || cardLast4 == "" ||
  !defined(receiptUrl) || receiptUrl == "" ||
  !defined(stripeCustomerId) || stripeCustomerId == ""
)] | order(_createdAt asc)[0...$limit]{
  _id,
  orderNumber,
  paymentIntentId,
  stripeSessionId,
  cardBrand,
  cardLast4,
  receiptUrl,
  stripeCustomerId,
  customerEmail,
  customerRef,
  billingAddress
}`
const ORDER_QUERY_WITH_ID = `*[
  _type == "order" &&
  (
    _id in $ids ||
    stripeSessionId == $lookup ||
    paymentIntentId == $lookup
  ) &&
  (defined(paymentIntentId) || defined(stripeSessionId)) &&
  (
    !defined(cardBrand) || cardBrand == "" ||
    !defined(cardLast4) || cardLast4 == "" ||
    !defined(receiptUrl) || receiptUrl == "" ||
    !defined(stripeCustomerId) || stripeCustomerId == ""
  )
][0...$limit]{
  _id,
  orderNumber,
  paymentIntentId,
  stripeSessionId,
  cardBrand,
  cardLast4,
  receiptUrl,
  stripeCustomerId,
  customerEmail,
  customerRef,
  billingAddress
}`

function describeOrder(order: OrderDoc): string {
  return order.orderNumber ? `${order.orderNumber} (${order._id})` : order._id
}

async function fetchPaymentIntent(stripe: Stripe, id: string): Promise<Stripe.PaymentIntent | null> {
  const normalized = id.trim()
  if (!normalized) return null
  try {
    return await stripe.paymentIntents.retrieve(normalized, {expand: [...PAYMENT_INTENT_EXPAND_FIELDS]})
  } catch (err) {
    console.warn(`Failed to load payment intent ${normalized}`, err)
    return null
  }
}

async function fetchCheckoutSession(
  stripe: Stripe,
  id?: string,
): Promise<Stripe.Checkout.Session | null> {
  const normalized = (id || '').trim()
  if (!normalized) return null
  try {
    return await stripe.checkout.sessions.retrieve(normalized, {
      expand: [
        'payment_intent.charges.data.payment_method_details',
        'payment_intent.charges.data.billing_details',
      ],
    })
  } catch (err) {
    console.warn(`Failed to load checkout session ${normalized}`, err)
    return null
  }
}

function resolveChargeFromPaymentIntent(paymentIntent?: Stripe.PaymentIntent | null): Stripe.Charge | null {
  if (!paymentIntent) return null
  const charges = (((paymentIntent as any)?.charges?.data || []) as Stripe.Charge[]) || []
  if (charges.length) {
    return charges[charges.length - 1] as Stripe.Charge
  }
  if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object') {
    return paymentIntent.latest_charge as Stripe.Charge
  }
  return null
}

function resolveChargeFromSession(session?: Stripe.Checkout.Session | null): Stripe.Charge | null {
  if (!session?.payment_intent) return null
  if (typeof session.payment_intent === 'object' && session.payment_intent) {
    const pi = session.payment_intent as Stripe.PaymentIntent
    const charges = (((pi as any)?.charges?.data || []) as Stripe.Charge[]) || []
    if (charges.length) return charges[charges.length - 1] as Stripe.Charge
  }
  return null
}

async function loadStripeDetails(
  stripe: Stripe,
  order: OrderDoc,
): Promise<{paymentIntent: Stripe.PaymentIntent | null; session: Stripe.Checkout.Session | null}> {
  let paymentIntent: Stripe.PaymentIntent | null = null
  let session: Stripe.Checkout.Session | null = null

  if (order.paymentIntentId) {
    paymentIntent = await fetchPaymentIntent(stripe, order.paymentIntentId)
  }
  if (!paymentIntent && order.stripeSessionId) {
    session = await fetchCheckoutSession(stripe, order.stripeSessionId)
    const sessionIntent = session?.payment_intent
    if (sessionIntent && typeof sessionIntent === 'object') {
      paymentIntent = sessionIntent as Stripe.PaymentIntent
    } else if (typeof sessionIntent === 'string') {
      paymentIntent = await fetchPaymentIntent(stripe, sessionIntent)
    }
  }
  if (!session && order.stripeSessionId) {
    session = await fetchCheckoutSession(stripe, order.stripeSessionId)
  }

  return {paymentIntent, session}
}

async function patchCustomer(
  sanity: ReturnType<typeof createSanityClient>,
  customerId: string | null,
  stripeCustomerId: string | undefined,
  billingAddress: NormalizedContactAddress | undefined,
  dryRun: boolean,
) {
  if (!customerId) return
  if (!stripeCustomerId && !billingAddress) return
  const patch: Record<string, any> = {stripeLastSyncedAt: new Date().toISOString()}
  if (stripeCustomerId) patch.stripeCustomerId = stripeCustomerId
  if (billingAddress) patch.billingAddress = billingAddress
  if (dryRun) {
    console.log(`[dry-run] Would patch customer ${customerId}`, patch)
    return
  }
  await sanity.patch(customerId).set(patch).commit({autoGenerateArrayKeys: true})
}

async function processOrder(
  sanity: ReturnType<typeof createSanityClient>,
  stripe: Stripe,
  order: OrderDoc,
  dryRun: boolean,
): Promise<boolean> {
  const {paymentIntent, session} = await loadStripeDetails(stripe, order)
  if (!paymentIntent && !session) {
    console.warn(
      `Skipping ${describeOrder(order)} (unable to load payment intent or checkout session)`,
    )
    return false
  }

  const charge =
    resolveChargeFromPaymentIntent(paymentIntent) || resolveChargeFromSession(session) || null

  const cardBrand = charge?.payment_method_details?.card?.brand
  const cardLast4 = charge?.payment_method_details?.card?.last4
  const receiptUrl = charge?.receipt_url
  const stripeCustomerId =
    resolveStripeCustomerId(paymentIntent?.customer) ||
    resolveStripeCustomerId(session?.customer || null)
  const billingAddress = normalizeStripeContactAddress(charge?.billing_details?.address, {
    name: charge?.billing_details?.name || undefined,
    email:
      charge?.billing_details?.email ||
      paymentIntent?.receipt_email ||
      session?.customer_details?.email ||
      undefined,
    phone: charge?.billing_details?.phone || undefined,
  }) ||
    normalizeStripeContactAddress(
      (session?.customer_details?.address as Stripe.Address | undefined) || undefined,
      {
        name: session?.customer_details?.name || undefined,
        email: session?.customer_details?.email || undefined,
        phone: session?.customer_details?.phone || undefined,
      },
    )

  const orderPatch: Record<string, any> = {}
  if (cardBrand && cardBrand !== order.cardBrand) orderPatch.cardBrand = cardBrand
  if (cardLast4 && cardLast4 !== order.cardLast4) orderPatch.cardLast4 = cardLast4
  if (receiptUrl && receiptUrl !== order.receiptUrl) orderPatch.receiptUrl = receiptUrl
  if (stripeCustomerId) {
    orderPatch.stripeCustomerId = stripeCustomerId
  }
  if (billingAddress) orderPatch.billingAddress = billingAddress
  if (paymentIntent?.id && paymentIntent.id !== order.paymentIntentId) {
    orderPatch.paymentIntentId = paymentIntent.id
  }
  if (Object.keys(orderPatch).length) {
    orderPatch.stripeLastSyncedAt = new Date().toISOString()
    if (dryRun) {
      console.log(`[dry-run] Would patch order ${describeOrder(order)}`, orderPatch)
    } else {
      const targets = idVariants(order._id)
      for (const targetId of targets) {
        await sanity.patch(targetId).set(orderPatch).commit({autoGenerateArrayKeys: true})
      }
      console.log(`Updated order ${describeOrder(order)} on ${targets.join(', ')}`)
    }
  } else {
    console.log(`No order patch required for ${describeOrder(order)}`)
  }

  const customerId = await findCustomerId(sanity, order, stripeCustomerId)
  if (customerId) {
    await patchCustomer(sanity, customerId, stripeCustomerId, billingAddress, dryRun)
  } else {
    console.warn(`Unable to locate customer for ${describeOrder(order)}`)
  }

  return true
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2))
  const sanity = createSanityClient()
  const stripe = createStripeClient()

  const batchSize = options.limit || 100
  let batchNumber = 0
  let succeeded = 0
  let failed = 0
  let totalProcessed = 0

  while (true) {
    const orders = await sanity.fetch<OrderDoc[]>(
      options.id ? ORDER_QUERY_WITH_ID : ORDER_QUERY_BASE,
      options.id
        ? {ids: idVariants(options.id), lookup: options.id.trim(), limit: batchSize}
        : {limit: batchSize},
    )
    if (!orders.length) {
      if (batchNumber === 0) {
        console.log('No orders require Stripe card data backfill.')
      }
      break
    }

    batchNumber += 1
    console.log(
      `Processing batch ${batchNumber} (${orders.length} order${
        orders.length === 1 ? '' : 's'
      })...`,
    )

    let processedInBatch = 0

    for (const order of orders) {
      totalProcessed += 1
      try {
        const ok = await processOrder(sanity, stripe, order, options.dryRun)
        if (ok) {
          succeeded += 1
          processedInBatch += 1
        } else {
          failed += 1
        }
      } catch (err) {
        failed += 1
        console.warn(`Unexpected error processing ${describeOrder(order)}`, err)
      }
    }

    if (processedInBatch === 0) {
      console.warn('No orders in this batch could be processed; stopping to avoid infinite loop.')
      break
    }

    // If targeting a single id, stop after the first batch.
    if (options.id) break
  }

  console.log(
    `Backfill complete. processed=${totalProcessed}, succeeded=${succeeded}, failed=${failed}, dryRun=${options.dryRun}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
