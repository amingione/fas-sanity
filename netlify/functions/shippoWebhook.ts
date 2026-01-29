/**
 * Shippo tracking webhook handler.
 *
 * Updates Sanity order shipping status based on Shippo tracking events.
 */
import type {Handler} from '@netlify/functions'
import {createHmac, timingSafeEqual, randomUUID} from 'crypto'
import {logFunctionExecution} from '../../utils/functionLogger'
import {sanityClient} from '../lib/sanityClient'

const WEBHOOK_SECRET = (process.env.SHIPPO_WEBHOOK_SECRET || '').trim()

const STATUS_MAP: Record<string, string> = {
  PRE_TRANSIT: 'pre_transit',
  TRANSIT: 'in_transit',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  RETURNED: 'returned',
  FAILURE: 'failure',
  UNKNOWN: 'unknown',
}

type ShippoTrackingStatus = {
  status?: string
  status_details?: string
  status_date?: string
  location?: {
    city?: string
    state?: string
    zip?: string
    country?: string
  }
}

type ShippoEvent = {
  event?: string
  data?: {
    tracking_number?: string
    tracking_url?: string
    carrier?: string
    tracking_status?: ShippoTrackingStatus
    tracking_history?: ShippoTrackingStatus[]
    eta?: string
    transaction?: string
  }
}

const getHeader = (headers: Record<string, any> | undefined, key: string): string | undefined => {
  if (!headers) return undefined
  const direct = headers[key]
  if (typeof direct === 'string') return direct
  const lower = key.toLowerCase()
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === lower) {
      if (typeof value === 'string') return value
      if (Array.isArray(value)) return value[0]
    }
  }
  return undefined
}

const normalizeSignature = (signature: string): string => {
  return signature
    .trim()
    .replace(/^sha256=/i, '')
    .replace(/^hmac-sha256-hex=/i, '')
}

const verifySignature = (rawBody: Buffer, signature: string, secret: string): boolean => {
  const normalized = normalizeSignature(signature)
  const hmac = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    const expected = Buffer.from(hmac, 'hex')
    const provided = Buffer.from(normalized, 'hex')
    if (expected.length !== provided.length) return false
    return timingSafeEqual(expected, provided)
  } catch (err) {
    console.warn('shippoWebhook signature comparison failed', err)
    return false
  }
}

const normalizeStatus = (status?: string | null): string => {
  if (!status) return 'unknown'
  const key = status.toString().trim().toUpperCase()
  return STATUS_MAP[key] || status.toString().trim().toLowerCase()
}

const formatStatusMessage = (trackingStatus?: ShippoTrackingStatus): string | undefined => {
  if (!trackingStatus) return undefined
  const parts: string[] = []
  if (trackingStatus.status) parts.push(trackingStatus.status)
  if (trackingStatus.status_details) parts.push(trackingStatus.status_details)
  const location = trackingStatus.location
  if (location) {
    const locationParts = [location.city, location.state, location.zip, location.country].filter(
      Boolean,
    )
    if (locationParts.length) parts.push(locationParts.join(', '))
  }
  return parts.length ? parts.join(' • ') : undefined
}

export const handler: Handler = async (event) => {
  const startTime = Date.now()
  let payload: ShippoEvent | null = null

  const finalize = async (
    response: {statusCode: number; headers?: Record<string, string>; body: string},
    status: 'success' | 'error' | 'warning',
    result?: unknown,
    error?: unknown,
  ) => {
    await logFunctionExecution({
      functionName: 'shippoWebhook',
      status,
      duration: Date.now() - startTime,
      eventData: event,
      result,
      error,
      metadata: {
        eventType: payload?.event,
        trackingNumber: payload?.data?.tracking_number,
      },
    })
    return response
  }

  if (event.httpMethod !== 'POST') {
    return await finalize(
      {
        statusCode: 405,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Method Not Allowed'}),
      },
      'error',
    )
  }

  if (!WEBHOOK_SECRET) {
    console.error('shippoWebhook missing SHIPPO_WEBHOOK_SECRET; reject webhook')
    return await finalize(
      {
        statusCode: 500,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Webhook secret not configured'}),
      },
      'error',
      {reason: 'missing webhook secret'},
    )
  }

  const incomingBody = event.body || ''
  const rawBodyBuffer = event.isBase64Encoded
    ? Buffer.from(incomingBody, 'base64')
    : Buffer.from(incomingBody, 'utf8')

  const signature = getHeader(event.headers, 'x-shippo-signature')
  if (!signature || !verifySignature(rawBodyBuffer, signature, WEBHOOK_SECRET)) {
    return await finalize(
      {
        statusCode: 401,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invalid webhook signature'}),
      },
      'error',
      {reason: 'invalid signature'},
    )
  }

  try {
    const rawBody = rawBodyBuffer.toString('utf8')
    payload = JSON.parse(rawBody || '{}') as ShippoEvent
  } catch (err) {
    console.error('shippoWebhook failed to parse payload', err)
    return await finalize(
      {
        statusCode: 400,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invalid payload'}),
      },
      'error',
      undefined,
      err,
    )
  }

  if (!payload || payload.event !== 'track_updated') {
    return await finalize(
      {
        statusCode: 200,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ok: true, ignored: true}),
      },
      'warning',
      {ignored: true},
    )
  }

  const trackingNumber = payload.data?.tracking_number?.toString().trim()
  if (!trackingNumber) {
    console.warn('shippoWebhook missing tracking number')
    return await finalize(
      {
        statusCode: 200,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ok: true, ignored: true, reason: 'missing tracking number'}),
      },
      'warning',
      {reason: 'missing tracking number'},
    )
  }

  const order = await sanityClient.fetch<{
    _id: string
    status?: string
    trackingNumber?: string
    trackingUrl?: string
    shippingStatus?: {lastEventAt?: string; status?: string}
  }>(
    `*[_type == "order" && (trackingNumber == $tracking || shippingStatus.trackingCode == $tracking)][0]{
      _id,
      status,
      trackingNumber,
      trackingUrl,
      shippingStatus
    }`,
    {tracking: trackingNumber},
  )

  if (!order?._id) {
    console.warn('shippoWebhook unable to locate order', {trackingNumber})
    return await finalize(
      {
        statusCode: 200,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ok: true, ignored: true, reason: 'order not found'}),
      },
      'warning',
      {reason: 'order not found'},
    )
  }

  const trackingStatus = payload.data?.tracking_status
  const normalizedStatus = normalizeStatus(trackingStatus?.status)
  const statusDate = trackingStatus?.status_date
  const lastEventAt = statusDate ? new Date(statusDate).toISOString() : new Date().toISOString()

  if (order.shippingStatus?.lastEventAt && statusDate) {
    const existingDate = new Date(order.shippingStatus.lastEventAt)
    const incomingDate = new Date(statusDate)
    if (!Number.isNaN(existingDate.getTime()) && incomingDate <= existingDate) {
      return await finalize(
        {
          statusCode: 200,
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ok: true, ignored: true, reason: 'stale update'}),
        },
        'success',
        {reason: 'stale update'},
      )
    }
  }

  const carrier = payload.data?.carrier || undefined
  const trackingUrl = payload.data?.tracking_url || undefined
  const patchSet: Record<string, any> = {
    'shippingStatus.status': normalizedStatus,
    'shippingStatus.carrier': carrier,
    'shippingStatus.trackingCode': trackingNumber,
    'shippingStatus.trackingUrl': trackingUrl,
    'shippingStatus.lastEventAt': lastEventAt,
  }

  if (trackingUrl && !order.trackingUrl) {
    patchSet.trackingUrl = trackingUrl
  }
  if (!order.trackingNumber) {
    patchSet.trackingNumber = trackingNumber
  }

  const normalizedOrderStatus = typeof order.status === 'string' ? order.status.toLowerCase() : ''
  if (normalizedStatus === 'delivered' && normalizedOrderStatus !== 'delivered') {
    patchSet.status = 'delivered'
  } else if (
    normalizedStatus !== 'delivered' &&
    normalizedOrderStatus !== 'fulfilled' &&
    normalizedOrderStatus !== 'delivered'
  ) {
    patchSet.status = 'fulfilled'
  }

  const logEntry = {
    _type: 'shippingLogEntry',
    _key: randomUUID(),
    status: normalizedStatus,
    message: formatStatusMessage(trackingStatus),
    trackingUrl,
    trackingNumber,
    createdAt: lastEventAt,
  }

  const patch = sanityClient.patch(order._id).setIfMissing({})
  if (Object.keys(patchSet).length) patch.set(patchSet)
  patch.setIfMissing({shippingLog: []}).append('shippingLog', [logEntry])
  await patch.commit({autoGenerateArrayKeys: true})

  return await finalize(
    {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ok: true}),
    },
    'success',
    {updated: true},
  )
}
