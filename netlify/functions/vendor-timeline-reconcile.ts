import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'

const SANITY_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || ''
const SANITY_DATASET = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN || ''
const SANITY_API_VERSION = '2025-10-22'
const RECONCILE_SECRET =
  process.env.VENDOR_TIMELINE_RECONCILE_SECRET || process.env.VENDOR_WEBHOOK_SECRET || ''

const REQUIRED_ORDER_EVENTS = [
  'vendor.order.processing',
  'vendor.order.fulfilled',
  'vendor.payment.received',
] as const

const getClient = () => {
  if (!SANITY_PROJECT_ID || !SANITY_API_TOKEN) return null
  return createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    apiVersion: SANITY_API_VERSION,
    token: SANITY_API_TOKEN,
    useCdn: false,
  })
}

function unauthorized() {
  return {statusCode: 401, body: 'Unauthorized'}
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  if (!RECONCILE_SECRET) {
    return {statusCode: 500, body: 'Reconcile secret not configured'}
  }

  const headerSecret =
    event.headers['x-reconcile-secret'] || event.headers['X-Reconcile-Secret'] || ''
  if (!headerSecret || headerSecret !== RECONCILE_SECRET) {
    return unauthorized()
  }

  const sanity = getClient()
  if (!sanity) {
    return {statusCode: 500, body: 'Sanity client not configured'}
  }

  const params = event.queryStringParameters || {}
  const from = params.from || null
  const to = params.to || null
  const vendorId = params.vendor_id || null
  const aggregateId = params.aggregate_id || null
  const limit = Math.min(Math.max(Number(params.limit || 1000) || 1000, 1), 5000)

  const query = `*[
    _type == "vendorActivityEvent"
    && (!defined($from) || occurredAt >= $from)
    && (!defined($to) || occurredAt <= $to)
    && (!defined($vendorId) || vendorId == $vendorId)
    && (!defined($aggregateId) || aggregateId == $aggregateId)
  ] | order(occurredAt asc)[0...$limit]{
    _id,
    eventId,
    eventType,
    occurredAt,
    aggregateType,
    aggregateId,
    vendorId
  }`

  try {
    const rows = (await sanity.fetch(query, {
      from,
      to,
      vendorId,
      aggregateId,
      limit,
    })) as Array<{
      _id: string
      eventId?: string
      eventType?: string
      occurredAt?: string
      aggregateType?: string
      aggregateId?: string
      vendorId?: string
    }>

    const byType: Record<string, number> = {}
    const duplicateEventIds: string[] = []
    const seenIds = new Set<string>()
    const byAggregate = new Map<string, Set<string>>()

    for (const row of rows) {
      if (row.eventType) byType[row.eventType] = (byType[row.eventType] || 0) + 1
      if (row.eventId) {
        if (seenIds.has(row.eventId)) duplicateEventIds.push(row.eventId)
        seenIds.add(row.eventId)
      }
      const key = `${row.aggregateType || 'unknown'}:${row.aggregateId || 'unknown'}`
      if (!byAggregate.has(key)) byAggregate.set(key, new Set<string>())
      if (row.eventType) byAggregate.get(key)!.add(row.eventType)
    }

    const missingByAggregate: Array<{aggregate: string; missing: string[]}> = []
    for (const [key, types] of byAggregate.entries()) {
      if (!key.startsWith('order:')) continue
      const missing = REQUIRED_ORDER_EVENTS.filter((required) => !types.has(required))
      if (missing.length > 0) {
        missingByAggregate.push({aggregate: key, missing: [...missing]})
      }
    }

    const response = {
      ok: true,
      generated_at: new Date().toISOString(),
      filters: {from, to, vendor_id: vendorId, aggregate_id: aggregateId, limit},
      scanned: rows.length,
      unique_event_ids: seenIds.size,
      duplicate_event_ids: duplicateEventIds,
      counts_by_event_type: byType,
      aggregates_checked: byAggregate.size,
      aggregates_missing_required_order_events: missingByAggregate,
    }

    return {
      statusCode: 200,
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(response),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {statusCode: 500, body: JSON.stringify({ok: false, error: message})}
  }
}

