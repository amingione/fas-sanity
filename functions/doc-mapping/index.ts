import type {SanityClient, SanityDocument} from '@sanity/client'

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
  execute: (event: DocumentFunctionEvent<TDocument>, context: DocumentFunctionContext) => Promise<void>
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
  shipTo?: Record<string, unknown> | null
  ship_from?: Record<string, unknown> | null
  weight?: Record<string, unknown> | null
  dimensions?: Record<string, unknown> | null
  shippingCarrier?: string | null
  shippingLabelUrl?: string | null
  trackingNumber?: string | null
  tags?: unknown
  slug?: {current?: string | null} | null
  sku?: string | null
}

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

const resolveInvoiceStatus = (
  document: NormalizedDocument,
  normalizedStatus: string,
): 'pending' | 'paid' | 'refunded' | 'cancelled' => {
  const candidates = [
    normalizedStatus,
    document.paymentStatus,
    document.status,
    document.orderStatus,
    document.state,
  ]
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    if (candidate.includes('refund')) return 'refunded'
  }

  for (const candidate of candidates) {
    if (candidate.includes('cancel') || candidate.includes('void') || candidate.includes('fail')) return 'cancelled'
    if (candidate === 'expired' || candidate.includes('dispute')) return 'cancelled'
  }

  for (const candidate of candidates) {
    if (
      candidate.includes('paid') ||
      candidate.includes('fulfill') ||
      candidate.includes('ship') ||
      candidate.includes('complete') ||
      candidate === 'succeeded' ||
      candidate === 'captured' ||
      candidate === 'closed'
    ) {
      return 'paid'
    }
  }

  return 'pending'
}

const extractReferences = (value: unknown, path: (string | number)[] = [], acc: string[] = []): string[] => {
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
    logger.warn('[doc-mapping] Failed to set reference field', {documentId, fieldName, referenceId, error})
  }
}

const createOrReplaceMappingDoc = async (
  client: SanityClient,
  logger: ReturnType<typeof getLogger>,
  document: NormalizedDocument,
  baseId: string,
  referencedTypes: string[],
  relationships: RelationshipLog[],
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
  const orderNumber = typeof document.orderNumber === 'string' && document.orderNumber.trim()
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
  const prefix = (process.env.SANITY_STUDIO_INVOICE_PREFIX || process.env.INVOICE_PREFIX || 'INV')
    .toString()
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase() || 'INV'

  const invoiceNumber =
    (typeof invoiceDoc?.invoiceNumber === 'string' && invoiceDoc.invoiceNumber) ||
    (orderNumber && /^[a-z0-9-]+$/i.test(orderNumber) ? orderNumber : await generateInvoiceNumber(client, prefix))

  const desiredStatus = resolveInvoiceStatus(document, status)

  const invoicePayload: Record<string, unknown> = {
    _id: invoiceIdentifier,
    _type: 'invoice',
    title: orderNumber ? `Invoice ${orderNumber}` : `Invoice for ${baseId}`,
    invoiceNumber,
    orderNumber: orderNumber || invoiceNumber,
    orderRef: asReference(baseId),
    status: desiredStatus,
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
      await client.create(invoicePayload)
      action = 'created'
      logger.info('[doc-mapping] Created invoice for order', {orderId: baseId, invoiceId: invoiceIdentifier})
    } else {
      const patchSet: Record<string, unknown> = {}
      if (!invoiceDoc.orderRef?._ref || normalizeId(invoiceDoc.orderRef._ref) !== baseId) {
        patchSet.orderRef = asReference(baseId)
      }
      if (!invoiceDoc.invoiceNumber) patchSet.invoiceNumber = invoiceNumber
      if (!invoiceDoc.orderNumber && orderNumber) patchSet.orderNumber = orderNumber
      if (invoiceDoc.status !== desiredStatus) {
        patchSet.status = desiredStatus
      }
      if (document.shipTo && JSON.stringify(document.shipTo) !== JSON.stringify(invoiceDoc.shipTo)) {
        patchSet.shipTo = document.shipTo
      }
      if (document.weight && JSON.stringify(document.weight) !== JSON.stringify(invoiceDoc.weight)) {
        patchSet.weight = document.weight
      }
      if (document.dimensions && JSON.stringify(document.dimensions) !== JSON.stringify(invoiceDoc.dimensions)) {
        patchSet.dimensions = document.dimensions
      }
      if (document.amountShipping && document.amountShipping !== invoiceDoc.amountShipping) {
        patchSet.amountShipping = document.amountShipping
      }
      if (Object.keys(patchSet).length > 0) {
        await client.patch(invoiceIdentifier).set(patchSet).commit({autoGenerateArrayKeys: true})
        action = 'updated'
        logger.info('[doc-mapping] Updated invoice linkage', {orderId: baseId, invoiceId: invoiceIdentifier, patchSet})
      }
    }
  } catch (error) {
    logger.error('[doc-mapping] Failed to upsert invoice', {orderId: baseId, invoiceId: invoiceIdentifier, error})
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
    reason: action === 'created' ? 'Invoice created for fulfilled order' : 'Invoice synced with order',
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

  const shipTo = (document.shipTo as Record<string, unknown> | null) || shippingDoc?.ship_to || defaultShipTo
  const shipFrom = (document.ship_from as Record<string, unknown> | null) || shippingDoc?.ship_from || defaultShipFrom
  const weight = (document.weight as Record<string, unknown> | null) || shippingDoc?.weight || defaultWeight
  const dimensions = (document.dimensions as Record<string, unknown> | null) || shippingDoc?.dimensions || defaultDimensions

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
      await client.create(payload)
      action = 'created'
      logger.info('[doc-mapping] Created shipping label shell', {
        invoiceId: baseId,
        shippingLabelId,
      })
    } else {
      const patchSet: Record<string, unknown> = {}
      if (JSON.stringify(shipTo) !== JSON.stringify(shippingDoc.ship_to)) patchSet.ship_to = shipTo
      if (JSON.stringify(shipFrom) !== JSON.stringify(shippingDoc.ship_from)) patchSet.ship_from = shipFrom
      if (JSON.stringify(weight) !== JSON.stringify(shippingDoc.weight)) patchSet.weight = weight
      if (JSON.stringify(dimensions) !== JSON.stringify(shippingDoc.dimensions)) patchSet.dimensions = dimensions
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
    logger.error('[doc-mapping] Failed to upsert shipping label', {invoiceId: baseId, shippingLabelId, error})
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
      await client.create(payload)
      action = 'created'
      logger.info('[doc-mapping] Created product mapping', {productId: baseId, mapId: mapDocId})
    } else {
      const patchSet: Record<string, unknown> = {}
      if (JSON.stringify(existing.tags || []) !== JSON.stringify(payload.tags)) patchSet.tags = payload.tags
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
        logger.info('[doc-mapping] Updated product mapping', {productId: baseId, mapId: mapDocId, patchSet})
      }
    }
  } catch (error) {
    logger.error('[doc-mapping] Failed to upsert product mapping', {productId: baseId, mapDocId, error})
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
) {
  const logger = getLogger(context)
  const baseId = normalizeId(document._id)
  if (!baseId) return

  await createOrReplaceMappingDoc(context.client, logger, document, baseId, referencedTypes, relationships)

  // Maintain reverse mapping docs
  for (const relationship of relationships) {
    if (!relationship.targetId) continue
    try {
      const targetDoc = await context.client.fetch(`*[_id == $id][0]`, {id: relationship.targetId})
      if (!targetDoc) continue
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
  projection: `{
    ...,
    invoiceRef,
    orderRef,
    shipTo,
    ship_from,
    weight,
    dimensions,
    shippingCarrier,
    shippingLabelUrl,
    trackingNumber,
    tags,
    slug,
    sku
  }`,
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
        const results = await context.client.fetch(
          `*[_id in $ids]{_id, _type}`,
          {ids: referenceIds},
        )
        if (Array.isArray(results)) {
          referencedTypes = dedupe(
            results
              .map((entry: {_id?: string; _type?: string}) => entry?._type)
              .filter((type): type is string => typeof type === 'string' && !!type),
          )
        }
      } catch (error) {
        logger.warn('[doc-mapping] Failed to resolve referenced document types', {referenceIds, error})
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

    if (relationships.length === 0 && referencedTypes.length === 0) {
      logger.info('[doc-mapping] No relationship updates required', {documentId: baseId, type: document._type})
      return
    }

    await syncRelationships(document, context, relationships, referencedTypes)
  },
})
