import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { createClient } from '@sanity/client'

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

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : (null as any)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

function baseUrl(): string | null {
  const b = (
    process.env.SANITY_STUDIO_NETLIFY_BASE ||
    process.env.PUBLIC_SITE_URL ||
    process.env.AUTH0_BASE_URL ||
    ''
  ).trim()
  return b && b.startsWith('http') ? b.replace(/\/$/, '') : null
}

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
      paymentIntent = (session.payment_intent as Stripe.PaymentIntent) || null
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
      paymentIntent = (session.payment_intent as Stripe.PaymentIntent) || null
    }

    // Derive core fields
    const email = (session?.customer_details?.email || session?.customer_email || (paymentIntent as any)?.receipt_email || (paymentIntent as any)?.charges?.data?.[0]?.billing_details?.email || '').toString()
    const paymentStatus = (session?.payment_status || (paymentIntent?.status === 'succeeded' ? 'paid' : 'unpaid')) as string
    const totalAmountCents = isCheckout ? Number(session?.amount_total || 0) : Number(paymentIntent?.amount_received || paymentIntent?.amount || 0)
    const totalAmount = totalAmountCents / 100

    const meta = {
      ...(session?.metadata || {}),
      ...(paymentIntent?.metadata || {}),
    } as Record<string, string>
    const invoiceId = (meta['sanity_invoice_id'] || '').toString().trim()

    // Gather line items if we have a Checkout Session
    let cart: Array<{ id?: string; sku?: string; name?: string; price?: number; quantity?: number; categories?: string[] }> = []
    if (session?.id) {
      try {
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100, expand: ['data.price.product'] })
        cart = (items?.data || []).map((li) => {
          const qty = Number(li.quantity || 0)
          const unitAmount = Number((li.price as any)?.unit_amount || 0) / 100
          const productObj: any = (li.price as any)?.product
          return {
            id: (li.price?.id || productObj?.id || '').toString() || undefined,
            sku: (productObj?.metadata?.sku || (li as any)?.metadata?.sku || '').toString() || undefined,
            name: (productObj?.name || li.description || '').toString() || undefined,
            price: Number.isFinite(unitAmount) ? unitAmount : undefined,
            quantity: Number.isFinite(qty) ? qty : undefined,
            categories: Array.isArray(productObj?.metadata?.categories)
              ? productObj.metadata.categories
              : (productObj?.metadata?.category ? [productObj.metadata.category] : undefined),
          }
        })
      } catch (e) {
        // continue without cart
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
    let existingId: string | null = null
    try {
      existingId = await sanity.fetch(`*[_type == "order" && stripeSessionId == $sid][0]._id`, { sid: stripeSessionId })
    } catch {}

    const baseDoc: any = {
      _type: 'order',
      stripeSessionId,
      customerEmail: email || undefined,
      totalAmount: Number.isFinite(totalAmount) ? totalAmount : undefined,
      status: paymentStatus === 'paid' ? 'paid' : 'pending',
      createdAt: new Date().toISOString(),
      ...(shippingAddress ? { shippingAddress } : {}),
      ...(cart.length ? { cart } : {}),
    }

    if (invoiceId) baseDoc.invoiceRef = { _type: 'reference', _ref: invoiceId }

    // Link to customer by email if possible
    if (email) {
      try {
        const customerId = await sanity.fetch(`*[_type == "customer" && email == $email][0]._id`, { email })
        if (customerId) baseDoc.customerRef = { _type: 'reference', _ref: customerId }
      } catch {}
    }

    let orderId = existingId
    if (existingId) {
      try { await sanity.patch(existingId).set(baseDoc).commit({ autoGenerateArrayKeys: true }) } catch {}
    } else {
      try {
        const created = await sanity.create(baseDoc)
        orderId = created?._id
      } catch {}
    }

    // Mark invoice as paid if metadata links one
    if (invoiceId && paymentStatus === 'paid') {
      const ids = idVariants(invoiceId)
      for (const vid of ids) {
        try { await sanity.patch(vid).set({ status: 'paid' }).commit({ autoGenerateArrayKeys: true }); break } catch {}
      }
    }

    // Optional: trigger fulfillment when paid and we have shipping
    let fulfillCalled = false
    if (autoFulfill && orderId && paymentStatus === 'paid' && shippingAddress) {
      const b = baseUrl()
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
