import type {Handler} from '@netlify/functions'
import EasyPost from '@easypost/api'
import {createHmac, timingSafeEqual, randomUUID} from 'crypto'
import {logFunctionExecution} from '../../utils/functionLogger'
import {sanityClient} from '../lib/sanityClient'
import {linkShipmentToOrder} from '../lib/referenceIntegrity'

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

const sanity = sanityClient

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
  if (!WEBHOOK_SECRET) {
    console.error('easypostWebhook missing EASYPOST_WEBHOOK_SECRET; signature check disabled')
    return false
  }
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
const ORDER_NUMBER_METADATA_KEYS = ['orderNumber', 'order_number', 'orderNum', 'order_num']
const PAYMENT_INTENT_METADATA_KEYS = [
  'paymentIntentId',
  'payment_intent_id',
  'stripePaymentIntentId',
  'stripe_payment_intent_id',
  'paymentIntent',
  'payment_intent',
]
const CUSTOMER_EMAIL_METADATA_KEYS = [
  'customerEmail',
  'customer_email',
  'customerEmailAddress',
  'customer_email_address',
  'email',
]

function sanitizeString(value?: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function looksLikeStripePaymentIntentId(value?: string | null): boolean {
  if (!value) return false
  return /^pi_[a-z0-9]+$/i.test(value.trim())
}

function isLikelySanityDocumentId(value?: string | null): boolean {
  if (!value) return false
  if (looksLikeStripePaymentIntentId(value)) return false
  return /^[A-Za-z0-9]{10,}$/.test(value)
}

function normalizeOrderId(value?: unknown): string | null {
  const normalized = sanitizeString(value)
  if (!normalized) return null
  const trimmed = normalized.startsWith('drafts.') ? normalized.slice(7) : normalized
  if (!isLikelySanityDocumentId(trimmed)) return null
  return trimmed
}

function getMetadataSources(shipment: any) {
  return [shipment?.metadata, shipment?.options?.metadata].filter(
    (value): value is Record<string, any> => Boolean(value) && typeof value === 'object',
  )
}

function extractMetadataValue(shipment: any, keys: string[]): string | null {
  const sources = getMetadataSources(shipment)
  for (const source of sources) {
    for (const key of keys) {
      const candidate = sanitizeString(source?.[key])
      if (candidate) return candidate
    }
  }
  return null
}

function extractPaymentIntentIdFromShipment(shipment: any): string | null {
  const candidate = extractMetadataValue(shipment, PAYMENT_INTENT_METADATA_KEYS)
  if (looksLikeStripePaymentIntentId(candidate)) return candidate!.trim()
  const reference = sanitizeString(shipment?.reference)
  if (looksLikeStripePaymentIntentId(reference)) return reference!
  const optionReference = sanitizeString(shipment?.options?.reference)
  if (looksLikeStripePaymentIntentId(optionReference)) return optionReference!
  return null
}

function extractOrderNumberFromShipment(shipment: any): string | null {
  const candidate = extractMetadataValue(shipment, ORDER_NUMBER_METADATA_KEYS)
  if (candidate && !isLikelySanityDocumentId(candidate) && !looksLikeStripePaymentIntentId(candidate))
    return candidate
  const reference = sanitizeString(shipment?.reference)
  if (
    reference &&
    !isLikelySanityDocumentId(reference) &&
    !looksLikeStripePaymentIntentId(reference)
  ) {
    return reference
  }
  const optionReference = sanitizeString(shipment?.options?.reference)
  if (
    optionReference &&
    !isLikelySanityDocumentId(optionReference) &&
    !looksLikeStripePaymentIntentId(optionReference)
  ) {
    return optionReference
  }
  return null
}

function extractCustomerEmailFromShipment(shipment: any): string | null {
  const metadataEmail = extractMetadataValue(shipment, CUSTOMER_EMAIL_METADATA_KEYS)
  if (metadataEmail) return metadataEmail
  const toAddressEmail = sanitizeString(shipment?.to_address?.email)
  return toAddressEmail
}

function extractOrderIdFromShipment(shipment: any): string | null {
  const metadataSources = getMetadataSources(shipment)
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

const mapAddress = (addr?: Record<string, any> | null) => {
  if (!addr || typeof addr !== 'object') return undefined
  const mapped = cleanUndefined({
    name: addr.name,
    street1: addr.street1 || addr.address1,
    street2: addr.street2 || addr.address2,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    country: addr.country,
    phone: addr.phone,
    email: addr.email,
  })
  return Object.keys(mapped).length ? mapped : undefined
}

const mapParcel = (parcel?: Record<string, any> | null) => {
  if (!parcel || typeof parcel !== 'object') return undefined
  const mapped = cleanUndefined({
    length: parcel.length,
    width: parcel.width,
    height: parcel.height,
    weight: parcel.weight,
  })
  return Object.keys(mapped).length ? mapped : undefined
}

const mapRate = (rate?: Record<string, any> | null) => {
  if (!rate || typeof rate !== 'object') return undefined
  const mapped = cleanUndefined({
    carrier: rate.carrier,
    service: rate.service,
    rate: rate.rate,
    currency: rate.currency,
    deliveryDays: rate.delivery_days,
  })
  return Object.keys(mapped).length ? mapped : undefined
}

const ORDER_PROJECTION = `{
  _id,
  orderNumber,
  easyPostShipmentId,
  easyPostTrackerId,
  shippingLabelUrl,
  trackingNumber,
  trackingUrl,
  status,
  customerEmail
}`

type SanityOrderRecord = {
  _id: string
  orderNumber?: string
  easyPostShipmentId?: string
  easyPostTrackerId?: string
  shippingLabelUrl?: string
  trackingNumber?: string
  trackingUrl?: string
  status?: string
  customerEmail?: string
}

type OrderLookupResult = {
  order: SanityOrderRecord | null
  orderIdCandidate?: string | null
  paymentIntentId?: string | null
  orderNumberCandidate?: string | null
  customerEmailCandidate?: string | null
  shipmentId?: string | null
  trackerId?: string | null
  trackingNumberCandidate?: string | null
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function computeRecentIso(referenceIso?: string | null) {
  const fallback = new Date(Date.now() - ONE_DAY_MS)
  if (!referenceIso) return fallback.toISOString()
  const parsed = Date.parse(referenceIso)
  if (Number.isNaN(parsed)) return fallback.toISOString()
  return new Date(parsed - ONE_DAY_MS).toISOString()
}

async function findOrderForShipment(shipment: any): Promise<OrderLookupResult> {
  const shipmentId = sanitizeString(shipment?.id)
  const trackerId = sanitizeString(shipment?.tracker?.id)
  const trackingNumberCandidate = extractTrackingNumber({shipment})
  const orderIdCandidate = extractOrderIdFromShipment(shipment)
  const paymentIntentId = extractPaymentIntentIdFromShipment(shipment)
  const orderNumberCandidate = extractOrderNumberFromShipment(shipment)
  const customerEmailCandidate = extractCustomerEmailFromShipment(shipment)
  const createdAt = sanitizeString(shipment?.created_at)

  const baseResult: OrderLookupResult = {
    order: null,
    orderIdCandidate,
    paymentIntentId,
    orderNumberCandidate,
    customerEmailCandidate,
    shipmentId,
    trackerId,
    trackingNumberCandidate,
  }

  if (orderIdCandidate) {
    const orderById = await sanity.fetch<SanityOrderRecord | null>(
      `*[_type == "order" && _id == $orderId][0]${ORDER_PROJECTION}`,
      {orderId: orderIdCandidate},
    )
    if (orderById) return {...baseResult, order: orderById}
  }

  if (shipmentId || trackerId || trackingNumberCandidate) {
    const orderByShipment = await sanity.fetch<SanityOrderRecord | null>(
      `*[_type == "order" && (
        easyPostShipmentId == $shipmentId ||
        easyPostTrackerId == $trackerId ||
        trackingNumber == $trackingNumber
      )][0]${ORDER_PROJECTION}`,
      {
        shipmentId: shipmentId || null,
        trackerId: trackerId || null,
        trackingNumber: trackingNumberCandidate || null,
      },
    )
    if (orderByShipment) return {...baseResult, order: orderByShipment}
  }

  if (paymentIntentId) {
    const orderByPi = await sanity.fetch<SanityOrderRecord | null>(
      `*[_type == "order" && stripeSummary.paymentIntentId == $piId][0]${ORDER_PROJECTION}`,
      {piId: paymentIntentId},
    )
    if (orderByPi) return {...baseResult, order: orderByPi}
  }

  if (orderNumberCandidate) {
    const orderByNumber = await sanity.fetch<SanityOrderRecord | null>(
      `*[_type == "order" && orderNumber == $orderNumber][0]${ORDER_PROJECTION}`,
      {orderNumber: orderNumberCandidate},
    )
    if (orderByNumber) return {...baseResult, order: orderByNumber}
  }

  if (customerEmailCandidate) {
    const orderByEmail = await sanity.fetch<SanityOrderRecord | null>(
      `*[_type == "order" && customerEmail == $email && _createdAt > $since]
        | order(_createdAt desc)[0]${ORDER_PROJECTION}`,
      {
        email: customerEmailCandidate,
        since: computeRecentIso(createdAt),
      },
    )
    if (orderByEmail) return {...baseResult, order: orderByEmail}
  }

  return baseResult
}

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

async function upsertShipmentDocument(
  shipment: any,
  rawPayload: any,
  orderLookup?: OrderLookupResult,
) {
  if (!shipment?.id) return null
  const trackingDetails = Array.isArray(shipment.tracking_details)
    ? shipment.tracking_details.map((detail: any) => ({
        message: detail?.message,
        status: detail?.status,
        datetime: detail?.datetime,
        trackingLocation: detail?.tracking_location,
      }))
    : undefined

  const orderRef = orderLookup?.order?._id
  const stripePaymentIntentId =
    orderLookup?.paymentIntentId ?? extractPaymentIntentIdFromShipment(shipment)

  const doc = cleanUndefined({
    title:
      shipment.reference ||
      shipment.tracking_code ||
      shipment.id ||
      (shipment.options?.reference as string | undefined) ||
      `Shipment to ${shipment.to_address?.name || 'customer'}`,
    easypostId: shipment.id,
    mode: shipment.mode,
    reference: shipment.reference || shipment.options?.reference,
    trackingCode:
      shipment.tracking_code ||
      shipment.tracker?.tracking_code ||
      shipment.trackingCode ||
      undefined,
    status: shipment.status,
    transitDays: shipment.selected_rate?.delivery_days,
    recipient: shipment.to_address?.name,
    labelUrl:
      shipment?.postage_label?.label_url ||
      shipment?.postage_label?.label_pdf_url ||
      shipment?.label_url,
    toAddress: mapAddress(shipment.to_address),
    fromAddress: mapAddress(shipment.from_address),
    parcel: mapParcel(shipment.parcel),
    selectedRate: mapRate(shipment.selected_rate),
    rates: Array.isArray(shipment.rates)
      ? shipment.rates
          .map((rate: any) => mapRate(rate))
          .filter((rate: any) => Boolean(rate))
      : undefined,
    postageLabel: shipment.postage_label
      ? cleanUndefined({
          labelUrl: shipment.postage_label.label_url,
          labelPdfUrl: shipment.postage_label.label_pdf_url,
        })
      : undefined,
    tracker: shipment.tracker
      ? cleanUndefined({
          id: shipment.tracker.id,
          status: shipment.tracker.status,
          carrier: shipment.tracker.carrier,
          public_url: shipment.tracker.public_url,
          tracking_code: shipment.tracker.tracking_code,
        })
      : undefined,
    trackingDetails,
    forms: Array.isArray(shipment.forms)
      ? shipment.forms
          .map((form: any) =>
            cleanUndefined({
              formId: form?.id,
              formType: form?.form_type,
              formUrl: form?.form_url,
              createdAt: form?.created_at,
            }),
          )
          .filter((f: any) => Object.keys(f).length)
      : undefined,
    customsInfo: shipment.customs_info
      ? cleanUndefined({
          id: shipment.customs_info.id,
          contents_type: shipment.customs_info.contents_type,
        })
      : undefined,
    insurance: shipment.insurance
      ? cleanUndefined({amount: shipment.insurance.amount, provider: shipment.insurance.provider})
      : undefined,
    createdAt: shipment.created_at,
    updatedAt: shipment.updated_at,
    batchId: shipment.batch_id,
    batchStatus: shipment.batch_status,
    batchMessage: shipment.batch_message,
    scanForm: shipment.scan_form
      ? cleanUndefined({id: shipment.scan_form.id, form_url: shipment.scan_form.form_url})
      : undefined,
    rawWebhookData: rawPayload ? JSON.stringify(rawPayload, null, 2) : undefined,
    details: JSON.stringify(shipment, null, 2),
    stripePaymentIntentId: stripePaymentIntentId || undefined,
    order: orderRef ? {_type: 'reference', _ref: orderRef} : undefined,
  })

  const existingId = await sanity.fetch<string | null>(
    `*[_type == "shipment" && easypostId == $id][0]._id`,
    {id: shipment.id},
  )

  if (existingId) {
    await sanity.patch(existingId).set(doc).commit({autoGenerateArrayKeys: true})
    console.log('easypostWebhook shipment updated', existingId)
    return existingId
  }

  const created = await sanity.create({
    _type: 'shipment',
    ...doc,
  })
  console.log('easypostWebhook shipment created', created._id)
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

  const order = await sanity.fetch<{
    _id: string
    trackingNumber?: string
    trackingUrl?: string
    status?: string
    easyPostTrackerId?: string
    easyPostShipmentId?: string
  }>(
    `*[_type == "order" && (easyPostTrackerId == $trackerId || easyPostShipmentId == $shipmentId || trackingNumber == $trackingCode)][0]{ _id, trackingNumber, trackingUrl, status, easyPostTrackerId, easyPostShipmentId }`,
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

  const trackerStatus = typeof tracker?.status === 'string' ? tracker.status.toLowerCase() : ''
  const normalizedOrderStatus = typeof order.status === 'string' ? order.status.toLowerCase() : ''

  const patchSet: Record<string, any> = Object.fromEntries(
    Object.entries({
      'shippingStatus.carrier': tracker?.carrier || undefined,
      'shippingStatus.trackingCode': trackingCode || undefined,
      'shippingStatus.trackingUrl': tracker?.public_url || undefined,
      'shippingStatus.status': tracker?.status || undefined,
      'shippingStatus.lastEventAt': lastEventAt ? new Date(lastEventAt).toISOString() : undefined,
      'fulfillment.status': tracker?.status || undefined,
      ...(tracker?.status === 'delivered' && lastEventAt
        ? {deliveredAt: new Date(lastEventAt).toISOString()}
        : {}),
    }).filter(([, value]) => value !== undefined),
  )

  if (tracker?.public_url && !order.trackingUrl) {
    patchSet.trackingUrl = tracker.public_url
  }
  if (trackingCode && !order.trackingNumber) {
    patchSet.trackingNumber = trackingCode
  }
  if (tracker?.carrier) {
    patchSet.carrier = tracker.carrier
  }
  if (trackerId && !order.easyPostTrackerId) {
    patchSet.easyPostTrackerId = trackerId
  }
  if (shipmentId && !order.easyPostShipmentId) {
    patchSet.easyPostShipmentId = shipmentId
  }
  if (trackerStatus === 'delivered') {
    if (normalizedOrderStatus !== 'delivered') {
      patchSet.status = 'delivered'
    }
  } else if (
    trackingCode &&
    normalizedOrderStatus !== 'fulfilled' &&
    normalizedOrderStatus !== 'delivered'
  ) {
    patchSet.status = 'fulfilled'
  }

  const logEntry = {
    _type: 'shippingLogEntry',
    _key: randomUUID(),
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

  const orderLookup = await findOrderForShipment(shipmentData)
  const shipmentDocId = await upsertShipmentDocument(shipmentData, rawPayload, orderLookup)

  const trackingNumber = extractTrackingNumber({shipment: shipmentData})
  const labelUrl = extractLabelUrl({shipment: shipmentData})
  const carrier =
    shipmentData?.selected_rate?.carrier ||
    shipmentData?.tracker?.carrier ||
    shipmentData?.rates?.[0]?.carrier ||
    shipmentData?.carrier ||
    undefined
  const trackingUrl = buildTrackingUrl({shipment: shipmentData}, carrier, trackingNumber)

  const order = orderLookup.order

  if (!order?._id) {
    console.warn('easypostWebhook unable to locate order for shipment', {
      shipmentId,
      orderIdCandidate: orderLookup.orderIdCandidate,
      paymentIntentId: orderLookup.paymentIntentId,
      orderNumberCandidate: orderLookup.orderNumberCandidate,
      trackingNumber,
    })
    return
  }

  if (order?._id && shipmentDocId) {
    await linkShipmentToOrder(sanity, shipmentDocId, order._id)
  }

  const normalizedOrderStatus =
    typeof order.status === 'string' ? order.status.toLowerCase() : ''

  const setOps: Record<string, any> = {}
  if (!order?.easyPostShipmentId) {
    setOps.easyPostShipmentId = shipmentId
  }
  if (!order?.easyPostTrackerId && shipmentData?.tracker?.id) {
    setOps.easyPostTrackerId = shipmentData.tracker.id
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
  if (
    trackingNumber &&
    normalizedOrderStatus !== 'fulfilled' &&
    normalizedOrderStatus !== 'delivered'
  ) {
    setOps.status = 'fulfilled'
  }

  const selectedRate = shipmentData?.selected_rate || shipmentData?.rates?.[0]
  const rateValue =
    typeof selectedRate?.rate === 'string'
      ? Number.parseFloat(selectedRate.rate)
      : typeof selectedRate?.rate === 'number'
        ? selectedRate.rate
        : NaN
  const normalizedRate = Number.isFinite(rateValue) ? Number(rateValue.toFixed(2)) : undefined
  const normalizedCurrency =
    typeof selectedRate?.currency === 'string' && selectedRate.currency.trim()
      ? selectedRate.currency.trim().toUpperCase()
      : undefined
  const statusTimestamp =
    shipmentData?.tracker?.updated_at ||
    shipmentData?.tracker?.last_updated_at ||
    shipmentData?.updated_at ||
    shipmentData?.created_at ||
    new Date().toISOString()
  const lastEventDate =
    statusTimestamp && !Number.isNaN(Date.parse(statusTimestamp))
      ? new Date(statusTimestamp)
      : new Date()
  const shippingStatus = Object.fromEntries(
    Object.entries({
      status: shipmentData?.status || 'label_created',
      carrier,
      service: selectedRate?.service || undefined,
      trackingCode: trackingNumber || undefined,
      trackingUrl,
      labelUrl,
      cost: normalizedRate,
      currency: normalizedCurrency,
      lastEventAt: lastEventDate.toISOString(),
    }).filter(([, value]) => value !== undefined),
  )
  if (Object.keys(shippingStatus).length) {
    setOps.shippingStatus = shippingStatus
  }
  if (carrier) {
    setOps.carrier = carrier
  }
  if (trackingNumber) {
    setOps.trackingNumber = trackingNumber
  }
  if (trackingUrl) {
    setOps.trackingUrl = trackingUrl
  }
  if (selectedRate?.service) {
    setOps.service = selectedRate.service
  }
  setOps['fulfillment.status'] = shippingStatus.status || 'label_created'
  setOps.shippedAt = shippingStatus.lastEventAt
  if (typeof selectedRate?.delivery_days === 'number') {
    setOps.deliveryDays = selectedRate.delivery_days
  }
  if (shipmentData?.tracker?.est_delivery_date) {
    setOps.estimatedDeliveryDate = new Date(shipmentData.tracker.est_delivery_date).toISOString()
  }
  if ((selectedRate as any)?.id || selectedRate?.service_code) {
    setOps.easypostRateId = (selectedRate as any)?.id || selectedRate?.service_code || undefined
  }

  const logParts = [
    'Label generated via EasyPost',
    carrier && selectedRate?.service ? `(${carrier} – ${selectedRate.service})` : carrier ? `(${carrier})` : null,
  ].filter(Boolean)
  const logEntry =
    trackingNumber || labelUrl
      ? {
          _type: 'shippingLogEntry',
          _key: randomUUID(),
          status: shipmentData?.status || 'label_created',
          message: logParts.join(' '),
          labelUrl: labelUrl || undefined,
          trackingUrl: trackingUrl || undefined,
          trackingNumber: trackingNumber || undefined,
          weight:
            typeof shipmentData?.parcel?.weight === 'number'
              ? Number(shipmentData.parcel.weight)
              : undefined,
          createdAt: new Date().toISOString(),
        }
      : null

  if (!Object.keys(setOps).length && !logEntry) return

  const patch = sanity.patch(order._id).setIfMissing({})
  if (Object.keys(setOps).length) patch.set(setOps)
  if (logEntry) {
    patch.setIfMissing({shippingLog: []}).append('shippingLog', [logEntry])
  }
  await patch.commit({autoGenerateArrayKeys: true})
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
    _key: randomUUID(),
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
  const startTime = Date.now()
  let payload: EasyPostEvent | null = null

  const finalize = async (
    response: {statusCode: number; headers?: Record<string, string>; body: string},
    status: 'success' | 'error' | 'warning',
    result?: unknown,
    error?: unknown,
  ) => {
    await logFunctionExecution({
      functionName: 'easypostWebhook',
      status,
      duration: Date.now() - startTime,
      eventData: event,
      result,
      error,
      metadata: {
        webhookId: payload?.id,
        status: payload?.status,
      },
    })
    return response
  }

  try {
    if (event.httpMethod === 'OPTIONS') {
      return await finalize({statusCode: 204, headers: CORS_HEADERS, body: ''}, 'success')
    }

    if (event.httpMethod !== 'POST') {
      return await finalize(
        {
          statusCode: 405,
          headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Method Not Allowed'}),
        },
        'error',
      )
    }

    const providerEnabled =
      SHIPPING_PROVIDER === 'easypost' || SHIPPING_PROVIDER === 'parcelcraft' // allow legacy value

    if (!providerEnabled) {
      console.warn('easypostWebhook received event but shipping provider is disabled', {
        SHIPPING_PROVIDER,
      })
      return await finalize(
        {
          statusCode: 200,
          headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
          body: JSON.stringify({ok: true, ignored: true, reason: 'EasyPost integration disabled'}),
        },
        'warning',
        {ignored: true},
      )
    }

    if (SHIPPING_PROVIDER === 'parcelcraft') {
      console.warn('easypostWebhook: SHIPPING_PROVIDER=parcelcraft (legacy) — proceed as EasyPost')
    }

    if (!WEBHOOK_SECRET) {
      console.error('easypostWebhook missing EASYPOST_WEBHOOK_SECRET; reject webhook')
      return await finalize(
        {
          statusCode: 500,
          headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
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

    if (!verifySignature(rawBodyBuffer, event.headers || {})) {
      return await finalize(
        {
          statusCode: 401,
          headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Invalid webhook signature'}),
        },
        'error',
        {reason: 'invalid signature'},
      )
    }

    try {
      const rawBody = rawBodyBuffer.toString('utf8')
      payload = JSON.parse(rawBody || '{}')
    } catch (err) {
      console.error('easypostWebhook failed to parse payload', err)
      return await finalize(
        {
          statusCode: 400,
          headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: 'Invalid payload'}),
        },
        'error',
        undefined,
        err,
      )
    }

    if (!payload || payload.object !== 'Event') {
      return await finalize(
        {
          statusCode: 200,
          headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
          body: JSON.stringify({ok: true, ignored: true}),
        },
        'warning',
        {ignored: true},
      )
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
      return await finalize(
        {
          statusCode: 500,
          headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
          body: JSON.stringify({error: message || 'Webhook processing failed'}),
        },
        'error',
        undefined,
        err,
      )
    }

    return await finalize(
      {
        statusCode: 200,
        headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
        body: JSON.stringify({ok: true}),
      },
      'success',
      {ok: true},
    )
  } catch (error) {
    return await finalize(
      {
        statusCode: 500,
        headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Internal error'}),
      },
      'error',
      undefined,
      error,
    )
  }
}
