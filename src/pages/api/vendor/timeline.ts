/**
 * GET /api/vendor/timeline
 *
 * Returns paginated activity events for the authenticated vendor.
 * Events are written by the vendor-timeline-webhook Netlify function.
 *
 * Query params:
 *   limit       - max results (default: 25, max: 100)
 *   before      - ISO datetime cursor for pagination (events before this time)
 *   eventType   - filter by specific event type (optional)
 *
 * Response 200: { events: VendorTimelineEvent[], hasMore: boolean }
 * Response 401/403: { error: string }
 */

import type {APIRoute} from 'astro'
import {requireVendorAuth, handleAuthError, jsonOk, jsonError} from '@/lib/vendorAuth'
import {sanityClient} from '@/sanity/lib/client'

interface VendorTimelineEvent {
  _id: string
  eventId: string
  eventType: string
  occurredAt: string
  summary?: string
  payload?: Record<string, unknown>
}

// GROQ — paginated timeline, newest first, optional cursor + eventType filter
const TIMELINE_ALL_QUERY = `*[
  _type == "vendorActivityEvent" &&
  vendorId == $vendorId
] | order(occurredAt desc) [0...$limit] {
  _id,
  eventId,
  eventType,
  occurredAt,
  summary,
  payload
}`

const TIMELINE_BEFORE_QUERY = `*[
  _type == "vendorActivityEvent" &&
  vendorId == $vendorId &&
  occurredAt < $before
] | order(occurredAt desc) [0...$limit] {
  _id,
  eventId,
  eventType,
  occurredAt,
  summary,
  payload
}`

const TIMELINE_TYPED_QUERY = `*[
  _type == "vendorActivityEvent" &&
  vendorId == $vendorId &&
  eventType == $eventType
] | order(occurredAt desc) [0...$limit] {
  _id,
  eventId,
  eventType,
  occurredAt,
  summary,
  payload
}`

const TIMELINE_TYPED_BEFORE_QUERY = `*[
  _type == "vendorActivityEvent" &&
  vendorId == $vendorId &&
  eventType == $eventType &&
  occurredAt < $before
] | order(occurredAt desc) [0...$limit] {
  _id,
  eventId,
  eventType,
  occurredAt,
  summary,
  payload
}`

export const GET: APIRoute = async ({request}) => {
  try {
    const {vendor} = await requireVendorAuth(request)

    const url = new URL(request.url)
    const limitParam = url.searchParams.get('limit')
    const before = url.searchParams.get('before') ?? null
    const eventType = url.searchParams.get('eventType') ?? null

    // Fetch one extra to determine hasMore
    const limit = Math.min(parseInt(limitParam ?? '25', 10) || 25, 100)
    const fetchLimit = limit + 1

    if (before !== null) {
      const ts = Date.parse(before)
      if (isNaN(ts)) {
        return jsonError('Invalid before cursor — must be an ISO datetime string', 400)
      }
    }

    // Choose query based on params
    let query: string
    const params: Record<string, unknown> = {vendorId: vendor._id, limit: fetchLimit}

    if (eventType && before) {
      query = TIMELINE_TYPED_BEFORE_QUERY
      params.eventType = eventType
      params.before = before
    } else if (eventType) {
      query = TIMELINE_TYPED_QUERY
      params.eventType = eventType
    } else if (before) {
      query = TIMELINE_BEFORE_QUERY
      params.before = before
    } else {
      query = TIMELINE_ALL_QUERY
    }

    const raw = await sanityClient.fetch<VendorTimelineEvent[]>(query, params)

    const hasMore = raw.length > limit
    const events = hasMore ? raw.slice(0, limit) : raw

    return jsonOk({events, hasMore})
  } catch (err) {
    return handleAuthError(err)
  }
}

export const POST: APIRoute = () =>
  new Response(JSON.stringify({error: 'Method not allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  })
