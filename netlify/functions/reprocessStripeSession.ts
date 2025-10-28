import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import {randomUUID} from 'crypto'
import {generatePackingSlipAsset} from '../lib/packingSlip'
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

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey, {apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion']}) : null

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

const DEBUG_REPROCESS = process.env.DEBUG_REPROCESS === '1'

type NormalizedMetadata = Record<string, string>

function normalizeMetadata(source?: Stripe.Metadata | null): NormalizedMetadata {
  const normalized: NormalizedMetadata = {}
  if (!source) return normalized
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = (rawKey || '').toString().trim()
    if (!key) continue
    if (rawValue === undefined || rawValue === null) continue
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) continue
      normalized[key] = trimmed
      continue
    }
    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      normalized[key] = String(rawValue)
      continue
    }
    try {
      const serialized = JSON.stringify(rawValue)
      if (serialized) normalized[key] = serialized
    } catch {}
  }
  return normalized
}

function mergeMetadata(...sources: Array<NormalizedMetadata | undefined>): NormalizedMetadata {
  return sources.reduce<NormalizedMetadata>((acc, source) => {
    if (!source) return acc
    for (const [key, value] of Object.entries(source)) {
      if (!key || value === undefined) continue
      acc[key] = value
    }
    return acc
  }, {})
}

async function buildCartFromSession(stripeSessionId: string, metadata: NormalizedMetadata): Promise<CartItem[]> {
  if (!stripeSessionId || !stripe) return []
  try {
    const items = await stripe.checkout.sessions.listLineItems(stripeSessionId, {
      limit: 100,
      expand: ['data.price.product'],
    })
    const cart = (items?.data || []).map((line: Stripe.LineItem) => ({
      _type: 'orderCartItem',
      _key: randomUUID(),
      ...mapStripeLineItem(line, {sessionMetadata: metadata}),
    })) as CartItem[]
    return await enrichCartItemsFromSanity(cart, sanity!)
  } catch (err) {
    console.warn('reprocessStripeSession: failed to list line items', err)
    return []
  }
}

function extractShippingAddress(
  session: Stripe.Checkout.Session,
  email?: string,
): Record<string, string | undefined> | undefined {
  try {
    const cd = session.customer_details
    const addr = (cd?.address || (session as any).shipping_details?.address) as Stripe.Address | undefined
    const name = cd?.name || (session as any).shipping_details?.name || undefined
    const phone = cd?.phone || (session as any).shipping_details?.phone || undefined
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
      addressLine1: (addr as any).line1 || undefined,
      addressLine2: (addr as any).line2 || undefined,
      city: addr.city || undefined,
      state: addr.state || (addr as any).province || undefined,
      postalCode: addr.postal_code || undefined,
      country: addr.country || undefined,
    }
  } catch {
    return undefined
  }
}

function coerceNumber(value: any, divideBy100 = false): number | undefined {
  const num = Number(value)
  if (!Number.isFinite(num)) return undefined
  return divideBy100 ? num / 100 : num
}

function resolveEmail(
  metadata: NormalizedMetadata,
  session?: Stripe.Checkout.Session | null,
  paymentIntent?: Stripe.PaymentIntent | null,
): string | undefined {
  const metaEmail =
    metadata['customer_email'] ||
    metadata['email'] ||
    metadata['bill_to_email'] ||
    metadata['ship_to_email']
  const sessionEmail =
    session?.customer_details?.email ||
    (session as any)?.customer_email ||
    (session as any)?.shipping_details?.email
  const piEmail = paymentIntent?.receipt_email || (paymentIntent as any)?.charges?.data?.[0]?.billing_details?.email
  const value = metaEmail || sessionEmail || piEmail
  if (!value) return undefined
  const trimmed = value.toString().trim()
  return trimmed || undefined
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'yes', 'y'].includes(normalized)
  }
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'boolean') return value
  return false
}

async function fetchSessionById(id: string): Promise<Stripe.Checkout.Session | null> {
  if (!stripe) return null
  try {
    const session = await stripe.checkout.sessions.retrieve(id, {
      expand: ['payment_intent', 'customer_details'],
    } as Stripe.Checkout.SessionRetrieveParams)
    return session
  } catch (err) {
    console.warn('reprocessStripeSession: failed to retrieve session', id, err)
    return null
  }
}

async function findSessionByPaymentIntent(paymentIntentId: string): Promise<Stripe.Checkout.Session | null> {
  if (!stripe) return null
  try {
    const list = await stripe.checkout.sessions.list({payment_intent: paymentIntentId, limit: 5})
    const match = list?.data?.find((entry) => entry && entry.id)
    if (match?.id) {
      return fetchSessionById(match.id)
    }
    return null
  } catch (err) {
    console.warn('reprocessStripeSession: failed to list sessions for payment intent', paymentIntentId, err)
    return null
  }
}

async function fetchPaymentIntent(id: string): Promise<Stripe.PaymentIntent | null> {
  if (!stripe) return null
  if (!id.startsWith('pi_')) {
    if (DEBUG_REPROCESS) {
      console.debug('reprocessStripeSession: skip payment intent lookup for non-pi id', id)
    }
    return null
  }
  try {
    return await stripe.paymentIntents.retrieve(id, {
      expand: ['latest_charge', 'charges.data'],
    })
  } catch (err) {
    console.warn('reprocessStripeSession: failed to retrieve payment intent', id, err)
    return null
  }
}

async function resolveSessionAndIntent(id: string): Promise<{
  session: Stripe.Checkout.Session | null
  paymentIntent: Stripe.PaymentIntent | null
  idType: 'checkout.session' | 'payment_intent'
}> {
  let session: Stripe.Checkout.Session | null = null
  let paymentIntent: Stripe.PaymentIntent | null = null
  let idType: 'checkout.session' | 'payment_intent' = 'checkout.session'

  if (id.startsWith('pi_')) {
    idType = 'payment_intent'
    paymentIntent = await fetchPaymentIntent(id)
    if (paymentIntent?.id) {
      session = await findSessionByPaymentIntent(paymentIntent.id)
    }
    if (!session) {
      const metaSessionId = (paymentIntent?.metadata?.checkout_session_id || '')
        .toString()
        .trim()
      if (metaSessionId) {
        session = await fetchSessionById(metaSessionId)
      }
    }
  } else {
    session = await fetchSessionById(id)
    idType = 'checkout.session'
    if (!session && id.startsWith('cs_')) {
      // No session found; fall back to treating as payment intent
      paymentIntent = await fetchPaymentIntent(id)
      if (paymentIntent?.id) {
        idType = 'payment_intent'
        session = await findSessionByPaymentIntent(paymentIntent.id)
      }
    }
  }

  if (!paymentIntent) {
    const piId = (() => {
      if (session?.payment_intent && typeof session.payment_intent === 'string') {
        return session.payment_intent
      }
      const expanded = session?.payment_intent as Stripe.PaymentIntent | null | undefined
      return expanded?.id
    })()
    if (piId) {
      paymentIntent = await fetchPaymentIntent(piId)
    }
  }

  return {session, paymentIntent, idType}
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
  const metadataOrderNumberRaw = (metadata['order_number'] || metadata['orderNo'] || metadata['website_order_number'] || '')
    .toString()
    .trim()
  const metadataInvoiceNumber = (metadata['sanity_invoice_number'] || metadata['invoice_number'] || '')
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

  const totalAmount = coerceNumber((session as any)?.amount_total ?? paymentIntent?.amount_received, true)
  const amountSubtotal = coerceNumber((session as any)?.amount_subtotal, true)
  const amountTax = coerceNumber((session as any)?.total_details?.amount_tax, true)
  const amountShipping = (() => {
    const shippingTotal = coerceNumber((session as any)?.shipping_cost?.amount_total, true)
    if (shippingTotal !== undefined) return shippingTotal
    const fallback = coerceNumber((session as any)?.total_details?.amount_shipping, true)
    return fallback
  })()
  const currency = ((session as any)?.currency || (paymentIntent as any)?.currency || '')
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

  const orderNumber = await resolveOrderNumber({
    metadataOrderNumber: metadataOrderNumberRaw,
    invoiceNumber: metadataInvoiceNumber,
    fallbackId: stripeSessionId,
  })

  const cart = await buildCartFromSession(stripeSessionId, metadata)
  const shippingAddress = extractShippingAddress(session, email || undefined)

  const charge = (paymentIntent as any)?.charges?.data?.[0] as Stripe.Charge | undefined
  const chargeId = charge?.id || undefined
  const cardBrand = charge?.payment_method_details?.card?.brand || undefined
  const cardLast4 = charge?.payment_method_details?.card?.last4 || undefined
  const receiptUrl = charge?.receipt_url || undefined

  const userIdMeta =
    (metadata['auth0_user_id'] || metadata['auth0_sub'] || metadata['userId'] || metadata['user_id'] || '')
      .toString()
      .trim() || undefined

  const baseDoc: Record<string, any> = {
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
    stripeSessionStatus: sessionStatus || undefined,
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
  const shippingCurrencyForDoc = shippingDetails.currency || (currency ? currency.toUpperCase() : undefined)
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

  const existingOrder = await sanity.fetch<{_id: string; packingSlipUrl?: string} | null>(
    `*[_type == "order" && stripeSessionId == $sid][0]{_id, packingSlipUrl}`,
    {sid: stripeSessionId},
  )

  let orderId = existingOrder?._id || null
  if (orderId) {
    await sanity
      .patch(orderId)
      .set(baseDoc)
      .setIfMissing({webhookNotified: true})
      .commit({autoGenerateArrayKeys: true})
  } else {
    const created = await sanity.create({...baseDoc, webhookNotified: true}, {autoGenerateArrayKeys: true})
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

  try {
    await updateCustomerProfileForOrder({
      sanity,
      orderId,
      customerId: (baseDoc as any)?.customerRef?._ref,
      email: email || undefined,
      shippingAddress,
      stripeCustomerId: typeof paymentIntent?.customer === 'string' ? paymentIntent.customer : undefined,
      stripeSyncTimestamp: new Date().toISOString(),
      customerName,
      metadata,
    })
  } catch (err) {
    console.warn('reprocessStripeSession: failed to update customer profile', err)
  }

  let linkedInvoiceId: string | undefined = undefined
  if (orderId && invoiceIdMeta) {
    const candidateIds = idVariants(invoiceIdMeta)
    try {
      linkedInvoiceId = await sanity.fetch<string | null>(
        `*[_type == "invoice" && _id in $ids][0]._id`,
        {ids: candidateIds},
      ) || undefined
      if (!linkedInvoiceId) {
        linkedInvoiceId = await sanity.fetch<string | null>(
          `*[_type == "invoice" && stripeInvoiceId == $sid][0]._id`,
          {sid: invoiceIdMeta},
        ) || undefined
      }
      if (linkedInvoiceId) {
        await sanity
          .patch(linkedInvoiceId)
          .set({
            orderRef: {_type: 'reference', _ref: orderId},
            stripeLastSyncedAt: new Date().toISOString(),
          })
          .commit({autoGenerateArrayKeys: true})
      }
    } catch (err) {
      console.warn('reprocessStripeSession: failed to link invoice', err)
    }
  }

  return {
    orderId: orderId || undefined,
    invoiceId: linkedInvoiceId,
    paymentStatus,
    packingSlipUploaded,
    shipStationOrderId,
  }
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string | undefined
  const headers = {...makeCORS(origin), 'Content-Type': 'application/json'}

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers, body: JSON.stringify({error: 'Method Not Allowed'})}
  }

  if (!stripe || !sanity) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({error: 'Stripe or Sanity not configured'}),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const rawId = typeof body?.id === 'string' ? body.id.trim() : ''
    if (!rawId) {
      return {statusCode: 400, headers, body: JSON.stringify({error: 'Missing id'})}
    }

    const autoFulfill = toBoolean(body?.autoFulfill)

    const {session, paymentIntent, idType} = await resolveSessionAndIntent(rawId)
    if (!session) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({error: 'Stripe checkout session not found'}),
      }
    }

    const metadata = mergeMetadata(
      normalizeMetadata(session.metadata || null),
      normalizeMetadata(paymentIntent?.metadata || null),
    )

    const result = await upsertOrder({
      session,
      paymentIntent,
      metadata,
      autoFulfill,
    })

    if (!result.orderId) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({error: 'Failed to upsert order'}),
      }
    }

    const responsePayload = {
      ok: true,
      type: idType,
      orderId: result.orderId,
      invoiceId: result.invoiceId,
      paymentStatus: result.paymentStatus,
      packingSlipUploaded: result.packingSlipUploaded,
      shipStationOrderId: result.shipStationOrderId,
    }

    if (DEBUG_REPROCESS) {
      console.info('reprocessStripeSession: success', responsePayload)
    }

    return {statusCode: 200, headers, body: JSON.stringify(responsePayload)}
  } catch (err: any) {
    console.error('reprocessStripeSession: unexpected error', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({error: err?.message || 'Internal error'}),
    }
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
