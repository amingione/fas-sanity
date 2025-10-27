import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import type {SanityDocumentStub} from '@sanity/client'
import {randomUUID} from 'crypto'
import {resolveNetlifyBase, generatePackingSlipAsset} from '../lib/packingSlip'
import {syncOrderToShipStation} from '../lib/shipstation'
import {mapStripeLineItem} from '../lib/stripeCartItem'
import {enrichCartItemsFromSanity} from '../lib/cartEnrichment'
import type {CartItem} from '../lib/cartEnrichment'
import {updateCustomerProfileForOrder} from '../lib/customerSnapshot'
import {buildStripeSummary} from '../lib/stripeSummary'
import {resolveStripeShippingDetails} from '../lib/stripeShipping'

// CORS helper (same pattern used elsewhere)
const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')
function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) o = origin
    else if (DEFAULT_ORIGINS.includes(origin)) o = origin
  }
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

function idVariants(id?: string): string[] {
  if (!id) return []
  const ids = [id]
  if (id.startsWith('drafts.')) ids.push(id.replace('drafts.', ''))
  else ids.push(`drafts.${id}`)
  return Array.from(new Set(ids))
}

function createOrderSlug(source?: string | null, fallback?: string | null): string | null {
  const raw = (source || fallback || '').toString().trim()
  if (!raw) return null
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  return slug || null
}

const ORDER_NUMBER_PREFIX = 'FAS'

type NormalizedMetadata = Record<string, string>
type OrderDocument = SanityDocumentStub<Record<string, any>> & Record<string, any>

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function candidateFromSessionId(id?: string | null): string | undefined {
  if (!id) return undefined
  const core = id
    .toString()
    .trim()
    .replace(/^cs_(?:test|live)_/i, '')
  const digits = core.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function resolveOrderNumber(options: {
  metadataOrderNumber?: string
  invoiceNumber?: string
  fallbackId?: string
}): Promise<string> {
  const candidates = [
    sanitizeOrderNumber(options.metadataOrderNumber),
    sanitizeOrderNumber(options.invoiceNumber),
    candidateFromSessionId(options.fallbackId),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      {num: candidate},
    )
    if (!Number(exists)) return candidate
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomCandidate = `${ORDER_NUMBER_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      {num: randomCandidate},
    )
    if (!Number(exists)) return randomCandidate
  }

  return `${ORDER_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
}

function pickString(...values: Array<any>): string | undefined {
  for (const value of values) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      const trimmed = String(value).trim()
      if (trimmed) return trimmed
    }
  }
  return undefined
}

function buildStudioAddress(
  source: any,
  type: 'billTo' | 'shipTo',
  opts: {fallbackEmail?: string; fallbackName?: string} = {},
): Record<string, any> | undefined {
  if (!source || typeof source !== 'object') return undefined
  const name = pickString(source.name, source.fullName, opts.fallbackName)
  const email = pickString(source.email, opts.fallbackEmail)
  const phone = pickString(source.phone, source.phoneNumber)
  const address_line1 = pickString(source.address_line1, source.addressLine1, source.line1)
  const address_line2 = pickString(source.address_line2, source.addressLine2, source.line2)
  const city_locality = pickString(source.city_locality, source.city)
  const state_province = pickString(source.state_province, source.state, source.region)
  const postal_code = pickString(source.postal_code, source.postalCode, source.zip)
  const country_code = pickString(source.country_code, source.country)
  if (
    !name &&
    !email &&
    !phone &&
    !address_line1 &&
    !address_line2 &&
    !city_locality &&
    !state_province &&
    !postal_code &&
    !country_code
  ) {
    return undefined
  }
  const base: Record<string, any> = {_type: type}
  if (name) base.name = name
  if (email) base.email = email
  if (phone) base.phone = phone
  if (address_line1) base.address_line1 = address_line1
  if (address_line2) base.address_line2 = address_line2
  if (city_locality) base.city_locality = city_locality
  if (state_province) base.state_province = state_province
  if (postal_code) base.postal_code = postal_code
  if (country_code) base.country_code = country_code.toUpperCase()
  return base
}

function computeTaxRateFromAmounts(amountSubtotal?: any, amountTax?: any): number | undefined {
  const sub = Number(amountSubtotal)
  const tax = Number(amountTax)
  if (!Number.isFinite(sub) || sub <= 0) {
    if (Number.isFinite(tax) && tax === 0) return 0
    return undefined
  }
  if (!Number.isFinite(tax) || tax < 0) return undefined
  const pct = (tax / sub) * 100
  return Math.round(pct * 100) / 100
}

function dateStringFrom(value?: any): string | undefined {
  if (!value) return undefined
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return undefined
    return date.toISOString().slice(0, 10)
  } catch {
    return undefined
  }
}

function coerceNumber(value?: unknown, fromMinorUnits?: boolean): number | undefined {
  if (value === null || value === undefined) return undefined
  let numeric: number | undefined
  if (typeof value === 'number') {
    numeric = Number.isFinite(value) ? value : undefined
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const direct = Number(trimmed)
    if (Number.isFinite(direct)) numeric = direct
    else {
      const cleaned = trimmed.replace(/[^0-9.-]/g, '')
      const fallback = Number(cleaned)
      numeric = Number.isFinite(fallback) ? fallback : undefined
    }
  } else if (typeof value === 'boolean') {
    numeric = value ? 1 : 0
  }
  if (numeric === undefined) return undefined
  return fromMinorUnits ? numeric / 100 : numeric
}

function resolveEmail(
  metadata: NormalizedMetadata,
  session: Stripe.Checkout.Session,
  paymentIntent: Stripe.PaymentIntent | null,
): string | undefined {
  const candidates: Array<string | undefined | null> = [
    metadata['customer_email'],
    metadata['customerEmail'],
    metadata['email'],
    metadata['customer_email_address'],
    session.customer_details?.email,
    session.customer_email,
    paymentIntent?.receipt_email,
    (paymentIntent as any)?.charges?.data?.[0]?.billing_details?.email,
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = candidate.toString().trim()
    if (normalized) return normalized
  }
  return undefined
}

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : (null as any)

async function buildCartFromSession(
  sessionId: string,
  metadata: NormalizedMetadata,
): Promise<CartItem[]> {
  if (!stripe) return []
  try {
    const items = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
      expand: ['data.price.product'],
    })
    const cartItems = (items?.data || []).map((li: Stripe.LineItem) => ({
      _type: 'orderCartItem',
      _key: randomUUID(),
      ...mapStripeLineItem(li, {sessionMetadata: metadata}),
    })) as CartItem[]
    return await enrichCartItemsFromSanity(cartItems, sanity)
  } catch (err) {
    console.warn('reprocessStripeSession: listLineItems failed', err)
    return []
  }
}

function extractShippingAddress(
  session: Stripe.Checkout.Session,
  email?: string,
): Record<string, string | undefined> | undefined {
  try {
    const customerDetails = session.customer_details
    const shippingDetails = (session as any).shipping_details
    const addr = (customerDetails?.address || shippingDetails?.address) as Stripe.Address | undefined
    const name = customerDetails?.name || shippingDetails?.name || undefined
    const phone = customerDetails?.phone || shippingDetails?.phone || undefined
    if (!addr && !name && !phone && !email) return undefined
    if (!addr) {
      return {
        name: name || undefined,
        phone: phone || undefined,
        email: email || undefined,
      }
    }
    return {
      name: name || undefined,
      phone: phone || undefined,
      email: email || undefined,
      addressLine1: addr.line1 || undefined,
      addressLine2: addr.line2 || undefined,
      city: addr.city || undefined,
      state: addr.state || undefined,
      postalCode: addr.postal_code || undefined,
      country: addr.country || undefined,
    }
  } catch (err) {
    console.warn('reprocessStripeSession: could not parse shipping address', err)
    return undefined
  }
}

async function upsertOrder({
  session,
  paymentIntent,
  metadata,
  autoFulfill,
}: {
  session: Stripe.Checkout.Session
  paymentIntent: Stripe.PaymentIntent | null
  metadata: NormalizedMetadata
  autoFulfill: boolean
}): Promise<{
  orderId?: string
  invoiceId?: string
  paymentStatus?: string
  packingSlipUploaded?: boolean
  shipStationOrderId?: string
}> {
  if (!sanity) throw new Error('Sanity client unavailable')

  const stripeSessionId = session.id
  const metadataOrderNumberRaw = (
    metadata['order_number'] ||
    metadata['orderNo'] ||
    metadata['website_order_number'] ||
    ''
  )
    .toString()
    .trim()
  const metadataInvoiceNumber = (
    metadata['sanity_invoice_number'] ||
    metadata['invoice_number'] ||
    ''
  )
    .toString()
    .trim()
  const invoiceIdMeta = (metadata['sanity_invoice_id'] || metadata['invoice_id'] || '')
    .toString()
    .trim()

  const email = resolveEmail(metadata, session, paymentIntent)
  const customerName =
    metadata['customer_name'] ||
    metadata['bill_to_name'] ||
    metadata['ship_to_name'] ||
    session.customer_details?.name ||
    (paymentIntent as any)?.charges?.data?.[0]?.billing_details?.name ||
    email ||
    undefined

  const totalAmount = coerceNumber(
    (session as any)?.amount_total ?? paymentIntent?.amount_received,
    true,
  )
  const amountSubtotal = coerceNumber((session as any)?.amount_subtotal, true)
  const amountTax = coerceNumber((session as any)?.total_details?.amount_tax, true)
  const amountShipping = (() => {
    const shippingTotal = coerceNumber((session as any)?.shipping_cost?.amount_total, true)
    if (shippingTotal !== undefined) return shippingTotal
    const fallback = coerceNumber((session as any)?.total_details?.amount_shipping, true)
    return fallback
  })()
  const currency =
    ((session as any)?.currency || (paymentIntent as any)?.currency || '')
      .toString()
      .toLowerCase() || undefined

  const sessionStatus = (session.status || '').toString().toLowerCase()
  const rawPaymentStatus = (session.payment_status || paymentIntent?.status || '')
    .toString()
    .toLowerCase()
  let paymentStatus = rawPaymentStatus
  if (['paid', 'succeeded', 'complete'].includes(rawPaymentStatus)) {
    paymentStatus = 'paid'
  } else if (sessionStatus === 'expired') {
    paymentStatus = 'expired'
  } else if (['canceled', 'cancelled', 'failed'].includes(rawPaymentStatus)) {
    paymentStatus = 'cancelled'
  } else if (!paymentStatus) {
    paymentStatus = 'pending'
  }
  const derivedOrderStatus: 'paid' | 'cancelled' | 'closed' | 'expired' =
    sessionStatus === 'expired' ? 'expired' : paymentStatus === 'cancelled' ? 'cancelled' : 'paid'

  const shippingDetails = await resolveStripeShippingDetails({
    metadata,
    session,
    paymentIntent,
    fallbackAmount: amountShipping,
    stripe,
  })

  const existingOrder = await sanity.fetch<{
    _id: string
    orderNumber?: string
    packingSlipUrl?: string
  } | null>(`*[_type == "order" && stripeSessionId == $sid][0]{_id, orderNumber, packingSlipUrl}`, {
    sid: stripeSessionId,
  })

  const orderNumber =
    existingOrder?.orderNumber ||
    (await resolveOrderNumber({
      metadataOrderNumber: metadataOrderNumberRaw,
      invoiceNumber: metadataInvoiceNumber,
      fallbackId: stripeSessionId,
    }))

  const cart = await buildCartFromSession(stripeSessionId, metadata)
  const shippingAddress = extractShippingAddress(session, email || undefined)

  const charge = (paymentIntent as any)?.charges?.data?.[0] as Stripe.Charge | undefined
  const chargeId = charge?.id || undefined
  const cardBrand = charge?.payment_method_details?.card?.brand || undefined
  const cardLast4 = charge?.payment_method_details?.card?.last4 || undefined
  const receiptUrl = charge?.receipt_url || undefined

  const userIdMeta =
    (
      metadata['auth0_user_id'] ||
      metadata['auth0_sub'] ||
      metadata['userId'] ||
      metadata['user_id'] ||
      ''
    )
      .toString()
      .trim() || undefined

  const baseDoc: OrderDocument = {
    _type: 'order',
    stripeSource: 'checkout.session',
    stripeSessionId,
    orderNumber,
    customerName,
    customerEmail: email || undefined,
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : undefined,
    status: derivedOrderStatus,
    createdAt: new Date().toISOString(),
    paymentStatus,
    stripeCheckoutStatus: sessionStatus || undefined,
    stripeCheckoutMode: session.mode || undefined,
    stripePaymentIntentStatus: paymentIntent?.status || undefined,
    stripeLastSyncedAt: new Date().toISOString(),
    currency,
    amountSubtotal,
    amountTax,
    paymentIntentId: paymentIntent?.id || undefined,
    chargeId,
    cardBrand,
    cardLast4,
    receiptUrl,
    checkoutDraft: derivedOrderStatus !== 'paid' ? true : undefined,
    ...(shippingAddress ? {shippingAddress} : {}),
    ...(userIdMeta ? {userId: userIdMeta} : {}),
    ...(cart.length ? {cart} : {}),
  }

  baseDoc.stripeSummary = buildStripeSummary({
    session,
    paymentIntent,
    charge,
    eventType: 'manual.reprocess',
    eventCreated: Date.now() / 1000,
  })

  const shippingAmountForDoc = shippingDetails.amount ?? amountShipping
  const shippingCurrencyForDoc =
    shippingDetails.currency || (currency ? currency.toUpperCase() : undefined)
  if (shippingDetails.carrier) {
    baseDoc.shippingCarrier = shippingDetails.carrier
  }
  if (
    shippingDetails.serviceName ||
    shippingDetails.serviceCode ||
    shippingAmountForDoc !== undefined
  ) {
    baseDoc.selectedService = {
      carrierId: shippingDetails.carrierId || undefined,
      carrier: shippingDetails.carrier || undefined,
      service: shippingDetails.serviceName || shippingDetails.serviceCode || undefined,
      serviceCode: shippingDetails.serviceCode || shippingDetails.serviceName || undefined,
      amount: shippingAmountForDoc,
      currency: shippingCurrencyForDoc || 'USD',
      deliveryDays: shippingDetails.deliveryDays,
      estimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
    }
  }
  if (shippingAmountForDoc !== undefined) {
    baseDoc.amountShipping = shippingAmountForDoc
    baseDoc.selectedShippingAmount = shippingAmountForDoc
  }
  if (shippingCurrencyForDoc) {
    baseDoc.selectedShippingCurrency = shippingCurrencyForDoc
  }
  if (shippingDetails.deliveryDays !== undefined) {
    baseDoc.shippingDeliveryDays = shippingDetails.deliveryDays
  }
  if (shippingDetails.estimatedDeliveryDate) {
    baseDoc.shippingEstimatedDeliveryDate = shippingDetails.estimatedDeliveryDate
  }
  if (shippingDetails.serviceCode) {
    baseDoc.shippingServiceCode = shippingDetails.serviceCode
  }
  if (shippingDetails.serviceName) {
    baseDoc.shippingServiceName = shippingDetails.serviceName
  }
  if (shippingDetails.metadata && Object.keys(shippingDetails.metadata).length) {
    baseDoc.shippingMetadata = shippingDetails.metadata
  }

  const orderSlug = createOrderSlug(orderNumber, stripeSessionId)
  if (orderSlug) baseDoc.slug = {_type: 'slug', current: orderSlug}

  if (email) {
    try {
      const customerId = await sanity.fetch<string | null>(
        `*[_type == "customer" && email == $email][0]._id`,
        {email},
      )
      if (customerId) baseDoc.customerRef = {_type: 'reference', _ref: customerId}
    } catch (err) {
      console.warn('reprocessStripeSession: failed to lookup customer by email', err)
    }
  }

  let orderId = existingOrder?._id || null
  if (orderId) {
    await sanity
      .patch(orderId)
      .set(baseDoc)
      .setIfMissing({webhookNotified: true})
      .commit({autoGenerateArrayKeys: true})
  } else {
    const docToCreate: OrderDocument = {...baseDoc, webhookNotified: true}
    const created = await sanity.create(docToCreate, {autoGenerateArrayKeys: true})
    orderId = created?._id || null
  }

  let packingSlipUploaded = false
  if (orderId && (!existingOrder?.packingSlipUrl || DEBUG_REPROCESS)) {
    try {
      const packingSlipUrl = await generatePackingSlipAsset({
        sanity,
        orderId,
        invoiceId: invoiceIdMeta || undefined,
      })
      if (packingSlipUrl) {
        packingSlipUploaded = true
        await sanity.patch(orderId).set({packingSlipUrl}).commit({autoGenerateArrayKeys: true})
      }
    } catch (err) {
      console.warn('reprocessStripeSession: failed to generate packing slip', err)
    }
  }

  let shipStationOrderId: string | undefined = undefined
  if (autoFulfill && orderId) {
    try {
      shipStationOrderId = await syncOrderToShipStation(sanity, orderId)
    } catch (err) {
      console.warn('reprocessStripeSession: ShipStation sync failed', err)
    }
  }

  return {
    orderId: orderId || undefined,
    invoiceId: invoiceIdMeta || undefined,
    paymentStatus,
    packingSlipUploaded,
    shipStationOrderId,
  }
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const DEBUG_REPROCESS = process.env.DEBUG_REPROCESS === '1'

export const handler: Handler = async () => {
  return {
    statusCode: 400,
    body: 'Not implemented',
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
