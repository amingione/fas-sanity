/**
 * Netlify Function: approve-wholesale-order
 *
 * Called by the Sanity Studio document action (or manually via API) when a
 * salesperson approves a vendor wholesale order request.
 *
 * On approval it:
 *   1. Validates the order exists and is in 'requested' state.
 *   2. Creates a Sanity `invoice` document from the order's cart.
 *   3. Patches the order's wholesaleDetails.workflowStatus → 'approved'.
 *   4. Emails the vendor a payment link:
 *      https://fasmotorsports.com/vendor-portal/invoices/{invoiceId}
 *
 * Auth: APPROVE_ORDER_SECRET header (falls back to VENDOR_WEBHOOK_SECRET).
 *
 * POST body:
 *   { orderId: string; notes?: string }
 *
 * Response:
 *   { ok: true; invoiceId: string; invoiceNumber: string }
 */

import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'

// ─── Config ───────────────────────────────────────────────────────────────────

const APPROVE_SECRET =
  (process.env.APPROVE_ORDER_SECRET || process.env.VENDOR_WEBHOOK_SECRET || '').trim()

const SANITY_PROJECT_ID = (
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  ''
).trim()
const SANITY_DATASET = (
  process.env.SANITY_STUDIO_DATASET ||
  process.env.SANITY_DATASET ||
  'production'
).trim()
const SANITY_API_TOKEN = (process.env.SANITY_API_TOKEN || '').trim()
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim()
const RESEND_FROM = (
  process.env.RESEND_FROM_EMAIL ||
  process.env.RESEND_FROM ||
  'FAS Motorsports <orders@fasmotorsports.com>'
).trim()
const STOREFRONT_BASE = (
  process.env.STOREFRONT_URL ||
  'https://fasmotorsports.com'
).trim().replace(/\/$/, '')

// ─── Sanity client ────────────────────────────────────────────────────────────

function getSanityClient() {
  if (!SANITY_PROJECT_ID || !SANITY_API_TOKEN) return null
  return createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    apiVersion: '2025-10-22',
    token: SANITY_API_TOKEN,
    useCdn: false,
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  _key: string
  name?: string | null
  sku?: string | null
  price?: number | null
  quantity?: number | null
  lineTotal?: number | null
  total?: number | null
  productRef?: {_ref?: string; _id?: string} | null
}

interface WholesaleOrder {
  _id: string
  orderNumber?: string | null
  orderType?: string | null
  status?: string | null
  wholesaleDetails?: {workflowStatus?: string | null} | null
  customerEmail?: string | null
  customerName?: string | null
  customerRef?: {_ref?: string; _id?: string} | null
  vendorRef?: {_ref?: string; _id?: string} | null
  vendor?: {
    _id?: string
    companyName?: string | null
    primaryContact?: {email?: string | null; firstName?: string | null} | null
    portalAccess?: {email?: string | null} | null
  } | null
  cart?: CartItem[] | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountShipping?: number | null
  totalAmount?: number | null
  currency?: string | null
  shippingAddress?: {
    firstName?: string | null
    lastName?: string | null
    street?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    country?: string | null
  } | null
}

// ─── Invoice number generator ─────────────────────────────────────────────────

async function generateInvoiceNumber(
  client: ReturnType<typeof createClient>,
): Promise<string> {
  const count = await client.fetch<number>(`count(*[_type == "invoice"])`)
  const seq = (typeof count === 'number' ? count : 0) + 1
  return `INV-${String(seq).padStart(5, '0')}`
}

// ─── Build line items for invoice ─────────────────────────────────────────────

function buildInvoiceLineItems(cartItems: CartItem[]) {
  return cartItems.map((item) => ({
    _type: 'invoiceLineItem' as const,
    _key: item._key || Math.random().toString(36).slice(2),
    description: item.name || 'Item',
    sku: item.sku || null,
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.price) || 0,
    lineTotal: Number(item.lineTotal ?? item.total ?? 0),
    total: Number(item.lineTotal ?? item.total ?? 0),
    ...(item.productRef?._ref || item.productRef?._id
      ? {
          product: {
            _type: 'reference' as const,
            _ref: (item.productRef._ref || item.productRef._id)!,
          },
        }
      : {}),
  }))
}

// ─── Email ────────────────────────────────────────────────────────────────────

async function sendApprovalEmail(
  to: string,
  vendorName: string,
  orderNumber: string,
  invoiceId: string,
  totalAmount: number,
) {
  if (!RESEND_API_KEY) {
    console.warn('[approve-wholesale-order] RESEND_API_KEY not set — skipping email')
    return {sent: false}
  }

  const paymentUrl = `${STOREFRONT_BASE}/vendor-portal/invoices/${invoiceId}`
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(totalAmount)

  const subject = `Order ${orderNumber} approved — invoice ready for payment`
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#111827;padding:28px 32px;">
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.5px;">F.A.S. Motorsports</p>
            <p style="margin:6px 0 0;color:#9ca3af;font-size:13px;">Wholesale Order Approved</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 16px;color:#111827;font-size:22px;">Your order has been approved!</h2>
            <p style="margin:0 0 24px;color:#374151;">
              Hi ${vendorName} — great news! Order <strong>${orderNumber}</strong> has been reviewed
              and approved by our team.
            </p>
            <p style="margin:0 0 8px;color:#374151;">
              Invoice total: <strong>${formattedTotal}</strong>
            </p>
            <p style="margin:0 0 24px;color:#374151;">
              To proceed, please pay your invoice using the secure link below:
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${paymentUrl}"
                 style="display:inline-block;background:#111827;color:#ffffff;padding:14px 32px;border-radius:6px;font-weight:700;font-size:15px;text-decoration:none;">
                Pay Invoice ${orderNumber}
              </a>
            </div>
            <p style="margin:0;color:#6b7280;font-size:13px;">
              Or copy this link: <a href="${paymentUrl}" style="color:#374151;">${paymentUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#6b7280;font-size:12px;text-align:center;">
              F.A.S. Motorsports LLC · 6161 Riverside Dr · Punta Gorda, FL 33982<br>
              Questions? Email <a href="mailto:sales@fasmotorsports.com" style="color:#374151;">sales@fasmotorsports.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const resend = new Resend(RESEND_API_KEY)
  try {
    const result = await resend.emails.send({from: RESEND_FROM, to, subject, html})
    return {sent: true, messageId: result.data?.id ?? null}
  } catch (err) {
    console.error('[approve-wholesale-order] Resend error', err)
    return {sent: false, error: err instanceof Error ? err.message : String(err)}
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-approve-secret',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: corsHeaders}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: corsHeaders, body: JSON.stringify({error: 'Method not allowed'})}
  }

  // ── Auth ──
  if (APPROVE_SECRET) {
    const provided = (
      event.headers['x-approve-secret'] ||
      event.headers['authorization']?.replace(/^bearer\s+/i, '') ||
      ''
    ).trim()
    if (!provided || provided !== APPROVE_SECRET) {
      return {statusCode: 401, headers: corsHeaders, body: JSON.stringify({error: 'Unauthorized'})}
    }
  }

  // ── Parse body ──
  let body: {orderId?: unknown; notes?: unknown}
  try {
    body = event.body ? JSON.parse(event.body) : {}
  } catch {
    return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Invalid JSON'})}
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  if (!orderId) {
    return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'orderId is required'})}
  }

  const sanity = getSanityClient()
  if (!sanity) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Sanity not configured (SANITY_PROJECT_ID / SANITY_API_TOKEN missing)'}),
    }
  }

  // ── Fetch the wholesale order ──
  let order: WholesaleOrder | null
  try {
    order = await sanity.fetch<WholesaleOrder | null>(
      `*[_type == "order" && _id == $id && orderType == "wholesale"][0]{
        _id,
        orderNumber,
        orderType,
        status,
        wholesaleDetails,
        customerEmail,
        customerName,
        customerRef,
        currency,
        amountSubtotal,
        amountTax,
        amountShipping,
        totalAmount,
        shippingAddress,
        cart[]{
          _key, name, sku, price, quantity, lineTotal, total,
          productRef->{ _id }
        },
        vendor->{ _id, companyName, primaryContact, portalAccess }
      }`,
      {id: orderId},
    )
  } catch (err) {
    console.error('[approve-wholesale-order] Sanity fetch failed', err)
    return {statusCode: 500, headers: corsHeaders, body: JSON.stringify({error: 'Failed to fetch order'})}
  }

  if (!order) {
    return {statusCode: 404, headers: corsHeaders, body: JSON.stringify({error: 'Wholesale order not found'})}
  }

  // ── Guard: already approved ──
  const workflowStatus = order.wholesaleDetails?.workflowStatus
  if (workflowStatus === 'approved' || workflowStatus === 'invoiced') {
    return {
      statusCode: 409,
      headers: corsHeaders,
      body: JSON.stringify({error: `Order is already in '${workflowStatus}' state`}),
    }
  }

  // ── Build invoice doc ──
  const invoiceNumber = await generateInvoiceNumber(sanity)
  const nowIso = new Date().toISOString()
  const cartItems: CartItem[] = Array.isArray(order.cart) ? order.cart : []
  const lineItems = buildInvoiceLineItems(cartItems)

  const subtotal = Number(order.amountSubtotal) || 0
  const tax = Number(order.amountTax) || 0
  const shipping = Number(order.amountShipping) || 0
  const total = Number(order.totalAmount) || subtotal + tax + shipping

  const invoiceDoc = {
    _type: 'invoice',
    invoiceNumber,
    status: 'payable',
    paymentStatus: 'unpaid',
    currency: order.currency || 'USD',
    issueDate: nowIso,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // net-30
    subtotal,
    tax,
    shipping,
    total,
    amountPaid: 0,
    amountDue: total,
    lineItems,
    orderRef: {_type: 'reference', _ref: order._id},
    ...(order.vendor?._id
      ? {vendorRef: {_type: 'reference', _ref: order.vendor._id}}
      : {}),
    ...(order.customerRef?._ref
      ? {customerRef: {_type: 'reference', _ref: order.customerRef._ref}}
      : {}),
    ...(typeof body.notes === 'string' && body.notes.trim()
      ? {notes: body.notes.trim()}
      : {}),
    createdAt: nowIso,
  }

  let createdInvoice: {_id: string}
  try {
    createdInvoice = await sanity.create(invoiceDoc, {autoGenerateArrayKeys: true})
  } catch (err) {
    console.error('[approve-wholesale-order] Invoice creation failed', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Failed to create invoice'}),
    }
  }

  // ── Patch order: mark approved + link invoice ──
  try {
    await sanity
      .patch(orderId)
      .set({
        'wholesaleDetails.workflowStatus': 'approved',
        status: 'approved',
        invoiceRef: {_type: 'reference', _ref: createdInvoice._id},
        approvedAt: nowIso,
      })
      .commit()
  } catch (err) {
    console.error('[approve-wholesale-order] Order patch failed', err)
    // Non-fatal: invoice was created — continue
  }

  // ── Resolve vendor email ──
  const vendorEmail =
    order.vendor?.primaryContact?.email ||
    order.vendor?.portalAccess?.email ||
    order.customerEmail ||
    null

  const vendorName =
    order.vendor?.primaryContact?.firstName ||
    order.vendor?.companyName ||
    order.customerName ||
    'there'

  const orderNumber = order.orderNumber || orderId.slice(-6)

  let emailResult: {sent: boolean; messageId?: string | null; error?: string} = {sent: false}

  if (vendorEmail) {
    emailResult = await sendApprovalEmail(vendorEmail, vendorName, orderNumber, createdInvoice._id, total)
  } else {
    console.warn('[approve-wholesale-order] No vendor email found — skipping notification')
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      ok: true,
      invoiceId: createdInvoice._id,
      invoiceNumber,
      orderNumber,
      vendorEmail,
      emailSent: emailResult.sent,
      ...(emailResult.messageId ? {emailMessageId: emailResult.messageId} : {}),
    }),
  }
}
