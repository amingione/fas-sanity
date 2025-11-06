import type {Handler} from '@netlify/functions'
import {createHmac, timingSafeEqual} from 'crypto'
import {createClient} from '@sanity/client'

const DEFAULT_ORIGIN = process.env.CORS_ALLOW || process.env.CORS_ORIGIN || 'http://localhost:3333'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': DEFAULT_ORIGIN,
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Hmac-Signature, X-Easypost-Signature',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const SHIPPING_PROVIDER = (process.env.SHIPPING_PROVIDER || 'easypost').toLowerCase()
const WEBHOOK_SECRET = (process.env.EASYPOST_WEBHOOK_SECRET || '').trim()

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: process.env.SANITY_API_VERSION || '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

function getHeader(headers: Record<string, any> | undefined, key: string): string | undefined {
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

function signaturesMatch(
  providedRaw: string,
  computedHex: string,
  computedBase64: string,
): boolean {
  const provided = providedRaw.trim()
  if (!provided) return false

  try {
    const providedHex = Buffer.from(provided, 'hex')
    const expectedHex = Buffer.from(computedHex, 'hex')
    if (
      providedHex.length > 0 &&
      expectedHex.length === providedHex.length &&
      timingSafeEqual(providedHex, expectedHex)
    ) {
      return true
    }
  } catch {
    // ignore hex parse errors
  }

  try {
    const providedBase64 = Buffer.from(provided, 'base64')
    const expectedBase64 = Buffer.from(computedBase64, 'base64')
    if (
      providedBase64.length > 0 &&
      expectedBase64.length === providedBase64.length &&
      timingSafeEqual(providedBase64, expectedBase64)
    ) {
      return true
    }
  } catch {
    // ignore base64 parse errors
  }

  return provided === computedHex || provided === computedBase64
}

function verifySignature(rawBody: string, headers: Record<string, any> | undefined): boolean {
  if (!WEBHOOK_SECRET) return true
  const headerSignature =
    getHeader(headers, 'x-hmac-signature') ||
    getHeader(headers, 'x-easypost-signature') ||
    getHeader(headers, 'x-easypost-hmac-sha256')

  if (!headerSignature) {
    console.warn('easypostWebhook missing signature header')
    return false
  }

  const hmac = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest()
  const computedHex = hmac.toString('hex')
  const computedBase64 = hmac.toString('base64')

  return signaturesMatch(headerSignature, computedHex, computedBase64)
}

type EasyPostEvent = {
  id?: string
  object?: string
  api_version?: string
  mode?: string
  status?: string
  description?: string
  created_at?: string
  result?: Record<string, any>
}

function extractLatestDetail(tracker: any) {
  const details = Array.isArray(tracker?.tracking_details) ? tracker.tracking_details : []
  if (details.length === 0) return null
  return details[details.length - 1]
}

function formatTrackerMessage(tracker: any): string | undefined {
  const status = tracker?.status
  const latest = extractLatestDetail(tracker)
  const parts: string[] = []
  if (status) parts.push(status.toString())
  if (latest?.message) parts.push(latest.message.toString())
  const locationFields = [latest?.city, latest?.state, latest?.zip, latest?.country].filter(Boolean)
  if (locationFields.length) parts.push(locationFields.join(', '))
  return parts.length ? `EasyPost update — ${parts.join(' • ')}` : undefined
}

async function handleTracker(tracker: any) {
  const trackerId = tracker?.id
  const trackingCode = tracker?.tracking_code
  const shipmentId = tracker?.shipment_id

  if (!trackerId && !trackingCode && !shipmentId) {
    console.warn('easypostWebhook tracker missing identifiers')
    return
  }

  const order = await sanity.fetch<{_id: string}>(
    `*[_type == "order" && (easyPostTrackerId == $trackerId || easyPostShipmentId == $shipmentId || trackingNumber == $trackingCode)][0]{ _id }`,
    {
      trackerId: trackerId || null,
      shipmentId: shipmentId || null,
      trackingCode: trackingCode || null,
    },
  )

  if (!order?._id) {
    console.warn('easypostWebhook unable to locate order for tracker', {
      trackerId,
      trackingCode,
      shipmentId,
    })
    return
  }

  const latestDetail = extractLatestDetail(tracker)
  const lastEventAt =
    latestDetail?.datetime ||
    tracker?.updated_at ||
    tracker?.last_updated_at ||
    tracker?.created_at ||
    new Date().toISOString()

  const patchSet = Object.fromEntries(
    Object.entries({
      trackingUrl: tracker?.public_url || undefined,
      trackingNumber: trackingCode || undefined,
      shippingCarrier: tracker?.carrier || undefined,
      'shippingStatus.carrier': tracker?.carrier || undefined,
      'shippingStatus.trackingCode': trackingCode || undefined,
      'shippingStatus.trackingUrl': tracker?.public_url || undefined,
      'shippingStatus.status': tracker?.status || undefined,
      'shippingStatus.lastEventAt': lastEventAt ? new Date(lastEventAt).toISOString() : undefined,
    }).filter(([, value]) => value !== undefined),
  )

  const logEntry = {
    _type: 'shippingLogEntry',
    status: tracker?.status || 'update',
    message: formatTrackerMessage(tracker),
    labelUrl: undefined,
    trackingUrl: tracker?.public_url || undefined,
    trackingNumber: trackingCode || undefined,
    weight: undefined,
    createdAt: new Date().toISOString(),
  }

  const patch = sanity.patch(order._id)
  if (Object.keys(patchSet).length) patch.set(patchSet)
  patch.setIfMissing({shippingLog: []}).append('shippingLog', [logEntry])

  await patch.commit({autoGenerateArrayKeys: true})
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: CORS_HEADERS, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }
  }

  if (SHIPPING_PROVIDER !== 'easypost') {
    return {
      statusCode: 409,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'EasyPost integration disabled'}),
    }
  }

  const rawBody = event.body || ''
  if (!verifySignature(rawBody, event.headers || {})) {
    return {
      statusCode: 401,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid webhook signature'}),
    }
  }

  let payload: EasyPostEvent | null = null
  try {
    payload = JSON.parse(rawBody || '{}')
  } catch (err) {
    console.error('easypostWebhook failed to parse payload', err)
    return {
      statusCode: 400,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid payload'}),
    }
  }

  if (!payload || payload.object !== 'Event') {
    return {
      statusCode: 200,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({ok: true, ignored: true}),
    }
  }

  try {
    const result = payload.result || {}
    if (result?.object === 'Tracker') {
      await handleTracker(result)
    }
  } catch (err) {
    console.error('easypostWebhook processing error', err)
    const message =
      err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string'
        ? (err as any).message
        : String(err)
    return {
      statusCode: 500,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: message || 'Webhook processing failed'}),
    }
  }

  return {
    statusCode: 200,
    headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
    body: JSON.stringify({ok: true}),
  }
}
