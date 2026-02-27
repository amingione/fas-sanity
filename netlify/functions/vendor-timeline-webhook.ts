/**
 * Netlify Function: vendor-timeline-webhook
 *
 * Receives canonical vendor lifecycle events from fas-medusa and writes
 * vendorActivityEvent documents to Sanity for the vendor portal timeline.
 *
 * Endpoint: POST /.netlify/functions/vendor-timeline-webhook
 * Auth:     HMAC-SHA256 via x-fas-vendor-signature header (VENDOR_WEBHOOK_SECRET)
 * Idempotency: eventId stored in Sanity — duplicates return 200 silently
 *
 * Contract: fas-sanity/docs/SourceOfTruths/vendor-portal-webhook-contract.md
 */

import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {createHmac, timingSafeEqual} from 'crypto'

// ─── Config ───────────────────────────────────────────────────────────────────

const VENDOR_WEBHOOK_SECRET = process.env.VENDOR_WEBHOOK_SECRET || ''
const SANITY_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || ''
const SANITY_DATASET = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN || ''
const SANITY_API_VERSION = '2025-10-22'

// ─── Sanity client ─────────────────────────────────────────────────────────────

const getSanityClient = () => {
  if (!SANITY_PROJECT_ID || !SANITY_API_TOKEN) return null
  return createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    apiVersion: SANITY_API_VERSION,
    token: SANITY_API_TOKEN,
    useCdn: false,
  })
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type VendorEventAggregate = {
  type: string
  id: string
  vendor_id: string
}

type VendorTimelinePayload = {
  event_id: string
  event_type: string
  occurred_at: string
  source: string
  version: string
  aggregate: VendorEventAggregate
  data: Record<string, unknown>
  signature?: string
}

const ACCEPTED_VERSIONS = new Set(['1.0', '2026-02-21.v1'])

// ─── HMAC verification ─────────────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    const receivedBuf = Buffer.from(signature, 'hex')
    if (expectedBuf.length !== receivedBuf.length) return false
    return timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

// ─── Human-readable summary builder ───────────────────────────────────────────

function buildSummary(eventType: string, data: Record<string, unknown>): string {
  const map: Record<string, (d: Record<string, unknown>) => string> = {
    'vendor.quote.created': (d) => `Quote created${d.order_number ? ` #${d.order_number}` : ''}`,
    'vendor.order.processing': (d) => `Order processing${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.order.backordered': (d) => `Order backordered${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.order.partially_fulfilled': (d) =>
      `Order partially fulfilled${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.payment.link_sent': (d) => `Payment link sent${d.invoice_id ? ` (${d.invoice_id})` : ''}`,
    'vendor.quote.approved': (d) => `Quote approved${d.order_number ? ` #${d.order_number}` : ''}`,
    'vendor.quote.rejected': (d) => `Quote rejected${d.order_number ? ` #${d.order_number}` : ''}`,
    'vendor.order.placed': (d) => `Order placed${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.order.confirmed': (d) => `Order confirmed${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.order.fulfilled': (d) => `Order fulfilled${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.order.cancelled': (d) => `Order cancelled${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.shipment.label_purchased': (d) =>
      `Shipping label purchased${d.tracking_number ? ` — ${d.tracking_number}` : ''}`,
    'vendor.shipment.in_transit': (d) =>
      `Shipment in transit${d.tracking_number ? ` — ${d.tracking_number}` : ''}`,
    'vendor.shipment.delivered': (d) =>
      `Shipment delivered${d.tracking_number ? ` — ${d.tracking_number}` : ''}`,
    'vendor.shipment.tracking_updated': (d) =>
      `Tracking updated${d.tracking_number ? ` — ${d.tracking_number}` : ''}`,
    'vendor.payment.received': (d) => {
      const amt = d.amount_cents != null ? ` $${((Number(d.amount_cents)) / 100).toFixed(2)}` : ''
      return `Payment received${amt}`
    },
    'vendor.payment.failed': (d) => `Payment failed${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.invoice.created': (d) => `Invoice created${d.invoice_id ? ` (${d.invoice_id})` : ''}`,
    'vendor.invoice.paid': (d) => `Invoice paid${d.invoice_id ? ` (${d.invoice_id})` : ''}`,
    'vendor.return.started': (d) => `Return initiated${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.return.completed': (d) => `Return completed${d.order_id ? ` (${d.order_id})` : ''}`,
    'vendor.refund.completed': (d) => {
      const amt = d.amount_cents != null ? ` $${((Number(d.amount_cents)) / 100).toFixed(2)}` : ''
      return `Refund completed${amt}`
    },
    'vendor.message.sent': (d) => `Message sent${d.message_id ? ` (${d.message_id})` : ''}`,
    'vendor.message.opened': (d) => `Message opened${d.message_id ? ` (${d.message_id})` : ''}`,
  }
  return map[eventType]?.(data) ?? eventType
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const rawBody = event.body || ''

  // ── Signature verification ──
  if (!VENDOR_WEBHOOK_SECRET) {
    console.error('[vendor-timeline-webhook] VENDOR_WEBHOOK_SECRET is not configured')
    return {statusCode: 500, body: 'Webhook secret not configured'}
  }

  const signature =
    event.headers['x-fas-vendor-signature'] || event.headers['X-Fas-Vendor-Signature'] || ''

  if (!verifySignature(rawBody, signature, VENDOR_WEBHOOK_SECRET)) {
    console.error('[vendor-timeline-webhook] Invalid signature')
    return {statusCode: 401, body: 'Invalid signature'}
  }

  // ── Parse payload ──
  let payload: VendorTimelinePayload
  try {
    payload = JSON.parse(rawBody)
  } catch (err) {
    console.error('[vendor-timeline-webhook] JSON parse error', err)
    return {statusCode: 400, body: 'Invalid JSON'}
  }

  const {event_id, event_type, occurred_at, source, version, aggregate, data} = payload

  if (!event_id || !event_type || !aggregate?.vendor_id || !version) {
    return {
      statusCode: 400,
      body: 'Missing required fields: event_id, event_type, version, aggregate.vendor_id',
    }
  }

  if (!ACCEPTED_VERSIONS.has(String(version))) {
    return {statusCode: 400, body: `Unsupported version: ${version}`}
  }

  // ── Sanity client ──
  const sanity = getSanityClient()
  if (!sanity) {
    console.error('[vendor-timeline-webhook] Sanity not configured')
    return {statusCode: 500, body: 'Sanity not configured'}
  }

  // ── Idempotency check ──
  try {
    const existing = await sanity.fetch<{_id: string} | null>(
      `*[_type == "vendorActivityEvent" && eventId == $eventId][0]{_id}`,
      {eventId: event_id},
    )

    if (existing) {
      console.log(`[vendor-timeline-webhook] Duplicate event_id ${event_id} — skipping`)
      return {statusCode: 200, body: JSON.stringify({status: 'duplicate', event_id})}
    }
  } catch (err) {
    console.error('[vendor-timeline-webhook] Idempotency check failed', err)
    // Continue — writing a duplicate is safer than dropping an event
  }

  // ── Resolve vendor reference ──
  const vendorId = aggregate.vendor_id.replace(/^drafts\./, '')
  let vendorRef: {_type: 'reference'; _ref: string} | undefined
  try {
    const vendorExists = await sanity.fetch<{_id: string} | null>(
      `*[_type == "vendor" && _id == $id][0]{_id}`,
      {id: vendorId},
    )
    if (vendorExists) {
      vendorRef = {_type: 'reference', _ref: vendorId}
    }
  } catch {
    // Non-fatal — vendorRef will be omitted
  }

  // ── Write vendorActivityEvent document ──
  const summary = buildSummary(event_type, data || {})
  const docId = `vendor-event-${event_id.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 80)}`

  try {
    await sanity.createIfNotExists({
      _id: docId,
      _type: 'vendorActivityEvent',
      eventId: event_id,
      eventType: event_type,
      occurredAt: occurred_at || new Date().toISOString(),
      source: source || 'fas-medusa',
      version: version || '1.0',
      aggregateType: aggregate.type || 'order',
      aggregateId: aggregate.id || '',
      ...(aggregate.type === 'order' && aggregate.id ? {orderRef: String(aggregate.id)} : {}),
      vendorId,
      ...(vendorRef ? {vendorRef} : {}),
      summary,
      payload: JSON.stringify(data, null, 2),
      readOnly: true,
      processingStatus: 'processed',
    })
  } catch (err) {
    console.error('[vendor-timeline-webhook] Failed to write vendorActivityEvent', err)
    return {statusCode: 500, body: 'Failed to write event document'}
  }

  console.log(`[vendor-timeline-webhook] Processed ${event_type} (${event_id}) for vendor ${vendorId}`)
  return {
    statusCode: 200,
    body: JSON.stringify({status: 'ok', event_id, doc_id: docId}),
  }
}
