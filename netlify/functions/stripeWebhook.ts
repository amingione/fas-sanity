// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import type {CartItem, CartProductSummary} from '../lib/cartEnrichment'
import {createClient} from '@sanity/client'
import {randomUUID} from 'crypto'
import {generatePackingSlipAsset} from '../lib/packingSlip'
import {mapStripeLineItem, type CartMetadataEntry} from '../lib/stripeCartItem'
import {
  enrichCartItemsFromSanity,
  computeShippingMetrics,
  fetchProductsForCart,
} from '../lib/cartEnrichment'
import {updateCustomerProfileForOrder} from '../lib/customerSnapshot'
import {buildStripeSummary} from '../lib/stripeSummary'
import {resolveStripeShippingDetails} from '../lib/stripeShipping'
import {
  normalizeMetadataEntries,
  deriveOptionsFromMetadata,
  remainingMetadataEntries,
  coerceStringArray,
  uniqueStrings,
} from '@fas/sanity-config/utils/cartItemDetails'
import {
  hydrateDiscountResources,
  removeCustomerDiscountRecord,
  syncCustomerDiscountRecord,
} from '../lib/customerDiscounts'

// Netlify delivers body as string; may be base64-encoded
function getRawBody(event: any): Buffer {
  const body = event.body || ''
  if (event.isBase64Encoded) return Buffer.from(body, 'base64')
  return Buffer.from(body)
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
const QUOTE_NUMBER_PREFIX = 'QT'

const FAILED_CHECKOUT_PAYMENT_STATUSES = new Set([
  'failed',
  'unpaid',
  'requires_payment_method',
  'requires_action',
  'requires_customer_action',
  'requires_source',
  'requires_source_action',
  'requires_confirmation',
])

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function normalizeOrderNumberForStorage(value?: string | null): string | undefined {
  const sanitized = sanitizeOrderNumber(value)
  if (sanitized) return sanitized
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  return trimmed || undefined
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

async function generateRandomOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${ORDER_NUMBER_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    try {
      const existing = await sanity.fetch<number>(
        'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
        {num: candidate},
      )
      if (!Number(existing)) return candidate
    } catch (err) {
      console.warn('stripeWebhook: order number uniqueness check failed', err)
      return candidate
    }
  }
  return `${ORDER_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
}

function sanitizeQuoteNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^QT-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${QUOTE_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function generateRandomQuoteNumber(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomValue = Math.floor(Math.random() * 1_000_000)
    const candidate = `${QUOTE_NUMBER_PREFIX}-${randomValue.toString().padStart(6, '0')}`
    try {
      const existing = await sanity.fetch<number>(
        'count(*[_type == "quote" && quoteNumber == $num])',
        {num: candidate},
      )
      if (!Number(existing)) return candidate
    } catch (err) {
      console.warn('stripeWebhook: quote number uniqueness check failed', err)
      return candidate
    }
  }
  return `${QUOTE_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
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
  if (candidates.length > 0) return candidates[0]
  return generateRandomOrderNumber()
}

type EventRecordInput = {
  eventType: string
  status?: string
  label?: string
  message?: string
  amount?: number
  currency?: string
  stripeEventId?: string
  metadata?: Record<string, unknown> | null
  occurredAt?: number | string | null
}

const safeJsonStringify = (value: unknown, maxLength = 15000): string | undefined => {
  if (!value) return undefined

  try {
    const json = JSON.stringify(value, null, 2)
    if (!json) return undefined
    if (json.length > maxLength) return `${json.slice(0, maxLength - 3)}...`
    return json
  } catch {
    return undefined
  }
}

const toIsoTimestamp = (value?: number | string | null): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 10_000_000_000) return new Date(value).toISOString()
    return new Date(value * 1000).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return toIsoTimestamp(parsed)
    }
    return new Date(value).toISOString()
  }
  return new Date().toISOString()
}

const isoDateOnly = (iso?: string | null): string | undefined => {
  if (!iso) return undefined
  const trimmed = iso.toString().trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, 10)
}

const isoDateFromUnix = (value?: number | null): string | undefined => {
  const iso = unixToIso(value)
  return isoDateOnly(iso)
}
function pruneUndefined<T extends Record<string, any>>(input: T): T {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result as T
}

function firstString(values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function summarizeEventType(eventType?: string): string {
  if (!eventType) return 'Processed event'
  const friendly = eventType.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!friendly) return 'Processed event'
  return friendly.charAt(0).toUpperCase() + friendly.slice(1)
}

type ComputedShippingMetrics = ReturnType<typeof computeShippingMetrics>

function applyShippingMetrics(
  target: Record<string, any>,
  metrics: ComputedShippingMetrics | null | undefined,
) {
  if (!metrics) return
  if (metrics.weight) target.weight = metrics.weight
  if (metrics.dimensions) target.dimensions = metrics.dimensions
}

async function findInvoiceDocumentIdForEvent(input: {
  metadata?: Record<string, any> | null
  stripeInvoiceId?: string
  invoiceNumber?: string
  paymentIntentId?: string | null
}): Promise<string | null> {
  const metadata = (input.metadata || {}) as Record<string, string>
  const metaId = INVOICE_METADATA_ID_KEYS.map((key) => normalizeSanityId(metadata[key])).find(
    Boolean,
  )
  if (metaId) {
    const docId = await sanity.fetch<string | null>(`*[_type == "invoice" && _id in $ids][0]._id`, {
      ids: idVariants(metaId),
    })
    if (docId) return docId
  }

  if (input.stripeInvoiceId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && stripeInvoiceId == $id][0]._id`,
      {id: input.stripeInvoiceId},
    )
    if (docId) return docId
  }

  const metaNumber = firstString(
    INVOICE_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
  )
  const invoiceNumber = metaNumber || input.invoiceNumber
  if (invoiceNumber) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && invoiceNumber == $num][0]._id`,
      {num: invoiceNumber},
    )
    if (docId) return docId
  }

  if (input.paymentIntentId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && paymentIntentId == $pi][0]._id`,
      {pi: input.paymentIntentId},
    )
    if (docId) return docId
  }

  return null
}

async function findOrderDocumentIdForEvent(input: {
  metadata?: Record<string, any> | null
  paymentIntentId?: string | null
  chargeId?: string | null
  sessionId?: string | null
  invoiceDocId?: string | null
  invoiceNumber?: string | null
}): Promise<string | null> {
  const metadata = (input.metadata || {}) as Record<string, string>
  const metaId = ORDER_METADATA_ID_KEYS.map((key) => normalizeSanityId(metadata[key])).find(Boolean)
  if (metaId) {
    const docId = await sanity.fetch<string | null>(`*[_type == "order" && _id in $ids][0]._id`, {
      ids: idVariants(metaId),
    })
    if (docId) return docId
  }

  if (input.invoiceDocId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "order" && invoiceRef._ref == $invoiceId][0]._id`,
      {invoiceId: input.invoiceDocId},
    )
    if (docId) return docId
  }

  const tryOrderNumberLookup = async (candidate?: string | null): Promise<string | null> => {
    if (!candidate) return null
    const trimmed = candidate.toString().trim()
    if (!trimmed) return null
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "order" && orderNumber == $num][0]._id`,
        {num: trimmed},
      )
      return docId || null
    } catch (err) {
      console.warn('stripeWebhook: failed order lookup by number', err)
      return null
    }
  }

  const metaOrderNumber = firstString(
    ORDER_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
  )
  const invoiceNumber = input.invoiceNumber || metaOrderNumber
  if (invoiceNumber) {
    const docId =
      (await tryOrderNumberLookup(invoiceNumber)) ||
      (await tryOrderNumberLookup(sanitizeOrderNumber(invoiceNumber)))
    if (docId) return docId
  }

  if (input.paymentIntentId || input.chargeId || input.sessionId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "order" && (
        ($pi != '' && paymentIntentId == $pi) ||
        ($charge != '' && chargeId == $charge) ||
        ($session != '' && stripeSessionId == $session)
      )][0]._id`,
      {
        pi: input.paymentIntentId || '',
        charge: input.chargeId || '',
        session: input.sessionId || '',
      },
    )
    if (docId) return docId
  }

  return null
}

async function recordStripeWebhookEvent(options: {
  event: Stripe.Event
  status: 'processed' | 'ignored' | 'error'
  summary?: string
}): Promise<void> {
  const {event, status, summary} = options
  if (!event?.id) return

  const payload = event.data?.object as Record<string, any> | undefined
  const metadata = (payload?.metadata || {}) as Record<string, string>

  const paymentIntentId = (() => {
    if (!payload) return undefined
    const raw = payload.payment_intent
    if (typeof raw === 'string') return raw
    if (raw && typeof raw === 'object' && typeof raw.id === 'string') return raw.id
    return undefined
  })()

  const chargeId = (() => {
    if (!payload) return undefined
    const raw = payload.charge
    if (typeof raw === 'string') return raw
    if (raw && typeof raw === 'object' && typeof raw.id === 'string') return raw.id
    const latestCharge = payload.latest_charge
    if (typeof latestCharge === 'string') return latestCharge
    if (latestCharge && typeof latestCharge === 'object' && typeof latestCharge.id === 'string') {
      return latestCharge.id
    }
    return undefined
  })()

  const sessionId = (() => {
    const candidates: Array<unknown> = SESSION_METADATA_KEYS.map((key) => metadata[key])
    candidates.push((payload as any)?.checkout_session)
    candidates.push((payload as any)?.session)
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return undefined
  })()

  const invoiceNumberCandidate = (() => {
    if (typeof payload?.number === 'string' && payload.number.trim()) {
      return payload.number.trim()
    }
    const metaNumber = firstString(
      INVOICE_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
    )
    if (metaNumber) return metaNumber
    const orderNumberMeta = firstString(
      ORDER_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
    )
    return orderNumberMeta
  })()

  const invoiceDocId = await findInvoiceDocumentIdForEvent({
    metadata,
    stripeInvoiceId:
      payload && payload.object === 'invoice' && typeof payload.id === 'string'
        ? payload.id
        : undefined,
    invoiceNumber: invoiceNumberCandidate,
    paymentIntentId: paymentIntentId || null,
  })

  const orderDocId = await findOrderDocumentIdForEvent({
    metadata,
    paymentIntentId: paymentIntentId || null,
    chargeId: chargeId || null,
    sessionId: sessionId || null,
    invoiceDocId,
    invoiceNumber: invoiceNumberCandidate || null,
  })

  const metadataString =
    metadata && Object.keys(metadata).length > 0 ? safeJsonStringify(metadata) : undefined
  const rawPayload = payload ? safeJsonStringify(payload) : undefined
  const summaryText = summary || `Processed ${event.type}`

  const orderNumber = firstString(
    ORDER_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
  )

  const document = pruneUndefined({
    _id: `${WEBHOOK_DOCUMENT_PREFIX}${event.id}`,
    _type: 'stripeWebhook',
    stripeEventId: event.id,
    eventType: event.type,
    status,
    summary: summaryText,
    occurredAt: toIsoTimestamp(event.created),
    processedAt: new Date().toISOString(),
    resourceType: typeof payload?.object === 'string' ? payload.object : undefined,
    resourceId: typeof payload?.id === 'string' ? payload.id : undefined,
    invoiceNumber: invoiceNumberCandidate,
    invoiceStatus: typeof payload?.status === 'string' ? payload.status : undefined,
    paymentIntentId,
    chargeId,
    customerId:
      typeof payload?.customer === 'string'
        ? payload.customer
        : payload?.customer && typeof payload.customer === 'object'
          ? (payload.customer as {id?: string}).id
          : undefined,
    requestId:
      typeof event.request === 'string'
        ? event.request
        : (event.request as Stripe.Event.Request | null | undefined)?.id,
    livemode: event.livemode ?? undefined,
    orderNumber,
    metadata: metadataString,
    rawPayload,
    orderId: orderDocId || undefined,
    invoiceId: invoiceDocId || undefined,
    orderRef: orderDocId ? {_type: 'reference', _ref: orderDocId} : undefined,
    invoiceRef: invoiceDocId ? {_type: 'reference', _ref: invoiceDocId} : undefined,
  })

  try {
    await sanity.createOrReplace(document, {autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to record webhook event', err)
  }
}

const buildOrderEventRecord = (input: EventRecordInput) => {
  const event: Record<string, any> = {
    _type: 'orderEvent',
    _key: randomUUID(),
    type: input.eventType,
    createdAt: toIsoTimestamp(input.occurredAt),
  }
  if (input.status) event.status = input.status
  if (input.label) event.label = input.label
  if (input.message) event.message = input.message
  if (typeof input.amount === 'number' && Number.isFinite(input.amount)) event.amount = input.amount
  if (input.currency) event.currency = input.currency.toUpperCase()
  if (input.stripeEventId) event.stripeEventId = input.stripeEventId
  const metadataString = safeJsonStringify(input.metadata)
  if (metadataString) event.metadata = metadataString
  return event
}

const appendEventsToDocument = async (
  docId: string | null | undefined,
  field: string,
  events: Array<Record<string, any>>,
) => {
  if (!docId || !events.length) return
  try {
    await sanity
      .patch(docId)
      .setIfMissing({[field]: []})
      .append(field, events)
      .commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn(`stripeWebhook: failed to append ${field} on ${docId}`, err)
  }
}

const appendOrderEvent = async (
  orderId: string | null | undefined,
  event: EventRecordInput,
): Promise<void> => {
  if (!orderId) return
  await appendEventsToDocument(orderId, 'orderEvents', [buildOrderEventRecord(event)])
}

const appendExpiredCartEvent = async (
  docId: string | null | undefined,
  event: EventRecordInput | Record<string, any>,
): Promise<void> => {
  if (!docId) return
  const record =
    event && typeof event === 'object' && 'eventType' in event
      ? buildOrderEventRecord(event as EventRecordInput)
      : (event as Record<string, any>)
  await appendEventsToDocument(docId, 'events', [record])
}

type StripeWebhookCategory = 'source' | 'person' | 'issuing_dispute'

const humanizeSegments = (value: string) =>
  value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

const recordStripeWebhookResourceEvent = async (
  webhookEvent: Stripe.Event,
  category: StripeWebhookCategory,
): Promise<void> => {
  try {
    const dataObject = webhookEvent.data?.object as Record<string, any> | null
    const metadataString =
      dataObject && typeof dataObject === 'object' && 'metadata' in dataObject
        ? safeJsonStringify((dataObject as any).metadata, 6000)
        : undefined
    const dataSnapshot = dataObject ? safeJsonStringify(dataObject, 12000) : undefined
    const payloadSnapshot = safeJsonStringify(webhookEvent, 15000)
    const resourceId =
      dataObject && typeof dataObject === 'object' && typeof (dataObject as any).id === 'string'
        ? (dataObject as any).id
        : undefined
    const resourceType =
      dataObject && typeof dataObject === 'object' && typeof (dataObject as any).object === 'string'
        ? (dataObject as any).object
        : undefined
    let status: string | undefined
    if (dataObject && typeof dataObject === 'object') {
      const candidateStatus = (dataObject as any).status
      if (typeof candidateStatus === 'string') {
        status = candidateStatus
      } else if (typeof (dataObject as any).verification?.status === 'string') {
        status = (dataObject as any).verification.status
      }
    }
    const amount =
      dataObject && typeof (dataObject as any).amount === 'number'
        ? (dataObject as any).amount
        : undefined
    const currency =
      dataObject && typeof (dataObject as any).currency === 'string'
        ? (dataObject as any).currency.toUpperCase()
        : undefined
    const requestId =
      typeof webhookEvent.request === 'string' ? webhookEvent.request : webhookEvent.request?.id
    const categoryLabel = humanizeSegments(category)
    const remainder = webhookEvent.type.startsWith(`${category}.`)
      ? webhookEvent.type.slice(category.length + 1)
      : webhookEvent.type
    const actionLabel = humanizeSegments(remainder.replace(/\./g, ' '))
    const baseSummary = [categoryLabel, actionLabel].filter(Boolean).join(' ') || webhookEvent.type

    const doc = {
      _id: `stripeWebhookEvent.${webhookEvent.id}`,
      _type: 'stripeWebhookEvent',
      eventId: webhookEvent.id,
      eventType: webhookEvent.type,
      category,
      summary: resourceId ? `${baseSummary} • ${resourceId}` : baseSummary,
      status,
      livemode: Boolean(webhookEvent.livemode),
      amount,
      currency,
      resourceId,
      resourceType,
      requestId,
      apiVersion: webhookEvent.api_version || undefined,
      metadata: metadataString,
      data: dataSnapshot,
      payload: payloadSnapshot,
      createdAt: toIsoTimestamp(webhookEvent.created),
      receivedAt: new Date().toISOString(),
    }

    const cleanedDoc = Object.fromEntries(
      Object.entries(doc).filter(([, value]) => value !== undefined && value !== null),
    ) as Record<string, any> & {_id: string; _type: 'stripeWebhookEvent'}

    await sanity.createOrReplace(cleanedDoc)
  } catch (err) {
    console.warn('stripeWebhook: failed to record generic webhook event', err)
  }
}

const buildMetadataEntries = (
  metadata: Record<string, string>,
): Array<{
  _type: 'stripeMetadataEntry'
  key: string
  value: string
}> =>
  normalizeMetadataEntries(metadata).map((entry) => ({
    _type: 'stripeMetadataEntry',
    key: entry.key,
    value: entry.value,
  }))

const parseCartMetadataNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '')
    if (!cleaned) return undefined
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const parseCartMetadataString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

const FALLBACK_OPTION_SUMMARY_KEYS = [
  'option_summary_display',
  'option_summary',
  'options_readable',
  'selected_options_display',
  'selected_options',
]

const OPTION_DETAIL_FIELD_KEYS = [
  'optionDetails',
  'option_details',
  'selected_options',
  'selected_options_json',
  'option_values',
  'option_value_display',
]

const UPGRADE_FIELD_KEYS = [
  'upgrades',
  'upgrade_list',
  'upgrade_summary',
  'upgrade_details',
  'addons',
  'add_ons',
  'addOns',
]

const DESCRIPTION_METADATA_KEYS = [
  'description',
  'line_description',
  'linedescription',
  'product_description',
  'productdescription',
  'item_description',
  'itemdescription',
  'stripe_line_description',
]

const IMAGE_METADATA_KEYS = [
  'image',
  'image_url',
  'imageurl',
  'image_link',
  'imagelink',
  'imageUrl',
  'product_image',
  'productimage',
  'productImage',
  'product_image_url',
  'productimageurl',
  'featured_image',
  'featuredimage',
  'thumbnail',
  'thumb',
  'thumb_url',
  'thumburl',
  'photo',
  'product_photo',
]

const PRODUCT_URL_METADATA_KEYS = [
  'product_url',
  'producturl',
  'productUrl',
  'product_link',
  'productlink',
  'productLink',
  'product_page',
  'productpage',
  'product_permalink',
  'productpermalink',
  'url',
]

const LINE_TOTAL_METADATA_KEYS = [
  'line_total',
  'linetotal',
  'lineTotal',
  'line_amount',
  'lineamount',
  'amount_total',
  'amounttotal',
  'amountTotal',
  'subtotal',
  'sub_total',
  'item_total',
  'itemtotal',
  'itemTotal',
]

const TOTAL_METADATA_KEYS = [
  'total',
  'total_amount',
  'totalamount',
  'totalAmount',
  'grand_total',
  'grandtotal',
  'grandTotal',
  'order_total',
  'ordertotal',
  'orderTotal',
  'amount_total',
  'amounttotal',
  'amountTotal',
]

const CATEGORY_FIELD_KEYS = [
  'categories',
  'category',
  'category_list',
  'category_tags',
  'categoryTags',
]

const CART_METADATA_SOURCE_VALUES: CartMetadataEntry['source'][] = [
  'lineItem',
  'price',
  'product',
  'session',
  'derived',
  'legacy',
]

const CART_METADATA_SOURCE_SET = new Set(CART_METADATA_SOURCE_VALUES)

const normalizeCartMetadataSource = (value: unknown): CartMetadataEntry['source'] => {
  if (typeof value === 'string') {
    const normalized = value.trim() as CartMetadataEntry['source']
    if (normalized && CART_METADATA_SOURCE_SET.has(normalized)) {
      return normalized
    }
  }
  return 'legacy'
}

const consumeRecordValue = (source: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key]
      delete source[key]
      return value
    }
  }
  return undefined
}

const normalizeMetadataKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '')

const findMetadataValue = (
  map: Record<string, string>,
  normalized: Record<string, string>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const lower = key.toLowerCase()
    if (map[lower]) return map[lower]
    const normalizedKey = normalizeMetadataKey(key)
    if (normalizedKey && normalized[normalizedKey]) return normalized[normalizedKey]
  }
  return undefined
}

const extractSlugFromUrl = (value?: string | null): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const segments = trimmed.split('/').filter(Boolean)
  if (!segments.length) return trimmed
  return segments[segments.length - 1] || trimmed
}

const convertLegacyCartEntry = (entry: unknown): CartItem | null => {
  if (!entry || typeof entry !== 'object') return null

  const record = entry as Record<string, unknown>
  const working = {...record}

  delete working._type
  const existingKey =
    typeof (record as any)._key === 'string' ? ((record as any)._key as string) : undefined
  delete working._key

  const metadataInputs: unknown[] = []
  const metadataValue = consumeRecordValue(working, ['metadata'])
  if (metadataValue !== undefined) metadataInputs.push(metadataValue)
  const rawMetadataValue = consumeRecordValue(working, ['raw_metadata', 'rawMetadata'])
  if (rawMetadataValue !== undefined) metadataInputs.push(rawMetadataValue)

  const stripeProductId = parseCartMetadataString(
    consumeRecordValue(working, ['stripeProductId', 'stripe_product_id']),
  )
  const stripePriceId = parseCartMetadataString(
    consumeRecordValue(working, ['stripePriceId', 'stripe_price_id', 'price_id']),
  )
  let productSlug = parseCartMetadataString(
    consumeRecordValue(working, ['productSlug', 'product_slug', 'slug', 'handle']),
  )
  const productName = parseCartMetadataString(
    consumeRecordValue(working, ['productName', 'product_name', 'stripe_product_name']),
  )
  const sku = parseCartMetadataString(
    consumeRecordValue(working, [
      'sku',
      'SKU',
      'product_sku',
      'productSku',
      'item_sku',
      'variant_sku',
      'inventory_sku',
    ]),
  )
  const id = parseCartMetadataString(
    consumeRecordValue(working, [
      'id',
      'productId',
      'product_id',
      'sanity_product_id',
      'sanityProductId',
      'item_id',
      'itemId',
    ]),
  )

  const rawUrl =
    parseCartMetadataString(record.url as string | undefined) ||
    parseCartMetadataString(record.product_url as string | undefined) ||
    parseCartMetadataString(record.productUrl as string | undefined) ||
    undefined
  if (!productSlug && rawUrl) {
    productSlug = extractSlugFromUrl(rawUrl)
  }

  const quantity = parseCartMetadataNumber(
    consumeRecordValue(working, ['quantity', 'qty', 'amount', 'q']),
  )
  const price = parseCartMetadataNumber(
    consumeRecordValue(working, [
      'price',
      'unit_price',
      'base_price',
      'amount',
      'total',
      'line_total',
      'line_amount',
      'p',
      'amount_total',
    ]),
  )

  const optionSummaryFromRecord = parseCartMetadataString(
    consumeRecordValue(working, [
      'optionSummary',
      'option_summary',
      'option_summary_display',
      'options_readable',
      'selected_options_display',
    ]),
  )
  const optionDetailsValue = consumeRecordValue(working, OPTION_DETAIL_FIELD_KEYS)
  const upgradesValue = consumeRecordValue(working, UPGRADE_FIELD_KEYS)
  const categoriesValue = consumeRecordValue(working, CATEGORY_FIELD_KEYS)

  const nameCandidate =
    parseCartMetadataString(consumeRecordValue(working, ['name', 'display_name', 'title', 'n'])) ||
    productName ||
    productSlug ||
    sku ||
    id ||
    'Item'

  if (Object.keys(working).length > 0) {
    metadataInputs.push(working)
  }

  const normalizedMetadata = metadataInputs.flatMap((input) =>
    normalizeMetadataEntries(input as any),
  )
  const derivedOptions = deriveOptionsFromMetadata(normalizedMetadata)

  const metadataMap: Record<string, string> = {}
  const normalizedMetadataMap: Record<string, string> = {}
  for (const {key, value} of normalizedMetadata) {
    const lower = key.toLowerCase()
    if (!metadataMap[lower]) metadataMap[lower] = value
    const normalizedKey = normalizeMetadataKey(key)
    if (normalizedKey && !normalizedMetadataMap[normalizedKey]) {
      normalizedMetadataMap[normalizedKey] = value
    }
  }
  const fallbackSummary =
    findMetadataValue(metadataMap, normalizedMetadataMap, ...FALLBACK_OPTION_SUMMARY_KEYS) ||
    undefined

  const metadataDescription = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...DESCRIPTION_METADATA_KEYS,
  )
  const metadataImage = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...IMAGE_METADATA_KEYS,
  )
  const metadataProductUrl = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...PRODUCT_URL_METADATA_KEYS,
  )
  const metadataLineTotalValue = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...LINE_TOTAL_METADATA_KEYS,
  )
  const metadataTotalValue = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...TOTAL_METADATA_KEYS,
  )
  const metadataLineTotal = parseCartMetadataNumber(metadataLineTotalValue)
  const metadataTotal = parseCartMetadataNumber(metadataTotalValue)

  const optionSummary =
    optionSummaryFromRecord || derivedOptions.optionSummary || fallbackSummary || undefined

  const optionDetailsCandidates = uniqueStrings([
    ...coerceStringArray(optionDetailsValue),
    ...derivedOptions.optionDetails,
  ])
  const summarySegments = optionSummary ? coerceStringArray(optionSummary) : []
  const optionDetails = uniqueStrings([...optionDetailsCandidates, ...summarySegments])

  const upgrades = uniqueStrings([...coerceStringArray(upgradesValue), ...derivedOptions.upgrades])
  const categories = uniqueStrings(coerceStringArray(categoriesValue))

  const resolvedDescription =
    parseCartMetadataString(metadataDescription) ||
    parseCartMetadataString((record as any).description) ||
    undefined
  const resolvedImage = parseCartMetadataString(metadataImage) || undefined
  const resolvedProductUrl =
    parseCartMetadataString(metadataProductUrl) || parseCartMetadataString(rawUrl) || undefined

  const typedMetadata: CartMetadataEntry[] = []
  const seenMetaKeys = new Set<string>()

  if (Array.isArray(metadataValue)) {
    for (const candidate of metadataValue) {
      if (!candidate || typeof candidate !== 'object') continue
      const key = parseCartMetadataString((candidate as any).key)
      const value = parseCartMetadataString((candidate as any).value)
      if (!key || !value) continue
      const dedupeKey = `${key.toLowerCase()}:::${value}`
      if (seenMetaKeys.has(dedupeKey)) continue
      seenMetaKeys.add(dedupeKey)
      typedMetadata.push({
        _type: 'orderCartItemMeta',
        key,
        value,
        source: normalizeCartMetadataSource((candidate as any).source),
      })
    }
  }

  const remainingEntries = remainingMetadataEntries(normalizedMetadata, derivedOptions.consumedKeys)
  for (const {key, value} of remainingEntries) {
    const trimmedKey = key.trim()
    const trimmedValue = value.trim()
    if (!trimmedKey || !trimmedValue) continue
    const dedupeKey = `${trimmedKey.toLowerCase()}:::${trimmedValue}`
    if (seenMetaKeys.has(dedupeKey)) continue
    seenMetaKeys.add(dedupeKey)
    typedMetadata.push({
      _type: 'orderCartItemMeta',
      key: trimmedKey,
      value: trimmedValue,
      source: 'legacy',
    })
  }

  const item: CartItem = {
    _type: 'orderCartItem',
    _key: existingKey || randomUUID(),
    name: nameCandidate,
  }

  if (id) item.id = id
  if (sku) item.sku = sku
  if (productSlug) item.productSlug = productSlug
  if (productName) item.productName = productName
  if (stripeProductId) item.stripeProductId = stripeProductId
  if (stripePriceId) item.stripePriceId = stripePriceId
  if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    item.quantity = Math.max(1, Math.round(quantity))
  }
  if (typeof price === 'number' && Number.isFinite(price)) {
    item.price = Number(price)
  }
  if (resolvedDescription) item.description = resolvedDescription
  if (resolvedImage) item.image = resolvedImage
  if (resolvedProductUrl) item.productUrl = resolvedProductUrl
  if (optionSummary) item.optionSummary = optionSummary
  if (optionDetails.length) item.optionDetails = optionDetails
  if (upgrades.length) item.upgrades = upgrades
  if (categories.length) item.categories = categories
  const resolvedQuantityValue =
    typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : undefined
  const resolvedPriceValue =
    typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : undefined
  const derivedLineTotal =
    metadataLineTotal !== undefined
      ? metadataLineTotal
      : resolvedPriceValue !== undefined && resolvedQuantityValue !== undefined
        ? resolvedPriceValue * resolvedQuantityValue
        : undefined
  const derivedTotal =
    metadataTotal !== undefined
      ? metadataTotal
      : derivedLineTotal !== undefined
        ? derivedLineTotal
        : undefined
  if (derivedLineTotal !== undefined) item.lineTotal = derivedLineTotal
  if (derivedTotal !== undefined) item.total = derivedTotal
  if (typedMetadata.length) {
    item.metadataEntries = typedMetadata
  }

  const metadataSummary = typeof item.optionSummary === 'string' ? item.optionSummary.trim() : ''
  const metadataUpgrades = Array.isArray(item.upgrades)
    ? item.upgrades
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry): entry is string => Boolean(entry))
    : []

  if (metadataSummary || metadataUpgrades.length) {
    item.metadata = {
      option_summary: metadataSummary || undefined,
      upgrades: metadataUpgrades.length ? metadataUpgrades : undefined,
    }
  }

  return item
}

function cartItemsFromMetadata(metadata: Record<string, string>): CartItem[] {
  const rawCandidates = [
    metadata['cart'],
    metadata['cart_items'],
    metadata['cartItems'],
    metadata['line_items'],
  ]
  const raw = rawCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim())
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const items: CartItem[] = []
    for (const entry of parsed) {
      const item = convertLegacyCartEntry(entry)
      if (item) items.push(item)
    }
    return items
  } catch (err) {
    console.warn('stripeWebhook: failed to parse cart metadata', err)
    return []
  }
}

async function buildCartFromSessionLineItems(
  sessionId: string,
  metadata: Record<string, string>,
): Promise<{items: CartItem[]; products: CartProductSummary[]}> {
  if (!stripe) return {items: [], products: []}
  try {
    const items = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
      expand: ['data.price.product'],
    })
    let cartItems = (items?.data || []).map((li: Stripe.LineItem) => ({
      _type: 'orderCartItem',
      _key: randomUUID(),
      ...mapStripeLineItem(li, {sessionMetadata: metadata}),
    })) as CartItem[]
    if (!cartItems.length) {
      cartItems = cartItemsFromMetadata(metadata)
    }
    if (!cartItems.length) return {items: [], products: []}

    let productSummaries: CartProductSummary[] = []
    const enriched = await enrichCartItemsFromSanity(cartItems, sanity, {
      onProducts: (list) => {
        productSummaries = list
      },
    })
    cartItems = enriched
    if (!productSummaries.length && cartItems.length) {
      productSummaries = await fetchProductsForCart(cartItems, sanity)
    }
    return {items: cartItems, products: productSummaries}
  } catch (err) {
    console.warn('stripeWebhook: listLineItems failed', err)
    let fallback = cartItemsFromMetadata(metadata)
    if (!fallback.length) return {items: [], products: []}
    try {
      let productSummaries: CartProductSummary[] = []
      const enriched = await enrichCartItemsFromSanity(fallback, sanity, {
        onProducts: (list) => {
          productSummaries = list
        },
      })
      fallback = enriched
      if (!productSummaries.length && fallback.length) {
        productSummaries = await fetchProductsForCart(fallback, sanity)
      }
      return {items: fallback, products: productSummaries}
    } catch {
      const productSummaries = fallback.length ? await fetchProductsForCart(fallback, sanity) : []
      return {items: fallback, products: productSummaries}
    }
  }
}

async function recordExpiredCart(
  session: Stripe.Checkout.Session,
  opts: {
    reason: string
    failureCode?: string
    failureMessage?: string
    stripeEventId?: string
    eventCreated?: number | null
    orderId?: string | null
    preloadedCart?: CartItem[]
  },
) {
  const metadata = (session.metadata || {}) as Record<string, string>
  let cart: CartItem[] = []
  if (Array.isArray(opts.preloadedCart) && opts.preloadedCart.length) {
    cart = opts.preloadedCart
  } else {
    try {
      const cartResult = await buildCartFromSessionLineItems(session.id, metadata)
      cart = cartResult.items
    } catch (err) {
      console.warn('stripeWebhook: failed to load cart for expired session', err)
      cart = cartItemsFromMetadata(metadata)
    }
  }
  const email = (session.customer_details?.email || session.customer_email || '').toString().trim()
  const customerName =
    (session.customer_details?.name || (session.metadata?.customer_name as string) || email || '')
      .toString()
      .trim() || undefined
  const totalAmount = toMajorUnits(session.amount_total ?? undefined)
  const currency = (session.currency || '').toString().toUpperCase() || undefined
  const metadataEntries = buildMetadataEntries(metadata)
  const createdAt = unixToIso(session.created) || new Date().toISOString()
  const expiredAt = unixToIso(session.expires_at) || new Date().toISOString()
  const normalizedPaymentStatus = (session.payment_status || 'pending').toString()
  const paymentStatus =
    opts.reason === 'checkout.session.expired' || opts.failureCode === 'checkout.session.expired'
      ? 'expired'
      : normalizedPaymentStatus
  const eventMetadata: Record<string, string> = {...metadata}
  if (opts.orderId) {
    eventMetadata['sanity_order_id'] = opts.orderId
  }

  const baseDoc: Record<string, any> = {
    stripeSessionId: session.id,
    clientReferenceId: session.client_reference_id || undefined,
    status: 'expired',
    paymentStatus,
    customerEmail: email || undefined,
    customerName,
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
    totalAmount,
    currency,
    metadata: metadataEntries.length ? metadataEntries : undefined,
    cart: cart.length ? cart : undefined,
    stripeSummary: buildStripeSummary({
      session,
      failureCode: opts.failureCode,
      failureMessage: opts.failureMessage,
      eventType: opts.reason,
      eventCreated: opts.eventCreated,
    }),
    createdAt,
    expiredAt,
  }

  const existing = await sanity.fetch<{_id: string; status?: string} | null>(
    `*[_type == "expiredCart" && stripeSessionId == $sid][0]{_id, status}`,
    {sid: session.id},
  )

  if (existing?.status && existing.status !== 'expired') {
    baseDoc.status = existing.status
  }

  const eventRecord = buildOrderEventRecord({
    eventType: opts.reason,
    status: 'expired',
    label: 'Checkout expired',
    message: opts.failureMessage,
    stripeEventId: opts.stripeEventId,
    occurredAt: opts.eventCreated,
    metadata: eventMetadata,
    amount: totalAmount,
    currency,
  })

  if (existing?._id) {
    try {
      await sanity.patch(existing._id).set(baseDoc).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update expired cart record', err)
    }
    await appendExpiredCartEvent(existing._id, eventRecord)
    return existing._id
  }

  const docToCreate = {
    _type: 'expiredCart',
    ...baseDoc,
    cart: cart.length ? cart : undefined,
    metadata: metadataEntries.length ? metadataEntries : undefined,
    events: [eventRecord],
  }
  try {
    const created = await sanity.create(docToCreate, {autoGenerateArrayKeys: true})
    return created?._id || null
  } catch (err) {
    console.warn('stripeWebhook: failed to create expired cart record', err)
    return null
  }
}

async function markExpiredCartRecovered(
  stripeSessionId: string | undefined,
  orderId: string | null,
  eventInput: EventRecordInput,
): Promise<void> {
  if (!stripeSessionId) return
  const doc = await sanity.fetch<{_id: string} | null>(
    `*[_type == "expiredCart" && stripeSessionId == $sid][0]{_id}`,
    {sid: stripeSessionId},
  )
  if (!doc?._id) return
  const patchData: Record<string, any> = {
    status: 'recovered',
    recoveredAt: new Date().toISOString(),
  }
  if (orderId) {
    patchData.orderRef = {_type: 'reference', _ref: orderId}
  }
  try {
    await sanity.patch(doc._id).set(patchData).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to mark expired cart as recovered', err)
  }
  await appendExpiredCartEvent(doc._id, eventInput)
}

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : (null as any)
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const money = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : ''

const renderAddressHtml = (address?: any): string => {
  if (!address) return ''
  const lines = [
    address?.name,
    address?.addressLine1,
    address?.addressLine2,
    [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', '),
    address?.country,
  ].filter((line) => Boolean(line && String(line).trim()))
  if (lines.length === 0) return ''
  return lines.map((line) => `<div>${line}</div>`).join('')
}

const renderAddressText = (address?: any): string => {
  if (!address) return ''
  const lines = [
    address?.name,
    address?.addressLine1,
    address?.addressLine2,
    [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', '),
    address?.country,
  ].filter((line) => Boolean(line && String(line).trim()))
  return lines.join('\n')
}

const PRODUCT_METADATA_ID_KEYS = [
  'sanity_id',
  'sanityId',
  'sanity_document_id',
  'sanityDocId',
  'sanity_doc_id',
  'sanityProductId',
  'sanity_product_id',
  'sanityDocumentId',
  'document_id',
  'documentId',
  'product_document_id',
  'productDocumentId',
]

const PRODUCT_METADATA_SKU_KEYS = ['sku', 'SKU', 'product_sku', 'productSku', 'sanity_sku']
const PRODUCT_METADATA_SLUG_KEYS = ['sanity_slug', 'slug', 'product_slug', 'productSlug']

const INVOICE_METADATA_ID_KEYS = ['sanity_invoice_id', 'invoice_id', 'sanityInvoiceId', 'invoiceId']
const INVOICE_METADATA_NUMBER_KEYS = [
  'sanity_invoice_number',
  'invoice_number',
  'invoiceNumber',
  'sanityInvoiceNumber',
]

const QUOTE_METADATA_ID_KEYS = ['sanity_quote_id', 'quote_id', 'sanityQuoteId', 'quoteId']
const QUOTE_METADATA_NUMBER_KEYS = ['sanity_quote_number', 'quote_number', 'quoteNumber']

const PAYMENT_LINK_METADATA_ID_KEYS = [
  'sanity_payment_link_id',
  'payment_link_id',
  'sanityPaymentLinkId',
  'paymentLinkId',
]
const PAYMENT_LINK_METADATA_QUOTE_KEYS = ['sanity_quote_id', 'quote_id', 'quoteId', 'sanityQuoteId']
const PAYMENT_LINK_METADATA_ORDER_KEYS = ['sanity_order_id', 'order_id', 'orderId', 'sanityOrderId']
const ORDER_METADATA_ID_KEYS = ['sanity_order_id', 'order_id', 'orderId', 'sanityOrderId']
const ORDER_METADATA_NUMBER_KEYS = [
  'sanity_order_number',
  'sanityOrderNumber',
  'order_number',
  'orderNumber',
  'orderNo',
  'website_order_number',
  'websiteOrderNumber',
]
const SESSION_METADATA_KEYS = [
  'stripe_session_id',
  'stripeSessionId',
  'sanity_session_id',
  'session_id',
  'sessionId',
  'checkout_session_id',
]
const WEBHOOK_DOCUMENT_PREFIX = 'stripeWebhook.'

function isStripeProduct(
  product: Stripe.Product | Stripe.DeletedProduct | string | null | undefined,
): product is Stripe.Product {
  return Boolean(
    product &&
      typeof product === 'object' &&
      !('deleted' in product && (product as Stripe.DeletedProduct).deleted),
  )
}

function normalizeSanityId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

const extractMetadataOrderNumber = (
  metadata: Record<string, unknown> | null | undefined,
): string | undefined => {
  if (!metadata) return undefined
  return firstString(ORDER_METADATA_NUMBER_KEYS.map((key) => metadata[key]))
}

function slugifyValue(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || `product-${Math.random().toString(36).slice(2, 10)}`
  )
}

async function ensureUniqueProductSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug || 'product'
  let suffix = 1
  while (suffix <= 20) {
    const exists = await sanity.fetch<number>(
      'count(*[_type == "product" && slug.current == $slug])',
      {slug},
    )
    if (!Number(exists)) return slug
    suffix += 1
    slug = `${baseSlug}-${suffix}`.slice(0, 96)
  }
  return `${baseSlug}-${Date.now()}`.slice(0, 96)
}

function toMajorUnits(amount?: number | null): number | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined
  return amount / 100
}

function unixToIso(timestamp?: number | null): string | undefined {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0)
    return undefined
  return new Date(timestamp * 1000).toISOString()
}

async function findProductDocumentId(opts: {
  metadata?: Record<string, string>
  stripeProductId?: string
  sku?: string
  slug?: string
}): Promise<string | null> {
  const meta = opts.metadata || {}

  const idCandidates = PRODUCT_METADATA_ID_KEYS.map((key) => normalizeSanityId(meta[key])).filter(
    Boolean,
  ) as string[]

  if (idCandidates.length > 0) {
    const variants = idCandidates.flatMap((id) => idVariants(id))
    const docId = await sanity.fetch<string | null>(`*[_type == "product" && _id in $ids][0]._id`, {
      ids: variants,
    })
    if (docId) return docId
  }

  if (opts.stripeProductId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "product" && stripeProductId == $pid][0]._id`,
      {pid: opts.stripeProductId},
    )
    if (docId) return docId
  }

  const skuCandidates = [opts.sku, ...PRODUCT_METADATA_SKU_KEYS.map((key) => meta[key])]
    .map((value) => (value || '').toString().trim())
    .filter(Boolean)
  if (skuCandidates.length > 0) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "product" && sku in $skus][0]._id`,
      {skus: skuCandidates},
    )
    if (docId) return docId
  }

  const slugCandidates = [opts.slug, ...PRODUCT_METADATA_SLUG_KEYS.map((key) => meta[key])]
    .map((value) => (value || '').toString().trim())
    .filter(Boolean)
  if (slugCandidates.length > 0) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "product" && slug.current in $slugs][0]._id`,
      {slugs: slugCandidates},
    )
    if (docId) return docId
  }

  return null
}

async function ensureProductDocument(
  stripeProductId: string,
  metadata?: Record<string, string>,
): Promise<string | null> {
  let docId = await findProductDocumentId({stripeProductId, metadata})
  if (docId) return docId

  try {
    const product = await stripe.products.retrieve(stripeProductId)
    if (!isStripeProduct(product)) return null
    docId = await syncStripeProduct(product)
    return docId
  } catch (err) {
    console.warn('stripeWebhook: failed to retrieve Stripe product', err)
    return null
  }
}

function buildPriceSnapshot(price: Stripe.Price) {
  return {
    priceId: price.id,
    nickname: price.nickname || undefined,
    currency: price.currency ? price.currency.toUpperCase() : undefined,
    unitAmount: toMajorUnits(price.unit_amount),
    unitAmountRaw: typeof price.unit_amount === 'number' ? price.unit_amount : undefined,
    type: price.type,
    billingScheme: price.billing_scheme,
    recurringInterval: price.recurring?.interval || undefined,
    recurringIntervalCount: price.recurring?.interval_count ?? undefined,
    active: price.active,
    livemode: price.livemode,
    createdAt: unixToIso(price.created) || new Date().toISOString(),
  }
}

async function syncStripeProduct(product: Stripe.Product): Promise<string | null> {
  const metadata = (product.metadata || {}) as Record<string, string>
  const skuCandidates = [metadata.sku, metadata.SKU, metadata.product_sku, metadata.productSku]
    .map((value) => (value || '').toString().trim())
    .filter(Boolean)
  const slugMeta =
    metadata.sanity_slug || metadata.slug || metadata.product_slug || metadata.productSlug

  const existingId = await findProductDocumentId({
    metadata,
    stripeProductId: product.id,
    sku: skuCandidates[0],
    slug: slugMeta,
  })
  const updatedAt = unixToIso(product.updated) || new Date().toISOString()
  const defaultPriceId =
    typeof product.default_price === 'string' ? product.default_price : product.default_price?.id
  const sku = skuCandidates.find(Boolean)

  const setOps: Record<string, any> = {
    stripeProductId: product.id,
    stripeActive: product.active,
    stripeUpdatedAt: updatedAt,
  }
  if (defaultPriceId) setOps.stripeDefaultPriceId = defaultPriceId

  if (existingId) {
    const existing = await sanity.fetch<{title?: string; sku?: string}>(
      `*[_id == $id][0]{title, sku}`,
      {id: existingId},
    )
    let patch = sanity.patch(existingId).set(setOps)
    if (sku && !existing?.sku) patch = patch.set({sku})
    if (product.name && !existing?.title) patch = patch.set({title: product.name})
    try {
      await patch.commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to patch product', err)
    }
    return existingId
  }

  const title = product.name || metadata.title || 'Stripe Product'
  const baseSlug = slugifyValue(slugMeta || title)
  const slug = await ensureUniqueProductSlug(baseSlug)

  const payload: Record<string, any> = {
    _type: 'product',
    title,
    slug: {_type: 'slug', current: slug},
    availability: 'in_stock',
    stripeProductId: product.id,
    stripeActive: product.active,
    stripeUpdatedAt: updatedAt,
  }
  if (defaultPriceId) payload.stripeDefaultPriceId = defaultPriceId
  if (sku) payload.sku = sku

  try {
    const created = await sanity.create(payload as any, {autoGenerateArrayKeys: true})
    return created?._id || null
  } catch (err) {
    console.warn('stripeWebhook: failed to create product doc from Stripe product', err)
    return null
  }
}

async function syncStripePrice(price: Stripe.Price): Promise<void> {
  const productId = typeof price.product === 'string' ? price.product : price.product?.id
  if (!productId) return

  const productObject = typeof price.product === 'string' ? null : price.product
  const combinedMeta: Record<string, string> = {
    ...(isStripeProduct(productObject)
      ? ((productObject.metadata || {}) as Record<string, string>)
      : {}),
    ...(price.metadata || {}),
  }

  const docId = await ensureProductDocument(productId, combinedMeta)
  if (!docId) return

  const existing = await sanity.fetch<{stripePrices?: any[]}>(`*[_id == $id][0]{stripePrices}`, {
    id: docId,
  })
  const currentPrices = Array.isArray(existing?.stripePrices) ? existing!.stripePrices : []
  const snapshot = buildPriceSnapshot(price)
  const filtered = currentPrices.filter(
    (entry: any) => entry?.priceId !== snapshot.priceId && entry?._key !== snapshot.priceId,
  )
  filtered.push({_type: 'stripePriceSnapshot', _key: snapshot.priceId, ...snapshot})

  const setOps: Record<string, any> = {
    stripePrices: filtered,
    stripeProductId: productId,
    stripeUpdatedAt: new Date().toISOString(),
  }

  if (
    typeof price.active === 'boolean' &&
    price.type === 'one_time' &&
    typeof price.unit_amount === 'number'
  ) {
    const major = toMajorUnits(price.unit_amount)
    if (typeof major === 'number') setOps.price = major
  }

  if (isStripeProduct(productObject) && productObject.default_price) {
    const defaultPriceId =
      typeof productObject.default_price === 'string'
        ? productObject.default_price
        : productObject.default_price?.id
    if (defaultPriceId) setOps.stripeDefaultPriceId = defaultPriceId
  }

  try {
    await sanity.patch(docId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to upsert Stripe price snapshot', err)
  }
}

async function removeStripePrice(priceId: string, productId?: string): Promise<void> {
  if (!priceId) return
  let docId: string | null = null
  if (productId) docId = await findProductDocumentId({stripeProductId: productId})
  if (!docId) {
    docId = await sanity.fetch<string | null>(
      `*[_type == "product" && stripePrices[].priceId == $pid][0]._id`,
      {pid: priceId},
    )
  }
  if (!docId) return

  const existing = await sanity.fetch<{stripePrices?: any[]; stripeDefaultPriceId?: string}>(
    `*[_id == $id][0]{stripePrices, stripeDefaultPriceId}`,
    {id: docId},
  )
  const currentPrices = Array.isArray(existing?.stripePrices) ? existing!.stripePrices : []
  const filtered = currentPrices.filter(
    (entry: any) => entry?.priceId !== priceId && entry?._key !== priceId,
  )

  const setOps: Record<string, any> = {
    stripePrices: filtered,
    stripeUpdatedAt: new Date().toISOString(),
  }

  if (existing?.stripeDefaultPriceId === priceId) {
    setOps.stripeDefaultPriceId = filtered[0]?.priceId || undefined
  }

  try {
    await sanity.patch(docId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to remove Stripe price snapshot', err)
  }
}

async function findCustomerDocIdByStripeCustomerId(
  stripeCustomerId?: string | null,
): Promise<string | null> {
  if (!stripeCustomerId) return null
  try {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "customer" && stripeCustomerId == $id][0]._id`,
      {id: stripeCustomerId},
    )
    return docId || null
  } catch (err) {
    console.warn('stripeWebhook: failed to lookup customer by Stripe ID', err)
    return null
  }
}

async function resolveCustomerReference(
  stripeCustomerId?: string | null,
  email?: string | null,
): Promise<{_type: 'reference'; _ref: string} | undefined> {
  let docId = await findCustomerDocIdByStripeCustomerId(stripeCustomerId)

  if (!docId && stripeCustomerId && stripe) {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId)
      if (customer && !('deleted' in customer && customer.deleted)) {
        await syncStripeCustomer(customer as Stripe.Customer)
        docId = await findCustomerDocIdByStripeCustomerId(stripeCustomerId)
      }
    } catch (err) {
      console.warn('stripeWebhook: unable to hydrate Stripe customer record', err)
    }
  }

  if (!docId && email) {
    const normalizedEmail = email.toString().trim().toLowerCase()
    if (normalizedEmail) {
      try {
        docId = await sanity.fetch<string | null>(
          `*[_type == "customer" && defined(email) && lower(email) == $email][0]._id`,
          {email: normalizedEmail},
        )
      } catch (err) {
        console.warn('stripeWebhook: failed to lookup customer by email', err)
      }
    }
  }

  return docId ? {_type: 'reference', _ref: docId} : undefined
}

function mapStripeQuoteStatus(status?: string | null): string {
  const normalized = (status || '').toLowerCase()
  switch (normalized) {
    case 'open':
      return 'Sent'
    case 'accepted':
      return 'Approved'
    case 'canceled':
    case 'cancelled':
      return 'Cancelled'
    case 'draft':
    default:
      return 'Draft'
  }
}

function mapQuoteConversionStatus(status?: string | null): string {
  const normalized = (status || '').toLowerCase()
  switch (normalized) {
    case 'accepted':
      return 'Converted'
    case 'canceled':
    case 'cancelled':
      return 'Closed'
    default:
      return 'Open'
  }
}

function buildQuoteBillTo(quote: Stripe.Quote): Record<string, string> | undefined {
  const details = (quote as any)?.customer_details
  if (!details) return undefined
  const billTo: Record<string, string> = {}
  if (details.name) billTo.name = details.name
  if (details.email) billTo.email = details.email
  if (details.phone) billTo.phone = details.phone
  const address = details.address || null
  if (address?.line1) billTo.address_line1 = address.line1
  if (address?.line2) billTo.address_line2 = address.line2
  if (address?.city) billTo.city_locality = address.city
  if (address?.state) billTo.state_province = address.state
  if (address?.postal_code) billTo.postal_code = address.postal_code
  if (address?.country) billTo.country_code = address.country
  return Object.keys(billTo).length > 0 ? billTo : undefined
}

function buildQuoteShipTo(quote: Stripe.Quote): Record<string, string> | undefined {
  const quoteAny = quote as any
  const shipping = quoteAny?.shipping_details || quoteAny?.shipping
  if (!shipping) return undefined
  const shipTo: Record<string, string> = {}
  if (shipping.name) shipTo.name = shipping.name
  if (shipping.email) shipTo.email = shipping.email
  if (shipping.phone) shipTo.phone = shipping.phone
  const address = shipping.address || null
  if (address?.line1) shipTo.address_line1 = address.line1
  if (address?.line2) shipTo.address_line2 = address.line2
  if (address?.city) shipTo.city_locality = address.city
  if (address?.state) shipTo.state_province = address.state
  if (address?.postal_code) shipTo.postal_code = address.postal_code
  if (address?.country) shipTo.country_code = address.country
  return Object.keys(shipTo).length > 0 ? shipTo : undefined
}

async function listQuoteLineItems(quote: Stripe.Quote): Promise<Stripe.LineItem[]> {
  const expanded = ((quote as any)?.line_items?.data || []) as Stripe.LineItem[]
  if (Array.isArray(expanded) && expanded.length > 0) {
    return expanded
  }
  if (!stripe) return []
  try {
    const response = await stripe.quotes.listLineItems(quote.id, {
      limit: 100,
      expand: ['data.price.product'],
    })
    return (response?.data || []) as Stripe.LineItem[]
  } catch (err) {
    console.warn('stripeWebhook: failed to list quote line items', err)
    return []
  }
}

async function buildQuoteLineItems(quote: Stripe.Quote): Promise<any[]> {
  const metadata = (quote.metadata || {}) as Record<string, string>
  const lineItems = await listQuoteLineItems(quote)
  if (!lineItems.length) return []

  const built: any[] = []
  for (const lineItem of lineItems) {
    const mapped = mapStripeLineItem(lineItem, {sessionMetadata: metadata})
    const fallbackQuantityRaw = Number(lineItem.quantity ?? 1)
    const fallbackQuantity = Number.isFinite(fallbackQuantityRaw) ? fallbackQuantityRaw : 1
    // Prefer mapped.quantity (may reflect derived values); otherwise use Stripe line item quantity.
    const quantity = mapped.quantity ?? fallbackQuantity
    const totalAmount =
      toMajorUnits((lineItem as any)?.amount_total) ??
      (mapped.price !== undefined && quantity ? mapped.price * quantity : undefined)
    const unitPrice =
      mapped.price !== undefined
        ? mapped.price
        : totalAmount !== undefined
          ? totalAmount / quantity
          : undefined

    const priceObj =
      lineItem.price && typeof lineItem.price === 'object' ? (lineItem.price as Stripe.Price) : null
    const productObj =
      priceObj && priceObj.product && typeof priceObj.product === 'object'
        ? (priceObj.product as Stripe.Product)
        : null
    const stripeProductId =
      mapped.stripeProductId ||
      (typeof lineItem.price?.product === 'string'
        ? (lineItem.price as any).product
        : productObj?.id)

    let productDocId: string | null = null
    if (stripeProductId) {
      const productMetadata = (productObj?.metadata || {}) as Record<string, string>
      productDocId = await ensureProductDocument(stripeProductId, productMetadata)
    } else if (mapped.productSlug) {
      try {
        productDocId = await sanity.fetch<string | null>(
          `*[_type == "product" && slug.current == $slug][0]._id`,
          {slug: mapped.productSlug},
        )
      } catch (err) {
        console.warn('stripeWebhook: failed to resolve product by slug for quote line item', err)
      }
    }

    const item: Record<string, any> = {
      _type: 'quoteLineItem',
      _key: randomUUID(),
      kind: productDocId ? 'product' : 'custom',
      quantity,
    }

    if (productDocId) {
      item.product = {_type: 'reference', _ref: productDocId}
    }

    const name = mapped.name || mapped.productName || lineItem.description || 'Line item'
    if (name) {
      item.customName = name
      item.description = lineItem.description || mapped.description || name
    }
    if (mapped.sku) item.sku = mapped.sku
    if (unitPrice !== undefined && Number.isFinite(unitPrice))
      item.unitPrice = Number(unitPrice.toFixed(2))
    if (totalAmount !== undefined && Number.isFinite(totalAmount))
      item.lineTotal = Number(totalAmount.toFixed(2))

    built.push(item)
  }

  return built
}

async function appendQuoteTimelineEvent(
  quoteId: string | null | undefined,
  action: string,
  occurredAt?: number | string | null,
): Promise<void> {
  if (!quoteId || !action) return
  try {
    await sanity
      .patch(quoteId)
      .setIfMissing({timeline: []})
      .append('timeline', [
        {
          _type: 'quoteTimelineEvent',
          _key: randomUUID(),
          action,
          timestamp: toIsoTimestamp(occurredAt),
        },
      ])
      .commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to append quote timeline event', err)
  }
}

async function findQuoteDocumentId(opts: {
  stripeQuoteId?: string | null
  metadata?: Record<string, string>
  quoteNumber?: string | null
}): Promise<string | null> {
  const meta = opts.metadata || {}
  const idCandidates = QUOTE_METADATA_ID_KEYS.map((key) => normalizeSanityId(meta[key])).filter(
    Boolean,
  ) as string[]

  if (idCandidates.length > 0) {
    try {
      const docId = await sanity.fetch<string | null>(`*[_type == "quote" && _id in $ids][0]._id`, {
        ids: idCandidates.flatMap((id) => idVariants(id)),
      })
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve quote by metadata id', err)
    }
  }

  if (opts.stripeQuoteId) {
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "quote" && stripeQuoteId == $id][0]._id`,
        {id: opts.stripeQuoteId},
      )
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve quote by Stripe ID', err)
    }
  }

  const numberCandidates = [
    sanitizeQuoteNumber(opts.quoteNumber),
    ...QUOTE_METADATA_NUMBER_KEYS.map((key) => sanitizeQuoteNumber(meta[key])),
  ].filter(Boolean) as string[]

  if (numberCandidates.length > 0) {
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "quote" && quoteNumber in $numbers][0]._id`,
        {numbers: numberCandidates},
      )
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve quote by number', err)
    }
  }

  return null
}

async function syncStripeQuote(
  quote: Stripe.Quote,
  opts: {eventType?: string; eventCreated?: number} = {},
): Promise<string | null> {
  const metadata = (quote.metadata || {}) as Record<string, string>
  const candidateQuoteNumber =
    sanitizeQuoteNumber(quote.number) ||
    QUOTE_METADATA_NUMBER_KEYS.map((key) => sanitizeQuoteNumber(metadata[key])).find(Boolean)

  let quoteId = await findQuoteDocumentId({
    stripeQuoteId: quote.id,
    metadata,
    quoteNumber: candidateQuoteNumber || null,
  })

  const billTo = buildQuoteBillTo(quote)
  const shipTo = buildQuoteShipTo(quote)
  const lineItems = await buildQuoteLineItems(quote)
  const subtotal = toMajorUnits((quote as any)?.amount_subtotal)
  const total = toMajorUnits((quote as any)?.amount_total)
  const taxAmount = toMajorUnits((quote as any)?.total_details?.amount_tax)
  const discountAmount = toMajorUnits((quote as any)?.total_details?.amount_discount)
  const discountType = discountAmount ? 'amount' : 'none'
  const stripeCustomerId =
    typeof quote.customer === 'string'
      ? quote.customer
      : (quote.customer as Stripe.Customer | undefined)?.id
  const customerEmail = ((quote as any)?.customer_details?.email || '') as string
  const quoteDate = isoDateFromUnix(quote.created)
  const expirationDate = isoDateFromUnix(quote.expires_at)
  const acceptedDate = isoDateFromUnix((quote as any)?.status_transitions?.accepted_at)
  const stripeQuotePdf = ((quote as any)?.pdf as string | undefined) || undefined
  const now = new Date().toISOString()

  if (!quoteId) {
    const quoteNumber = candidateQuoteNumber || (await generateRandomQuoteNumber())
    const payload: Record<string, any> = {
      _type: 'quote',
      quoteNumber,
      title: metadata.title || 'Stripe Quote',
      quoteDate: quoteDate || isoDateOnly(now),
      status: mapStripeQuoteStatus(quote.status),
      conversionStatus: mapQuoteConversionStatus(quote.status),
      createdAt: now,
      stripeQuoteId: quote.id,
      stripeQuoteStatus: quote.status || undefined,
      stripeQuoteNumber: quote.number || undefined,
      stripeCustomerId: stripeCustomerId || undefined,
      stripeLastSyncedAt: now,
    }
    if (billTo) payload.billTo = billTo
    if (shipTo) payload.shipTo = shipTo
    if (lineItems.length > 0) payload.lineItems = lineItems
    if (subtotal !== undefined) payload.subtotal = subtotal
    if (taxAmount !== undefined) payload.taxAmount = taxAmount
    if (total !== undefined) payload.total = total
    if (discountAmount !== undefined) {
      payload.discountType = discountType
      payload.discountValue = discountAmount
    }
    if (expirationDate) payload.expirationDate = expirationDate
    if (acceptedDate) payload.acceptedDate = acceptedDate
    if (stripeQuotePdf) payload.stripeQuotePdf = stripeQuotePdf

    const customerRef = await resolveCustomerReference(stripeCustomerId, customerEmail)
    if (customerRef) payload.customer = customerRef

    try {
      const created = await sanity.create(payload as any, {autoGenerateArrayKeys: true})
      quoteId = created?._id || null
    } catch (err) {
      console.warn('stripeWebhook: failed to create quote document', err)
      return null
    }
  }

  if (!quoteId) return null

  const setOps: Record<string, any> = {
    status: mapStripeQuoteStatus(quote.status),
    conversionStatus: mapQuoteConversionStatus(quote.status),
    stripeQuoteId: quote.id,
    stripeQuoteStatus: quote.status || undefined,
    stripeQuoteNumber: quote.number || undefined,
    stripeCustomerId: stripeCustomerId || undefined,
    stripeLastSyncedAt: now,
  }

  const existingQuote = await sanity.fetch<{quoteNumber?: string} | null>(
    `*[_type == "quote" && _id == $id][0]{quoteNumber}`,
    {id: quoteId},
  )
  if (!existingQuote?.quoteNumber && candidateQuoteNumber) {
    setOps.quoteNumber = candidateQuoteNumber
  }

  if (quoteDate) setOps.quoteDate = quoteDate
  if (expirationDate) setOps.expirationDate = expirationDate
  if (acceptedDate) setOps.acceptedDate = acceptedDate
  if (billTo) setOps.billTo = billTo
  if (shipTo) setOps.shipTo = shipTo
  if (lineItems.length > 0) setOps.lineItems = lineItems
  if (subtotal !== undefined) setOps.subtotal = subtotal
  if (taxAmount !== undefined) setOps.taxAmount = taxAmount
  if (total !== undefined) setOps.total = total
  if (discountAmount !== undefined) {
    setOps.discountType = discountType
    setOps.discountValue = discountAmount
  } else {
    setOps.discountType = 'none'
    setOps.discountValue = undefined
  }
  if ((quote as any)?.footer) setOps.customerMessage = (quote as any).footer
  if ((quote as any)?.header) setOps.paymentInstructions = (quote as any).header
  if (stripeQuotePdf) setOps.stripeQuotePdf = stripeQuotePdf

  const paymentLinkId =
    ((quote as any)?.payment_link as string | undefined) ||
    metadata.payment_link_id ||
    metadata.paymentLinkId
  if (paymentLinkId) setOps.stripePaymentLinkId = paymentLinkId

  const customerRef = await resolveCustomerReference(stripeCustomerId, customerEmail)
  if (customerRef) setOps.customer = customerRef

  try {
    await sanity.patch(quoteId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to update quote document', err)
  }

  await appendQuoteTimelineEvent(quoteId, opts.eventType || 'stripe.quote.sync', opts.eventCreated)

  return quoteId
}

async function fetchQuoteResource(resource: Stripe.Quote | string): Promise<Stripe.Quote | null> {
  if (!resource) return null
  const quoteId = typeof resource === 'string' ? resource : resource.id
  if (!quoteId) return typeof resource === 'object' ? resource : null
  if (!stripe) return typeof resource === 'object' ? resource : null
  try {
    const fresh = await stripe.quotes.retrieve(quoteId, {
      expand: ['line_items.data.price.product', 'customer'],
    })
    return fresh as Stripe.Quote
  } catch (err) {
    console.warn('stripeWebhook: failed to retrieve quote resource', err)
    return typeof resource === 'object' ? resource : null
  }
}

async function findPaymentLinkDocumentId(opts: {
  stripePaymentLinkId?: string | null
  metadata?: Record<string, string>
}): Promise<string | null> {
  const meta = opts.metadata || {}
  const idCandidates = PAYMENT_LINK_METADATA_ID_KEYS.map((key) =>
    normalizeSanityId(meta[key]),
  ).filter(Boolean) as string[]

  if (idCandidates.length > 0) {
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "paymentLink" && _id in $ids][0]._id`,
        {ids: idCandidates.flatMap((id) => idVariants(id))},
      )
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve payment link by metadata id', err)
    }
  }

  if (opts.stripePaymentLinkId) {
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "paymentLink" && stripePaymentLinkId == $id][0]._id`,
        {id: opts.stripePaymentLinkId},
      )
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve payment link by Stripe ID', err)
    }
  }

  return null
}

async function buildPaymentLinkLineItems(paymentLink: Stripe.PaymentLink): Promise<CartItem[]> {
  if (!stripe) return []
  try {
    const response = await stripe.paymentLinks.listLineItems(paymentLink.id, {
      limit: 100,
      expand: ['data.price.product'],
    })
    const metadata = (paymentLink.metadata || {}) as Record<string, string>
    const items = (response?.data || []).map((lineItem: Stripe.LineItem) => ({
      _type: 'orderCartItem',
      _key: randomUUID(),
      ...mapStripeLineItem(lineItem, {sessionMetadata: metadata}),
    })) as CartItem[]
    return await enrichCartItemsFromSanity(items, sanity)
  } catch (err) {
    console.warn('stripeWebhook: failed to list payment link line items', err)
    return []
  }
}

async function fetchPaymentLinkResource(
  resource: Stripe.PaymentLink | string,
): Promise<Stripe.PaymentLink | null> {
  if (!resource) return null
  const paymentLinkId = typeof resource === 'string' ? resource : resource.id
  if (!paymentLinkId) return typeof resource === 'object' ? resource : null
  if (!stripe) return typeof resource === 'object' ? resource : null
  try {
    const fresh = await stripe.paymentLinks.retrieve(paymentLinkId)
    return fresh as Stripe.PaymentLink
  } catch (err) {
    console.warn('stripeWebhook: failed to retrieve payment link resource', err)
    return typeof resource === 'object' ? resource : null
  }
}

async function syncStripePaymentLink(
  paymentLink: Stripe.PaymentLink,
  opts: {eventType?: string; eventCreated?: number} = {},
): Promise<string | null> {
  const metadata = (paymentLink.metadata || {}) as Record<string, string>
  let paymentLinkId = await findPaymentLinkDocumentId({
    stripePaymentLinkId: paymentLink.id,
    metadata,
  })

  const lineItems = await buildPaymentLinkLineItems(paymentLink)
  const metadataEntries = buildMetadataEntries(metadata)
  const status = paymentLink.active ? 'active' : 'inactive'
  const title = metadata.title || paymentLink.url || paymentLink.id
  const now = new Date().toISOString()

  let quoteDocId = await findQuoteDocumentId({
    metadata,
    stripeQuoteId: metadata.stripe_quote_id || metadata.quote_id || metadata.quoteId || null,
  })
  if (!quoteDocId) {
    const quoteCandidate = PAYMENT_LINK_METADATA_QUOTE_KEYS.map((key) =>
      normalizeSanityId(metadata[key]),
    ).find(Boolean)
    if (quoteCandidate) {
      try {
        quoteDocId = await sanity.fetch<string | null>(
          `*[_type == "quote" && _id in $ids][0]._id`,
          {ids: idVariants(quoteCandidate)},
        )
      } catch (err) {
        console.warn('stripeWebhook: failed to resolve quote reference for payment link', err)
      }
    }
  }
  let orderDocId: string | null = null
  const orderIdCandidate = PAYMENT_LINK_METADATA_ORDER_KEYS.map((key) =>
    normalizeSanityId(metadata[key]),
  ).find(Boolean)
  if (orderIdCandidate) {
    try {
      orderDocId = await sanity.fetch<string | null>(`*[_type == "order" && _id in $ids][0]._id`, {
        ids: idVariants(orderIdCandidate),
      })
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve order for payment link', err)
    }
  }

  const customerEmail = (metadata.customer_email ||
    metadata.email ||
    metadata.billing_email ||
    '') as string
  const stripeCustomerId = metadata.stripe_customer_id || metadata.customer_id || undefined
  const customerRef = await resolveCustomerReference(stripeCustomerId, customerEmail)

  const baseSet: Record<string, any> = {
    title,
    stripePaymentLinkId: paymentLink.id,
    status,
    url: paymentLink.url || undefined,
    livemode: paymentLink.livemode ?? undefined,
    active: paymentLink.active,
    metadata: metadataEntries.length ? metadataEntries : undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    stripeLastSyncedAt: now,
    afterCompletion: safeJsonStringify(paymentLink.after_completion) || undefined,
  }

  if (customerRef) baseSet.customerRef = customerRef
  if (quoteDocId) baseSet.quoteRef = {_type: 'reference', _ref: quoteDocId}
  if (orderDocId) baseSet.orderRef = {_type: 'reference', _ref: orderDocId}

  if (!paymentLinkId) {
    const payload: Record<string, any> = {
      _type: 'paymentLink',
      ...baseSet,
    }
    try {
      const created = await sanity.create(payload as any, {autoGenerateArrayKeys: true})
      paymentLinkId = created?._id || null
    } catch (err) {
      console.warn('stripeWebhook: failed to create payment link document', err)
      return null
    }
  } else {
    try {
      await sanity.patch(paymentLinkId).set(baseSet).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update payment link document', err)
    }
  }

  if (paymentLinkId && quoteDocId) {
    try {
      await sanity
        .patch(quoteDocId)
        .set({
          stripePaymentLinkId: paymentLink.id,
          stripePaymentLinkUrl: paymentLink.url || undefined,
          paymentLinkRef: {_type: 'reference', _ref: paymentLinkId},
        })
        .commit({autoGenerateArrayKeys: true})
      await appendQuoteTimelineEvent(
        quoteDocId,
        opts.eventType || 'stripe.payment_link.sync',
        opts.eventCreated,
      )
    } catch (err) {
      console.warn('stripeWebhook: failed to link payment link to quote', err)
    }
  }

  return paymentLinkId
}

async function syncCustomerPaymentMethod(paymentMethod: Stripe.PaymentMethod): Promise<void> {
  const paymentMethodId = paymentMethod.id
  if (!paymentMethodId) return

  const stripeCustomerId =
    typeof paymentMethod.customer === 'string'
      ? paymentMethod.customer
      : (paymentMethod.customer as Stripe.Customer | undefined)?.id

  let targetDocIds: string[] = []
  const billingEmail = paymentMethod.billing_details?.email || null
  const now = new Date().toISOString()

  if (stripeCustomerId) {
    let docId = await findCustomerDocIdByStripeCustomerId(stripeCustomerId)
    if (!docId && stripe) {
      try {
        const customer = await stripe.customers.retrieve(stripeCustomerId)
        if (customer && !('deleted' in customer && customer.deleted)) {
          await syncStripeCustomer(customer as Stripe.Customer)
          docId = await findCustomerDocIdByStripeCustomerId(stripeCustomerId)
        }
      } catch (err) {
        console.warn('stripeWebhook: unable to reload customer for payment method', err)
      }
    }
    if (docId) targetDocIds.push(docId)
  }

  if (targetDocIds.length === 0 && billingEmail) {
    const normalizedEmail = billingEmail.toString().trim().toLowerCase()
    if (normalizedEmail) {
      try {
        const docId = await sanity.fetch<string | null>(
          `*[_type == "customer" && defined(email) && lower(email) == $email][0]._id`,
          {email: normalizedEmail},
        )
        if (docId) targetDocIds.push(docId)
      } catch (err) {
        console.warn('stripeWebhook: failed to find customer by billing email', err)
      }
    }
  }

  if (targetDocIds.length === 0) return

  const card = paymentMethod.card
  const wallet =
    card?.wallet && typeof card.wallet === 'object' ? Object.keys(card.wallet)[0] : undefined
  const createdAt = isoDateFromUnix(paymentMethod.created) || new Date().toISOString()

  for (const docId of targetDocIds) {
    let existing: {stripePaymentMethods?: any[]} | null = null
    try {
      existing = await sanity.fetch<{stripePaymentMethods?: any[]} | null>(
        `*[_type == "customer" && _id == $id][0]{stripePaymentMethods}`,
        {id: docId},
      )
    } catch (err) {
      console.warn('stripeWebhook: failed to load existing payment methods', err)
    }

    const current = Array.isArray(existing?.stripePaymentMethods)
      ? existing!.stripePaymentMethods
      : []
    const filtered = current.filter(
      (entry: any) => entry?.id !== paymentMethodId && entry?._key !== paymentMethodId,
    )
    filtered.unshift({
      _type: 'stripePaymentMethod',
      _key: paymentMethodId,
      id: paymentMethodId,
      type: paymentMethod.type || 'card',
      brand: card?.brand || 'Card on file',
      last4: card?.last4 || '',
      expMonth: card?.exp_month ?? undefined,
      expYear: card?.exp_year ?? undefined,
      funding: card?.funding || undefined,
      fingerprint: card?.fingerprint || undefined,
      wallet: wallet || undefined,
      customerId: stripeCustomerId || undefined,
      billingName: paymentMethod.billing_details?.name || undefined,
      billingEmail: billingEmail || undefined,
      billingZip: paymentMethod.billing_details?.address?.postal_code || undefined,
      createdAt,
      livemode: paymentMethod.livemode ?? undefined,
      isDefault: Boolean(
        (paymentMethod.metadata as any)?.is_default === 'true' ||
          (paymentMethod.metadata as any)?.default_payment_method === 'true',
      ),
    })

    try {
      await sanity
        .patch(docId)
        .set({
          stripePaymentMethods: filtered,
          stripeLastSyncedAt: now,
        })
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to upsert customer payment method', err)
    }
  }
}

async function removeCustomerPaymentMethod(paymentMethodId: string): Promise<void> {
  if (!paymentMethodId) return
  let customers: Array<{_id: string; stripePaymentMethods?: any[]}> = []
  try {
    customers =
      (await sanity.fetch(
        `*[_type == "customer" && stripePaymentMethods[].id == $id]{_id, stripePaymentMethods}`,
        {id: paymentMethodId},
      )) || []
  } catch (err) {
    console.warn('stripeWebhook: failed to lookup customers for payment method removal', err)
    return
  }

  for (const customer of customers) {
    const current = Array.isArray(customer.stripePaymentMethods)
      ? customer.stripePaymentMethods
      : []
    const filtered = current.filter(
      (entry: any) => entry?.id !== paymentMethodId && entry?._key !== paymentMethodId,
    )
    try {
      await sanity
        .patch(customer._id)
        .set({stripePaymentMethods: filtered})
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to remove payment method from customer', err)
    }
  }
}

function mapInvoiceStatus(stripeStatus?: string | null): string | undefined {
  switch (stripeStatus) {
    case 'draft':
    case 'open':
    case 'unpaid':
      return 'pending'
    case 'paid':
      return 'paid'
    case 'uncollectible':
    case 'void':
    case 'canceled':
      return 'cancelled'
    default:
      return undefined
  }
}

async function syncStripeInvoice(invoice: Stripe.Invoice): Promise<void> {
  const invoiceRecord = invoice as Stripe.Invoice & {
    amount_subtotal?: number
    amount_tax?: number
    customer_details?: {email?: string | null}
    payment_intent?: string | Stripe.PaymentIntent
  }

  const metadata = (invoice.metadata || {}) as Record<string, string>
  const metaId = INVOICE_METADATA_ID_KEYS.map((key) => normalizeSanityId(metadata[key])).find(
    Boolean,
  )

  let docId: string | null = null

  if (metaId) {
    docId = await sanity.fetch<string | null>(`*[_type == "invoice" && _id in $ids][0]._id`, {
      ids: idVariants(metaId),
    })
  }

  if (!docId && invoice.id) {
    docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && stripeInvoiceId == $id][0]._id`,
      {id: invoice.id},
    )
  }

  if (!docId && invoice.number) {
    docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && invoiceNumber == $num][0]._id`,
      {num: invoice.number},
    )
  }

  if (!docId) return

  const existingInvoice = await sanity.fetch<{status?: string} | null>(
    `*[_type == "invoice" && _id == $id][0]{status}`,
    {id: docId},
  )
  const existingStatus = existingInvoice?.status

  const setOps: Record<string, any> = {
    stripeInvoiceId: invoice.id,
    stripeInvoiceStatus: invoice.status || undefined,
    stripeHostedInvoiceUrl: invoice.hosted_invoice_url || undefined,
    stripeInvoicePdf: invoice.invoice_pdf || undefined,
    stripeLastSyncedAt: new Date().toISOString(),
  }

  const subtotal = toMajorUnits(invoiceRecord.amount_subtotal || undefined)
  if (typeof subtotal === 'number') setOps.amountSubtotal = subtotal
  const tax = toMajorUnits(invoiceRecord.amount_tax || undefined)
  if (typeof tax === 'number') setOps.amountTax = tax
  const total = typeof invoice.total === 'number' ? toMajorUnits(invoice.total) : undefined
  if (typeof total === 'number') setOps.total = total
  if (invoice.currency) setOps.currency = invoice.currency.toUpperCase()

  const mappedStatus = mapInvoiceStatus(invoice.status)
  if (mappedStatus) {
    const isTerminalStatus = existingStatus === 'refunded' || existingStatus === 'cancelled'
    const isStatusChange = mappedStatus !== existingStatus
    if (!isTerminalStatus || !isStatusChange) {
      setOps.status = mappedStatus
    }
  }

  const email = invoice.customer_email || invoiceRecord.customer_details?.email || undefined
  if (email) setOps.customerEmail = email

  if (invoiceRecord.payment_intent) {
    setOps.paymentIntentId =
      typeof invoiceRecord.payment_intent === 'string'
        ? invoiceRecord.payment_intent
        : invoiceRecord.payment_intent.id
  }

  if (invoice.hosted_invoice_url) setOps.receiptUrl = invoice.hosted_invoice_url

  if (typeof invoice.due_date === 'number' && Number.isFinite(invoice.due_date)) {
    setOps.dueDate = new Date(invoice.due_date * 1000).toISOString().slice(0, 10)
  }

  if (typeof invoice.created === 'number' && Number.isFinite(invoice.created)) {
    setOps.invoiceDate = new Date(invoice.created * 1000).toISOString().slice(0, 10)
  }

  try {
    await sanity.patch(docId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to sync invoice doc', err)
  }
}

async function syncStripeInvoiceById(
  invoice: string | Stripe.Invoice | null | undefined,
): Promise<void> {
  if (!invoice || !stripe) return
  const invoiceId =
    typeof invoice === 'string' ? invoice : typeof invoice?.id === 'string' ? invoice.id : undefined
  if (!invoiceId) return
  try {
    const freshInvoice = await stripe.invoices.retrieve(invoiceId)
    await syncStripeInvoice(freshInvoice)
  } catch (err) {
    console.warn('stripeWebhook: failed to sync invoice by id', err)
  }
}

function splitName(fullName?: string | null): {firstName?: string; lastName?: string} {
  if (!fullName) return {}
  const name = fullName.toString().trim()
  if (!name) return {}
  const parts = name.split(/\s+/)
  if (parts.length === 1) return {firstName: parts[0]}
  return {firstName: parts[0], lastName: parts.slice(1).join(' ')}
}

function formatShippingAddress(shipping?: Stripe.Customer.Shipping | null): string | undefined {
  if (!shipping?.address) return undefined
  const lines: string[] = []
  if (shipping.name) lines.push(shipping.name)
  if (shipping.address.line1) lines.push(shipping.address.line1)
  if (shipping.address.line2) lines.push(shipping.address.line2)
  const cityLine = [shipping.address.city, shipping.address.state, shipping.address.postal_code]
    .filter(Boolean)
    .join(', ')
  if (cityLine) lines.push(cityLine)
  if (shipping.address.country) lines.push(shipping.address.country)
  return lines.filter(Boolean).join('\n') || undefined
}

function buildShippingAddress(shipping?: Stripe.Customer.Shipping | null) {
  if (!shipping?.address) return undefined
  const address = shipping.address
  const hasContent =
    address.line1 ||
    address.line2 ||
    address.city ||
    address.state ||
    address.postal_code ||
    address.country
  if (!hasContent) return undefined
  const street =
    [address.line1, address.line2].filter(Boolean).join(', ') || address.line1 || undefined
  return {
    _type: 'customerBillingAddress',
    name: shipping.name || undefined,
    street,
    city: address.city || undefined,
    state: address.state || undefined,
    postalCode: address.postal_code || undefined,
    country: address.country || undefined,
  }
}

function buildBillingAddress(address?: Stripe.Address | null, name?: string | null) {
  if (!address) return undefined
  const hasContent =
    address.line1 ||
    address.line2 ||
    address.city ||
    address.state ||
    address.postal_code ||
    address.country
  if (!hasContent) return undefined
  const street =
    [address.line1, address.line2].filter(Boolean).join(', ') || address.line1 || undefined
  return {
    _type: 'customerBillingAddress',
    name: name || undefined,
    street,
    city: address.city || undefined,
    state: address.state || undefined,
    postalCode: address.postal_code || undefined,
    country: address.country || undefined,
  }
}

async function syncStripeCustomer(customer: Stripe.Customer): Promise<void> {
  const emailRaw = (
    customer.email ||
    (customer.metadata as Record<string, string> | undefined)?.email ||
    ''
  )
    .toString()
    .trim()
  if (!emailRaw) return
  const email = emailRaw.toLowerCase()

  const existing = await sanity.fetch<{
    _id: string
    firstName?: string
    lastName?: string
    roles?: string[]
  }>(
    `*[_type == "customer" && defined(email) && lower(email) == $email][0]{_id, firstName, lastName, roles}`,
    {email},
  )

  const {firstName, lastName} = splitName(customer.name || customer.shipping?.name)
  const shippingText = formatShippingAddress(customer.shipping)
  const shippingAddress = buildShippingAddress(customer.shipping)
  const billingAddress = buildBillingAddress(
    customer.address,
    customer.name || customer.shipping?.name,
  )

  const setOps: Record<string, any> = {
    stripeCustomerId: customer.id,
    stripeLastSyncedAt: new Date().toISOString(),
  }

  if (shippingText) setOps.address = shippingText
  if (shippingAddress) setOps.shippingAddress = shippingAddress
  if (billingAddress) setOps.billingAddress = billingAddress
  if (customer.phone) setOps.phone = customer.phone
  if (firstName && !existing?.firstName) setOps.firstName = firstName
  if (lastName && !existing?.lastName) setOps.lastName = lastName

  if (existing?._id) {
    if (!Array.isArray(existing.roles) || existing.roles.length === 0) setOps.roles = ['customer']
    try {
      await sanity.patch(existing._id).set(setOps).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update customer doc', err)
    }
  } else {
    const payload: Record<string, any> = {
      _type: 'customer',
      email,
      roles: ['customer'],
      stripeCustomerId: customer.id,
      stripeLastSyncedAt: new Date().toISOString(),
    }
    if (firstName) payload.firstName = firstName
    if (lastName) payload.lastName = lastName
    if (customer.phone) payload.phone = customer.phone
    if (shippingText) payload.address = shippingText
    if (shippingAddress) payload.shippingAddress = shippingAddress
    if (billingAddress) payload.billingAddress = billingAddress

    try {
      await sanity.create(payload as any, {autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to create customer doc from Stripe customer', err)
    }
  }
}

type PaymentFailureDiagnostics = {
  code?: string
  message?: string
}

async function resolvePaymentFailureDiagnostics(
  pi: Stripe.PaymentIntent,
): Promise<PaymentFailureDiagnostics> {
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
      const latestChargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : null
      if (latestChargeId) {
        charge = await stripe.charges.retrieve(latestChargeId)
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
      console.warn('stripeWebhook: failed to load charge for payment failure details', err)
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

async function markPaymentIntentFailure(pi: Stripe.PaymentIntent): Promise<void> {
  const order = await sanity.fetch<{
    _id: string
    invoiceRef?: {_ref?: string}
  } | null>(
    `*[_type == "order" && (paymentIntentId == $pid || stripeSessionId == $pid)][0]{ _id, invoiceRef }`,
    {pid: pi.id},
  )

  const {code: failureCode, message: failureMessage} = await resolvePaymentFailureDiagnostics(pi)
  const rawPaymentStatus = (pi.status || '').trim().toLowerCase()
  const paymentStatus =
    rawPaymentStatus && !['succeeded', 'processing', 'requires_capture'].includes(rawPaymentStatus)
      ? 'failed'
      : rawPaymentStatus || 'failed'
  const derivedOrderStatus: 'paid' | 'cancelled' =
    rawPaymentStatus === 'succeeded' ? 'paid' : 'cancelled'
  const timestamp = new Date().toISOString()
  const summary = buildStripeSummary({
    paymentIntent: pi,
    failureCode,
    failureMessage,
    eventType: 'payment_intent.payment_failed',
    eventCreated: pi.created,
  })

  if (order?._id) {
    const setOps: Record<string, any> = {
      paymentStatus,
      status: derivedOrderStatus,
      stripeLastSyncedAt: timestamp,
      paymentFailureCode: failureCode,
      paymentFailureMessage: failureMessage,
      stripeSummary: summary,
    }
    try {
      await sanity.patch(order._id).set(setOps).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to mark payment failure on order', err)
    }
  }

  const invoiceCandidateIds = new Set<string>()
  const meta = (pi.metadata || {}) as Record<string, string>

  const invoiceMetaId = normalizeSanityId(meta['sanity_invoice_id'] || meta['invoice_id'])
  if (invoiceMetaId) {
    idVariants(invoiceMetaId).forEach((id) => invoiceCandidateIds.add(id))
  }

  if (order?.invoiceRef?._ref) {
    idVariants(order.invoiceRef._ref).forEach((id) => invoiceCandidateIds.add(id))
  }

  let invoiceId: string | null = null
  if (invoiceCandidateIds.size > 0) {
    invoiceId = await sanity.fetch<string | null>(`*[_type == "invoice" && _id in $ids][0]._id`, {
      ids: Array.from(invoiceCandidateIds),
    })
  }

  if (!invoiceId) {
    invoiceId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && paymentIntentId == $pid][0]._id`,
      {pid: pi.id},
    )
  }

  if (invoiceId) {
    try {
      await sanity
        .patch(invoiceId)
        .set({
          status: 'cancelled',
          stripeInvoiceStatus: 'payment_intent.payment_failed',
          stripeLastSyncedAt: timestamp,
          paymentFailureCode: failureCode,
          paymentFailureMessage: failureMessage,
          stripeSummary: summary,
        })
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update invoice after payment failure', err)
    }
  }
}

async function fetchChargeResource(
  resource: string | Stripe.Charge | null | undefined,
  opts: {expandPaymentIntent?: boolean} = {},
): Promise<Stripe.Charge | null> {
  if (!resource) return null
  if (typeof resource !== 'string') return resource
  if (!stripe) return null
  try {
    return await stripe.charges.retrieve(resource, {
      expand: opts.expandPaymentIntent ? ['payment_intent'] : undefined,
    })
  } catch (err) {
    console.warn('stripeWebhook: unable to load charge for diagnostics', err)
    return null
  }
}

async function fetchPaymentIntentResource(
  resource: string | Stripe.PaymentIntent | null | undefined,
  opts: {expandCharges?: boolean} = {},
): Promise<Stripe.PaymentIntent | null> {
  if (!resource) return null
  if (typeof resource !== 'string') return resource
  if (!stripe) return null
  try {
    const expandCharges = opts.expandCharges !== false
    const expand = expandCharges
      ? (['charges.data.payment_method_details', 'latest_charge'] as string[])
      : undefined
    return await stripe.paymentIntents.retrieve(resource, expand ? {expand} : undefined)
  } catch (err) {
    console.warn('stripeWebhook: unable to load payment intent for diagnostics', err)
    return null
  }
}

type OrderPaymentStatusInput = {
  paymentStatus?: string
  orderStatus?: 'paid' | 'fulfilled' | 'shipped' | 'cancelled' | 'refunded' | 'closed' | 'expired'
  invoiceStatus?: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'cancelled'
  invoiceStripeStatus?: string
  paymentIntentId?: string
  chargeId?: string
  stripeSessionId?: string
  additionalOrderFields?: Record<string, any>
  additionalInvoiceFields?: Record<string, any>
  preserveExistingFailureDiagnostics?: boolean
  preserveExistingRefundedStatus?: boolean
  event?: EventRecordInput
}

const formatMajorAmount = (amount?: number, currency?: string): string | undefined => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined
  const formatted = amount.toFixed(2)
  const code = (currency || '').toString().trim().toUpperCase()
  return code ? `${formatted} ${code}` : formatted
}

type HandleChargeEventInput = {
  charge: Stripe.Charge | null
  paymentIntent?: Stripe.PaymentIntent | null
  paymentIntentId?: string
  event: Stripe.Event
  paymentStatus: string
  orderStatus?: OrderPaymentStatusInput['orderStatus']
  invoiceStatus?: OrderPaymentStatusInput['invoiceStatus']
  label: string
  messageParts?: Array<string | null | undefined>
  amountOverride?: number
  currencyOverride?: string
  metadataOverride?: Record<string, unknown> | null
  additionalOrderFields?: Record<string, any>
  additionalInvoiceFields?: Record<string, any>
  preserveExistingFailureDiagnostics?: boolean
  eventStatus?: string
  includeChargeContext?: boolean
}

const handleChargeEvent = async (input: HandleChargeEventInput) => {
  const {
    charge,
    paymentIntent,
    paymentIntentId,
    event,
    paymentStatus,
    orderStatus,
    invoiceStatus,
    label,
    messageParts = [],
    amountOverride,
    currencyOverride,
    metadataOverride,
    additionalOrderFields,
    additionalInvoiceFields,
    preserveExistingFailureDiagnostics,
    eventStatus,
    includeChargeContext = true,
  } = input

  const resolvedPaymentIntent =
    paymentIntent ||
    (charge?.payment_intent ? await fetchPaymentIntentResource(charge.payment_intent) : null)
  const resolvedPaymentIntentId =
    paymentIntentId ||
    (resolvedPaymentIntent?.id
      ? resolvedPaymentIntent.id
      : typeof charge?.payment_intent === 'string'
        ? charge.payment_intent
        : undefined)

  const amount =
    amountOverride !== undefined
      ? amountOverride
      : charge?.amount_captured && charge.captured
        ? toMajorUnits(charge.amount_captured)
        : toMajorUnits(charge?.amount || undefined)
  const currency =
    currencyOverride !== undefined
      ? currencyOverride
      : (charge?.currency || '').toString().trim().toUpperCase() || undefined

  const orderFields: Record<string, any> = {
    chargeId: charge?.id || undefined,
    cardBrand: charge?.payment_method_details?.card?.brand || undefined,
    cardLast4: charge?.payment_method_details?.card?.last4 || undefined,
    receiptUrl: charge?.receipt_url || undefined,
    stripeSummary: buildStripeSummary({
      paymentIntent: resolvedPaymentIntent || undefined,
      charge: charge || undefined,
      eventType: event.type,
      eventCreated: event.created,
    }),
  }
  if (additionalOrderFields && typeof additionalOrderFields === 'object') {
    Object.assign(orderFields, additionalOrderFields)
  }

  const invoiceFields: Record<string, any> = {}
  if (additionalInvoiceFields && typeof additionalInvoiceFields === 'object') {
    Object.assign(invoiceFields, additionalInvoiceFields)
  }

  const parts = messageParts.filter((part): part is string => Boolean(part && String(part).trim()))
  if (includeChargeContext) {
    if (charge?.id) parts.push(`Charge ${charge.id}`)
    if (typeof amount === 'number') {
      const amountLabel = formatMajorAmount(amount, currency)
      if (amountLabel) parts.push(amountLabel)
    }
    if (charge?.status) parts.push(`Status ${charge.status}`)
  } else if (parts.length === 0 && charge?.id) {
    parts.push(`Charge ${charge.id}`)
  }

  const metadata = metadataOverride || (charge?.metadata as Record<string, unknown> | null) || null

  await updateOrderPaymentStatus({
    paymentStatus,
    orderStatus,
    invoiceStatus,
    invoiceStripeStatus: event.type,
    paymentIntentId: resolvedPaymentIntentId,
    chargeId: charge?.id,
    additionalOrderFields: orderFields,
    additionalInvoiceFields: Object.keys(invoiceFields).length ? invoiceFields : undefined,
    preserveExistingFailureDiagnostics,
    event: {
      eventType: event.type,
      status: eventStatus || orderStatus || paymentStatus,
      label,
      message: parts.length ? parts.join(' • ') : undefined,
      amount,
      currency,
      stripeEventId: event.id,
      occurredAt: event.created,
      metadata: metadata || undefined,
    },
  })
}

type HandleDisputeEventInput = {
  dispute: Stripe.Dispute | null
  charge: Stripe.Charge | null
  paymentIntent?: Stripe.PaymentIntent | null
  event: Stripe.Event
  paymentStatus: string
  orderStatus?: OrderPaymentStatusInput['orderStatus']
  invoiceStatus?: OrderPaymentStatusInput['invoiceStatus']
  label: string
  messageParts?: Array<string | null | undefined>
  additionalOrderFields?: Record<string, any>
  additionalInvoiceFields?: Record<string, any>
  eventStatus?: string
}

const handleDisputeEvent = async (input: HandleDisputeEventInput) => {
  const {
    dispute,
    charge,
    paymentIntent,
    event,
    paymentStatus,
    orderStatus,
    invoiceStatus,
    label,
    messageParts = [],
    additionalOrderFields,
    additionalInvoiceFields,
    eventStatus,
  } = input

  const resolvedCharge =
    charge ||
    (dispute?.charge
      ? await fetchChargeResource(dispute.charge, {expandPaymentIntent: true})
      : null)
  const resolvedPaymentIntent =
    paymentIntent ||
    (resolvedCharge?.payment_intent
      ? await fetchPaymentIntentResource(resolvedCharge.payment_intent)
      : dispute?.payment_intent
        ? await fetchPaymentIntentResource(dispute.payment_intent as string | Stripe.PaymentIntent)
        : null)

  const disputeAmount = toMajorUnits(dispute?.amount || undefined)
  const disputeCurrency = (dispute?.currency || '').toString().trim().toUpperCase() || undefined

  const orderFields: Record<string, any> = {
    ...(additionalOrderFields || {}),
  }
  if (dispute?.id) orderFields.lastDisputeId = dispute.id
  if (dispute?.status) orderFields.lastDisputeStatus = dispute.status
  if (dispute?.reason) orderFields.lastDisputeReason = dispute.reason
  if (disputeAmount !== undefined) orderFields.lastDisputeAmount = disputeAmount
  if (disputeCurrency) orderFields.lastDisputeCurrency = disputeCurrency
  if (typeof dispute?.created === 'number') {
    const createdAt = unixToIso(dispute.created)
    if (createdAt) orderFields.lastDisputeCreatedAt = createdAt
  }
  const dueBy = dispute?.evidence_details?.due_by
  if (typeof dueBy === 'number') {
    const dueByIso = unixToIso(dueBy)
    if (dueByIso) orderFields.lastDisputeDueBy = dueByIso
  }

  const metadata =
    dispute?.metadata || (resolvedCharge?.metadata as Record<string, string> | null) || null

  const parts = messageParts.filter((part): part is string => Boolean(part && String(part).trim()))
  if (dispute?.status) parts.push(`Status ${dispute.status}`)
  if (dispute?.reason) parts.push(`Reason ${dispute.reason}`)
  const amountLabel = formatMajorAmount(disputeAmount, disputeCurrency)
  if (amountLabel) parts.push(`Amount ${amountLabel}`)
  if (typeof dueBy === 'number') {
    const dueByIso = unixToIso(dueBy)
    if (dueByIso) parts.push(`Evidence due ${dueByIso}`)
  }
  if (resolvedCharge?.id) parts.push(`Charge ${resolvedCharge.id}`)

  await handleChargeEvent({
    charge: resolvedCharge,
    paymentIntent: resolvedPaymentIntent || undefined,
    paymentIntentId: resolvedPaymentIntent?.id,
    event,
    paymentStatus,
    orderStatus,
    invoiceStatus,
    label,
    messageParts: parts,
    amountOverride: disputeAmount,
    currencyOverride: disputeCurrency,
    metadataOverride: metadata,
    additionalOrderFields: orderFields,
    additionalInvoiceFields,
    eventStatus,
    includeChargeContext: false,
  })
}

export async function handleRefundWebhookEvent(webhookEvent: Stripe.Event): Promise<void> {
  try {
    const raw = webhookEvent.data.object as Stripe.Charge | Stripe.Refund
    const rawObject = raw as unknown as {object?: string}
    const isRefundObject = rawObject?.object === 'refund'

    let refund: Stripe.Refund | null = isRefundObject ? (raw as Stripe.Refund) : null
    let charge: Stripe.Charge | null =
      !isRefundObject && rawObject?.object === 'charge' ? (raw as Stripe.Charge) : null

    if (!charge && refund?.charge) {
      charge = await fetchChargeResource(refund.charge, {expandPaymentIntent: true})
    }

    if (!refund && charge?.refunds?.data?.length) {
      const matchingRefund = charge.refunds.data.find(
        (entry) => entry.id === (isRefundObject ? (raw as Stripe.Refund).id : undefined),
      )
      refund = matchingRefund || charge.refunds.data[charge.refunds.data.length - 1] || null
    }

    const paymentIntent = await fetchPaymentIntentResource(
      (charge?.payment_intent as Stripe.PaymentIntent | string | null | undefined) ??
        (refund?.payment_intent as Stripe.PaymentIntent | string | null | undefined) ??
        null,
    )

    const chargeAmountCents = typeof charge?.amount === 'number' ? charge.amount : undefined
    const refundedCentsFromCharge =
      typeof charge?.amount_refunded === 'number' ? charge.amount_refunded : undefined
    const refundedCentsFromRefund = typeof refund?.amount === 'number' ? refund.amount : undefined

    const refundedAmount =
      refundedCentsFromCharge !== undefined
        ? refundedCentsFromCharge / 100
        : refundedCentsFromRefund !== undefined
          ? refundedCentsFromRefund / 100
          : undefined

    const isFullRefund =
      Boolean(charge?.refunded) ||
      (typeof chargeAmountCents === 'number' &&
        typeof refundedCentsFromCharge === 'number' &&
        chargeAmountCents > 0 &&
        refundedCentsFromCharge >= chargeAmountCents)

    const explicitRefundStatus = (refund?.status || '').toString().toLowerCase()
    const chargeIndicatesRefund =
      Boolean(charge?.refunded) ||
      (typeof refundedCentsFromCharge === 'number' && refundedCentsFromCharge > 0) ||
      (typeof refundedCentsFromRefund === 'number' && refundedCentsFromRefund > 0)
    const inferredRefundStatus = !explicitRefundStatus && chargeIndicatesRefund ? 'succeeded' : ''
    const refundStatus = explicitRefundStatus || inferredRefundStatus
    const refundSucceeded = refundStatus === 'succeeded'
    const preserveRefundedStatus = Boolean(
      explicitRefundStatus && explicitRefundStatus !== 'succeeded',
    )
    const paymentStatus = refundSucceeded
      ? isFullRefund
        ? 'refunded'
        : 'partially_refunded'
      : 'paid'
    const paymentIntentId =
      typeof paymentIntent?.id === 'string'
        ? paymentIntent.id
        : typeof charge?.payment_intent === 'string'
          ? charge.payment_intent
          : typeof refund?.payment_intent === 'string'
            ? refund.payment_intent
            : undefined

    await updateOrderPaymentStatus({
      paymentIntentId,
      chargeId: charge?.id || (typeof refund?.charge === 'string' ? refund.charge : undefined),
      paymentStatus,
      orderStatus: refundSucceeded && isFullRefund ? 'refunded' : undefined,
      invoiceStatus: refundSucceeded
        ? isFullRefund
          ? 'refunded'
          : 'partially_refunded'
        : undefined,
      invoiceStripeStatus: webhookEvent.type,
      additionalOrderFields: {
        ...(refundedAmount !== undefined ? {amountRefunded: refundedAmount} : {}),
        ...(refund?.id ? {lastRefundId: refund.id} : {}),
        ...(refundStatus ? {lastRefundStatus: refundStatus} : {}),
        ...(refund?.reason ? {lastRefundReason: refund.reason} : {}),
        ...(typeof refund?.created === 'number'
          ? {lastRefundedAt: new Date(refund.created * 1000).toISOString()}
          : {}),
        stripeSummary: buildStripeSummary({
          paymentIntent: paymentIntent || undefined,
          charge: charge || undefined,
          eventType: webhookEvent.type,
          eventCreated: webhookEvent.created,
        }),
      },
      preserveExistingRefundedStatus: preserveRefundedStatus,
      event: {
        eventType: webhookEvent.type,
        label: refund?.id ? `Refund ${refund.id}` : 'Charge refunded',
        message:
          refund?.status || refund?.amount
            ? [
                refund?.status ? `Refund ${refund.status}` : null,
                refundedAmount !== undefined
                  ? `Amount ${refundedAmount.toFixed(2)} ${(refund?.currency || charge?.currency || '').toUpperCase()}`
                  : null,
                charge?.id ? `Charge ${charge.id}` : null,
              ]
                .filter(Boolean)
                .join(' • ')
            : `Charge ${charge?.id || refund?.charge || ''} refunded`,
        amount: refundedAmount,
        currency: (refund?.currency || charge?.currency)?.toUpperCase() || undefined,
        stripeEventId: webhookEvent.id,
        occurredAt: webhookEvent.created,
        metadata: (refund?.metadata || charge?.metadata || {}) as Record<string, string>,
        status: refundStatus || paymentStatus || undefined,
      },
    })
  } catch (err) {
    console.warn('stripeWebhook: failed to handle refund webhook', err)
  }
}

async function updateOrderPaymentStatus(opts: OrderPaymentStatusInput): Promise<boolean> {
  const {
    paymentStatus,
    orderStatus,
    invoiceStatus,
    invoiceStripeStatus,
    paymentIntentId,
    chargeId,
    stripeSessionId,
    additionalInvoiceFields,
    additionalOrderFields,
    preserveExistingFailureDiagnostics,
    preserveExistingRefundedStatus,
    event,
  } = opts
  if (!paymentIntentId && !chargeId && !stripeSessionId) return false

  const params = {
    pi: paymentIntentId || '',
    charge: chargeId || '',
    session: stripeSessionId || '',
  }

  const order = await sanity.fetch<{
    _id: string
    orderNumber?: string
    invoiceRef?: {_id: string}
    customerRef?: {_ref: string}
    customerEmail?: string
    paymentFailureCode?: string
    paymentFailureMessage?: string
    paymentStatus?: string
  } | null>(
    `*[_type == "order" && (
      ($pi != '' && paymentIntentId == $pi) ||
      ($charge != '' && chargeId == $charge) ||
      ($session != '' && stripeSessionId == $session)
    )][0]{ _id, orderNumber, customerRef, customerEmail, paymentFailureCode, paymentFailureMessage, paymentStatus, invoiceRef->{ _id } }`,
    params,
  )

  if (!order?._id) return false

  const existingPaymentStatus =
    typeof order?.paymentStatus === 'string' ? order.paymentStatus.trim().toLowerCase() : undefined
  const shouldPreserveRefundedStatus = Boolean(
    preserveExistingRefundedStatus &&
      existingPaymentStatus &&
      ['refunded', 'partially_refunded'].includes(existingPaymentStatus),
  )

  const orderPatch: Record<string, any> = {
    stripeLastSyncedAt: new Date().toISOString(),
  }

  if (!shouldPreserveRefundedStatus) {
    orderPatch.paymentStatus = paymentStatus
  }
  if (orderStatus) orderPatch.status = orderStatus
  if (additionalOrderFields && typeof additionalOrderFields === 'object') {
    const existingFailureDetails =
      preserveExistingFailureDiagnostics && order
        ? {
            paymentFailureCode:
              typeof order.paymentFailureCode === 'string' ? order.paymentFailureCode.trim() : '',
            paymentFailureMessage:
              typeof order.paymentFailureMessage === 'string'
                ? order.paymentFailureMessage.trim()
                : '',
          }
        : null

    for (const [field, value] of Object.entries(additionalOrderFields)) {
      if (
        existingFailureDetails &&
        (field === 'paymentFailureCode' || field === 'paymentFailureMessage')
      ) {
        const existingValue = existingFailureDetails[field]
        if (existingValue) {
          continue
        }
      }
      orderPatch[field] = value
    }
  }

  try {
    await sanity.patch(order._id).set(orderPatch).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to update order payment status', err)
  }

  const fetchInvoiceId = async (): Promise<string | null> => {
    if (order.invoiceRef?._id) return order.invoiceRef._id
    if (paymentIntentId) {
      const byPI = await sanity.fetch<string | null>(
        `*[_type == "invoice" && paymentIntentId == $pi][0]._id`,
        {pi: paymentIntentId},
      )
      if (byPI) return byPI
    }
    if (order._id) {
      const byOrderRef = await sanity.fetch<string | null>(
        `*[_type == "invoice" && (orderRef._ref == $orderId || orderRef->_ref == $orderId)][0]._id`,
        {orderId: order._id},
      )
      if (byOrderRef) return byOrderRef
    }
    return null
  }

  const invoiceId = await fetchInvoiceId()
  if (invoiceId) {
    const invoicePatch: Record<string, any> = {
      stripeLastSyncedAt: new Date().toISOString(),
    }
    if (invoiceStatus) invoicePatch.status = invoiceStatus
    if (invoiceStripeStatus) invoicePatch.stripeInvoiceStatus = invoiceStripeStatus
    if (additionalInvoiceFields && typeof additionalInvoiceFields === 'object') {
      Object.assign(invoicePatch, additionalInvoiceFields)
    }
    try {
      await sanity.patch(invoiceId).set(invoicePatch).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update invoice after payment status change', err)
    }
  }

  try {
    await updateCustomerProfileForOrder({
      sanity,
      orderId: order?._id,
      customerId: order?.customerRef?._ref,
      email: order?.customerEmail,
    })
  } catch (err) {
    console.warn(
      'stripeWebhook: failed to refresh customer profile after payment status update',
      err,
    )
  }

  if (event) {
    const eventPayload: EventRecordInput = {
      ...event,
      status: event.status || orderStatus || paymentStatus,
    }
    await appendOrderEvent(order?._id, eventPayload)
  }

  return true
}

type CheckoutAsyncContext = {
  eventType?: string
  invoiceStripeStatus?: string
  stripeEventId?: string
  eventCreated?: number | null
  metadata?: Record<string, string>
  paymentIntent?: Stripe.PaymentIntent | null
  label?: string
  message?: string
}

const getCheckoutAsyncDefaults = (
  session: Stripe.Checkout.Session,
  context: CheckoutAsyncContext,
) => {
  const metadata =
    (context.metadata && typeof context.metadata === 'object'
      ? context.metadata
      : ((session.metadata || {}) as Record<string, string>)) || {}
  const baseEventType = context.eventType || context.invoiceStripeStatus || ''
  const eventType = baseEventType || 'checkout.session.async_payment_succeeded'
  const invoiceStripeStatus =
    context.invoiceStripeStatus || 'checkout.session.async_payment_succeeded'
  const amount =
    typeof session.amount_total === 'number' && Number.isFinite(session.amount_total)
      ? session.amount_total / 100
      : undefined
  const currency =
    (session.currency || context.paymentIntent?.currency || '').toString().toUpperCase() ||
    undefined
  return {metadata, eventType, invoiceStripeStatus, amount, currency}
}

async function handleCheckoutAsyncPaymentSucceeded(
  session: Stripe.Checkout.Session,
  context: CheckoutAsyncContext = {},
): Promise<void> {
  const paymentIntent =
    context.paymentIntent ?? (await fetchPaymentIntentResource(session.payment_intent))
  const {metadata, eventType, invoiceStripeStatus, amount, currency} = getCheckoutAsyncDefaults(
    session,
    {
      ...context,
      invoiceStripeStatus:
        context.invoiceStripeStatus || 'checkout.session.async_payment_succeeded',
    },
  )

  const paymentIntentId =
    (typeof session.payment_intent === 'string' ? session.payment_intent : paymentIntent?.id) ||
    undefined

  const summary = buildStripeSummary({
    session,
    paymentIntent: paymentIntent || undefined,
    eventType: invoiceStripeStatus,
    eventCreated: context.eventCreated ?? null,
  })

  const additionalOrderFields: Record<string, any> = {
    stripeSummary: summary,
    stripeCheckoutStatus: session.status || undefined,
    stripeSessionStatus: session.status || undefined,
    stripeCheckoutMode: session.mode || undefined,
    stripePaymentIntentStatus: paymentIntent?.status || session.payment_status || undefined,
    checkoutDraft: false,
    paymentFailureCode: null,
    paymentFailureMessage: null,
  }

  const additionalInvoiceFields: Record<string, any> = {
    stripeSummary: summary,
    paymentFailureCode: null,
    paymentFailureMessage: null,
  }

  await updateOrderPaymentStatus({
    paymentStatus: 'paid',
    orderStatus: 'paid',
    invoiceStatus: 'paid',
    invoiceStripeStatus,
    paymentIntentId,
    stripeSessionId: session.id,
    additionalOrderFields,
    additionalInvoiceFields,
    event: {
      eventType,
      label: context.label || 'Async payment succeeded',
      message: context.message || `Checkout session ${session.id} async payment succeeded`,
      amount,
      currency:
        currency || (paymentIntent?.currency ? paymentIntent.currency.toUpperCase() : undefined),
      stripeEventId: context.stripeEventId,
      occurredAt: context.eventCreated ?? null,
      metadata,
    },
  })
}

export async function handleCheckoutAsyncPaymentFailed(
  session: Stripe.Checkout.Session,
  context: CheckoutAsyncContext = {},
): Promise<void> {
  const paymentIntent =
    context.paymentIntent ?? (await fetchPaymentIntentResource(session.payment_intent))
  const {metadata, eventType, invoiceStripeStatus, amount, currency} = getCheckoutAsyncDefaults(
    session,
    {
      ...context,
      invoiceStripeStatus: context.invoiceStripeStatus || 'checkout.session.async_payment_failed',
    },
  )

  let failureCode: string | undefined
  let failureMessage: string | undefined
  const paymentIntentStatus = (paymentIntent?.status || '').toString().toLowerCase()
  const sessionPaymentStatus = (session.payment_status || '').toString().toLowerCase()

  if (paymentIntent) {
    const diagnostics = await resolvePaymentFailureDiagnostics(paymentIntent)
    failureCode = diagnostics.code
    failureMessage = diagnostics.message
  }

  let paymentStatus = (() => {
    const raw = paymentIntentStatus || sessionPaymentStatus
    if (['succeeded', 'paid', 'complete', 'requires_capture'].includes(raw)) return 'paid'
    if (['canceled', 'cancelled'].includes(raw)) return 'cancelled'
    if (raw) return raw
    return 'failed'
  })()

  let orderStatus: 'paid' | 'cancelled' = paymentStatus === 'paid' ? 'paid' : 'cancelled'

  let invoiceStatus: 'paid' | 'cancelled' = paymentStatus === 'paid' ? 'paid' : 'cancelled'

  if (paymentStatus === 'paid' && failureCode) {
    // Even if intent eventually succeeded, preserve diagnostics for visibility.
    orderStatus = 'paid'
    invoiceStatus = 'paid'
  }

  const summary = buildStripeSummary({
    session,
    paymentIntent: paymentIntent || undefined,
    failureCode,
    failureMessage,
    eventType: invoiceStripeStatus,
    eventCreated: context.eventCreated ?? null,
  })

  const additionalOrderFields: Record<string, any> = {
    stripeSummary: summary,
    stripeCheckoutStatus: session.status || undefined,
    stripeSessionStatus: session.status || undefined,
    stripeCheckoutMode: session.mode || undefined,
    stripePaymentIntentStatus: paymentIntent?.status || session.payment_status || undefined,
    checkoutDraft: orderStatus === 'paid' ? false : true,
  }
  if (failureCode) additionalOrderFields.paymentFailureCode = failureCode
  if (failureMessage) additionalOrderFields.paymentFailureMessage = failureMessage

  const additionalInvoiceFields: Record<string, any> = {
    stripeSummary: summary,
  }
  if (failureCode) additionalInvoiceFields.paymentFailureCode = failureCode
  if (failureMessage) additionalInvoiceFields.paymentFailureMessage = failureMessage

  const paymentIntentId =
    (typeof session.payment_intent === 'string' ? session.payment_intent : paymentIntent?.id) ||
    undefined

  await updateOrderPaymentStatus({
    paymentStatus,
    orderStatus,
    invoiceStatus,
    invoiceStripeStatus,
    paymentIntentId,
    stripeSessionId: session.id,
    additionalOrderFields,
    additionalInvoiceFields,
    preserveExistingFailureDiagnostics: !(failureCode || failureMessage),
    event: {
      eventType,
      label: context.label || 'Async payment failed',
      message: context.message || `Checkout session ${session.id} async payment failed`,
      amount,
      currency:
        currency || (paymentIntent?.currency ? paymentIntent.currency.toUpperCase() : undefined),
      stripeEventId: context.stripeEventId,
      occurredAt: context.eventCreated ?? null,
      metadata,
    },
  })
}

async function handleCheckoutExpired(
  session: Stripe.Checkout.Session,
  context: {stripeEventId?: string; eventCreated?: number | null} = {},
): Promise<void> {
  const timestamp = new Date().toISOString()
  const failureCode = 'checkout.session.expired'
  const metadata = (session.metadata || {}) as Record<string, string>
  const {items: cart, products: cartProducts} = await buildCartFromSessionLineItems(
    session.id,
    metadata,
  )
  const shippingMetrics = computeShippingMetrics(cart, cartProducts)
  const email = (session.customer_details?.email || session.customer_email || '').toString().trim()
  const expiresAt =
    typeof session.expires_at === 'number'
      ? new Date(session.expires_at * 1000).toISOString()
      : null
  const createdAt =
    typeof session.created === 'number' ? new Date(session.created * 1000).toISOString() : timestamp
  let failureMessage = 'Checkout session expired before payment was completed.'
  if (email) failureMessage = `${failureMessage} Customer: ${email}.`
  if (expiresAt) failureMessage = `${failureMessage} Expired at ${expiresAt}.`
  failureMessage = `${failureMessage} (session ${session.id})`
  const amountTotal = toMajorUnits(session.amount_total ?? undefined)
  const amountSubtotal = Number.isFinite(Number((session as any)?.amount_subtotal))
    ? Number((session as any)?.amount_subtotal) / 100
    : undefined
  const amountTax = Number.isFinite(Number((session as any)?.total_details?.amount_tax))
    ? Number((session as any)?.total_details?.amount_tax) / 100
    : undefined
  let amountShipping = (() => {
    const a = Number((session as any)?.shipping_cost?.amount_total)
    if (Number.isFinite(a)) return a / 100
    const b = Number((session as any)?.total_details?.amount_shipping)
    return Number.isFinite(b) ? b / 100 : undefined
  })()
  const currencyLower = (session.currency || '').toString().toLowerCase() || undefined
  const currencyUpper = currencyLower ? currencyLower.toUpperCase() : undefined
  const summary = buildStripeSummary({
    session,
    failureCode,
    failureMessage,
    eventType: 'checkout.session.expired',
    eventCreated: session.created || null,
  })

  const shippingDetails = await resolveStripeShippingDetails({
    metadata,
    session,
    fallbackAmount: amountShipping,
    stripe,
  })
  if (shippingDetails.amount !== undefined) {
    amountShipping = shippingDetails.amount
  }
  const shippingCurrencyForDoc = shippingDetails.currency || currencyUpper

  let shippingAddress: Record<string, any> | undefined
  try {
    const details = session.customer_details
    const address = (details?.address || (session as any)?.shipping_details?.address) as
      | Stripe.Address
      | undefined
    const name = details?.name || (session as any)?.shipping_details?.name || undefined
    const phone = details?.phone || (session as any)?.shipping_details?.phone || undefined
    shippingAddress = address
      ? {
          name: name || undefined,
          phone: phone || undefined,
          email: email || undefined,
          addressLine1: address.line1 || undefined,
          addressLine2: address.line2 || undefined,
          city: address.city || undefined,
          state: address.state || undefined,
          postalCode: address.postal_code || undefined,
          country: address.country || undefined,
        }
      : undefined
  } catch (err) {
    console.warn('stripeWebhook: could not parse shipping address for expired checkout', err)
  }

  const customerName =
    (
      shippingAddress?.name ||
      metadata['customer_name'] ||
      metadata['bill_to_name'] ||
      session.customer_details?.name ||
      email ||
      ''
    )
      .toString()
      .trim() || undefined

  const existingOrderId = await sanity.fetch<string | null>(
    `*[_type == "order" && stripeSessionId == $sid][0]._id`,
    {sid: session.id},
  )
  let orderId = existingOrderId
  if (!orderId) {
    try {
      const metadataOrderNumber = extractMetadataOrderNumber(metadata) || ''
      const metadataInvoiceNumber =
        firstString(
          INVOICE_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
        ) || ''
      const orderNumber = await resolveOrderNumber({
        metadataOrderNumber,
        invoiceNumber: metadataInvoiceNumber,
        fallbackId: session.id,
      })
      const normalizedOrderNumber = normalizeOrderNumberForStorage(orderNumber) || orderNumber
      const orderSlug = createOrderSlug(normalizedOrderNumber, session.id)
      const baseDoc: Record<string, any> = pruneUndefined({
        _type: 'order',
        stripeSource: 'checkout.session',
        stripeSessionId: session.id,
        orderNumber: normalizedOrderNumber,
        slug: orderSlug ? {_type: 'slug', current: orderSlug} : undefined,
        customerName,
        customerEmail: email || undefined,
        totalAmount: amountTotal,
        amountSubtotal,
        amountTax,
        amountShipping,
        currency: currencyLower,
        status: 'expired',
        paymentStatus: 'expired',
        checkoutDraft: true,
        createdAt,
        stripeCreatedAt: createdAt,
        stripeExpiresAt: expiresAt || undefined,
        stripeCheckoutStatus: session.status || undefined,
        stripeSessionStatus: session.status || undefined,
        stripeCheckoutMode: session.mode || undefined,
        stripePaymentIntentStatus: session.payment_status || undefined,
        stripeLastSyncedAt: timestamp,
        stripeSummary: summary,
        paymentFailureCode: failureCode,
        paymentFailureMessage: failureMessage,
        cart: cart.length ? cart : undefined,
        shippingAddress,
        weight: shippingMetrics.weight,
        dimensions: shippingMetrics.dimensions,
        webhookNotified: true,
      })

      const selectedService = pruneUndefined({
        carrierId: shippingDetails.carrierId,
        carrier: shippingDetails.carrier,
        service: shippingDetails.serviceName || shippingDetails.serviceCode,
        serviceCode: shippingDetails.serviceCode || shippingDetails.serviceName,
        amount: amountShipping,
        currency: shippingCurrencyForDoc,
        deliveryDays: shippingDetails.deliveryDays,
        estimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
      })
      if (Object.keys(selectedService).length > 0) {
        baseDoc.selectedService = selectedService
      }
      if (amountShipping !== undefined) {
        baseDoc.selectedShippingAmount = amountShipping
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
      if (shippingDetails.carrier) {
        baseDoc.shippingCarrier = shippingDetails.carrier
      }
      if (shippingDetails.metadata && Object.keys(shippingDetails.metadata).length) {
        baseDoc.shippingMetadata = shippingDetails.metadata
      }

      if (email) {
        try {
          const customerId = await sanity.fetch(
            `*[_type == "customer" && email == $email][0]._id`,
            {email},
          )
          if (customerId) baseDoc.customerRef = {_type: 'reference', _ref: customerId}
        } catch (err) {
          console.warn('stripeWebhook: failed to link customer for expired checkout', err)
        }
      }

      const created = await sanity.create(baseDoc as any, {autoGenerateArrayKeys: true})
      orderId = created?._id || null
    } catch (err) {
      console.warn('stripeWebhook: failed to create order for expired checkout', err)
    }
  } else {
    try {
      const patchData: Record<string, any> = pruneUndefined({
        status: 'expired',
        paymentStatus: 'expired',
        checkoutDraft: true,
        stripeCheckoutStatus: session.status || undefined,
        stripeSessionStatus: session.status || undefined,
        stripeCheckoutMode: session.mode || undefined,
        stripePaymentIntentStatus: session.payment_status || undefined,
        stripeLastSyncedAt: timestamp,
        stripeCreatedAt: createdAt,
        stripeExpiresAt: expiresAt || undefined,
        stripeSummary: summary,
        paymentFailureCode: failureCode,
        paymentFailureMessage: failureMessage,
        totalAmount: amountTotal,
        amountSubtotal,
        amountTax,
        amountShipping,
        currency: currencyLower,
        cart: cart.length ? cart : undefined,
        shippingAddress,
        weight: shippingMetrics.weight,
        dimensions: shippingMetrics.dimensions,
        shippingCarrier: shippingDetails.carrier || undefined,
        shippingServiceCode: shippingDetails.serviceCode || undefined,
        shippingServiceName: shippingDetails.serviceName || undefined,
        shippingDeliveryDays: shippingDetails.deliveryDays,
        shippingEstimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
        shippingMetadata:
          shippingDetails.metadata && Object.keys(shippingDetails.metadata).length
            ? shippingDetails.metadata
            : undefined,
      })

      const selectedServicePatch = pruneUndefined({
        carrierId: shippingDetails.carrierId,
        carrier: shippingDetails.carrier,
        service: shippingDetails.serviceName || shippingDetails.serviceCode,
        serviceCode: shippingDetails.serviceCode || shippingDetails.serviceName,
        amount: amountShipping,
        currency: shippingCurrencyForDoc,
        deliveryDays: shippingDetails.deliveryDays,
        estimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
      })
      if (Object.keys(selectedServicePatch).length > 0) {
        patchData.selectedService = selectedServicePatch
        if (amountShipping !== undefined) {
          patchData.selectedShippingAmount = amountShipping
        }
        if (shippingCurrencyForDoc) {
          patchData.selectedShippingCurrency = shippingCurrencyForDoc
        }
      }

      await sanity
        .patch(orderId)
        .set(patchData)
        .setIfMissing({webhookNotified: true})
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update order after checkout expiration', err)
    }
  }

  if (orderId) {
    await appendOrderEvent(orderId, {
      eventType: 'checkout.session.expired',
      status: 'expired',
      label: 'Checkout expired',
      message: failureMessage,
      amount: amountTotal,
      currency: currencyUpper,
      stripeEventId: context.stripeEventId,
      occurredAt: context.eventCreated ?? session.created,
      metadata: session.metadata as Record<string, string>,
    })
  }

  const invoiceMetaId = normalizeSanityId(metadata['sanity_invoice_id'])
  if (invoiceMetaId) {
    const invoiceId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && _id in $ids][0]._id`,
      {ids: idVariants(invoiceMetaId)},
    )
    if (invoiceId) {
      try {
        await sanity
          .patch(invoiceId)
          .set({
            status: 'expired',
            stripeInvoiceStatus: 'checkout.session.expired',
            stripeLastSyncedAt: timestamp,
            paymentFailureCode: failureCode,
            paymentFailureMessage: failureMessage,
            stripeSummary: summary,
          })
          .commit({autoGenerateArrayKeys: true})
      } catch (err) {
        console.warn('stripeWebhook: failed to update invoice after checkout expiration', err)
      }
    }
  }

  await recordExpiredCart(session, {
    reason: 'checkout.session.expired',
    failureCode,
    failureMessage,
    stripeEventId: context.stripeEventId,
    eventCreated: context.eventCreated ?? session.created,
    orderId,
    preloadedCart: cart,
  })
}

async function sendOrderConfirmationEmail(opts: {
  to: string
  orderNumber: string
  customerName?: string
  items: Array<{name?: string; sku?: string; quantity?: number; price?: number}>
  totalAmount?: number
  subtotal?: number
  taxAmount?: number
  shippingAmount?: number
  shippingAddress?: any
}) {
  if (!RESEND_API_KEY || !opts.to) return

  const {
    to,
    orderNumber,
    customerName,
    items,
    totalAmount,
    subtotal,
    taxAmount,
    shippingAmount,
    shippingAddress,
  } = opts

  const displayOrderNumber = sanitizeOrderNumber(orderNumber) || orderNumber
  const trimmedName = (customerName || '').toString().trim()
  const greetingLine = trimmedName
    ? `Hi ${trimmedName}, we’re getting your order ready now.`
    : 'We’re getting your order ready now.'
  const salutationPlain = trimmedName ? `Hi ${trimmedName}` : 'Hi there'

  const itemsHtml = items.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0;">
        <thead>
          <tr>
            <th align="left" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;">Item</th>
            <th align="center" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;width:70px;">Qty</th>
            <th align="right" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;width:90px;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                  <div style="font-size:14px;color:#111827;font-weight:600;">${item?.name || item?.sku || 'Item'}</div>
                  ${item?.sku ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">SKU ${item.sku}</div>` : ''}
                </td>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#374151;">${Number(item?.quantity || 1)}</td>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#374151;">${money(item?.price)}</td>
              </tr>
            `,
            )
            .join('')}
        </tbody>
      </table>`
    : ''

  const shippingHtml = renderAddressHtml(shippingAddress)
    ? `<div style="margin:24px 0 12px;">
        <h3 style="margin:0 0 6px;font-size:15px;color:#111827;">Shipping to</h3>
        <div style="font-size:14px;color:#374151;line-height:1.5;">${renderAddressHtml(shippingAddress)}</div>
      </div>`
    : ''

  const summaryRows = [
    {label: 'Subtotal', value: money(typeof subtotal === 'number' ? subtotal : undefined)},
    {
      label: 'Shipping',
      value: money(typeof shippingAmount === 'number' ? shippingAmount : undefined),
    },
    {label: 'Tax', value: money(typeof taxAmount === 'number' ? taxAmount : undefined)},
  ].filter((row) => row.value)

  const totalDisplay = money(totalAmount)
  const summaryHtml =
    summaryRows.length || totalDisplay
      ? `<div style="margin:12px 0 24px;padding:12px 16px;border:1px solid #e4e4e7;border-radius:12px;background:#f9fafb;max-width:340px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tbody>
            ${summaryRows
              .map(
                (row) => `
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#52525b;">${row.label}</td>
                  <td style="padding:6px 0;font-size:13px;color:#374151;text-align:right;">${row.value}</td>
                </tr>
              `,
              )
              .join('')}
            ${
              totalDisplay
                ? `<tr>
                  <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#111827;border-top:1px solid #e4e4e7;">Total</td>
                  <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#111827;text-align:right;border-top:1px solid #e4e4e7;">${totalDisplay}</td>
                </tr>`
                : ''
            }
          </tbody>
        </table>
      </div>`
      : ''

  const html = `
    <div style="margin:0;padding:24px 12px;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;color:#ffffff;padding:24px 28px;">
            <h1 style="margin:0;font-size:22px;font-weight:700;">Thank you for your order${
              displayOrderNumber ? ` <span style="color:#f97316">#${displayOrderNumber}</span>` : ''
            }</h1>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">${greetingLine}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 24px;color:#111827;">
            <p style="margin:0 0 16px;font-size:15px;">Here’s a quick summary for your records. We’ll send tracking details as soon as your package ships.</p>
            ${itemsHtml}
            ${summaryHtml}
            ${shippingHtml}
            <div style="margin:28px 0 0;padding:16px 20px;border-radius:10px;background:#f9fafb;color:#4b5563;font-size:13px;border:1px solid #e4e4e7;">
              Questions? Reply to this email or call us at (812) 200-9012.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;border-top:1px solid #e4e4e7;background:#f4f4f5;font-size:12px;color:#6b7280;text-align:center;">
            F.A.S. Motorsports LLC • 6161 Riverside Dr • Punta Gorda, FL 33982
          </td>
        </tr>
      </table>
    </div>
  `

  const textItems =
    items
      .map(
        (item) =>
          `- ${Number(item?.quantity || 1)} × ${item?.name || item?.sku || 'Item'} ${money(item?.price)}`,
      )
      .join('\n') || '- (details unavailable)'

  const textLines: string[] = []
  textLines.push(`${salutationPlain},`)
  textLines.push('')
  textLines.push(`Thank you for your order${displayOrderNumber ? ` #${displayOrderNumber}` : ''}!`)
  textLines.push('')
  textLines.push('Items:')
  textLines.push(textItems)
  if (totalDisplay) {
    textLines.push('')
    textLines.push(`Order total: ${totalDisplay}`)
  }
  if (renderAddressText(shippingAddress)) {
    textLines.push('')
    textLines.push('Shipping to:')
    textLines.push(renderAddressText(shippingAddress))
  }
  textLines.push('')
  textLines.push('We will email you tracking details as soon as your package ships.')
  textLines.push('')
  textLines.push('Questions? Reply to this email or call (812) 200-9012.')
  textLines.push('')
  textLines.push('— F.A.S. Motorsports')

  const text = textLines.join('\n')

  const subject = displayOrderNumber
    ? `Order Confirmation #${displayOrderNumber} – F.A.S. Motorsports`
    : 'Order Confirmation – F.A.S. Motorsports'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'orders@fasmotorsports.com',
      to,
      subject,
      html,
      text,
    }),
  })
}

export const handler: Handler = async (event) => {
  if (!stripe) return {statusCode: 500, body: 'Stripe not configured'}

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!endpointSecret) return {statusCode: 500, body: 'Missing STRIPE_WEBHOOK_SECRET'}

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, body: ''}
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: 'Method Not Allowed'}

  const sig = (event.headers['stripe-signature'] || event.headers['Stripe-Signature']) as string
  if (!sig) return {statusCode: 400, body: 'Missing Stripe-Signature header'}

  let webhookEvent: Stripe.Event
  try {
    const raw = getRawBody(event)
    webhookEvent = stripe.webhooks.constructEvent(raw, sig, endpointSecret)
  } catch (err: any) {
    console.error('stripeWebhook signature verification failed:', err?.message || err)
    return {statusCode: 400, body: `Webhook Error: ${err?.message || 'invalid signature'}`}
  }

  let webhookStatus: 'processed' | 'ignored' | 'error' = 'processed'
  let webhookSummary = summarizeEventType(webhookEvent.type)

  try {
    type ExtendedStripeEventType = Stripe.Event.Type | string
    const eventType = webhookEvent.type as ExtendedStripeEventType

    switch (eventType) {
      case 'quote.created':
      case 'quote.finalized':
      case 'quote.updated':
      case 'quote.accepted':
      case 'quote.canceled':
      case 'quote.will_expire': {
        try {
          const quoteObject = webhookEvent.data.object as Stripe.Quote
          const quote = (await fetchQuoteResource(quoteObject)) || quoteObject
          await syncStripeQuote(quote, {
            eventType: webhookEvent.type,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to sync quote event', err)
        }
        break
      }

      case 'payment_link.created':
      case 'payment_link.updated': {
        try {
          const paymentLinkObject = webhookEvent.data.object as Stripe.PaymentLink
          const paymentLink =
            (await fetchPaymentLinkResource(paymentLinkObject)) || paymentLinkObject
          await syncStripePaymentLink(paymentLink, {
            eventType: webhookEvent.type,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to sync payment link event', err)
        }
        break
      }

      case 'payment_method.attached':
      case 'payment_method.updated':
      case 'payment_method.automatically_updated': {
        try {
          const paymentMethod = webhookEvent.data.object as Stripe.PaymentMethod
          await syncCustomerPaymentMethod(paymentMethod)
        } catch (err) {
          console.warn('stripeWebhook: failed to sync payment method', err)
        }
        break
      }

      case 'payment_method.detached': {
        try {
          const paymentMethod = webhookEvent.data.object as Stripe.PaymentMethod
          await removeCustomerPaymentMethod(paymentMethod.id)
        } catch (err) {
          console.warn('stripeWebhook: failed to remove payment method', err)
        }
        break
      }

      case 'product.created':
      case 'product.updated': {
        try {
          const product = webhookEvent.data.object as Stripe.Product
          await syncStripeProduct(product)
        } catch (err) {
          console.warn('stripeWebhook: failed to sync product event', err)
        }
        break
      }

      case 'product.deleted': {
        try {
          const product = webhookEvent.data.object as {id: string}
          const docId = await findProductDocumentId({stripeProductId: product.id})
          if (docId) {
            await sanity
              .patch(docId)
              .set({
                stripeActive: false,
                stripeUpdatedAt: new Date().toISOString(),
              })
              .commit({autoGenerateArrayKeys: true})
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to handle product.deleted', err)
        }
        break
      }

      case 'price.created':
      case 'price.updated': {
        try {
          const price = webhookEvent.data.object as Stripe.Price
          await syncStripePrice(price)
        } catch (err) {
          console.warn('stripeWebhook: failed to sync price event', err)
        }
        break
      }

      case 'price.deleted': {
        try {
          const deleted = webhookEvent.data.object as {id: string; product?: string | {id?: string}}
          const productId =
            typeof deleted.product === 'string' ? deleted.product : deleted.product?.id
          await removeStripePrice(deleted.id, productId)
        } catch (err) {
          console.warn('stripeWebhook: failed to handle price.deleted', err)
        }
        break
      }

      case 'customer.created':
      case 'customer.updated': {
        try {
          const customer = webhookEvent.data.object as Stripe.Customer
          if (!customer.deleted) {
            await syncStripeCustomer(customer)
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to sync customer', err)
        }
        break
      }

      case 'customer.deleted': {
        try {
          const deleted = webhookEvent.data.object as {id: string}
          const docId = await sanity.fetch<string | null>(
            `*[_type == "customer" && stripeCustomerId == $id][0]._id`,
            {id: deleted.id},
          )
          if (docId) {
            await sanity
              .patch(docId)
              .set({stripeLastSyncedAt: new Date().toISOString()})
              .commit({autoGenerateArrayKeys: true})
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to handle customer.deleted', err)
        }
        break
      }

      case 'customer.discount.created':
      case 'customer.discount.updated': {
        try {
          const discount = webhookEvent.data.object as Stripe.Discount
          const {coupon, promotion} = await hydrateDiscountResources(stripe, discount)
          await syncCustomerDiscountRecord({
            sanity,
            discount,
            stripe,
            coupon,
            promotion,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to sync customer discount', err)
        }
        break
      }

      case 'customer.discount.deleted': {
        try {
          const discount = webhookEvent.data.object as Stripe.Discount
          const stripeCustomerId =
            typeof discount.customer === 'string'
              ? discount.customer
              : (discount.customer as Stripe.Customer | null)?.id
          await removeCustomerDiscountRecord({
            sanity,
            stripeDiscountId: discount.id,
            stripeCustomerId,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to remove customer discount', err)
        }
        break
      }

      case 'invoice.created':
      case 'invoice.deleted':
      case 'invoice.finalization_failed':
      case 'invoice.finalized':
      case 'invoice.marked_uncollectible':
      case 'invoice.overdue':
      case 'invoice.overpaid':
      case 'invoice.paid':
      case 'invoice.payment_action_required':
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded':
      case 'invoice.sent':
      case 'invoice.upcoming':
      case 'invoice.voided':
      case 'invoice.updated':
      case 'invoice.will_be_due': {
        try {
          const invoice = webhookEvent.data.object as Stripe.Invoice
          await syncStripeInvoice(invoice)

          const invoiceStatus = (invoice.status || '').toString().toLowerCase()
          const invoiceIdentifier = (() => {
            const raw = (invoice.number ?? invoice.id ?? '') as string | null
            return raw ? raw.toString().trim() : ''
          })()
          const shouldRecordFailure =
            webhookEvent.type === 'invoice.payment_failed' || invoiceStatus === 'uncollectible'

          if (shouldRecordFailure) {
            const paymentIntent = await fetchPaymentIntentResource((invoice as any).payment_intent)
            if (paymentIntent) {
              await markPaymentIntentFailure(paymentIntent)
            }
          } else if (webhookEvent.type === 'invoice.payment_action_required') {
            const paymentIntent = await fetchPaymentIntentResource((invoice as any).payment_intent)
            const paymentIntentId =
              paymentIntent?.id ||
              (typeof (invoice as any)?.payment_intent === 'string'
                ? ((invoice as any).payment_intent as string)
                : undefined)
            if (paymentIntentId) {
              await updateOrderPaymentStatus({
                paymentIntentId,
                paymentStatus: 'requires_action',
                invoiceStripeStatus: webhookEvent.type,
                preserveExistingFailureDiagnostics: true,
                event: {
                  eventType: webhookEvent.type,
                  label: 'Invoice requires payment action',
                  message: invoiceIdentifier
                    ? `Invoice ${invoiceIdentifier} requires customer action`
                    : 'Invoice requires customer action',
                  stripeEventId: webhookEvent.id,
                  occurredAt: webhookEvent.created,
                  metadata: (invoice.metadata || {}) as Record<string, unknown>,
                },
              })
            }
          } else if (
            webhookEvent.type === 'invoice.payment_succeeded' ||
            webhookEvent.type === 'invoice.paid'
          ) {
            const paymentIntent = await fetchPaymentIntentResource((invoice as any).payment_intent)
            const paymentIntentId =
              paymentIntent?.id ||
              (typeof (invoice as any)?.payment_intent === 'string'
                ? ((invoice as any).payment_intent as string)
                : undefined)
            if (paymentIntentId) {
              const latestCharge = paymentIntent?.latest_charge as
                | string
                | Stripe.Charge
                | null
                | undefined
              const chargeId =
                typeof latestCharge === 'string'
                  ? latestCharge
                  : typeof latestCharge?.id === 'string'
                    ? latestCharge.id
                    : undefined
              const summary = buildStripeSummary({
                paymentIntent: paymentIntent || undefined,
                eventType: webhookEvent.type,
                eventCreated: webhookEvent.created,
              })
              const additionalOrderFields = {
                stripeSummary: summary,
                paymentFailureCode: null,
                paymentFailureMessage: null,
              }
              const additionalInvoiceFields = {
                stripeSummary: summary,
                paymentFailureCode: null,
                paymentFailureMessage: null,
              }
              await updateOrderPaymentStatus({
                paymentIntentId,
                chargeId,
                paymentStatus: 'paid',
                orderStatus: 'paid',
                invoiceStatus: 'paid',
                invoiceStripeStatus: webhookEvent.type,
                additionalOrderFields,
                additionalInvoiceFields,
                event: {
                  eventType: webhookEvent.type,
                  label: 'Invoice payment succeeded',
                  message: invoiceIdentifier
                    ? `Invoice ${invoiceIdentifier} payment succeeded`
                    : 'Invoice payment succeeded',
                  stripeEventId: webhookEvent.id,
                  occurredAt: webhookEvent.created,
                  metadata: (invoice.metadata || {}) as Record<string, unknown>,
                },
              })
            }
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to sync invoice', err)
        }
        break
      }

      case 'invoiceitem.created':
      case 'invoiceitem.deleted':
      case 'invoiceitem.updated': {
        try {
          const invoiceItem = webhookEvent.data.object as Stripe.InvoiceItem
          await syncStripeInvoiceById(
            invoiceItem.invoice as string | Stripe.Invoice | null | undefined,
          )
        } catch (err) {
          console.warn('stripeWebhook: failed to sync invoice from invoiceitem event', err)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        try {
          const pi = webhookEvent.data.object as Stripe.PaymentIntent
          await markPaymentIntentFailure(pi)
        } catch (err) {
          console.warn('stripeWebhook: failed to mark payment failure', err)
        }
        break
      }

      case 'payment_intent.canceled': {
        try {
          const pi = webhookEvent.data.object as Stripe.PaymentIntent
          const diagnostics = await resolvePaymentFailureDiagnostics(pi)
          await updateOrderPaymentStatus({
            paymentIntentId: pi.id,
            stripeSessionId:
              typeof pi.metadata?.checkout_session_id === 'string'
                ? pi.metadata?.checkout_session_id
                : undefined,
            paymentStatus: pi.status || 'canceled',
            orderStatus: 'cancelled',
            invoiceStatus: 'cancelled',
            invoiceStripeStatus: 'payment_intent.canceled',
            additionalOrderFields: {
              paymentFailureCode: diagnostics.code,
              paymentFailureMessage: diagnostics.message,
            },
            additionalInvoiceFields: {
              paymentFailureCode: diagnostics.code,
              paymentFailureMessage: diagnostics.message,
            },
            preserveExistingFailureDiagnostics: true,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to mark payment cancellation', err)
        }
        break
      }

      case 'charge.captured':
      case 'charge.succeeded': {
        try {
          const charge = webhookEvent.data.object as Stripe.Charge
          const amountCaptured =
            webhookEvent.type === 'charge.captured'
              ? toMajorUnits(charge.amount_captured)
              : toMajorUnits(charge.amount || undefined)
          const amountLabel = formatMajorAmount(amountCaptured, charge.currency)
          await handleChargeEvent({
            charge,
            event: webhookEvent,
            paymentStatus: 'paid',
            orderStatus: 'paid',
            invoiceStatus: 'paid',
            label: webhookEvent.type === 'charge.captured' ? 'Charge captured' : 'Charge succeeded',
            messageParts: [
              charge.id ? `Charge ${charge.id}` : null,
              amountCaptured !== undefined && amountLabel ? `Amount ${amountLabel}` : null,
              charge.status ? `Stripe status ${charge.status}` : null,
            ],
            amountOverride: amountCaptured,
            includeChargeContext: false,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge success event', err)
        }
        break
      }

      case 'charge.pending': {
        try {
          const charge = webhookEvent.data.object as Stripe.Charge
          const amountPending = toMajorUnits(charge.amount || undefined)
          const amountLabel = formatMajorAmount(amountPending, charge.currency)
          await handleChargeEvent({
            charge,
            event: webhookEvent,
            paymentStatus: 'pending',
            invoiceStatus: 'pending',
            label: 'Charge pending',
            messageParts: [
              charge.id ? `Charge ${charge.id}` : null,
              amountPending !== undefined && amountLabel ? `Amount ${amountLabel}` : null,
              charge.status ? `Stripe status ${charge.status}` : null,
            ],
            amountOverride: amountPending,
            includeChargeContext: false,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge.pending', err)
        }
        break
      }

      case 'charge.failed': {
        try {
          const charge = webhookEvent.data.object as Stripe.Charge
          const amountFailed = toMajorUnits(charge.amount || undefined)
          const amountLabel = formatMajorAmount(amountFailed, charge.currency)
          await handleChargeEvent({
            charge,
            event: webhookEvent,
            paymentStatus: 'failed',
            orderStatus: 'cancelled',
            invoiceStatus: 'cancelled',
            label: 'Charge failed',
            messageParts: [
              charge.id ? `Charge ${charge.id}` : null,
              amountFailed !== undefined && amountLabel ? `Amount ${amountLabel}` : null,
              charge.failure_code ? `Failure ${charge.failure_code}` : null,
              charge.failure_message ? charge.failure_message : null,
            ],
            amountOverride: amountFailed,
            additionalOrderFields: {
              paymentFailureCode: charge.failure_code || charge.outcome?.reason || undefined,
              paymentFailureMessage:
                charge.failure_message || charge.outcome?.seller_message || undefined,
            },
            additionalInvoiceFields: {
              paymentFailureCode: charge.failure_code || charge.outcome?.reason || undefined,
              paymentFailureMessage:
                charge.failure_message || charge.outcome?.seller_message || undefined,
            },
            preserveExistingFailureDiagnostics: false,
            includeChargeContext: false,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge.failed', err)
        }
        break
      }

      case 'charge.expired': {
        try {
          const charge = webhookEvent.data.object as Stripe.Charge
          const amount = toMajorUnits(charge.amount || undefined)
          const amountLabel = formatMajorAmount(amount, charge.currency)
          await handleChargeEvent({
            charge,
            event: webhookEvent,
            paymentStatus: 'expired',
            orderStatus: 'expired',
            invoiceStatus: 'cancelled',
            label: 'Charge authorization expired',
            messageParts: [
              charge.id ? `Charge ${charge.id}` : null,
              amount !== undefined && amountLabel ? `Amount ${amountLabel}` : null,
            ],
            amountOverride: amount,
            includeChargeContext: false,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge.expired', err)
        }
        break
      }

      case 'charge.dispute.created': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent,
            paymentStatus: 'disputed',
            label: 'Dispute opened',
            messageParts: [dispute.id ? `Dispute ${dispute.id}` : null],
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.created', err)
        }
        break
      }

      case 'charge.dispute.updated': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent,
            paymentStatus: 'disputed',
            label: 'Dispute updated',
            messageParts: [dispute.id ? `Dispute ${dispute.id}` : null],
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.updated', err)
        }
        break
      }

      case 'charge.dispute.closed': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          const status = (dispute.status || '').toLowerCase()
          let paymentStatus: string = 'dispute_closed'
          let orderStatus: OrderPaymentStatusInput['orderStatus'] | undefined = undefined
          let invoiceStatus: OrderPaymentStatusInput['invoiceStatus'] | undefined = undefined
          if (status === 'won') {
            paymentStatus = 'dispute_won'
            orderStatus = 'paid'
            invoiceStatus = 'paid'
          } else if (status === 'lost') {
            paymentStatus = 'dispute_lost'
            orderStatus = 'cancelled'
            invoiceStatus = 'cancelled'
          } else if (status === 'warning_closed') {
            paymentStatus = 'dispute_warning_closed'
          }
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent,
            paymentStatus,
            orderStatus,
            invoiceStatus,
            label: 'Dispute closed',
            messageParts: [dispute.id ? `Dispute ${dispute.id}` : null],
            eventStatus: paymentStatus,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.closed', err)
        }
        break
      }

      case 'charge.dispute.funds_withdrawn': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent,
            paymentStatus: 'dispute_funds_withdrawn',
            label: 'Dispute funds withdrawn',
            messageParts: [
              dispute.id ? `Dispute ${dispute.id}` : null,
              'Stripe withdrew dispute funds',
            ],
            eventStatus: 'dispute_funds_withdrawn',
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.funds_withdrawn', err)
        }
        break
      }

      case 'charge.dispute.funds_reinstated': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent,
            paymentStatus: 'dispute_funds_reinstated',
            orderStatus: 'paid',
            invoiceStatus: 'paid',
            label: 'Dispute funds reinstated',
            messageParts: [
              dispute.id ? `Dispute ${dispute.id}` : null,
              'Stripe reinstated dispute funds',
            ],
            eventStatus: 'dispute_funds_reinstated',
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.funds_reinstated', err)
        }
        break
      }

      case 'charge.refunded':
      case 'charge.refund.created':
      case 'charge.refund.updated': {
        await handleRefundWebhookEvent(webhookEvent)
        break
      }

      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        await handleRefundWebhookEvent(webhookEvent)
        break
      }

      case 'checkout.session.async_payment_succeeded': {
        try {
          const session = webhookEvent.data.object as Stripe.Checkout.Session
          await handleCheckoutAsyncPaymentSucceeded(session, {
            eventType: webhookEvent.type,
            invoiceStripeStatus: webhookEvent.type,
            stripeEventId: webhookEvent.id,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn(
            'stripeWebhook: failed to handle checkout.session.async_payment_succeeded',
            err,
          )
        }
        break
      }

      case 'checkout.session.async_payment_failed': {
        try {
          const session = webhookEvent.data.object as Stripe.Checkout.Session
          await handleCheckoutAsyncPaymentFailed(session, {
            eventType: webhookEvent.type,
            invoiceStripeStatus: webhookEvent.type,
            stripeEventId: webhookEvent.id,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle checkout.session.async_payment_failed', err)
        }
        break
      }

      case 'checkout.session.completed': {
        const session = webhookEvent.data.object as Stripe.Checkout.Session
        const email = session.customer_details?.email || session.customer_email || ''
        const totalAmount = (Number(session.amount_total || 0) || 0) / 100
        const stripeSessionId = session.id
        const metadata = (session.metadata || {}) as Record<string, string>
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

        // Enrich with Stripe payment details if available
        let paymentIntent: Stripe.PaymentIntent | null = null
        try {
          if (session.payment_intent) {
            paymentIntent = await stripe.paymentIntents.retrieve(String(session.payment_intent), {
              expand: ['charges.data.payment_method_details', 'latest_charge'],
            })
          }
        } catch {}

        const currency =
          ((session as any)?.currency || (paymentIntent as any)?.currency || '')
            .toString()
            .toLowerCase() || undefined
        const sessionStatus = (session.status || '').toString().toLowerCase()
        const rawPaymentStatus = (session.payment_status || paymentIntent?.status || '')
          .toString()
          .toLowerCase()
        const normalizedPaymentStatus = rawPaymentStatus.trim()
        let paymentStatus: string = normalizedPaymentStatus
        if (
          ['paid', 'succeeded', 'complete', 'no_payment_required'].includes(normalizedPaymentStatus)
        ) {
          paymentStatus = 'paid'
        } else if (sessionStatus === 'expired') {
          paymentStatus = 'expired'
        } else if (['canceled', 'cancelled'].includes(normalizedPaymentStatus)) {
          paymentStatus = 'cancelled'
        } else if (FAILED_CHECKOUT_PAYMENT_STATUSES.has(normalizedPaymentStatus)) {
          paymentStatus = 'failed'
        } else if (!paymentStatus) {
          paymentStatus = 'pending'
        }
        let derivedOrderStatus: 'paid' | 'cancelled' | 'closed' | 'expired'
        if (sessionStatus === 'expired') derivedOrderStatus = 'expired'
        else if (paymentStatus === 'cancelled' || paymentStatus === 'failed')
          derivedOrderStatus = 'cancelled'
        else derivedOrderStatus = 'paid'
        const amountSubtotal = Number.isFinite(Number((session as any)?.amount_subtotal))
          ? Number((session as any)?.amount_subtotal) / 100
          : undefined
        const amountTax = Number.isFinite(Number((session as any)?.total_details?.amount_tax))
          ? Number((session as any)?.total_details?.amount_tax) / 100
          : undefined
        const amountDiscount = Number.isFinite(
          Number((session as any)?.total_details?.amount_discount),
        )
          ? Number((session as any)?.total_details?.amount_discount) / 100
          : undefined
        let amountShipping = (() => {
          const a = Number((session as any)?.shipping_cost?.amount_total)
          if (Number.isFinite(a)) return a / 100
          const b = Number((session as any)?.total_details?.amount_shipping)
          return Number.isFinite(b) ? b / 100 : undefined
        })()
        let chargeId: string | undefined
        let cardBrand: string | undefined
        let cardLast4: string | undefined
        let receiptUrl: string | undefined
        let chargeBillingName: string | undefined
        try {
          let chargeRecord: Stripe.Charge | null = null
          const chargeList = (paymentIntent as any)?.charges?.data
          if (Array.isArray(chargeList) && chargeList.length > 0) {
            chargeRecord = chargeList[chargeList.length - 1] as Stripe.Charge
          } else if (paymentIntent?.latest_charge) {
            if (typeof paymentIntent.latest_charge === 'string') {
              chargeRecord = stripe
                ? await stripe.charges.retrieve(paymentIntent.latest_charge, {
                    expand: ['payment_method_details'],
                  })
                : null
            } else if (
              paymentIntent.latest_charge &&
              typeof paymentIntent.latest_charge === 'object'
            ) {
              chargeRecord = paymentIntent.latest_charge as Stripe.Charge
            }
          }
          if (chargeRecord) {
            chargeId = chargeRecord.id || chargeId
            receiptUrl = chargeRecord.receipt_url || receiptUrl
            const c = chargeRecord.payment_method_details?.card
            cardBrand = c?.brand || cardBrand
            cardLast4 = c?.last4 || cardLast4
            chargeBillingName = chargeRecord.billing_details?.name || chargeBillingName
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to resolve card details for checkout', err)
        }

        const metadataOrderNumberRaw = extractMetadataOrderNumber(metadata) || ''
        const metadataInvoiceNumber =
          firstString(
            INVOICE_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
          ) || ''
        // Use the shared helper so metadata fallbacks and live Stripe rate
        // lookups stay in sync across reprocessing + webhook flows.
        const shippingDetails = await resolveStripeShippingDetails({
          metadata,
          session,
          paymentIntent,
          fallbackAmount: amountShipping,
          stripe,
        })
        if (shippingDetails.amount !== undefined) {
          amountShipping = shippingDetails.amount
        }
        const orderNumber = await resolveOrderNumber({
          metadataOrderNumber: metadataOrderNumberRaw,
          invoiceNumber: metadataInvoiceNumber,
          fallbackId: stripeSessionId,
        })
        const normalizedOrderNumber = normalizeOrderNumberForStorage(orderNumber) || orderNumber

        const invoiceId = metadata['sanity_invoice_id']
        const metadataCustomerName = (metadata['bill_to_name'] || metadata['customer_name'] || '')
          .toString()
          .trim()
        // 2) Gather enriched data: line items + shipping
        const {items: cart, products: cartProducts} = await buildCartFromSessionLineItems(
          stripeSessionId,
          metadata,
        )
        const shippingMetrics = computeShippingMetrics(cart, cartProducts)
        let shippingAddress: any = undefined
        try {
          const cd = session.customer_details
          const addr = (cd?.address || (session as any).shipping_details?.address) as
            | Stripe.Address
            | undefined
          const name = cd?.name || (session as any).shipping_details?.name || undefined
          const phone = cd?.phone || (session as any).shipping_details?.phone || undefined
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
        } catch (err) {
          console.warn('stripeWebhook: could not parse shipping address', err)
        }

        const customerName =
          (
            shippingAddress?.name ||
            metadataCustomerName ||
            session.customer_details?.name ||
            chargeBillingName ||
            email ||
            ''
          )
            .toString()
            .trim() || undefined

        // 3) Upsert an Order doc for visibility/fulfillment
        try {
          const existingOrder = await sanity.fetch(
            `*[_type == "order" && stripeSessionId == $sid][0]{_id, packingSlipUrl}`,
            {sid: stripeSessionId},
          )
          const existingId = existingOrder?._id || null
          const normalizedEmail = typeof email === 'string' ? email.trim() : ''
          const shouldSendConfirmation =
            !existingId && Boolean(normalizedEmail) && Boolean(RESEND_API_KEY)

          const baseDoc: any = {
            _type: 'order',
            stripeSource: 'checkout.session',
            stripeSessionId,
            orderNumber: normalizedOrderNumber,
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
            amountDiscount,
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
          applyShippingMetrics(baseDoc, shippingMetrics)
          baseDoc.stripeSummary = buildStripeSummary({
            session,
            paymentIntent,
            eventType: webhookEvent.type,
            eventCreated: webhookEvent.created,
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

          const orderSlug = createOrderSlug(normalizedOrderNumber, stripeSessionId)
          if (orderSlug) baseDoc.slug = {_type: 'slug', current: orderSlug}

          // Try to link to an existing customer by email
          if (email) {
            try {
              const customerId = await sanity.fetch(
                `*[_type == "customer" && email == $email][0]._id`,
                {email},
              )
              if (customerId) baseDoc.customerRef = {_type: 'reference', _ref: customerId}
            } catch {}
          }

          let orderId = existingId
          if (existingId) {
            await sanity
              .patch(existingId)
              .set(baseDoc)
              .setIfMissing({webhookNotified: true})
              .commit({autoGenerateArrayKeys: true})
          } else {
            const created = await sanity.create(
              {...baseDoc, webhookNotified: true},
              {autoGenerateArrayKeys: true},
            )
            orderId = created?._id
          }

          if (orderId) {
            await appendOrderEvent(orderId, {
              eventType: webhookEvent.type,
              status: paymentStatus,
              label: 'Checkout completed',
              message: `Checkout session ${stripeSessionId} completed with status ${session.payment_status || 'unknown'}`,
              amount: totalAmount,
              currency: currency ? currency.toUpperCase() : undefined,
              stripeEventId: webhookEvent.id,
              occurredAt: webhookEvent.created,
              metadata,
            })
            await markExpiredCartRecovered(stripeSessionId, orderId, {
              eventType: 'checkout.recovered',
              status: 'recovered',
              label: 'Converted to order',
              message: `Order ${normalizedOrderNumber || orderId} created from checkout ${stripeSessionId}`,
              amount: totalAmount,
              currency: currency ? currency.toUpperCase() : undefined,
              stripeEventId: webhookEvent.id,
              occurredAt: webhookEvent.created,
              metadata,
            })
            try {
              if (!existingOrder?.packingSlipUrl) {
                const packingSlipUrl = await generatePackingSlipAsset({
                  sanity,
                  orderId,
                  invoiceId,
                })
                if (packingSlipUrl) {
                  await sanity
                    .patch(orderId)
                    .set({packingSlipUrl})
                    .commit({autoGenerateArrayKeys: true})
                }
              }
            } catch (err) {
              console.warn('stripeWebhook: packing slip auto upload failed', err)
            }
          }

          try {
            await updateCustomerProfileForOrder({
              sanity,
              orderId,
              customerId: (baseDoc as any)?.customerRef?._ref,
              email: normalizedEmail || email || undefined,
              shippingAddress,
              stripeCustomerId:
                typeof paymentIntent?.customer === 'string' ? paymentIntent.customer : undefined,
              stripeSyncTimestamp: new Date().toISOString(),
              customerName,
            })
          } catch (err) {
            console.warn('stripeWebhook: failed to refresh customer profile', err)
          }

          if (shouldSendConfirmation && orderId) {
            try {
              await sendOrderConfirmationEmail({
                to: normalizedEmail,
                orderNumber,
                customerName,
                items: cart,
                totalAmount,
                subtotal: typeof amountSubtotal === 'number' ? amountSubtotal : undefined,
                taxAmount: typeof amountTax === 'number' ? amountTax : undefined,
                shippingAmount: typeof amountShipping === 'number' ? amountShipping : undefined,
                shippingAddress,
              })
              await sanity
                .patch(orderId)
                .set({confirmationEmailSent: true})
                .commit({autoGenerateArrayKeys: true})
            } catch (err) {
              console.warn('stripeWebhook: order confirmation email failed', err)
            }
          }

          // 4) Auto-fulfillment: call our Netlify function to generate packing slip, label, and email
          try {
            if (orderId) {
              const base = (
                process.env.SANITY_STUDIO_NETLIFY_BASE ||
                process.env.PUBLIC_SITE_URL ||
                process.env.AUTH0_BASE_URL ||
                ''
              ).trim()
              if (base && base.startsWith('http')) {
                const url = `${base.replace(/\/$/, '')}/.netlify/functions/fulfill-order`
                await fetch(url, {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({orderId}),
                })
              }
            }
          } catch (e) {
            console.warn('stripeWebhook: auto-fulfillment call failed', e)
          }
        } catch (e) {
          console.error('stripeWebhook: failed to upsert Order doc:', e)
          // Do not fail the webhook; Stripe will retry and we may create duplicates otherwise
        }

        break
      }

      case 'payment_intent.succeeded': {
        const pi = webhookEvent.data.object as Stripe.PaymentIntent
        const meta = (pi.metadata || {}) as Record<string, string>
        const userIdMeta =
          (meta['auth0_user_id'] || meta['auth0_sub'] || meta['userId'] || meta['user_id'] || '')
            .toString()
            .trim() || undefined
        const invoiceId = meta['sanity_invoice_id']
        const checkoutSessionMeta =
          (
            meta['checkout_session_id'] ||
            meta['checkoutSessionId'] ||
            meta['stripe_checkout_session_id'] ||
            ''
          )
            .toString()
            .trim() || undefined

        // Create a minimal Order if none exists yet
        try {
          const totalAmount = (Number(pi.amount_received || pi.amount || 0) || 0) / 100
          const email =
            (pi as any)?.charges?.data?.[0]?.billing_details?.email ||
            (pi as any)?.receipt_email ||
            undefined
          const currency = ((pi as any)?.currency || '').toString().toLowerCase() || undefined
          const ch = (pi as any)?.charges?.data?.[0]
          const chargeId = ch?.id || undefined
          const receiptUrl = ch?.receipt_url || undefined
          const cardBrand = ch?.payment_method_details?.card?.brand || undefined
          const cardLast4 = ch?.payment_method_details?.card?.last4 || undefined
          const chargeBillingName = ch?.billing_details?.name || undefined
          const shippingAddr: any = (pi as any)?.shipping?.address || undefined
          let amountShipping: number | undefined = undefined
          const rawPaymentStatus = (pi.status || '').toLowerCase()
          let paymentStatus = rawPaymentStatus || 'pending'
          if (['succeeded', 'paid'].includes(rawPaymentStatus)) paymentStatus = 'paid'
          else if (['canceled', 'cancelled'].includes(rawPaymentStatus)) paymentStatus = 'cancelled'
          let derivedOrderStatus: 'paid' | 'cancelled' =
            paymentStatus === 'cancelled' ? 'cancelled' : 'paid'

          const metadataOrderNumberRaw = extractMetadataOrderNumber(meta) || ''
          const metadataInvoiceNumber =
            firstString(
              INVOICE_METADATA_NUMBER_KEYS.map((key) => meta[key as keyof typeof meta]),
            ) || ''
          const shippingDetails = await resolveStripeShippingDetails({
            metadata: meta,
            paymentIntent: pi,
            fallbackAmount: undefined,
            stripe,
          })
          const orderNumber = await resolveOrderNumber({
            metadataOrderNumber: metadataOrderNumberRaw,
            invoiceNumber: metadataInvoiceNumber,
            fallbackId: pi.id,
          })
          const normalizedOrderNumber = normalizeOrderNumberForStorage(orderNumber) || orderNumber
          const customerName =
            (
              (pi as any)?.shipping?.name ||
              meta['bill_to_name'] ||
              chargeBillingName ||
              email ||
              ''
            )
              .toString()
              .trim() || undefined

          let cart: CartItem[] = []
          let cartProducts: CartProductSummary[] = []
          if (checkoutSessionMeta) {
            try {
              const cartResult = await buildCartFromSessionLineItems(checkoutSessionMeta, meta)
              cart = cartResult.items
              cartProducts = cartResult.products
            } catch (err) {
              console.warn('stripeWebhook: failed to load cart from checkout metadata', err)
            }
          }
          if (!cart.length) {
            cart = cartItemsFromMetadata(meta)
          }
          if (cart.length && !cartProducts.length) {
            try {
              const enriched = await enrichCartItemsFromSanity(cart, sanity, {
                onProducts: (list: CartProductSummary[]) => {
                  cartProducts = list
                },
              })
              cart = enriched
            } catch (err) {
              console.warn('stripeWebhook: failed to enrich payment intent cart', err)
            }
          }
          if (cart.length && !cartProducts.length) {
            try {
              cartProducts = await fetchProductsForCart(cart, sanity)
            } catch (err) {
              console.warn(
                'stripeWebhook: failed to fetch product summaries for payment intent',
                err,
              )
            }
          }
          const shippingMetrics = computeShippingMetrics(cart, cartProducts)

          const existingOrder = await sanity.fetch(
            `*[_type == "order" && stripeSessionId == $sid][0]{_id, packingSlipUrl}`,
            {sid: pi.id},
          )
          const existingId = existingOrder?._id || null
          const normalizedEmail = typeof email === 'string' ? email.trim() : ''
          const shouldSendConfirmation =
            !existingId && Boolean(normalizedEmail) && Boolean(RESEND_API_KEY)
          const baseDoc: any = {
            _type: 'order',
            stripeSource: 'payment_intent',
            stripeSessionId: pi.id,
            orderNumber: normalizedOrderNumber,
            customerName,
            customerEmail: email || undefined,
            totalAmount: Number.isFinite(totalAmount) ? totalAmount : undefined,
            status: derivedOrderStatus,
            createdAt: new Date().toISOString(),
            paymentStatus,
            stripePaymentIntentStatus: pi.status || undefined,
            stripeLastSyncedAt: new Date().toISOString(),
            currency,
            paymentIntentId: pi.id,
            chargeId,
            cardBrand,
            cardLast4,
            receiptUrl,
            checkoutDraft: derivedOrderStatus !== 'paid' ? true : undefined,
            ...(userIdMeta ? {userId: userIdMeta} : {}),
            ...(shippingAddr
              ? {
                  shippingAddress: {
                    name: (pi as any)?.shipping?.name || chargeBillingName || undefined,
                    addressLine1: shippingAddr.line1 || undefined,
                    addressLine2: shippingAddr.line2 || undefined,
                    city: shippingAddr.city || undefined,
                    state: shippingAddr.state || undefined,
                    postalCode: shippingAddr.postal_code || undefined,
                    country: shippingAddr.country || undefined,
                    email: email || undefined,
                  },
                }
              : {}),
            ...(cart.length ? {cart} : {}),
          }
          applyShippingMetrics(baseDoc, shippingMetrics)
          baseDoc.stripeSummary = buildStripeSummary({
            paymentIntent: pi,
            eventType: webhookEvent.type,
            eventCreated: webhookEvent.created,
          })
          const shippingAmountForDoc = shippingDetails.amount ?? amountShipping
          if (shippingAmountForDoc !== undefined) {
            baseDoc.amountShipping = shippingAmountForDoc
            baseDoc.selectedShippingAmount = shippingAmountForDoc
          }
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
              currency:
                shippingDetails.currency ||
                (currency ? currency.toUpperCase() : undefined) ||
                'USD',
              deliveryDays: shippingDetails.deliveryDays,
              estimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
            }
          }
          if (shippingDetails.currency) {
            baseDoc.selectedShippingCurrency = shippingDetails.currency
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
          const intentSlug = createOrderSlug(normalizedOrderNumber, pi.id)
          if (intentSlug) baseDoc.slug = {_type: 'slug', current: intentSlug}

          let orderId = existingId
          if (existingId) {
            await sanity.patch(existingId).set(baseDoc).commit({autoGenerateArrayKeys: true})
          } else {
            const created = await sanity.create(baseDoc, {autoGenerateArrayKeys: true})
            orderId = created?._id
          }

          if (orderId) {
            await appendOrderEvent(orderId, {
              eventType: webhookEvent.type,
              status: paymentStatus,
              label: 'Payment intent succeeded',
              message: `Payment intent ${pi.id} succeeded`,
              amount: totalAmount,
              currency: currency ? currency.toUpperCase() : undefined,
              stripeEventId: webhookEvent.id,
              occurredAt: webhookEvent.created,
              metadata: meta,
            })
            await markExpiredCartRecovered(checkoutSessionMeta, orderId, {
              eventType: 'checkout.recovered',
              status: 'recovered',
              label: 'Payment intent recovered checkout',
              message: checkoutSessionMeta
                ? `Checkout ${checkoutSessionMeta} converted from payment intent ${pi.id}`
                : `Payment intent ${pi.id} recorded`,
              amount: totalAmount,
              currency: currency ? currency.toUpperCase() : undefined,
              stripeEventId: webhookEvent.id,
              occurredAt: webhookEvent.created,
              metadata: meta,
            })
            try {
              if (!existingOrder?.packingSlipUrl) {
                const packingSlipUrl = await generatePackingSlipAsset({
                  sanity,
                  orderId,
                  invoiceId,
                })
                if (packingSlipUrl) {
                  await sanity
                    .patch(orderId)
                    .set({packingSlipUrl})
                    .commit({autoGenerateArrayKeys: true})
                }
              }
            } catch (err) {
              console.warn('stripeWebhook: packing slip auto upload failed', err)
            }
          }

          if (shouldSendConfirmation && orderId) {
            try {
              await sendOrderConfirmationEmail({
                to: normalizedEmail,
                orderNumber,
                customerName,
                items: cart,
                totalAmount,
                shippingAmount:
                  typeof shippingDetails.amount === 'number' ? shippingDetails.amount : undefined,
                shippingAddress: shippingAddr,
              })
              await sanity
                .patch(orderId)
                .set({confirmationEmailSent: true})
                .commit({autoGenerateArrayKeys: true})
            } catch (err) {
              console.warn('stripeWebhook: PI order confirmation email failed', err)
            }
          }

          // Try auto-fulfillment only if we have a shipping address on the PI
          try {
            const base = (
              process.env.SANITY_STUDIO_NETLIFY_BASE ||
              process.env.PUBLIC_SITE_URL ||
              process.env.AUTH0_BASE_URL ||
              ''
            ).trim()
            const hasShipping = Boolean((pi as any)?.shipping?.address?.line1)
            if (base && base.startsWith('http') && orderId && hasShipping) {
              const url = `${base.replace(/\/$/, '')}/.netlify/functions/fulfill-order`
              await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({orderId}),
              })
            }
          } catch {}
        } catch (e) {
          console.warn('stripeWebhook: PI fallback order creation failed', e)
        }
        break
      }
      case 'checkout.session.expired':
        try {
          const session = webhookEvent.data.object as Stripe.Checkout.Session
          await handleCheckoutExpired(session, {
            stripeEventId: webhookEvent.id,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle checkout.session.expired', err)
        }
        break
      default: {
        const type = webhookEvent.type || ''
        if (type.startsWith('source.')) {
          await recordStripeWebhookResourceEvent(webhookEvent, 'source')
        } else if (type.startsWith('person.')) {
          await recordStripeWebhookResourceEvent(webhookEvent, 'person')
        } else if (type.startsWith('issuing_dispute.')) {
          await recordStripeWebhookResourceEvent(webhookEvent, 'issuing_dispute')
        }
        break
      }
    }
  } catch (err: any) {
    webhookStatus = 'error'
    webhookSummary = err?.message
      ? `Error processing ${webhookEvent.type}: ${err.message}`
      : `Error processing ${webhookEvent.type}`
    console.error('stripeWebhook handler error:', err)
  }

  try {
    await recordStripeWebhookEvent({
      event: webhookEvent,
      status: webhookStatus,
      summary: webhookSummary,
    })
  } catch (err) {
    console.warn('stripeWebhook: failed to log webhook event', err)
  }

  if (webhookStatus === 'error') {
    return {statusCode: 200, body: JSON.stringify({received: true, hint: 'internal error logged'})}
  }

  return {statusCode: 200, body: JSON.stringify({received: true, status: webhookStatus})}
}

// Netlify picks up the named export automatically; avoid duplicate exports.
