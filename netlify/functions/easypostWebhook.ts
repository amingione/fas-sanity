import type {Handler} from '@netlify/functions'
import EasyPost from '@easypost/api'
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
const EASYPOST_API_KEY =
  process.env.EASYPOST_API_KEY || process.env.EASYPOST_PROD_API_KEY || process.env.EASYPOST_TEST_API_KEY || ''

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: process.env.SANITY_API_VERSION || '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const easyPost = EASYPOST_API_KEY ? new EasyPost(EASYPOST_API_KEY) : null

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

function verifySignature(rawBody: Buffer, headers: Record<string, any> | undefined): boolean {
  if (!WEBHOOK_SECRET) return true
  const headerSignature =
    getHeader(headers, 'x-hmac-signature') ||
    getHeader(headers, 'x-easypost-signature') ||
    getHeader(headers, 'x-easypost-hmac-sha256')

  if (!headerSignature) {
    console.warn('easypostWebhook missing signature header')
    return false
  }

  const hmac = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
  const expectedSignature = `hmac-sha256-hex=${hmac}`
  const provided = headerSignature.trim()

  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8')
    const providedBuffer = Buffer.from(provided, 'utf8')
    if (expectedBuffer.length !== providedBuffer.length) return false
    return timingSafeEqual(expectedBuffer, providedBuffer)
  } catch (err) {
    console.warn('easypostWebhook signature comparison failed', err)
    return false
  }
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

const ORDER_METADATA_KEYS = ['sanityOrderId', 'sanity_order_id', 'orderId', 'order_id']

function normalizeOrderId(value?: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

function extractOrderIdFromShipment(shipment: any): string | null {
  const metadataSources = [shipment?.metadata, shipment?.options?.metadata].filter(Boolean)
  for (const source of metadataSources) {
    for (const key of ORDER_METADATA_KEYS) {
      const normalized = normalizeOrderId(source?.[key])
      if (normalized) return normalized
    }
  }
  const referenceCandidates = [shipment?.options?.reference, shipment?.reference]
  for (const ref of referenceCandidates) {
    const normalized = normalizeOrderId(ref)
    if (normalized) return normalized
  }
  return null
}

function extractTrackingNumber(payload: any): string | null {
  const candidate =
    payload?.tracker?.tracking_code ||
    payload?.tracking_code ||
    payload?.result?.tracking_code ||
    payload?.shipment?.tracking_code ||
    null
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

function extractLabelUrl(payload: any): string | null {
  const candidate =
    payload?.shipment?.postage_label?.label_url ||
    payload?.result?.postage_label?.label_url ||
    payload?.postage_label?.label_url ||
    null
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

function buildTrackingUrl(payload: any, carrier?: string, trackingCode?: string | null): string | null {
  const direct =
    payload?.tracker?.public_url ||
    payload?.public_url ||
    payload?.tracking_url ||
    payload?.result?.public_url ||
    null
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  if (carrier && trackingCode) {
    return `https://www.easypost.com/tracking/${encodeURIComponent(carrier)}/${encodeURIComponent(
      trackingCode,
    )}`
  }
  return null
}

const cleanUndefined = (value: Record<string, any>) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined))

async function fetchShipmentFromEasyPost(shipmentId: string) {
  if (!shipmentId) return null
  if (!easyPost) {
    console.warn('easypostWebhook missing EASYPOST_API_KEY, cannot fetch shipment', {shipmentId})
    return null
  }
  try {
    const shipment = await easyPost.Shipment.retrieve(shipmentId)
    return JSON.parse(JSON.stringify(shipment))
  } catch (err) {
    console.error('easypostWebhook failed to retrieve shipment from EasyPost', {shipmentId, err})
    return null
  }
}

async function upsertShipmentDocument(shipment: any, rawPayload: any) {
  if (!shipment?.id) return null
  const trackingDetails = Array.isArray(shipment.tracking_details)
    ? shipment.tracking_details.map((detail: any) => ({
        message: detail?.message,
        status: detail?.status,
        datetime: detail?.datetime,
        trackingLocation: detail?.tracking_location,
      }))
    : undefined

  const orderRef = extractOrderIdFromShipment(shipment)

  const doc = cleanUndefined({
    easypostId: shipment.id,
    mode: shipment.mode,
    reference: shipment.reference || shipment.options?.reference,
    trackingCode:
      shipment.tracking_code ||
      shipment.tracker?.tracking_code ||
      shipment.trackingCode ||
      undefined,
    status: shipment.status,
    toAddress: shipment.to_address,
    fromAddress: shipment.from_address,
    parcel: shipment.parcel,
    selectedRate: shipment.selected_rate,
    rates: shipment.rates,
    postageLabel: shipment.postage_label,
    tracker: shipment.tracker,
    trackingDetails,
    forms: shipment.forms,
    customsInfo: shipment.customs_info,
    insurance: shipment.insurance,
    createdAt: shipment.created_at,
    updatedAt: shipment.updated_at,
    batchId: shipment.batch_id,
    batchStatus: shipment.batch_status,
    batchMessage: shipment.batch_message,
    scanForm: shipment.scan_form,
    rawWebhookData: rawPayload ? JSON.stringify(rawPayload, null, 2) : undefined,
    order: orderRef ? {_type: 'reference', _ref: orderRef} : undefined,
  })

  const existingId = await sanity.fetch<string | null>(
    `*[_type == "shipment" && easypostId == $id][0]._id`,
    {id: shipment.id},
  )

  if (existingId) {
    await sanity.patch(existingId).set(doc).commit({autoGenerateArrayKeys: true})
    return existingId
  }

  const created = await sanity.create({
    _type: 'shipment',
    ...doc,
  })
  return created._id
}

async function handleTracker(tracker: any, rawPayload?: any) {
  const trackerId = tracker?.id
  const trackingCode = tracker?.tracking_code
  const shipmentId = tracker?.shipment_id

  if (!trackerId && !trackingCode && !shipmentId) {
    console.warn('easypostWebhook tracker missing identifiers')
    return
  }

  if (shipmentId) {
    const shipment = await fetchShipmentFromEasyPost(shipmentId)
    if (shipment) {
      await handleShipment(shipment, rawPayload || tracker)
    }
  } else if (tracker?.shipment) {
    await handleShipment(tracker.shipment, rawPayload || tracker)
  }

  const order = await sanity.fetch<{_id: string; trackingNumber?: string; trackingUrl?: string; status?: string}>(
    `*[_type == "order" && (easyPostTrackerId == $trackerId || easyPostShipmentId == $shipmentId || trackingNumber == $trackingCode)][0]{ _id, trackingNumber, trackingUrl, status }`,
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

  const patchSet: Record<string, any> = Object.fromEntries(
    Object.entries({
      shippingCarrier: tracker?.carrier || undefined,
      'shippingStatus.carrier': tracker?.carrier || undefined,
      'shippingStatus.trackingCode': trackingCode || undefined,
      'shippingStatus.trackingUrl': tracker?.public_url || undefined,
      'shippingStatus.status': tracker?.status || undefined,
      'shippingStatus.lastEventAt': lastEventAt ? new Date(lastEventAt).toISOString() : undefined,
    }).filter(([, value]) => value !== undefined),
  )

  if (tracker?.public_url && !order.trackingUrl) {
    patchSet.trackingUrl = tracker.public_url
  }
  if (trackingCode && !order.trackingNumber) {
    patchSet.trackingNumber = trackingCode
  }
  if (trackingCode && order.status !== 'fulfilled') {
    patchSet.status = 'fulfilled'
  }

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

  const patch = sanity.patch(order._id).setIfMissing({})
  if (Object.keys(patchSet).length) patch.set(patchSet)
  patch.setIfMissing({shippingLog: []}).append('shippingLog', [logEntry])

  await patch.commit({autoGenerateArrayKeys: true})
}

async function handleShipment(shipment: any, rawPayload?: any) {
  const shipmentId = shipment?.id
  if (!shipmentId) {
    console.warn('easypostWebhook shipment missing id')
    return
  }

  let shipmentData = shipment
  if ((!shipmentData?.to_address || !shipmentData?.rates) && easyPost) {
    const fetched = await fetchShipmentFromEasyPost(shipmentId)
    if (fetched) shipmentData = fetched
  }

  await upsertShipmentDocument(shipmentData, rawPayload)

  const trackingNumber = extractTrackingNumber({shipment: shipmentData})
  const labelUrl = extractLabelUrl({shipment: shipmentData})
  const carrier =
    shipmentData?.selected_rate?.carrier ||
    shipmentData?.tracker?.carrier ||
    shipmentData?.rates?.[0]?.carrier ||
    shipmentData?.carrier ||
    undefined
  const trackingUrl = buildTrackingUrl({shipment: shipmentData}, carrier, trackingNumber)

  const orderIdCandidate = extractOrderIdFromShipment(shipmentData)
  const order = await sanity.fetch<{
    _id: string
    easyPostShipmentId?: string
    shippingLabelUrl?: string
    trackingNumber?: string
    trackingUrl?: string
    status?: string
  }>(
    `*[_type == "order" && (
      _id == $orderId ||
      easyPostShipmentId == $shipmentId ||
      trackingNumber == $trackingCode
    )][0]{ _id, shippingLabelUrl, trackingNumber, trackingUrl, status }`,
    {
      orderId: orderIdCandidate || null,
      shipmentId,
      trackingCode: trackingNumber || null,
    },
  )

  if (!order?._id) {
    console.warn('easypostWebhook unable to locate order for shipment', {
      shipmentId,
      orderIdCandidate,
    })
    return
  }

  const setOps: Record<string, any> = {}
  if (!order?.easyPostShipmentId) {
    setOps.easyPostShipmentId = shipmentId
  }
  if (labelUrl && !order.shippingLabelUrl) {
    setOps.shippingLabelUrl = labelUrl
  }
  if (trackingNumber && !order.trackingNumber) {
    setOps.trackingNumber = trackingNumber
  }
  if (trackingUrl && !order.trackingUrl) {
    setOps.trackingUrl = trackingUrl
  }
  if (trackingNumber && order.status !== 'fulfilled') {
    setOps.status = 'fulfilled'
  }

  if (!Object.keys(setOps).length) return

  await sanity.patch(order._id).setIfMissing({}).set(setOps).commit({autoGenerateArrayKeys: true})
}

async function handleRefund(refund: any) {
  const refundId = refund?.id
  const shipmentId = refund?.shipment_id || refund?.shipment
  const trackingCode = extractTrackingNumber({shipment: refund}) || refund?.tracking_code
  if (!refundId && !shipmentId && !trackingCode) {
    console.warn('easypostWebhook refund missing identifiers')
    return
  }

  const order = await sanity.fetch<{_id: string; fulfillment?: any; shippingLog?: any[]}>(
    `*[_type == "order" && (
      easyPostShipmentId == $shipmentId ||
      trackingNumber == $trackingCode ||
      easyPostTrackerId == $trackerId
    )][0]{_id, fulfillment, shippingLog}`,
    {
      shipmentId: shipmentId || null,
      trackingCode: trackingCode || null,
      trackerId: refund?.tracker_id || null,
    },
  )

  if (!order?._id) {
    console.warn('easypostWebhook unable to locate order for refund', {
      refundId,
      shipmentId,
      trackingCode,
    })
    return
  }

  const nowIso = new Date().toISOString()
  const patchSet: Record<string, any> = Object.fromEntries(
    Object.entries({
      'fulfillment.labelRefunded': true,
      'fulfillment.labelRefundedAt': nowIso,
      'fulfillment.refundId': refundId,
      'fulfillment.status': order?.fulfillment?.status || 'unfulfilled',
    }).filter(([, value]) => value !== undefined),
  )

  const logEntry = {
    _type: 'shippingLogEntry',
    status: refund?.status || 'refunded',
    message: `EasyPost refund ${refund?.status || ''}`.trim(),
    labelUrl: undefined,
    trackingUrl: undefined,
    trackingNumber: trackingCode || undefined,
    weight: undefined,
    createdAt: nowIso,
  }

  const patch = sanity.patch(order._id).setIfMissing({})
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
    console.warn('easypostWebhook received event but shipping provider is disabled', {
      SHIPPING_PROVIDER,
    })
    return {
      statusCode: 200,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({ok: true, ignored: true, reason: 'EasyPost integration disabled'}),
    }
  }

  const incomingBody = event.body || ''
  const rawBodyBuffer = event.isBase64Encoded
    ? Buffer.from(incomingBody, 'base64')
    : Buffer.from(incomingBody, 'utf8')

  if (!verifySignature(rawBodyBuffer, event.headers || {})) {
    return {
      statusCode: 401,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid webhook signature'}),
    }
  }

  let payload: EasyPostEvent | null = null
  try {
    const rawBody = rawBodyBuffer.toString('utf8')
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
      await handleTracker(result, payload)
    } else if (result?.object === 'Shipment') {
      await handleShipment(result, payload)
    } else if (result?.object === 'Refund') {
      await handleRefund(result)
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
