import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { createClient } from '@sanity/client'
import { randomUUID } from 'crypto'
import { resolveNetlifyBase, generatePackingSlipAsset } from '../lib/packingSlip'
import { syncOrderToShipStation } from '../lib/shipstation'
import { mapStripeLineItem } from '../lib/stripeCartItem'
import { enrichCartItemsFromSanity } from '../lib/cartEnrichment'
import type { CartItem } from '../lib/cartEnrichment'
import { updateCustomerProfileForOrder } from '../lib/customerSnapshot'
import { buildStripeSummary } from '../lib/stripeSummary'
import { resolveStripeShippingDetails } from '../lib/stripeShipping'

// CORS helper (same pattern used elsewhere)
const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
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
  const core = id.toString().trim().replace(/^cs_(?:test|live)_/i, '')
  const digits = core.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function resolveOrderNumber(options: { metadataOrderNumber?: string; invoiceNumber?: string; fallbackId?: string }): Promise<string> {
  const candidates = [
    sanitizeOrderNumber(options.metadataOrderNumber),
    sanitizeOrderNumber(options.invoiceNumber),
    candidateFromSessionId(options.fallbackId),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      { num: candidate }
    )
    if (!Number(exists)) return candidate
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomCandidate = `${ORDER_NUMBER_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      { num: randomCandidate }
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
  opts: { fallbackEmail?: string; fallbackName?: string } = {}
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
  if (!name && !email && !phone && !address_line1 && !address_line2 && !city_locality && !state_province && !postal_code && !country_code) {
    return undefined
  }
  const base: Record<string, any> = { _type: type }
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

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : (null as any)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const DEBUG_REPROCESS = process.env.DEBUG_REPROCESS === '1'

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  if (!stripe) return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Stripe not configured' }) }

  let id = (event.queryStringParameters?.id || '').trim()
  let autoFulfill = (event.queryStringParameters?.autoFulfill || '').toLowerCase() === 'true'
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}')
      id = String(body.session_id || body.id || id || '').trim()
      if (typeof body.autoFulfill === 'boolean') autoFulfill = body.autoFulfill
    } catch {
      // ignore; rely on query params
    }
  }

  if (!id) return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing id (Checkout session id expected)' }) }

  const isCheckout = id.startsWith('cs_')
  const isPI = id.startsWith('pi_')

  try {
    let session: Stripe.Checkout.Session | null = null
    let paymentIntent: Stripe.PaymentIntent | null = null

    if (isCheckout) {
      session = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] })
      paymentIntent = ((session as any)?.payment_intent as Stripe.PaymentIntent) || null
    } else if (isPI) {
      paymentIntent = await stripe.paymentIntents.retrieve(id)
      // Try to find a related Checkout Session if possible (soft attempt)
      try {
        // Some Stripe API versions allow listing sessions by payment_intent via search; fallback to null if unsupported
        // We keep proceeding even without a session (we can still upsert a minimal order)
      } catch {}
    } else {
      // Assume checkout session id by default
      session = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] })
      paymentIntent = ((session as any)?.payment_intent as Stripe.PaymentIntent) || null
    }

    // Derive core fields
    const email = (session?.customer_details?.email || session?.customer_email || (paymentIntent as any)?.receipt_email || (paymentIntent as any)?.charges?.data?.[0]?.billing_details?.email || '').toString()
    const sessionStatus = (session?.status || '').toString().toLowerCase()
    const rawPaymentStatus = (session?.payment_status || paymentIntent?.status || '').toString().toLowerCase()
    let paymentStatus = rawPaymentStatus || (sessionStatus === 'expired' ? 'expired' : 'pending')
    let derivedOrderStatus: 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'expired' = 'pending'
    if (['succeeded', 'paid', 'complete'].includes(paymentStatus)) {
      paymentStatus = 'paid'
      derivedOrderStatus = 'paid'
    } else if (sessionStatus === 'expired' || paymentStatus === 'expired') {
      paymentStatus = 'expired'
      derivedOrderStatus = 'expired'
    } else if (
      ['requires_payment_method', 'requires_confirmation', 'requires_action', 'canceled', 'cancelled', 'failed'].includes(
        paymentStatus
      )
    ) {
      paymentStatus = 'failed'
      derivedOrderStatus = 'cancelled'
    }
    const totalAmountCents = isCheckout ? Number(session?.amount_total || 0) : Number(paymentIntent?.amount_received || paymentIntent?.amount || 0)
    const totalAmount = totalAmountCents / 100

    // Extra Stripe amounts and metadata (best-effort; depends on API version)
    const currency = ((session as any)?.currency || (paymentIntent as any)?.currency || '').toString().toLowerCase() || undefined
    const amountSubtotalCents = isCheckout ? Number((session as any)?.amount_subtotal) : NaN
    const amountTaxCents = isCheckout ? Number((session as any)?.total_details?.amount_tax) : NaN
    const amountShippingCents = isCheckout ? Number((session as any)?.shipping_cost?.amount_total) : NaN
    const amountSubtotal = Number.isFinite(amountSubtotalCents) ? amountSubtotalCents / 100 : undefined
    const amountTax = Number.isFinite(amountTaxCents) ? amountTaxCents / 100 : undefined
    let amountShipping = Number.isFinite(amountShippingCents) ? amountShippingCents / 100 : undefined

    // Charge + card details
    let paymentIntentId: string | undefined = paymentIntent?.id || undefined
    let chargeId: string | undefined
    let cardBrand: string | undefined
    let cardLast4: string | undefined
    let receiptUrl: string | undefined
    let billingAddress: any | undefined
    try {
      const ch = (paymentIntent as any)?.charges?.data?.[0]
      if (ch) {
        chargeId = ch.id || undefined
        receiptUrl = ch.receipt_url || undefined
        const c = ch.payment_method_details?.card
        cardBrand = c?.brand || undefined
        cardLast4 = c?.last4 || undefined
        const b = ch.billing_details
        const addr = b?.address
        billingAddress = addr
          ? {
              name: (b?.name || undefined) ?? undefined,
              phone: (b?.phone || undefined) ?? undefined,
              email: (b?.email || email || undefined) ?? undefined,
              addressLine1: (addr as any)?.line1 || undefined,
              addressLine2: (addr as any)?.line2 || undefined,
              city: (addr as any)?.city || undefined,
              state: (addr as any)?.state || undefined,
              postalCode: (addr as any)?.postal_code || undefined,
              country: (addr as any)?.country || undefined,
            }
          : undefined
      }
    } catch {}

    const meta = {
      ...(session?.metadata || {}),
      ...(paymentIntent?.metadata || {}),
    } as Record<string, string>
    const invoiceId = (meta['sanity_invoice_id'] || '').toString().trim()
    const metadataOrderNumberRaw = (meta['order_number'] || meta['orderNo'] || meta['website_order_number'] || '').toString().trim()
    const metadataInvoiceNumber = (meta['sanity_invoice_number'] || meta['invoice_number'] || '').toString().trim()
    // Always funnel metadata + Stripe rate lookups through the shared helper so
    // we keep the order/invoice shipping amounts, carrier details, and
    // delivery estimates consistent with checkout.session handling.
    const shippingDetails = await resolveStripeShippingDetails({
      metadata: meta,
      session,
      paymentIntent,
      fallbackAmount: amountShipping,
      stripe,
    })
    if (shippingDetails.amount !== undefined) {
      amountShipping = shippingDetails.amount
    }
    const metadataShippingAmountRaw = (meta['shipping_amount'] || meta['shippingAmount'] || '').toString().trim()
    const metadataShippingCarrier =
      (meta['shipping_carrier'] || meta['shippingCarrier'] || '').toString().trim() || undefined
    const metadataShippingServiceCode =
      (meta['shipping_service_code'] || meta['shipping_service'] || meta['shippingService'] || '').toString().trim() ||
      undefined
    const metadataShippingServiceName = (meta['shipping_service_name'] || '').toString().trim() || undefined
    const metadataShippingCarrierId = (meta['shipping_carrier_id'] || '').toString().trim() || undefined
    const metadataShippingCurrencyRaw = (meta['shipping_currency'] || meta['shippingCurrency'] || '').toString().trim()
    const metadataShippingCurrency = metadataShippingCurrencyRaw ? metadataShippingCurrencyRaw.toUpperCase() : undefined
    const shippingAmountFromMetadata = (() => {
      if (!metadataShippingAmountRaw) return undefined
      const parsed = Number(metadataShippingAmountRaw)
      if (Number.isFinite(parsed)) return parsed
      const cleaned = metadataShippingAmountRaw.replace(/[^0-9.]/g, '')
      const fallback = Number(cleaned)
      return Number.isFinite(fallback) ? fallback : undefined
    })()
    if (shippingDetails.amount === undefined && shippingAmountFromMetadata !== undefined) {
      amountShipping = shippingAmountFromMetadata
    }
    const userIdMeta = (
      meta['auth0_user_id'] ||
      meta['auth0_sub'] ||
      meta['userId'] ||
      meta['user_id'] ||
      ''
    ).toString().trim() || undefined

    // Gather line items if we have a Checkout Session
    let cart: CartItem[] = []
    if (session?.id) {
      try {
        const items = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 100,
          expand: ['data.price.product'],
        })
        cart = (items?.data || []).map((li: Stripe.LineItem) => {
          const mapped = mapStripeLineItem(li, { sessionMetadata: meta })
          return {
            _type: 'orderCartItem',
            _key: randomUUID(),
            ...mapped,
          } as CartItem
        })
        cart = await enrichCartItemsFromSanity(cart, sanity)
      } catch (err) {
        console.warn('reprocessStripeSession: unable to load line items', err)
      }
    }

    // Build shipping address
    let shippingAddress: any = undefined
    try {
      const cd = session?.customer_details
      const addr = (cd?.address || (session as any)?.shipping_details?.address) as Stripe.Address | undefined
      const name = cd?.name || (session as any)?.shipping_details?.name || undefined
      const phone = cd?.phone || (session as any)?.shipping_details?.phone || undefined
      shippingAddress = addr
        ? {
            name: name || undefined,
            phone: phone || undefined,
            email: email || undefined,
            addressLine1: (addr as any).line1 || undefined,
            addressLine2: (addr as any).line2 || undefined,
            city: (addr as any).city || undefined,
            state: (addr as any).state || undefined,
            postalCode: (addr as any).postal_code || undefined,
            country: (addr as any).country || undefined,
          }
        : undefined
    } catch {}

    // Upsert Order
    const stripeSessionId = session?.id || paymentIntent?.id || id
    const customerName = (shippingAddress?.name || meta['bill_to_name'] || billingAddress?.name || email || '').toString().trim() || undefined
    const orderNumber = await resolveOrderNumber({
      metadataOrderNumber: metadataOrderNumberRaw,
      invoiceNumber: metadataInvoiceNumber,
      fallbackId: stripeSessionId,
    })
    let existingOrder: any = null
    try {
      existingOrder = await sanity.fetch(
        `*[_type == "order" && stripeSessionId == $sid][0]{_id, packingSlipUrl}`,
        { sid: stripeSessionId }
      )
    } catch {}
    let existingId: string | null = existingOrder?._id || null

    const baseDoc: any = {
      _type: 'order',
      stripeSessionId,
      orderNumber,
      customerName,
      customerEmail: email || undefined,
      totalAmount: Number.isFinite(totalAmount) ? totalAmount : undefined,
      status: derivedOrderStatus,
      createdAt: new Date().toISOString(),
      paymentStatus: paymentStatus || undefined,
      currency,
      amountSubtotal,
      amountTax,
      amountShipping,
      paymentIntentId,
      chargeId,
      cardBrand,
      cardLast4,
      receiptUrl,
      userId: userIdMeta,
      ...(shippingAddress ? { shippingAddress } : {}),
      ...(cart.length ? { cart } : {}),
    }
    baseDoc.stripeSummary = buildStripeSummary({
      session,
      paymentIntent,
    })

    const shippingAmountForDoc = shippingDetails.amount ?? amountShipping
    if (shippingAmountForDoc !== undefined) {
      baseDoc.amountShipping = shippingAmountForDoc
      baseDoc.selectedShippingAmount = shippingAmountForDoc
    }

    const resolvedCarrier = shippingDetails.carrier || metadataShippingCarrier
    if (resolvedCarrier) {
      baseDoc.shippingCarrier = resolvedCarrier
    }

    const resolvedServiceCode = shippingDetails.serviceCode || metadataShippingServiceCode
    const resolvedServiceName =
      shippingDetails.serviceName || metadataShippingServiceName || resolvedServiceCode || undefined

    const selectedCurrency =
      shippingDetails.currency || metadataShippingCurrency || (currency ? currency.toUpperCase() : undefined)

    if (resolvedServiceName || resolvedServiceCode || shippingAmountForDoc !== undefined) {
      baseDoc.selectedService = {
        carrierId: shippingDetails.carrierId || metadataShippingCarrierId || undefined,
        carrier: resolvedCarrier,
        service: resolvedServiceName || undefined,
        serviceCode: resolvedServiceCode || resolvedServiceName || undefined,
        amount: shippingAmountForDoc,
        currency: selectedCurrency || 'USD',
        deliveryDays: shippingDetails.deliveryDays,
        estimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
      }
    }

    if (selectedCurrency) {
      baseDoc.selectedShippingCurrency = selectedCurrency
    }

    if (shippingDetails.deliveryDays !== undefined) {
      baseDoc.shippingDeliveryDays = shippingDetails.deliveryDays
    }
    if (shippingDetails.estimatedDeliveryDate) {
      baseDoc.shippingEstimatedDeliveryDate = shippingDetails.estimatedDeliveryDate
    }
    if (resolvedServiceCode) {
      baseDoc.shippingServiceCode = resolvedServiceCode
    }
    if (resolvedServiceName) {
      baseDoc.shippingServiceName = resolvedServiceName
    }
    if (shippingDetails.metadata && Object.keys(shippingDetails.metadata).length) {
      baseDoc.shippingMetadata = shippingDetails.metadata
    }

    const orderSlug = createOrderSlug(orderNumber, stripeSessionId)
    if (orderSlug) baseDoc.slug = { _type: 'slug', current: orderSlug }

    if (invoiceId) baseDoc.invoiceRef = { _type: 'reference', _ref: invoiceId }

    // Link to customer by email if possible
    if (email) {
      try {
        const customerId = await sanity.fetch(`*[_type == "customer" && email == $email][0]._id`, { email })
        if (customerId) {
          baseDoc.customerRef = { _type: 'reference', _ref: customerId }
        }
      } catch {}
    }

    let orderId = existingId
    if (existingId) {
      try {
        await sanity.patch(existingId).set(baseDoc).commit({ autoGenerateArrayKeys: true })
      } catch (err) {
        if (DEBUG_REPROCESS) {
          console.warn('reprocessStripeSession: failed to update existing order', err)
        }
      }
    } else {
      try {
        const created = await sanity.create(baseDoc, { autoGenerateArrayKeys: true })
        orderId = created?._id
      } catch (err) {
        if (DEBUG_REPROCESS) {
          console.warn('reprocessStripeSession: failed to create order', err)
        }
      }
    }

    if (orderId) {
      try {
        if (!existingOrder?.packingSlipUrl) {
          const packingSlipUrl = await generatePackingSlipAsset({
            sanity,
            orderId,
            invoiceId,
          })
          if (packingSlipUrl) {
            await sanity.patch(orderId).set({ packingSlipUrl }).commit({ autoGenerateArrayKeys: true })
          }
        }
      } catch (err) {
        console.warn('reprocessStripeSession: packing slip auto upload failed', err)
      }
      try {
        await syncOrderToShipStation(sanity, orderId)
      } catch (err) {
        console.warn('reprocessStripeSession: ShipStation sync failed', err)
      }

      try {
        await updateCustomerProfileForOrder({
          sanity,
          orderId,
          customerId: (baseDoc as any)?.customerRef?._ref,
          email,
          shippingAddress,
          stripeCustomerId: typeof paymentIntent?.customer === 'string' ? paymentIntent.customer : undefined,
          stripeSyncTimestamp: new Date().toISOString(),
          customerName,
        })
      } catch (err) {
        console.warn('reprocessStripeSession: failed to refresh customer profile', err)
      }
    }

    // Create invoice from order if none linked
    try {
      if (!invoiceId && orderId) {
        const cartItems = Array.isArray(cart) ? cart : []
        const skus = cartItems.map((c) => (c?.sku || '').toString().trim()).filter(Boolean)
        const titles = cartItems.map((c) => (c?.name || '').toString().trim()).filter(Boolean)
        let products: any[] = []
        if (skus.length || titles.length) {
          try {
            products = await sanity.fetch(
              `*[_type == "product" && (sku in $skus || title in $titles)]{_id, title, sku}`,
              { skus, titles }
            )
          } catch {}
        }
        function findProductRef(ci: any): string | null {
          if (!products || products.length === 0) return null
          if (ci?.sku) {
            const bySku = products.find((p) => p?.sku === ci.sku)
            if (bySku) return bySku._id
          }
          if (ci?.name) {
            const byTitle = products.find((p) => p?.title === ci.name)
            if (byTitle) return byTitle._id
          }
          return null
        }
        const invoiceLineItems = cartItems.map((ci) => {
          const qty = Number(ci?.quantity || 1)
          const unit = Number(ci?.price || 0)
          const line = Number.isFinite(qty * unit) ? qty * unit : undefined
          const ref = findProductRef(ci)
          return {
            _type: 'invoiceLineItem' as const,
            _key: randomUUID(),
            description: (ci?.name || ci?.sku || 'Item').toString(),
            sku: (ci?.sku || '').toString() || undefined,
            quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
            unitPrice: Number.isFinite(unit) ? unit : undefined,
            lineTotal: Number.isFinite(line as number) ? (line as number) : undefined,
            ...(ref ? { product: { _type: 'reference', _ref: ref } } : {}),
          }
        })
        const taxRatePct = Number.isFinite(amountSubtotal || NaN) && Number.isFinite(amountTax || NaN) && (amountSubtotal as number) > 0
          ? Math.round(((amountTax as number) / (amountSubtotal as number)) * 10000) / 100
          : undefined
        const sa: any = shippingAddress || {}
        const ba: any = billingAddress || {}
        const billTo = (ba && (ba.name || ba.addressLine1))
          ? {
              _type: 'billTo',
              name: ba.name || undefined,
              email: ba.email || email || undefined,
              phone: ba.phone || undefined,
              address_line1: ba.addressLine1 || undefined,
              address_line2: ba.addressLine2 || undefined,
              city_locality: ba.city || undefined,
              state_province: ba.state || undefined,
              postal_code: ba.postalCode || undefined,
              country_code: ba.country || undefined,
            }
          : sa && (sa.name || sa.addressLine1)
          ? {
              _type: 'billTo',
              name: sa.name || undefined,
              email: sa.email || email || undefined,
              phone: sa.phone || undefined,
              address_line1: sa.addressLine1 || undefined,
              address_line2: sa.addressLine2 || undefined,
              city_locality: sa.city || undefined,
              state_province: sa.state || undefined,
              postal_code: sa.postalCode || undefined,
              country_code: sa.country || undefined,
            }
          : undefined
        const shipTo = sa && (sa.name || sa.addressLine1)
          ? {
              _type: 'shipTo',
              name: sa.name || undefined,
              email: sa.email || email || undefined,
              phone: sa.phone || undefined,
              address_line1: sa.addressLine1 || undefined,
              address_line2: sa.addressLine2 || undefined,
              city_locality: sa.city || undefined,
              state_province: sa.state || undefined,
              postal_code: sa.postalCode || undefined,
              country_code: sa.country || undefined,
            }
          : undefined
        const createdAtIso = (() => {
          try {
            const t = (session as any)?.created || (paymentIntent as any)?.created
            if (typeof t === 'number' && t > 0) return new Date(t * 1000).toISOString()
          } catch {}
          return new Date().toISOString()
        })()
        // Prefer full name from linked customer if available
        let titleName = customerName || sa?.name || email || 'Invoice'
        try {
          const cref = (baseDoc as any)?.customerRef?._ref
          if (cref) {
            const cust = await sanity.fetch(`*[_type == "customer" && _id == $id][0]{firstName,lastName,email}`, { id: cref })
            const full = [cust?.firstName, cust?.lastName].filter(Boolean).join(' ').trim()
            if (full) titleName = full
            else if (cust?.email) titleName = cust.email
          }
        } catch {}
        const invBase: any = {
          _type: 'invoice',
          title: titleName,
          orderNumber,
          invoiceNumber: sanitizeOrderNumber(metadataInvoiceNumber) || orderNumber,
          customerRef: (baseDoc as any)?.customerRef || undefined,
          orderRef: { _type: 'reference', _ref: orderId },
          billTo,
          shipTo,
          lineItems: invoiceLineItems,
          discountType: 'amount',
          discountValue: 0,
          taxRate: taxRatePct || 0,
          subtotal: Number.isFinite(amountSubtotal || NaN) ? (amountSubtotal as number) : undefined,
          total: Number.isFinite(totalAmount || NaN) ? totalAmount : undefined,
          amountSubtotal: Number.isFinite(amountSubtotal || NaN) ? (amountSubtotal as number) : undefined,
          amountTax: Number.isFinite(amountTax || NaN) ? (amountTax as number) : undefined,
          currency: currency || 'usd',
          customerEmail: email || undefined,
          userId: userIdMeta || undefined,
          status: paymentStatus === 'paid' ? 'paid' : paymentStatus === 'expired' ? 'expired' : 'pending',
          invoiceDate: createdAtIso.slice(0,10),
          dueDate: createdAtIso.slice(0,10),
          stripeLastSyncedAt: new Date().toISOString(),
        }

        const shippingAmountForInvoice = shippingDetails.amount ?? amountShipping
        if (shippingAmountForInvoice !== undefined) {
          invBase.amountShipping = shippingAmountForInvoice
        }
        if (resolvedCarrier) {
          invBase.shippingCarrier = resolvedCarrier
        }
        const invoiceSelectedService =
          resolvedServiceName ||
          resolvedServiceCode ||
          shippingAmountForInvoice !== undefined
            ? {
                carrierId: shippingDetails.carrierId || metadataShippingCarrierId || undefined,
                carrier: resolvedCarrier,
                service: resolvedServiceName || undefined,
                serviceCode: resolvedServiceCode || resolvedServiceName || undefined,
                amount: shippingAmountForInvoice,
                currency: selectedCurrency || 'USD',
                deliveryDays: shippingDetails.deliveryDays,
                estimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
              }
            : undefined
        if (invoiceSelectedService) {
          invBase.selectedService = invoiceSelectedService
        }
        if (shippingDetails.metadata && Object.keys(shippingDetails.metadata).length) {
          invBase.shippingMetadata = shippingDetails.metadata
        }
        invBase.stripeSummary = buildStripeSummary({
          session,
          paymentIntent,
          eventType: 'reprocessStripeSession',
          eventCreated: paymentIntent?.created || session?.created || null,
        })
        try {
          const createdInv = await sanity.create(invBase, { autoGenerateArrayKeys: true })
          if (createdInv?._id) {
            try { await sanity.patch(orderId).set({ invoiceRef: { _type: 'reference', _ref: createdInv._id } }).commit({ autoGenerateArrayKeys: true }) } catch {}
          }
        } catch {}
      }
    } catch {}


    // Mark invoice as paid if metadata links one
    if (invoiceId && paymentStatus === 'paid') {
      const ids = idVariants(invoiceId)
      const invoiceNumberToSet = sanitizeOrderNumber(metadataInvoiceNumber) || orderNumber
      const billSource = billingAddress || shippingAddress
      const billToUpdate = buildStudioAddress(billSource, 'billTo', { fallbackEmail: email, fallbackName: customerName })
      const shipToUpdate =
        buildStudioAddress(shippingAddress, 'shipTo', { fallbackEmail: email, fallbackName: customerName }) ||
        (billToUpdate ? { ...billToUpdate, _type: 'shipTo' } : undefined)
      const createdAtIso = (() => {
        try {
          const t = (session as any)?.created || (paymentIntent as any)?.created
          if (typeof t === 'number' && t > 0) return new Date(t * 1000).toISOString()
        } catch {}
        return new Date().toISOString()
      })()
      const invoiceDateValue = dateStringFrom(createdAtIso)
      const computedTaxRate = computeTaxRateFromAmounts(amountSubtotal, amountTax)
      const baseTitleName = pickString(customerName, billToUpdate?.name, shipToUpdate?.name, email) || 'Invoice'
      const titleValue = invoiceNumberToSet ? `${baseTitleName} • ${invoiceNumberToSet}` : baseTitleName

      for (const vid of ids) {
        try {
          let patch = sanity.patch(vid).set({ status: 'paid' })
          if (orderNumber) patch = patch.set({ orderNumber })
          if (invoiceNumberToSet) patch = patch.set({ invoiceNumber: invoiceNumberToSet })
          if (titleValue) patch = patch.set({ title: titleValue })
          if (billToUpdate) patch = patch.set({ billTo: billToUpdate })
          if (shipToUpdate) patch = patch.set({ shipTo: shipToUpdate })
          if (invoiceDateValue) patch = patch.set({ invoiceDate: invoiceDateValue, dueDate: invoiceDateValue })
          if (typeof computedTaxRate === 'number') patch = patch.set({ taxRate: computedTaxRate })
          const shippingAmountForInvoice = shippingDetails.amount ?? amountShipping
          const invoiceSelectedService =
            resolvedServiceName ||
            resolvedServiceCode ||
            shippingAmountForInvoice !== undefined
              ? {
                  carrierId: shippingDetails.carrierId || metadataShippingCarrierId || undefined,
                  carrier: resolvedCarrier,
                  service: resolvedServiceName || undefined,
                  serviceCode: resolvedServiceCode || resolvedServiceName || undefined,
                  amount: shippingAmountForInvoice,
                  currency: selectedCurrency || 'USD',
                  deliveryDays: shippingDetails.deliveryDays,
                  estimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
                }
              : undefined
          const shippingPatch: Record<string, any> = {}
          if (shippingAmountForInvoice !== undefined) {
            shippingPatch.amountShipping = shippingAmountForInvoice
          }
          if (resolvedCarrier) {
            shippingPatch.shippingCarrier = resolvedCarrier
          }
          if (invoiceSelectedService) {
            shippingPatch.selectedService = invoiceSelectedService
          }
          if (shippingDetails.metadata && Object.keys(shippingDetails.metadata).length) {
            shippingPatch.shippingMetadata = shippingDetails.metadata
          }
          if (Object.keys(shippingPatch).length > 0) {
            patch = patch.set(shippingPatch)
          }
          patch = patch.set({
            stripeLastSyncedAt: new Date().toISOString(),
            stripeSummary: buildStripeSummary({
              session,
              paymentIntent,
              eventType: 'reprocessStripeSession',
              eventCreated: paymentIntent?.created || session?.created || null,
            }),
          })
          await patch.commit({ autoGenerateArrayKeys: true })
          break
        } catch {}
      }
    }

    // Optional: trigger fulfillment when paid and we have shipping
    let fulfillCalled = false
    if (autoFulfill && orderId && paymentStatus === 'paid' && shippingAddress) {
      const b = resolveNetlifyBase()
      if (b) {
        try {
          const resp = await fetch(`${b}/.netlify/functions/fulfill-order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId }) })
          fulfillCalled = resp.ok
        } catch {}
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        id,
        type: isCheckout ? 'checkout_session' : isPI ? 'payment_intent' : 'unknown',
        orderId,
        invoiceId: invoiceId || null,
        paymentStatus,
        updated: Boolean(orderId),
        fulfillCalled,
      }),
    }
  } catch (e: any) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e?.message || 'Reprocess failed' }) }
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
