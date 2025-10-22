import type { Handler } from '@netlify/functions'
import { createHmac } from 'crypto'
import { createClient } from '@sanity/client'
import {
  fetchShipStationResource,
  resolveOrderIdFromShipment,
  findOrderIdByOrderNumber,
  ShipStationWebhookEvent,
} from '../lib/shipstation'

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:3333,http://localhost:8888').split(',')
function makeCORS(origin?: string) {
  const o = origin && (DEFAULT_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/i.test(origin)) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ShipStation-Signature, X-Shipstation-Signature',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  }
}

function verifySignature(rawBody: string, headers: Record<string, any>): boolean {
  const secret = (process.env.SHIPSTATION_WEBHOOK_SECRET || '').trim()
  if (!secret) return true
  const signatureHeader =
    headers['x-shipstation-signature'] ||
    headers['x-shipstation-signature'.toLowerCase()] ||
    headers['x-shipstation-hmac-sha256'] ||
    headers['x-shipstation-hmac-sha256'.toLowerCase()]
  if (!signatureHeader || typeof signatureHeader !== 'string') return false
  const computed = createHmac('sha256', secret).update(rawBody).digest('base64')
  return signatureHeader.trim() === computed
}

async function handleShipmentEvent(event: ShipStationWebhookEvent, rawBody: string) {
  if (!event.resource_url) throw new Error('Missing resource_url')
  const shipment = await fetchShipStationResource<any>(event.resource_url)
  const { orderId, orderNumber } = await resolveOrderIdFromShipment(shipment)

  let docId = orderId
  if (!docId) {
    docId = await findOrderIdByOrderNumber(sanity, orderNumber)
  }
  if (!docId) {
    throw new Error(`Unable to resolve order for shipment ${shipment?.shipmentId || event.resource_id}`)
  }

  const labelUrl =
    shipment?.labelData?.fileUrl ||
    shipment?.labelDownload?.href ||
    shipment?.labelDownload?.pdf ||
    shipment?.label_url ||
    undefined

  const trackingNumber =
    shipment?.trackingNumber ||
    shipment?.tracking_number ||
    shipment?.packages?.[0]?.trackingNumber ||
    undefined

  const trackingUrl =
    shipment?.trackingUrl ||
    shipment?.tracking_url ||
    undefined

  const carrierCode = shipment?.carrierCode || shipment?.carrier_code
  const serviceCode = shipment?.serviceCode || shipment?.service_code
  const serviceName = shipment?.serviceName || shipment?.service || shipment?.service_type
  const carrierName = shipment?.carrierFriendlyName || shipment?.carrier || shipment?.carrierName

  const logEntry = {
    _type: 'shippingLogEntry',
    status: 'label_created',
    message: `Label generated via ShipStation (${carrierCode || 'carrier'} – ${serviceCode || 'service'})`,
    createdAt: new Date().toISOString(),
    trackingNumber,
    trackingUrl,
    labelUrl,
  }

  await sanity
    .patch(docId)
    .set({
      shippingCarrier: carrierCode || carrierName || undefined,
      selectedService: {
        carrierId: carrierCode || undefined,
        carrier: carrierName || undefined,
        service: serviceName || undefined,
        serviceCode: serviceCode || undefined,
        amount: Number.isFinite(Number(shipment?.shipmentCost)) ? Number(shipment?.shipmentCost) : undefined,
        currency: shipment?.shipmentCostCurrency || undefined,
      },
      shipStationOrderId: shipment?.orderId ? String(shipment.orderId) : undefined,
      shipStationLabelId: shipment?.shipmentId ? String(shipment.shipmentId) : undefined,
      trackingNumber: trackingNumber || undefined,
      trackingUrl: trackingUrl || undefined,
      shippingLabelUrl: labelUrl || undefined,
    })
    .setIfMissing({ shippingLog: [] })
    .append('shippingLog', [logEntry])
    .commit({ autoGenerateArrayKeys: true })
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  const rawBody = event.body || ''
  if (!verifySignature(rawBody, event.headers || {})) {
    return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid signature' }) }
  }

  try {
    const payload: ShipStationWebhookEvent = JSON.parse(rawBody || '{}')
      const resourceType = (payload.resource_type || '').toUpperCase()
    const eventType = (payload.event || '').toUpperCase()

    if (resourceType.includes('SHIPMENT') || eventType.includes('SHIP')) {
      await handleShipmentEvent(payload, rawBody)
    }

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) }
  } catch (err: any) {
    console.error('shipstation-webhook error', err)
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'Webhook handling failed' }),
    }
  }
}
