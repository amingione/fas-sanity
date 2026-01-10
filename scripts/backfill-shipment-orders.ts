#!/usr/bin/env tsx
import 'dotenv/config'
import {sanityClient} from '../netlify/lib/sanityClient'

const ORDER_METADATA_KEYS = ['sanityOrderId', 'sanity_order_id', 'orderId', 'order_id']
const ORDER_NUMBER_METADATA_KEYS = ['orderNumber', 'order_number', 'orderNum', 'order_num']

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1200

const sanitizeString = (value?: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

const looksLikeStripePaymentIntentId = (value?: string | null): boolean =>
  typeof value === 'string' && /^pi_[a-z0-9]+$/i.test(value.trim())

const isLikelySanityDocumentId = (value?: string | null): boolean => {
  if (!value) return false
  if (looksLikeStripePaymentIntentId(value)) return false
  return /^[A-Za-z0-9]{10,}$/.test(value.trim())
}

const normalizeOrderId = (value?: unknown): string | null => {
  const normalized = sanitizeString(value)
  if (!normalized) return null
  const trimmed = normalized.startsWith('drafts.') ? normalized.slice(7) : normalized
  if (!isLikelySanityDocumentId(trimmed)) return null
  return trimmed
}

const getMetadataSources = (shipment: ShipmentDoc): Array<Record<string, unknown>> =>
  [shipment.metadata, shipment.options?.metadata].filter(
    (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object',
  )

const extractMetadataValue = (shipment: ShipmentDoc, keys: string[]): string | null => {
  const sources = getMetadataSources(shipment)
  for (const source of sources) {
    for (const key of keys) {
      const candidate = sanitizeString(source[key])
      if (candidate) return candidate
    }
  }
  return null
}

const extractOrderIdFromShipment = (shipment: ShipmentDoc): string | null => {
  for (const metadata of getMetadataSources(shipment)) {
    for (const key of ORDER_METADATA_KEYS) {
      const normalized = normalizeOrderId(metadata[key])
      if (normalized) return normalized
    }
  }
  const referenceCandidates = [shipment.options?.reference, shipment.reference]
  for (const candidate of referenceCandidates) {
    const normalized = normalizeOrderId(candidate)
    if (normalized) return normalized
  }
  return null
}

const extractOrderNumberFromShipment = (shipment: ShipmentDoc): string | null => {
  const candidate = extractMetadataValue(shipment, ORDER_NUMBER_METADATA_KEYS)
  if (candidate && !isLikelySanityDocumentId(candidate) && !looksLikeStripePaymentIntentId(candidate)) {
    return candidate
  }
  const reference = sanitizeString(shipment.reference)
  if (reference && !isLikelySanityDocumentId(reference) && !looksLikeStripePaymentIntentId(reference)) {
    return reference
  }
  const optionReference = sanitizeString(shipment.options?.reference)
  if (optionReference && !isLikelySanityDocumentId(optionReference) && !looksLikeStripePaymentIntentId(optionReference)) {
    return optionReference
  }
  return null
}

const extractTrackingNumberFromShipment = (shipment: ShipmentDoc): string | null =>
  sanitizeString(shipment.trackingCode) || sanitizeString(shipment.tracker?.tracking_code)

const normalizeLimit = (value?: number): number => {
  if (!value || Number.isNaN(value) || value <= 0) return DEFAULT_LIMIT
  return Math.min(value, MAX_LIMIT)
}

const parseArgs = (): ScriptOptions => {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--limit') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = Number.parseInt(value, 10)
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value "${value}" (expected positive integer)`) }
      options.limit = normalizeLimit(parsed)
      i += 1
      continue
    }
    if (arg === '--dry-run' || arg === '--dryRun') {
      options.dryRun = true
      continue
    }
  }
  return options
}

type ScriptOptions = {
  dryRun?: boolean
  limit?: number
}

type ShipmentDoc = {
  _id: string
  reference?: string | null
  metadata?: Record<string, unknown> | null
  options?: {
    reference?: string | null
    metadata?: Record<string, unknown> | null
  }
  trackingCode?: string | null
  tracker?: {tracking_code?: string | null}
}

type ResolutionResult = {
  orderId: string
  reason: string
}

const fetchOrderById = async (orderId: string): Promise<string | null> => {
  const doc = await sanityClient.fetch<{_id?: string}>(
    `*[_type == "order" && _id == $id][0]{_id}`,
    {id: orderId},
  )
  return doc?._id ?? null
}

const fetchOrderByNumber = async (orderNumberCandidate: string): Promise<string | null> => {
  const normalized = orderNumberCandidate.trim()
  if (!normalized) return null
  const doc = await sanityClient.fetch<{_id?: string}>(
    `*[_type == "order" && lower(orderNumber) == $orderNumber][0]{_id}`,
    {orderNumber: normalized.toLowerCase()},
  )
  return doc?._id ?? null
}

const fetchOrderByTracking = async (tracking: string): Promise<string | null> => {
  const normalized = tracking.trim()
  if (!normalized) return null
  const doc = await sanityClient.fetch<{_id?: string}>(
    `*[_type == "order" && (trackingNumber == $tracking || shippingStatus.trackingCode == $tracking)][0]{_id}`,
    {tracking: normalized},
  )
  return doc?._id ?? null
}

const resolveOrderReference = async (shipment: ShipmentDoc): Promise<ResolutionResult | null> => {
  const orderIdFromMetadata = extractOrderIdFromShipment(shipment)
  if (orderIdFromMetadata) {
    const resolved = await fetchOrderById(orderIdFromMetadata)
    if (resolved) {
      return {orderId: resolved, reason: 'metadata orderId'}
    }
  }

  const orderNumberFromShipment = extractOrderNumberFromShipment(shipment)
  if (orderNumberFromShipment) {
    const resolved = await fetchOrderByNumber(orderNumberFromShipment)
    if (resolved) {
      return {orderId: resolved, reason: 'orderNumber or reference'}
    }
  }

  const trackingValue = extractTrackingNumberFromShipment(shipment)
  if (trackingValue) {
    const resolved = await fetchOrderByTracking(trackingValue)
    if (resolved) {
      return {orderId: resolved, reason: 'trackingNumber'}
    }
  }

  return null
}

const main = async () => {
  const {limit = DEFAULT_LIMIT, dryRun} = parseArgs()
  const effectiveLimit = limit ? normalizeLimit(limit) : DEFAULT_LIMIT
  console.log(`[backfill-shipment-orders] Dry run=${Boolean(dryRun)}, limit=${effectiveLimit}`)

  const shipments = await sanityClient.fetch<ShipmentDoc[]>(
    `*[_type == "shipment" && !defined(order._ref)]
      | order(createdAt desc)[0...${effectiveLimit}] {
        _id,
        reference,
        metadata,
        options{reference, metadata},
        trackingCode,
        tracker{tracking_code}
      }`,
  )

  if (!shipments.length) {
    console.log('[backfill-shipment-orders] No unlinked shipments found.')
    return
  }

  const summary = {
    processed: 0,
    linked: 0,
    missing: 0,
    errors: 0,
  }

  for (const shipment of shipments) {
    summary.processed += 1
    const resolution = await resolveOrderReference(shipment)
    if (!resolution) {
      summary.missing += 1
      continue
    }

    console.log(
      `[backfill-shipment-orders] Shipment ${shipment._id} -> order ${resolution.orderId} (${resolution.reason})`,
    )

    if (dryRun) {
      summary.linked += 1
      continue
    }

    try {
      await sanityClient
        .patch(shipment._id)
        .set({order: {_type: 'reference', _ref: resolution.orderId}})
        .commit({autoGenerateArrayKeys: true})
      summary.linked += 1
    } catch (error) {
      summary.errors += 1
      console.error(`[backfill-shipment-orders] Failed to link ${shipment._id}:`, error)
    }
  }

  console.log(
    `[backfill-shipment-orders] Summary processed=${summary.processed} linked=${summary.linked} missing=${summary.missing} errors=${summary.errors}`,
  )
}

main().catch((error) => {
  console.error('[backfill-shipment-orders] Unexpected error', error)
  process.exit(1)
})
