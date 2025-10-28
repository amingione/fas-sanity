import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import type {CartItem} from '../lib/cartEnrichment'
import {createClient} from '@sanity/client'
import {randomUUID} from 'crypto'
import {generatePackingSlipAsset} from '../lib/packingSlip'
import {syncOrderToShipStation} from '../lib/shipstation'
import {mapStripeLineItem} from '../lib/stripeCartItem'
import {enrichCartItemsFromSanity} from '../lib/cartEnrichment'
import {updateCustomerProfileForOrder} from '../lib/customerSnapshot'
import {buildStripeSummary} from '../lib/stripeSummary'
import {resolveStripeShippingDetails} from '../lib/stripeShipping'
import {normalizeMetadataEntries} from '@fas/sanity-config/utils/cartItemDetails'

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

async function buildCartFromSessionLineItems(
  sessionId: string,
  metadata: Record<string, string>,
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
    console.warn('stripeWebhook: listLineItems failed', err)
    return []
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
  },
) {
  const metadata = (session.metadata || {}) as Record<string, string>
  const cart = await buildCartFromSessionLineItems(session.id, metadata)
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
  const baseDoc: Record<string, any> = {
    stripeSessionId: session.id,
    clientReferenceId: session.client_reference_id || undefined,
    status: 'expired',
    paymentStatus: (session.payment_status || 'pending').toString(),
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

  const existing = await sanity.fetch<{_id: string} | null>(
    `*[_type == "expiredCart" && stripeSessionId == $sid][0]{_id}`,
    {sid: session.id},
  )

  const eventRecord = buildOrderEventRecord({
    eventType: opts.reason,
    status: 'expired',
    label: 'Checkout expired',
    message: opts.failureMessage,
    stripeEventId: opts.stripeEventId,
    occurredAt: opts.eventCreated,
    metadata,
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
  const billingAddress = buildBillingAddress(
    customer.address,
    customer.name || customer.shipping?.name,
  )

  const setOps: Record<string, any> = {
    stripeCustomerId: customer.id,
    stripeLastSyncedAt: new Date().toISOString(),
  }

  if (shippingText) setOps.address = shippingText
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
): Promise<Stripe.PaymentIntent | null> {
  if (!resource) return null
  if (typeof resource !== 'string') return resource
  if (!stripe) return null
  try {
    return await stripe.paymentIntents.retrieve(resource)
  } catch (err) {
    console.warn('stripeWebhook: unable to load payment intent for diagnostics', err)
    return null
  }
}

type OrderPaymentStatusInput = {
  paymentStatus: string
  orderStatus?: 'paid' | 'fulfilled' | 'shipped' | 'cancelled' | 'refunded' | 'closed' | 'expired'
  invoiceStatus?: 'pending' | 'paid' | 'refunded' | 'cancelled'
  invoiceStripeStatus?: string
  paymentIntentId?: string
  chargeId?: string
  stripeSessionId?: string
  additionalOrderFields?: Record<string, any>
  additionalInvoiceFields?: Record<string, any>
  preserveExistingFailureDiagnostics?: boolean
  event?: EventRecordInput
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
  } | null>(
    `*[_type == "order" && (
      ($pi != '' && paymentIntentId == $pi) ||
      ($charge != '' && chargeId == $charge) ||
      ($session != '' && stripeSessionId == $session)
    )][0]{ _id, orderNumber, customerRef, customerEmail, paymentFailureCode, paymentFailureMessage, invoiceRef->{ _id } }`,
    params,
  )

  if (!order?._id) return false

  const orderPatch: Record<string, any> = {
    paymentStatus,
    stripeLastSyncedAt: new Date().toISOString(),
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
    if (order.orderNumber) {
      const byOrderNumber = await sanity.fetch<string | null>(
        `*[_type == "invoice" && (orderNumber == $orderNumber || orderRef._ref == $orderId || orderRef->_ref == $orderId)][0]._id`,
        {orderNumber: order.orderNumber, orderId: order._id},
      )
      if (byOrderNumber) return byOrderNumber
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

async function handleCheckoutExpired(
  session: Stripe.Checkout.Session,
  context: {stripeEventId?: string; eventCreated?: number | null} = {},
): Promise<void> {
  const timestamp = new Date().toISOString()
  const failureCode = 'checkout.session.expired'
  const email = (session.customer_details?.email || session.customer_email || '').toString().trim()
  const expiresAt =
    typeof session.expires_at === 'number'
      ? new Date(session.expires_at * 1000).toISOString()
      : null
  let failureMessage = 'Checkout session expired before payment was completed.'
  if (email) failureMessage = `${failureMessage} Customer: ${email}.`
  if (expiresAt) failureMessage = `${failureMessage} Expired at ${expiresAt}.`
  failureMessage = `${failureMessage} (session ${session.id})`
  const amountTotal = toMajorUnits(session.amount_total ?? undefined)
  const summary = buildStripeSummary({
    session,
    failureCode,
    failureMessage,
    eventType: 'checkout.session.expired',
    eventCreated: session.created || null,
  })

  const orderId = await sanity.fetch<string | null>(
    `*[_type == "order" && stripeSessionId == $sid][0]._id`,
    {sid: session.id},
  )
  if (orderId) {
    try {
      await sanity
        .patch(orderId)
        .set({
          status: 'expired',
          paymentStatus: 'expired',
          stripeLastSyncedAt: timestamp,
          paymentFailureCode: failureCode,
          paymentFailureMessage: failureMessage,
          stripeSummary: summary,
        })
        .commit({autoGenerateArrayKeys: true})
      await appendOrderEvent(orderId, {
        eventType: 'checkout.session.expired',
        status: 'expired',
        label: 'Checkout expired',
        message: failureMessage,
        amount: amountTotal,
        currency: (session.currency || '').toString().toUpperCase(),
        stripeEventId: context.stripeEventId,
        occurredAt: context.eventCreated ?? session.created,
        metadata: session.metadata as Record<string, string>,
      })
    } catch (err) {
      console.warn('stripeWebhook: failed to update order after checkout expiration', err)
    }
  }

  const meta = (session.metadata || {}) as Record<string, string>
  const invoiceMetaId = normalizeSanityId(meta['sanity_invoice_id'])
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

  if (!orderId) {
    await recordExpiredCart(session, {
      reason: 'checkout.session.expired',
      failureCode,
      failureMessage,
      stripeEventId: context.stripeEventId,
      eventCreated: context.eventCreated ?? session.created,
    })
  }
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

  try {
    switch (webhookEvent.type) {
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

      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.updated': {
        try {
          const invoice = webhookEvent.data.object as Stripe.Invoice
          await syncStripeInvoice(invoice)

          const shouldRecordFailure =
            webhookEvent.type === 'invoice.payment_failed' ||
            (webhookEvent.type === 'invoice.updated' && invoice.status === 'uncollectible')

          if (shouldRecordFailure) {
            const paymentIntent = await fetchPaymentIntentResource((invoice as any).payment_intent)
            if (paymentIntent) {
              await markPaymentIntentFailure(paymentIntent)
            }
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to sync invoice', err)
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

      case 'charge.refunded':
      case 'charge.refund.created':
      case 'charge.refund.updated': {
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
            const matchingRefund = charge.refunds.data.find((entry) => entry.id === (isRefundObject ? (raw as Stripe.Refund).id : undefined))
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

          const refundStatus = typeof refund?.status === 'string' ? refund.status : undefined
          const refundSucceeded = refundStatus === 'succeeded' || Boolean(charge?.refunded)
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
            invoiceStatus: refundSucceeded && isFullRefund ? 'refunded' : undefined,
            invoiceStripeStatus: webhookEvent.type,
            additionalOrderFields: {
              ...(refundedAmount !== undefined ? {amountRefunded: refundedAmount} : {}),
              ...(refund?.id ? {lastRefundId: refund.id} : {}),
              ...(refund?.status ? {lastRefundStatus: refund.status} : {}),
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
            event: {
              eventType: webhookEvent.type,
              label: refund?.id ? `Refund ${refund.id}` : 'Charge refunded',
              message:
                refund?.status || refund?.amount
                  ? [
                      refund?.status ? `Refund ${refund.status}` : null,
                      refundedAmount !== undefined
                        ? `Amount ${refundedAmount.toFixed(2)} ${(refund?.currency || charge?.currency || '')
                            .toString()
                            .toUpperCase()}`
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
            },
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge refund', err)
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
            paymentIntent = await stripe.paymentIntents.retrieve(String(session.payment_intent))
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
        if (['paid', 'succeeded', 'complete', 'no_payment_required'].includes(normalizedPaymentStatus)) {
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
        else if (paymentStatus === 'cancelled' || paymentStatus === 'failed') derivedOrderStatus = 'cancelled'
        else derivedOrderStatus = 'paid'
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
        let chargeId: string | undefined
        let cardBrand: string | undefined
        let cardLast4: string | undefined
        let receiptUrl: string | undefined
        let chargeBillingName: string | undefined
        try {
          const ch = (paymentIntent as any)?.charges?.data?.[0]
          if (ch) {
            chargeId = ch.id || undefined
            receiptUrl = ch.receipt_url || undefined
            const c = ch.payment_method_details?.card
            cardBrand = c?.brand || undefined
            cardLast4 = c?.last4 || undefined
            chargeBillingName = ch?.billing_details?.name || undefined
          }
        } catch {}

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

        const invoiceId = metadata['sanity_invoice_id']
        const metadataCustomerName = (metadata['bill_to_name'] || metadata['customer_name'] || '')
          .toString()
          .trim()

        // 2) Gather enriched data: line items + shipping
        const cart: CartItem[] = await buildCartFromSessionLineItems(stripeSessionId, metadata)

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

          const orderSlug = createOrderSlug(orderNumber, stripeSessionId)
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
              message: `Order ${orderNumber || orderId} created from checkout ${stripeSessionId}`,
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
            try {
              await syncOrderToShipStation(sanity, orderId)
            } catch (err) {
              console.warn('stripeWebhook: ShipStation sync failed', err)
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

          const metadataOrderNumberRaw = (
            meta['order_number'] ||
            meta['orderNo'] ||
            meta['website_order_number'] ||
            ''
          )
            .toString()
            .trim()
          const metadataInvoiceNumber = (
            meta['sanity_invoice_number'] ||
            meta['invoice_number'] ||
            ''
          )
            .toString()
            .trim()
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
            orderNumber,
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
          }
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
          const intentSlug = createOrderSlug(orderNumber, pi.id)
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
            try {
              await syncOrderToShipStation(sanity, orderId)
            } catch (err) {
              console.warn('stripeWebhook: ShipStation sync failed', err)
            }
          }

          if (shouldSendConfirmation && orderId) {
            try {
              await sendOrderConfirmationEmail({
                to: normalizedEmail,
                orderNumber,
                customerName,
                items: [],
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
      default:
        // Ignore other events quietly
        break
    }

    return {statusCode: 200, body: JSON.stringify({received: true})}
  } catch (err: any) {
    console.error('stripeWebhook handler error:', err)
    // Return 200 to avoid aggressive retries if our internal handling fails non-critically
    return {statusCode: 200, body: JSON.stringify({received: true, hint: 'internal error logged'})}
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
