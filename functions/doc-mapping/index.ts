import type {SanityClient, SanityDocument} from '@sanity/client'

/**
 * Local fallbacks for cart item detail utilities to avoid relying on an external package.
 * These implementations provide minimal, defensive behavior expected by this module.
 */
const coerceStringArray = (value: unknown): string[] => {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''))
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    // Accept comma-separated strings as a convenience
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }
  return []
}

const uniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>()
  const output: string[] = []
  for (const v of values) {
    const s = v?.toString().trim()
    if (s && !seen.has(s)) {
      seen.add(s)
      output.push(s)
    }
  }
  return output
}

/**
 * Lightweight helper mirroring the Sanity defineDocumentFunction API shape.
 * Keeping this local avoids type-resolution issues while allowing the blueprint
 * runtime to understand the exported object structure.
 */
export type DocumentFunctionEvent<TDocument extends SanityDocument = SanityDocument> = {
  /** The identifier for the document that triggered the function. */
  documentId?: string
  /** The latest snapshot of the document after the change. */
  document?: TDocument | null
  /** The snapshot prior to the change, if available. */
  previousDocument?: TDocument | null
  /** Operation type (create/update/delete). */
  operation?: string
  /** Timestamp emitted with the event. */
  timestamp?: string
}

export type DocumentFunctionContext = {
  client: SanityClient
  /** Optional structured logger made available by the runtime. */
  logger?: {
    info: (...payload: any[]) => void
    warn: (...payload: any[]) => void
    error: (...payload: any[]) => void
  }
  /** Convenience dataset/project metadata if surfaced by the runtime. */
  projectId?: string
  dataset?: string
}

export type DocumentFunctionDefinition<TDocument extends SanityDocument = SanityDocument> = {
  name: string
  title?: string
  description?: string
  /** Groq filter that determines which events invoke the function. */
  filter: string
  /** Groq projection applied to the triggering document snapshot. */
  projection: string
  on?: ('create' | 'update' | 'delete' | 'appear' | 'disappear')[]
  /**
   * Core handler executed when a document matches the filter & projection.
   * Returning void signals success; thrown errors propagate to the runtime.
   */
  execute: (
    event: DocumentFunctionEvent<TDocument>,
    context: DocumentFunctionContext,
  ) => Promise<void>
}

export const defineDocumentFunction = <TDocument extends SanityDocument>(
  definition: DocumentFunctionDefinition<TDocument>,
): DocumentFunctionDefinition<TDocument> => definition

type ReferenceLike = {_type?: string; _ref?: string | null}

type RelationshipLog = {
  targetId: string
  targetType: string
  action: 'created' | 'updated' | 'unchanged' | 'skipped'
  reason: string
}

type NormalizedDocument = SanityDocument & {
  status?: string | null
  state?: string | null
  orderStatus?: string | null
  paymentStatus?: string | null
  orderNumber?: string | null
  invoiceNumber?: string | null
  invoiceRef?: ReferenceLike | null
  orderRef?: ReferenceLike | null
  createdAt?: string | null
  shipTo?: Record<string, unknown> | null
  ship_to?: Record<string, unknown> | null
  ship_from?: Record<string, unknown> | null
  weight?: Record<string, unknown> | null
  dimensions?: Record<string, unknown> | null
  shippingCarrier?: string | null
  shippingLabelUrl?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  packingSlipUrl?: string | null
  tags?: unknown
  slug?: {current?: string | null} | null
  sku?: string | null
  customerName?: string | null
  customerEmail?: string | null
  customerRef?: ReferenceLike | null
  customer?: ReferenceLike | null
  paymentIntentId?: string | null
  stripePaymentIntentStatus?: string | null
  cardBrand?: string | null
  cardLast4?: string | null
  receiptUrl?: string | null
  stripeSummary?: Record<string, unknown> | null
  stripeSource?: string | null
  stripeCheckoutStatus?: string | null
  stripeCheckoutMode?: string | null
  stripeSessionId?: string | null
  stripeSessionStatus?: string | null
  stripeCreatedAt?: string | null
  stripeLastSyncedAt?: string | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountShipping?: number | null
  totalAmount?: number | null
  currency?: string | null
  cart?: Array<Record<string, unknown>> | null
  shippingAddress?: Record<string, unknown> | null
  selectedService?: Record<string, unknown> | null
  selectedShippingAmount?: number | null
  selectedShippingCurrency?: string | null
  shippingDeliveryDays?: number | null
  shippingEstimatedDeliveryDate?: string | null
  shippingServiceCode?: string | null
  shippingServiceName?: string | null
  shippingMetadata?: Record<string, unknown> | null
  shippingLog?: Array<Record<string, unknown>> | null
  orderEvents?: Array<Record<string, unknown>> | null
  metadata?: Record<string, unknown> | null
  paymentFailureCode?: string | null
  paymentFailureMessage?: string | null
  serviceSelection?: string | null
}

const PROJECTION_FIELDS = `
  ...,
  invoiceRef,
  orderRef,
  shipTo,
  ship_to,
  ship_from,
  weight,
  dimensions,
  shippingCarrier,
  shippingLabelUrl,
  labelUrl,
  trackingNumber,
  trackingUrl,
  packingSlipUrl,
  orderNumber,
  invoiceNumber,
  tags,
  slug,
  sku,
  customerName,
  customerEmail,
  customerRef,
  customer,
  paymentIntentId,
  stripePaymentIntentStatus,
  cardBrand,
  cardLast4,
  receiptUrl,
  stripeSummary,
  stripeSource,
  stripeCheckoutStatus,
  stripeCheckoutMode,
  stripeSessionId,
  stripeSessionStatus,
  stripeCreatedAt,
  stripeLastSyncedAt,
  amountSubtotal,
  amountTax,
  amountShipping,
  totalAmount,
  currency,
  cart,
  shippingAddress,
  selectedService,
  selectedShippingAmount,
  selectedShippingCurrency,
  shippingDeliveryDays,
  shippingEstimatedDeliveryDate,
  shippingServiceCode,
  shippingServiceName,
  shippingMetadata,
  shippingLog,
  orderEvents,
  metadata,
  paymentFailureCode,
  paymentFailureMessage,
  serviceSelection
`

const mapIdForDocument = (documentId: string) => `map-${documentId}`
const mapTypeForDocument = (documentType: string) => `map-${documentType}`

const getLogger = (context: DocumentFunctionContext) => {
  const fallback = console
  return context.logger || fallback
}

const normalizeId = (id: string | undefined | null) => (id ? id.replace(/^drafts\./, '') : '')

const asReference = (id: string) => ({_type: 'reference', _ref: id})

const normalizeTagValue = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const maybeValue = (value as Record<string, unknown>).value
    if (typeof maybeValue === 'string') return maybeValue
    const maybeLabel = (value as Record<string, unknown>).label
    if (typeof maybeLabel === 'string') return maybeLabel
  }
  return null
}

const collectTags = (document: NormalizedDocument): Set<string> => {
  const output = new Set<string>()
  const raw = document.tags
  if (!raw) return output
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const tag = normalizeTagValue(item)
      if (tag) output.add(tag.toLowerCase())
    }
    return output
  }
  const single = normalizeTagValue(raw)
  if (single) output.add(single.toLowerCase())
  return output
}

const normalizeStatus = (document: NormalizedDocument): string => {
  const candidates = [document.status, document.state, document.orderStatus, document.paymentStatus]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().toLowerCase()
  }
  return ''
}

const extractReferences = (
  value: unknown,
  path: (string | number)[] = [],
  acc: string[] = [],
): string[] => {
  if (!value) return acc
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      extractReferences(value[index], [...path, index], acc)
    }
    return acc
  }
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>
    if (candidate._type === 'reference' && typeof candidate._ref === 'string' && candidate._ref) {
      acc.push(candidate._ref)
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (key === '_ref' || key === '_type') continue
      extractReferences(child, [...path, key], acc)
    }
  }
  return acc
}

const dedupe = <T>(values: T[]): T[] => Array.from(new Set(values))

const isPresent = <T>(value: T | undefined | null): value is T =>
  value !== undefined && value !== null

const toCleanString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

const toCleanNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const toCleanStringArray = (value: unknown, limit = 10): string[] | undefined => {
  const coerced = uniqueStrings(coerceStringArray(value))
  if (!coerced.length) return undefined
  return coerced.slice(0, limit)
}

const limitArray = <T>(value: T[] | undefined, limit = 20): T[] | undefined => {
  if (!value || value.length === 0) return undefined
  return value.slice(0, limit)
}

const cleanValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const items = value.map((entry) => cleanValue(entry)).filter(isPresent)
    return items.length ? items : undefined
  }
  if (typeof value === 'object') {
    const obj: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = cleanValue(child)
      if (cleaned !== undefined) obj[key] = cleaned
    }
    return Object.keys(obj).length ? obj : undefined
  }
  return undefined
}

const sanitizeCartItem = (item: Record<string, unknown>): Record<string, unknown> | undefined => {
  const metadataEntries = Array.isArray(item.metadataEntries)
    ? limitArray(
        item.metadataEntries
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return undefined
            const meta = entry as Record<string, unknown>
            return cleanValue({
              key: toCleanString(meta.key),
              value: toCleanString(meta.value),
              source: toCleanString(meta.source),
            }) as Record<string, unknown> | undefined
          })
          .filter(isPresent),
        20,
      )
    : Array.isArray(item.metadata)
      ? limitArray(
          (item.metadata as Array<unknown>).map((entry) => {
            if (!entry || typeof entry !== 'object') return undefined
            const meta = entry as Record<string, unknown>
            return cleanValue({
              key: toCleanString(meta.key),
              value: toCleanString(meta.value),
              source: toCleanString(meta.source),
            }) as Record<string, unknown> | undefined
          }),
          20,
        )
      : undefined

  const metadataOptionSummary = toCleanString(
    (item.metadata as Record<string, unknown> | undefined)?.option_summary ?? item.optionSummary,
  )
  const metadataUpgrades = toCleanStringArray(
    (item.metadata as Record<string, unknown> | undefined)?.upgrades ?? item.upgrades,
    20,
  )

  const metadataSummary =
    metadataOptionSummary || (metadataUpgrades && metadataUpgrades.length)
      ? (cleanValue({
          option_summary: metadataOptionSummary,
          upgrades: metadataUpgrades,
        }) as Record<string, unknown> | undefined)
      : undefined

  const result = cleanValue({
    id: toCleanString(item.id),
    productSlug: toCleanString(item.productSlug),
    stripeProductId: toCleanString(item.stripeProductId),
    stripePriceId: toCleanString(item.stripePriceId),
    sku: toCleanString(item.sku),
    name: toCleanString(item.name),
    productName: toCleanString(item.productName),
    description: toCleanString(item.description),
    optionSummary: toCleanString(item.optionSummary),
    optionDetails: toCleanStringArray(item.optionDetails, 20),
    upgrades: toCleanStringArray(item.upgrades, 20),
    customizations: toCleanStringArray(item.customizations, 20),
    price: toCleanNumber(item.price),
    quantity: toCleanNumber(item.quantity),
    categories: toCleanStringArray(item.categories, 20),
    metadata: metadataSummary,
    metadataEntries,
  })

  return (
    (result && typeof result === 'object' ? (result as Record<string, unknown>) : undefined) ??
    undefined
  )
}

const sanitizeOrderEvents = (
  events: Array<Record<string, unknown>> | undefined | null,
  limit = 25,
): Array<Record<string, unknown>> | undefined => {
  if (!Array.isArray(events)) return undefined
  const items = events
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return undefined
      return cleanValue({
        type: toCleanString(entry.type),
        status: toCleanString(entry.status),
        label: toCleanString(entry.label),
        message: toCleanString(entry.message),
        amount: toCleanNumber(entry.amount),
        currency: toCleanString(entry.currency),
        stripeEventId: toCleanString(entry.stripeEventId),
        createdAt: toCleanString(entry.createdAt),
      }) as Record<string, unknown> | undefined
    })
    .filter(isPresent)

  if (!items.length) return undefined
  return items.slice(0, limit)
}

const sanitizeShippingLog = (
  entries: Array<Record<string, unknown>> | undefined | null,
  limit = 25,
): Array<Record<string, unknown>> | undefined => {
  if (!Array.isArray(entries)) return undefined
  const items = entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return undefined
      return cleanValue({
        status: toCleanString(entry.status),
        message: toCleanString(entry.message),
        trackingNumber: toCleanString(entry.trackingNumber),
        trackingUrl: toCleanString(entry.trackingUrl),
        createdAt: toCleanString(entry.createdAt),
      }) as Record<string, unknown> | undefined
    })
    .filter(isPresent)

  if (!items.length) return undefined
  return items.slice(0, limit)
}

const buildMappingSummary = (document: NormalizedDocument): Record<string, unknown> | null => {
  const baseMeta = cleanValue({
    status: normalizeStatus(document) || undefined,
    tags: Array.from(collectTags(document)),
    updatedAt: document._updatedAt || document._createdAt || undefined,
    orderNumber: toCleanString(document.orderNumber),
    invoiceNumber: toCleanString(document.invoiceNumber),
    createdAt: toCleanString(document.createdAt || document._createdAt),
  }) as Record<string, unknown> | undefined

  if (document._type === 'order') {
    const cartItems = Array.isArray(document.cart)
      ? limitArray(
          document.cart
            .map((item) =>
              item && typeof item === 'object'
                ? sanitizeCartItem(item as Record<string, unknown>)
                : undefined,
            )
            .filter(isPresent),
          25,
        )
      : undefined

    const summary = cleanValue({
      ...baseMeta,
      customer: cleanValue({
        name: toCleanString(document.customerName),
        email: toCleanString(document.customerEmail),
        referenceId: toCleanString(document.customerRef?._ref || document.customer?._ref),
      }),
      totals: cleanValue({
        total: toCleanNumber(document.totalAmount),
        subtotal: toCleanNumber(document.amountSubtotal),
        tax: toCleanNumber(document.amountTax),
        shipping: toCleanNumber(document.amountShipping),
        currency: toCleanString(document.currency),
      }),
      payment: cleanValue({
        paymentStatus: toCleanString(document.paymentStatus || document.stripePaymentIntentStatus),
        paymentIntentId: toCleanString(document.paymentIntentId),
        stripeIntentStatus: toCleanString(document.stripePaymentIntentStatus),
        cardBrand: toCleanString(document.cardBrand),
        cardLast4: toCleanString(document.cardLast4),
        receiptUrl: toCleanString(document.receiptUrl),
        failureCode: toCleanString(document.paymentFailureCode),
        failureMessage: toCleanString(document.paymentFailureMessage),
      }),
      stripe: cleanValue({
        source: toCleanString(document.stripeSource),
        checkoutSessionId: toCleanString(document.stripeSessionId),
        checkoutStatus: toCleanString(
          document.stripeCheckoutStatus || document.stripeSessionStatus,
        ),
        checkoutMode: toCleanString(document.stripeCheckoutMode),
        createdAt: toCleanString(document.stripeCreatedAt),
        lastSyncedAt: toCleanString(document.stripeLastSyncedAt),
        summary: cleanValue(document.stripeSummary),
      }),
      shipping: cleanValue({
        address: cleanValue(document.shippingAddress),
        selectedRate: cleanValue(document.selectedService),
        selectedAmount: toCleanNumber(document.selectedShippingAmount),
        selectedCurrency: toCleanString(document.selectedShippingCurrency),
        deliveryDays: toCleanNumber(document.shippingDeliveryDays),
        estimatedDeliveryDate: toCleanString(document.shippingEstimatedDeliveryDate),
        serviceCode: toCleanString(document.shippingServiceCode),
        serviceName: toCleanString(document.shippingServiceName),
        metadata: cleanValue(document.shippingMetadata),
      }),
      fulfillment: cleanValue({
        carrier: toCleanString(document.shippingCarrier),
        weight: cleanValue(document.weight),
        dimensions: cleanValue(document.dimensions),
        shippingLabelUrl: toCleanString(document.shippingLabelUrl),
        trackingNumber: toCleanString(document.trackingNumber),
        trackingUrl: toCleanString(document.trackingUrl),
        packingSlipUrl: toCleanString(document.packingSlipUrl),
      }),
      cart: cartItems,
      events: sanitizeOrderEvents(document.orderEvents),
      shippingLog: sanitizeShippingLog(document.shippingLog),
    })

    return summary && typeof summary === 'object' ? (summary as Record<string, unknown>) : null
  }

  if (document._type === 'invoice') {
    const summary = cleanValue({
      ...baseMeta,
      orderRefId: toCleanString(document.orderRef?._ref),
      customerRefId: toCleanString(document.customerRef?._ref || document.customer?._ref),
      status: toCleanString(document.status || document.paymentStatus),
      amounts: cleanValue({
        shipping: toCleanNumber(document.amountShipping),
        currency: toCleanString(document.currency),
      }),
      shipping: cleanValue({
        shipTo: cleanValue(document.shipTo),
        weight: cleanValue(document.weight),
        dimensions: cleanValue(document.dimensions),
        carrier: toCleanString(document.shippingCarrier),
      }),
      fulfillment: cleanValue({
        shippingLabelUrl: toCleanString(document.shippingLabelUrl),
        trackingNumber: toCleanString(document.trackingNumber),
        trackingUrl: toCleanString(document.trackingUrl),
      }),
      stripe: cleanValue({
        summary: cleanValue(document.stripeSummary),
      }),
    })

    return summary && typeof summary === 'object' ? (summary as Record<string, unknown>) : null
  }

  if (document._type === 'shippingLabel') {
    const summary = cleanValue({
      ...baseMeta,
      shipFrom: cleanValue(document.ship_from),
      shipTo: cleanValue(document.shipTo || document.ship_to),
      weight: cleanValue(document.weight),
      dimensions: cleanValue(document.dimensions),
      serviceSelection:
        toCleanString(document.shippingCarrier) || toCleanString(document.serviceSelection),
      trackingNumber: toCleanString(document.trackingNumber),
      labelUrl: toCleanString(document.shippingLabelUrl || (document as any).labelUrl),
      metadata: cleanValue(document.metadata),
      links: cleanValue({
        invoiceId: toCleanString(
          (document.metadata as Record<string, unknown> | undefined)?.invoiceId,
        ),
        orderId: toCleanString((document.metadata as Record<string, unknown> | undefined)?.orderId),
      }),
    })

    return summary && typeof summary === 'object' ? (summary as Record<string, unknown>) : null
  }

  if (document._type === 'product') {
    const summary = cleanValue({
      ...baseMeta,
      slug: toCleanString(document.slug?.current),
      sku: toCleanString(document.sku),
    })
    return summary && typeof summary === 'object' ? (summary as Record<string, unknown>) : null
  }

  const fallback = cleanValue({
    ...baseMeta,
    title: toCleanString((document as Record<string, unknown>).title),
    slug: toCleanString(document.slug?.current),
  })

  return fallback && typeof fallback === 'object' ? (fallback as Record<string, unknown>) : null
}

const defaultShipFrom = {
  name: 'FAS Motorsports',
  address_line1: '123 Warehouse Rd',
  city_locality: 'Mooresville',
  state_province: 'NC',
  postal_code: '28117',
  country_code: 'US',
}

const defaultShipTo = {
  name: 'Customer TBD',
  address_line1: '123 Shipping Ln',
  city_locality: 'City',
  state_province: 'NC',
  postal_code: '00000',
  country_code: 'US',
}

const defaultWeight = {value: 1, unit: 'pound'}
const defaultDimensions = {length: 12, width: 9, height: 4}

const generateInvoiceNumber = async (client: SanityClient, prefix: string): Promise<string> => {
  const safePrefix = prefix || 'INV'
  const latest = await client.fetch(
    `*[_type == "invoice" && defined(invoiceNumber) && startswith(invoiceNumber, $prefix)] | order(invoiceNumber desc)[0].invoiceNumber`,
    {prefix: `${safePrefix}-`},
  )

  if (typeof latest === 'string') {
    const [, numeric] = latest.split('-')
    const counter = Number.parseInt(numeric || '0', 10) + 1
    return `${safePrefix}-${counter.toString().padStart(6, '0')}`
  }

  return `${safePrefix}-000001`
}

const ensureReferenceField = async (
  client: SanityClient,
  logger: ReturnType<typeof getLogger>,
  documentId: string,
  fieldName: string,
  referenceId: string,
) => {
  if (!documentId || !referenceId) return
  try {
    await client
      .patch(documentId)
      .set({[fieldName]: asReference(referenceId)})
      .commit({autoGenerateArrayKeys: true})
  } catch (error) {
    logger.warn('[doc-mapping] Failed to set reference field', {
      documentId,
      fieldName,
      referenceId,
      error,
    })
  }
}

const createOrReplaceMappingDoc = async (
  client: SanityClient,
  logger: ReturnType<typeof getLogger>,
  document: NormalizedDocument,
  baseId: string,
  referencedTypes: string[],
  relationships: RelationshipLog[],
  summary: Record<string, unknown> | null,
) => {
  if (!baseId) return
  const mappingId = mapIdForDocument(baseId)
  const mappingType = mapTypeForDocument(document._type || 'unknown')
  const payload = {
    _id: mappingId,
    _type: mappingType,
    source: asReference(baseId),
    sourceType: document._type,
    sourceStatus: normalizeStatus(document),
    sourceTags: Array.from(collectTags(document)),
    referencedTypes,
    updatedAt: new Date().toISOString(),
    summary: summary || null,
    relationships: relationships.map((rel) => ({
      _key: rel.targetId,
      target: asReference(rel.targetId),
      targetType: rel.targetType,
      action: rel.action,
      reason: rel.reason,
      updatedAt: new Date().toISOString(),
    })),
  }

  try {
    await client.createOrReplace(payload)
  } catch (error) {
    logger.error('[doc-mapping] Failed to upsert mapping document', {mappingId, mappingType, error})
  }
}

const ensureInvoiceForOrder = async (
  document: NormalizedDocument,
  context: DocumentFunctionContext,
  baseId: string,
  status: string,
  tags: Set<string>,
): Promise<RelationshipLog | null> => {
  const logger = getLogger(context)
  const client = context.client
  const shouldCreate =
    tags.has('requires-invoice') ||
    tags.has('needs-invoice') ||
    ['paid', 'fulfilled', 'shipped', 'completed', 'complete'].includes(status)

  const existingRef = document.invoiceRef?._ref ? normalizeId(document.invoiceRef?._ref) : ''
  const orderNumber =
    typeof document.orderNumber === 'string' && document.orderNumber.trim()
      ? document.orderNumber.trim()
      : undefined
  const invoiceIdentifier = existingRef || `invoice-${orderNumber || baseId}`

  if (!shouldCreate) {
    logger.info('[doc-mapping] Order skipped invoice sync', {
      orderId: baseId,
      status,
      tags: Array.from(tags),
    })
    return {
      targetId: invoiceIdentifier,
      targetType: 'invoice',
      action: 'skipped',
      reason: 'Order not marked for invoicing',
    }
  }

  let invoiceDoc: NormalizedDocument | null = null
  try {
    invoiceDoc = await client.fetch(`*[_id == $id][0]`, {id: invoiceIdentifier})
  } catch (error) {
    logger.warn('[doc-mapping] Unable to read invoice candidate', {invoiceIdentifier, error})
  }

  let action: RelationshipLog['action'] = 'unchanged'
  const prefix =
    (process.env.SANITY_STUDIO_INVOICE_PREFIX || process.env.INVOICE_PREFIX || 'INV')
      .toString()
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase() || 'INV'

  const invoiceNumber =
    (typeof invoiceDoc?.invoiceNumber === 'string' && invoiceDoc.invoiceNumber) ||
    (orderNumber && /^[a-z0-9-]+$/i.test(orderNumber)
      ? orderNumber
      : await generateInvoiceNumber(client, prefix))

  const invoicePayload: Record<string, unknown> = {
    _id: invoiceIdentifier,
    _type: 'invoice',
    title: orderNumber ? `Invoice ${orderNumber}` : `Invoice for ${baseId}`,
    invoiceNumber,
    orderNumber: orderNumber || invoiceNumber,
    orderRef: asReference(baseId),
    status: invoiceDoc?.status || (status === 'paid' ? 'paid' : 'pending'),
    customerRef: document.customerRef || document.customer || undefined,
    shipTo: document.shipTo || invoiceDoc?.shipTo || null,
    weight: document.weight || invoiceDoc?.weight || null,
    dimensions: document.dimensions || invoiceDoc?.dimensions || null,
    amountShipping: document.amountShipping || invoiceDoc?.amountShipping || null,
    metadata: {
      orderId: baseId,
      syncedAt: new Date().toISOString(),
      source: 'doc-mapping',
    },
  }

  try {
    if (!invoiceDoc) {
      await client.create(invoicePayload as unknown as SanityDocument)
      action = 'created'
      logger.info('[doc-mapping] Created invoice for order', {
        orderId: baseId,
        invoiceId: invoiceIdentifier,
      })
    } else {
      const patchSet: Record<string, unknown> = {}
      if (!invoiceDoc.orderRef?._ref || normalizeId(invoiceDoc.orderRef._ref) !== baseId) {
        patchSet.orderRef = asReference(baseId)
      }
      if (!invoiceDoc.invoiceNumber) patchSet.invoiceNumber = invoiceNumber
      if (!invoiceDoc.orderNumber && orderNumber) patchSet.orderNumber = orderNumber
      if (
        document.shipTo &&
        JSON.stringify(document.shipTo) !== JSON.stringify(invoiceDoc.shipTo)
      ) {
        patchSet.shipTo = document.shipTo
      }
      if (
        document.weight &&
        JSON.stringify(document.weight) !== JSON.stringify(invoiceDoc.weight)
      ) {
        patchSet.weight = document.weight
      }
      if (
        document.dimensions &&
        JSON.stringify(document.dimensions) !== JSON.stringify(invoiceDoc.dimensions)
      ) {
        patchSet.dimensions = document.dimensions
      }
      if (document.amountShipping && document.amountShipping !== invoiceDoc.amountShipping) {
        patchSet.amountShipping = document.amountShipping
      }
      if (Object.keys(patchSet).length > 0) {
        await client.patch(invoiceIdentifier).set(patchSet).commit({autoGenerateArrayKeys: true})
        action = 'updated'
        logger.info('[doc-mapping] Updated invoice linkage', {
          orderId: baseId,
          invoiceId: invoiceIdentifier,
          patchSet,
        })
      }
    }
  } catch (error) {
    logger.error('[doc-mapping] Failed to upsert invoice', {
      orderId: baseId,
      invoiceId: invoiceIdentifier,
      error,
    })
    return {
      targetId: invoiceIdentifier,
      targetType: 'invoice',
      action: 'skipped',
      reason: 'Invoice upsert failed',
    }
  }

  await ensureReferenceField(client, logger, baseId, 'invoiceRef', invoiceIdentifier)
  await ensureReferenceField(client, logger, `drafts.${baseId}`, 'invoiceRef', invoiceIdentifier)
  await ensureReferenceField(client, logger, invoiceIdentifier, 'orderRef', baseId)

  return {
    targetId: invoiceIdentifier,
    targetType: 'invoice',
    action,
    reason:
      action === 'created' ? 'Invoice created for fulfilled order' : 'Invoice synced with order',
  }
}

const ensureShippingLabelForInvoice = async (
  document: NormalizedDocument,
  context: DocumentFunctionContext,
  baseId: string,
  status: string,
  tags: Set<string>,
): Promise<RelationshipLog | null> => {
  const logger = getLogger(context)
  const client = context.client
  const shouldCreate =
    tags.has('requires-shipping') ||
    tags.has('ship-now') ||
    ['paid', 'fulfilled', 'ready-to-ship', 'ready_to_ship'].includes(status)

  const invoiceNumber =
    typeof document.invoiceNumber === 'string' && document.invoiceNumber.trim()
      ? document.invoiceNumber.trim()
      : undefined
  const shippingLabelId = `shippingLabel-${invoiceNumber || baseId}`

  if (!shouldCreate && !document.shippingLabelUrl && !document.trackingNumber) {
    logger.info('[doc-mapping] Invoice skipped shipping label sync', {
      invoiceId: baseId,
      status,
      tags: Array.from(tags),
    })
    return {
      targetId: shippingLabelId,
      targetType: 'shippingLabel',
      action: 'skipped',
      reason: 'Invoice not ready for shipping',
    }
  }

  let shippingDoc: NormalizedDocument | null = null
  try {
    shippingDoc = await client.fetch(`*[_id == $id][0]`, {id: shippingLabelId})
  } catch (error) {
    logger.warn('[doc-mapping] Unable to read shipping label candidate', {shippingLabelId, error})
  }

  const shipTo =
    (document.shipTo as Record<string, unknown> | null) || shippingDoc?.ship_to || defaultShipTo
  const shipFrom =
    (document.ship_from as Record<string, unknown> | null) ||
    shippingDoc?.ship_from ||
    defaultShipFrom
  const weight =
    (document.weight as Record<string, unknown> | null) || shippingDoc?.weight || defaultWeight
  const dimensions =
    (document.dimensions as Record<string, unknown> | null) ||
    shippingDoc?.dimensions ||
    defaultDimensions

  const payload = {
    _id: shippingLabelId,
    _type: 'shippingLabel',
    name: invoiceNumber ? `Label ${invoiceNumber}` : `Label for ${baseId}`,
    ship_from: shipFrom,
    ship_to: shipTo,
    weight,
    dimensions,
    serviceSelection: document.shippingCarrier || shippingDoc?.serviceSelection || 'ups_ground',
    trackingNumber: document.trackingNumber || shippingDoc?.trackingNumber || null,
    labelUrl: document.shippingLabelUrl || shippingDoc?.labelUrl || null,
    metadata: {
      invoiceId: baseId,
      syncedAt: new Date().toISOString(),
      source: 'doc-mapping',
    },
  }

  let action: RelationshipLog['action'] = 'unchanged'
  try {
    if (!shippingDoc) {
      await client.create(payload as unknown as SanityDocument)
      action = 'created'
      logger.info('[doc-mapping] Created shipping label shell', {
        invoiceId: baseId,
        shippingLabelId,
      })
    } else {
      const patchSet: Record<string, unknown> = {}
      if (JSON.stringify(shipTo) !== JSON.stringify(shippingDoc.ship_to)) patchSet.ship_to = shipTo
      if (JSON.stringify(shipFrom) !== JSON.stringify(shippingDoc.ship_from))
        patchSet.ship_from = shipFrom
      if (JSON.stringify(weight) !== JSON.stringify(shippingDoc.weight)) patchSet.weight = weight
      if (JSON.stringify(dimensions) !== JSON.stringify(shippingDoc.dimensions))
        patchSet.dimensions = dimensions
      if (document.shippingCarrier && document.shippingCarrier !== shippingDoc.serviceSelection) {
        patchSet.serviceSelection = document.shippingCarrier
      }
      if (document.shippingLabelUrl && document.shippingLabelUrl !== shippingDoc.labelUrl) {
        patchSet.labelUrl = document.shippingLabelUrl
      }
      if (document.trackingNumber && document.trackingNumber !== shippingDoc.trackingNumber) {
        patchSet.trackingNumber = document.trackingNumber
      }

      if (Object.keys(patchSet).length > 0) {
        await client.patch(shippingLabelId).set(patchSet).commit({autoGenerateArrayKeys: true})
        action = 'updated'
        logger.info('[doc-mapping] Updated shipping label from invoice', {
          invoiceId: baseId,
          shippingLabelId,
          patchSet,
        })
      }
    }
  } catch (error) {
    logger.error('[doc-mapping] Failed to upsert shipping label', {
      invoiceId: baseId,
      shippingLabelId,
      error,
    })
    return {
      targetId: shippingLabelId,
      targetType: 'shippingLabel',
      action: 'skipped',
      reason: 'Shipping label upsert failed',
    }
  }

  return {
    targetId: shippingLabelId,
    targetType: 'shippingLabel',
    action,
    reason:
      action === 'created'
        ? 'Shipping label scaffolded from invoice'
        : action === 'updated'
          ? 'Shipping label synced with invoice'
          : 'Shipping label already linked',
  }
}

const ensureProductMap = async (
  document: NormalizedDocument,
  context: DocumentFunctionContext,
  baseId: string,
  referencedTypes: string[],
  tags: Set<string>,
): Promise<RelationshipLog | null> => {
  const logger = getLogger(context)
  const client = context.client
  const slug = document.slug?.current?.trim()
  const sku = typeof document.sku === 'string' ? document.sku.trim() : ''
  const identifier = slug || sku || baseId
  const mapDocId = `map-product-${identifier}`

  const payload = {
    _id: mapDocId,
    _type: 'productMap',
    product: asReference(baseId),
    productSku: sku || null,
    productSlug: slug || null,
    status: normalizeStatus(document),
    tags: Array.from(tags),
    referencedTypes,
    syncedAt: new Date().toISOString(),
  }

  let action: RelationshipLog['action'] = 'unchanged'
  try {
    const existing = await client.fetch(`*[_id == $id][0]`, {id: mapDocId})
    if (!existing) {
      await client.create(payload as unknown as SanityDocument)
      action = 'created'
      logger.info('[doc-mapping] Created product mapping', {productId: baseId, mapId: mapDocId})
    } else {
      const patchSet: Record<string, unknown> = {}
      if (JSON.stringify(existing.tags || []) !== JSON.stringify(payload.tags))
        patchSet.tags = payload.tags
      if (existing.status !== payload.status) patchSet.status = payload.status
      if (JSON.stringify(existing.referencedTypes || []) !== JSON.stringify(referencedTypes)) {
        patchSet.referencedTypes = referencedTypes
      }
      if (existing.product?._ref !== baseId) patchSet.product = asReference(baseId)
      if (existing.productSku !== payload.productSku) patchSet.productSku = payload.productSku
      if (existing.productSlug !== payload.productSlug) patchSet.productSlug = payload.productSlug

      if (Object.keys(patchSet).length > 0) {
        patchSet.syncedAt = new Date().toISOString()
        await client.patch(mapDocId).set(patchSet).commit({autoGenerateArrayKeys: true})
        action = 'updated'
        logger.info('[doc-mapping] Updated product mapping', {
          productId: baseId,
          mapId: mapDocId,
          patchSet,
        })
      }
    }
  } catch (error) {
    logger.error('[doc-mapping] Failed to upsert product mapping', {
      productId: baseId,
      mapDocId,
      error,
    })
    return {
      targetId: mapDocId,
      targetType: 'productMap',
      action: 'skipped',
      reason: 'Product mapping upsert failed',
    }
  }

  return {
    targetId: mapDocId,
    targetType: 'productMap',
    action,
    reason:
      action === 'created'
        ? 'Product mapping initialized'
        : action === 'updated'
          ? 'Product mapping refreshed'
          : 'Product mapping already current',
  }
}

async function syncRelationships(
  document: NormalizedDocument,
  context: DocumentFunctionContext,
  relationships: RelationshipLog[],
  referencedTypes: string[],
  summary: Record<string, unknown> | null,
) {
  const logger = getLogger(context)
  const baseId = normalizeId(document._id)
  if (!baseId) return

  await createOrReplaceMappingDoc(
    context.client,
    logger,
    document,
    baseId,
    referencedTypes,
    relationships,
    summary,
  )

  // Maintain reverse mapping docs
  for (const relationship of relationships) {
    if (!relationship.targetId) continue
    try {
      const targetDoc = await context.client.fetch(`*[_id == $id][0]{${PROJECTION_FIELDS}}`, {
        id: relationship.targetId,
      })
      if (!targetDoc) continue
      const targetSummary = buildMappingSummary(targetDoc as NormalizedDocument)
      await createOrReplaceMappingDoc(
        context.client,
        logger,
        targetDoc as NormalizedDocument,
        normalizeId(relationship.targetId),
        referencedTypes,
        [
          {
            targetId: baseId,
            targetType: document._type || 'unknown',
            action: 'updated',
            reason: 'Reverse relationship maintained by doc-mapping',
          },
        ],
        targetSummary,
      )
    } catch (error) {
      logger.warn('[doc-mapping] Failed to synchronize reverse mapping', {
        sourceId: baseId,
        targetId: relationship.targetId,
        error,
      })
    }
  }

  for (const relationship of relationships) {
    logger.info('[doc-mapping] Relationship recorded', {
      sourceId: baseId,
      sourceType: document._type,
      targetId: relationship.targetId,
      targetType: relationship.targetType,
      action: relationship.action,
      reason: relationship.reason,
    })
  }
}

export default defineDocumentFunction<NormalizedDocument>({
  name: 'doc-mapping',
  title: 'Universal Document Mapping',
  description:
    'Keeps invoices, shipping labels, and product mapping documents synchronized with source content while logging relationships.',
  on: ['create', 'update'],
  filter: `_type != null && delta::changedAny(*)`,
  projection: `{${PROJECTION_FIELDS}}`,
  execute: async (event, context) => {
    const logger = getLogger(context)
    const document = event.document as NormalizedDocument | undefined | null
    if (!document?._id || !document._type) {
      logger.warn('[doc-mapping] Event missing document payload', {event})
      return
    }

    const baseId = normalizeId(document._id)
    if (!baseId) {
      logger.warn('[doc-mapping] Unable to normalize document id', {documentId: document._id})
      return
    }

    const status = normalizeStatus(document)
    const tags = collectTags(document)
    const referenceIds = dedupe(extractReferences(document))
    let referencedTypes: string[] = []

    if (referenceIds.length > 0) {
      try {
        const results = await context.client.fetch(`*[_id in $ids]{_id, _type}`, {
          ids: referenceIds,
        })
        if (Array.isArray(results)) {
          referencedTypes = dedupe(
            results
              .map((entry: {_id?: string; _type?: string}) => entry?._type)
              .filter((type): type is string => typeof type === 'string' && !!type),
          )
        }
      } catch (error) {
        logger.warn('[doc-mapping] Failed to resolve referenced document types', {
          referenceIds,
          error,
        })
      }
    }

    const relationships: RelationshipLog[] = []

    if (document._type === 'order') {
      const relation = await ensureInvoiceForOrder(document, context, baseId, status, tags)
      if (relation) relationships.push(relation)
    }

    if (document._type === 'invoice') {
      const relation = await ensureShippingLabelForInvoice(document, context, baseId, status, tags)
      if (relation) relationships.push(relation)
    }

    if (document._type === 'product') {
      const relation = await ensureProductMap(document, context, baseId, referencedTypes, tags)
      if (relation) relationships.push(relation)
    }

    const summary = buildMappingSummary(document)

    if (!summary && relationships.length === 0 && referencedTypes.length === 0) {
      logger.info('[doc-mapping] No relationship updates required', {
        documentId: baseId,
        type: document._type,
      })
      return
    }

    if (summary && relationships.length === 0 && referencedTypes.length === 0) {
      logger.info('[doc-mapping] Snapshot refreshed for document without relationships', {
        documentId: baseId,
        type: document._type,
      })
    }

    await syncRelationships(document, context, relationships, referencedTypes, summary)
  },
})
