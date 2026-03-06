/**
 * Netlify Function: processMedusaVendorPayment
 *
 * Called by fas-medusa's Stripe webhook handler when a vendor invoice
 * payment_intent.succeeded is detected (metadata.sanity_invoice_id present).
 *
 * This is NOT a Stripe webhook endpoint. It accepts HMAC-SHA256-signed
 * requests from Medusa (x-medusa-signature header), verifying with
 * MEDUSA_VENDOR_PROCESSOR_SECRET.
 *
 * CANONICAL FLOW:
 *   Stripe → api.fasmotorsports.com/webhooks/stripe (fas-medusa)
 *     → POST fassanity.fasmotorsports.com/.netlify/functions/processMedusaVendorPayment  ← HERE
 *       → fetches Sanity invoice, creates vendorOrder in Sanity
 *       → POST api.fasmotorsports.com/api/webhooks/vendor-order-paid (fas-medusa)
 *         → creates Medusa order + dispatches vendor timeline events
 *
 * Required env vars (fas-sanity Netlify):
 *   MEDUSA_VENDOR_PROCESSOR_SECRET — must match SANITY_VENDOR_PROCESSOR_SECRET on fas-medusa
 *   MEDUSA_API_BASE                — https://api.fasmotorsports.com
 *   VENDOR_WEBHOOK_SECRET          — HMAC secret for calling Medusa's vendor-order-paid
 *   STRIPE_SECRET_KEY              — (optional, only needed if createVendorInvoicePaymentIntent is used)
 *   SANITY_STUDIO_PROJECT_ID
 *   SANITY_STUDIO_DATASET
 *   SANITY_API_TOKEN
 */
import {createHmac, timingSafeEqual} from 'crypto'
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'

// ─── Config ───────────────────────────────────────────────────────────────────

const MEDUSA_VENDOR_PROCESSOR_SECRET = (process.env.MEDUSA_VENDOR_PROCESSOR_SECRET || '').trim()
const MEDUSA_API_BASE = (
  process.env.MEDUSA_API_BASE ||
  process.env.MEDUSA_URL ||
  'https://api.fasmotorsports.com'
).trim().replace(/\/$/, '')
const VENDOR_WEBHOOK_SECRET = (process.env.VENDOR_WEBHOOK_SECRET || '').trim()

const SANITY_STUDIO_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || ''
const SANITY_STUDIO_DATASET = process.env.SANITY_STUDIO_DATASET || 'production'

const sanity =
  SANITY_STUDIO_PROJECT_ID && process.env.SANITY_API_TOKEN
    ? createClient({
        projectId: SANITY_STUDIO_PROJECT_ID,
        dataset: SANITY_STUDIO_DATASET,
        apiVersion: '2024-04-10',
        token: process.env.SANITY_API_TOKEN as string,
        useCdn: false,
      })
    : null

// ─── HMAC verification ────────────────────────────────────────────────────────

function verifyMedusaSignature(body: string, signature: string): boolean {
  if (!MEDUSA_VENDOR_PROCESSOR_SECRET) return true // not configured — allow (log warning)
  if (!signature) return false
  try {
    const expected = createHmac('sha256', MEDUSA_VENDOR_PROCESSOR_SECRET).update(body).digest('hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    const receivedBuf = Buffer.from(signature.replace(/^0x/i, ''), 'hex')
    if (expectedBuf.length !== receivedBuf.length) return false
    return timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

// ─── Medusa vendor-order-paid notification ────────────────────────────────────

async function notifyMedusaVendorOrderPaid(
  payload: Record<string, unknown>,
): Promise<string | null> {
  const url = `${MEDUSA_API_BASE}/api/webhooks/vendor-order-paid`
  const body = JSON.stringify(payload)
  const signature = VENDOR_WEBHOOK_SECRET
    ? createHmac('sha256', VENDOR_WEBHOOK_SECRET).update(body).digest('hex')
    : ''

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signature ? {'x-vendor-signature': signature} : {}),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(
        `[processMedusaVendorPayment] vendor-order-paid returned ${res.status}: ${text.slice(0, 200)}`,
      )
      return null
    }

    const json = (await res.json().catch(() => ({}))) as {medusa_order_id?: string}
    return json.medusa_order_id ?? null
  } catch (err) {
    console.error(
      '[processMedusaVendorPayment] Failed to notify Medusa:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  if (!sanity) {
    return {statusCode: 500, body: JSON.stringify({error: 'Sanity not configured'})}
  }

  // ── HMAC verification ──
  const rawBody = event.body || ''
  const signature = (
    event.headers['x-medusa-signature'] ||
    event.headers['X-Medusa-Signature'] ||
    ''
  ).trim()

  if (MEDUSA_VENDOR_PROCESSOR_SECRET && !verifyMedusaSignature(rawBody, signature)) {
    console.error('[processMedusaVendorPayment] Invalid HMAC signature')
    return {statusCode: 401, body: JSON.stringify({error: 'Invalid signature'})}
  }

  if (!MEDUSA_VENDOR_PROCESSOR_SECRET) {
    console.warn('[processMedusaVendorPayment] MEDUSA_VENDOR_PROCESSOR_SECRET not set — skipping auth. Set this env var in production.')
  }

  // ── Parse body ──
  let body: {payment_intent?: Record<string, any>}
  try {
    body = JSON.parse(rawBody)
  } catch {
    return {statusCode: 400, body: JSON.stringify({error: 'Invalid JSON'})}
  }

  const paymentIntent = body.payment_intent
  if (!paymentIntent || typeof paymentIntent !== 'object') {
    return {statusCode: 400, body: JSON.stringify({error: 'Missing payment_intent'})}
  }

  const invoiceId: string = (paymentIntent.metadata?.sanity_invoice_id || '').trim()
  if (!invoiceId) {
    return {statusCode: 400, body: JSON.stringify({error: 'Missing sanity_invoice_id in payment_intent metadata'})}
  }

  const now = new Date().toISOString()

  // ── Fetch Sanity invoice ──
  const invoice = await sanity
    .fetch(
      `*[_type == "invoice" && _id == $id][0]{
        _id,
        total,
        subtotal,
        tax,
        shipping,
        vendorRef->{_id, companyName, primaryContact, paymentTerms},
        customerRef->{_id},
        lineItems[]{
          _key,
          description,
          sku,
          quantity,
          unitPrice,
          lineTotal,
          total,
          product->{_id}
        },
        vendorOrderRef
      }`,
      {id: invoiceId},
    )
    .catch((err: unknown) => {
      console.error('[processMedusaVendorPayment] Sanity fetch failed:', err instanceof Error ? err.message : String(err))
      return null
    })

  if (!invoice) {
    console.error(`[processMedusaVendorPayment] Invoice ${invoiceId} not found`)
    // Return 200 to prevent Medusa from retrying — log and investigate manually
    return {statusCode: 200, body: JSON.stringify({ok: false, error: 'Invoice not found', invoice_id: invoiceId})}
  }

  // ── Update Sanity invoice status ──
  await sanity
    .patch(invoiceId)
    .set({
      status: 'paid',
      amountPaid: Number(paymentIntent.amount_received || paymentIntent.amount || 0) / 100,
      amountDue: 0,
      stripePaymentStatus: paymentIntent.status,
      stripeLastSyncedAt: now,
    })
    .commit()
    .catch((err: unknown) => {
      console.warn('[processMedusaVendorPayment] Failed to update invoice status:', err instanceof Error ? err.message : String(err))
    })

  // ── Create Sanity vendorOrder if not already linked ──
  let vendorOrderId: string = invoice.vendorOrderRef?._ref || ''

  if (!vendorOrderId) {
    const orderNumber = `VO-${invoiceId.replace(/[^a-zA-Z0-9]/g, '').slice(-6)}`
    const buildOrderCartItem = (item: any) => ({
      _type: 'orderCartItem',
      _key: item._key || Math.random().toString(36).slice(2),
      name: item.description || 'Item',
      sku: item.sku,
      price: Number(item.unitPrice) || 0,
      quantity: Number(item.quantity) || 1,
      lineTotal: Number(item.lineTotal ?? item.total ?? 0),
      total: Number(item.lineTotal ?? item.total ?? 0),
      id: item.product?._id,
      productName: item.description || 'Item',
      productRef: item.product?._id ? {_type: 'reference', _ref: item.product._id} : undefined,
    })

    const subtotal = Number(invoice.subtotal) || 0
    const tax = Number(invoice.tax) || 0
    const shipping = Number(invoice.shipping) || 0
    const total = Number(invoice.total) || subtotal + tax + shipping

    try {
      const createdOrder = await sanity.create(
        {
          _type: 'vendorOrder',
          orderNumber,
          vendor: invoice.vendorRef?._id
            ? {_type: 'reference', _ref: invoice.vendorRef._id}
            : undefined,
          customerRef: invoice.customerRef?._id
            ? {_type: 'reference', _ref: invoice.customerRef._id}
            : undefined,
          invoiceRef: {_type: 'reference', _ref: invoice._id},
          status: 'paid',
          paymentStatus: 'paid',
          currency: 'USD',
          cart: Array.isArray(invoice.lineItems) ? invoice.lineItems.map(buildOrderCartItem) : [],
          amountSubtotal: subtotal,
          amountTax: tax,
          amountShipping: shipping,
          totalAmount: total,
          createdAt: now,
        },
        {autoGenerateArrayKeys: true},
      )
      vendorOrderId = createdOrder._id

      await sanity
        .patch(invoiceId)
        .set({vendorOrderRef: {_type: 'reference', _ref: vendorOrderId}})
        .commit()
    } catch (err) {
      console.error('[processMedusaVendorPayment] Failed to create vendorOrder:', err instanceof Error ? err.message : String(err))
    }
  }

  // ── Notify Medusa vendor-order-paid ──
  const subtotal = Number(invoice.subtotal) || 0
  const tax = Number(invoice.tax) || 0
  const shipping = Number(invoice.shipping) || 0
  const total = Number(invoice.total) || subtotal + tax + shipping

  const medusaOrderId = await notifyMedusaVendorOrderPaid({
    sanity_invoice_id: invoiceId,
    sanity_vendor_order_id: vendorOrderId || invoiceId,
    vendor_id: invoice.vendorRef?._id || '',
    vendor_name: invoice.vendorRef?.companyName || null,
    vendor_email: invoice.vendorRef?.primaryContact?.email || null,
    line_items: (invoice.lineItems || []).map((item: any) => ({
      title: item.description || 'Item',
      sku: item.sku || null,
      quantity: Number(item.quantity) || 1,
      unit_price: Math.round((Number(item.unitPrice) || 0) * 100),
    })),
    total_cents: Math.round(total * 100),
    subtotal_cents: Math.round(subtotal * 100),
    tax_cents: Math.round(tax * 100),
    shipping_cents: Math.round(shipping * 100),
    currency_code: 'usd',
    stripe_payment_intent_id: paymentIntent.id,
  })

  if (medusaOrderId && vendorOrderId) {
    await sanity.patch(vendorOrderId).set({medusaOrderId}).commit().catch(() => {})
  }

  // ── Update vendor stats ──
  if (invoice.vendorRef?._id) {
    await sanity
      .patch(invoice.vendorRef._id)
      .setIfMissing({totalOrders: 0, totalRevenue: 0, currentBalance: 0})
      .set({lastOrderDate: now})
      .inc({totalOrders: 1, totalRevenue: total, currentBalance: total})
      .commit({autoGenerateArrayKeys: true})
      .catch(() => {})
  }

  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      ok: true,
      invoice_id: invoiceId,
      vendor_order_id: vendorOrderId || null,
      medusa_order_id: medusaOrderId || null,
    }),
  }
}
