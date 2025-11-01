import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import { getShipEngineFromAddress } from '../lib/ship-from'

const ALLOW_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3333'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY || ''

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false
})

const extractShipEngineErrorMessage = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined
  const data = payload as Record<string, any>

  const collectMessages = (value: unknown): string[] => {
    if (!value) return []
    if (Array.isArray(value)) {
      return value.flatMap((item) => collectMessages(item))
    }
    if (typeof value === 'string') return [value]
    if (typeof value === 'object') {
      const obj = value as Record<string, any>
      const msgs: string[] = []
      if (typeof obj.message === 'string') msgs.push(obj.message)
      if (typeof obj.detail === 'string') msgs.push(obj.detail)
      if (typeof obj.error === 'string') msgs.push(obj.error)
      if (Array.isArray(obj.errors)) {
        for (const item of obj.errors) {
          msgs.push(...collectMessages(item))
        }
      }
      return msgs
    }
    return []
  }

  const directKeys = ['message', 'error', 'error_description', 'detail']
  for (const key of directKeys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  if (Array.isArray(data.errors)) {
    const messages = collectMessages(data.errors).filter((msg) => msg && msg.trim())
    if (messages.length) return messages.join('; ')
  }

  if (data.details) {
    const nested = collectMessages(data.details)
    if (nested.length) return nested.join('; ')
  }

  return undefined
}

export const handler: Handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  let body: any = {}
  try { body = JSON.parse(event.body || '{}') } catch { body = {} }

  // Two payload shapes are supported:
  // A) From shippingLabel doc: { ship_to, ship_from, service_code, package_details }
  // B) From orders UI: { orderId, serviceCode, carrier, weight, dimensions }
  const ship_to = body.ship_to
  const service_code = body.service_code || body.serviceCode
  const package_details = body.package_details

  const orderId = body.orderId as string | undefined
  const invoiceId = body.invoiceId as string | undefined
  const weight = body.weight || package_details?.weight
  const dimensions = body.dimensions || package_details?.dimensions
  const carrierId = body.carrier || body.carrier_id || body.carrierId

  if (!service_code) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing service_code/serviceCode' }),
    }
  }

  if (!weight) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing weight' }),
    }
  }

  if (!dimensions || !dimensions.length || !dimensions.width || !dimensions.height) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing or incomplete dimensions' }),
    }
  }

  try {
    // Derive addresses depending on payload
    let toAddress = ship_to
    const fromAddress = getShipEngineFromAddress()

    if (!toAddress) {
      // Try derive from order or invoice
      if (orderId) {
        const order = await sanity.fetch(`*[_type == "order" && _id == $id][0]{ shippingAddress }`, { id: orderId })
        const sa = order?.shippingAddress || {}
        toAddress = {
          name: sa?.name,
          phone: sa?.phone,
          address_line1: sa?.addressLine1,
          address_line2: sa?.addressLine2,
          city_locality: sa?.city,
          state_province: sa?.state,
          postal_code: sa?.postalCode,
          country_code: sa?.country || 'US',
        }
      } else if (invoiceId) {
        const inv = await sanity.fetch(`*[_type == "invoice" && _id == $id][0]{ shipTo }`, { id: invoiceId })
        const st = inv?.shipTo || {}
        toAddress = {
          name: st?.name,
          phone: st?.phone,
          address_line1: st?.address_line1,
          address_line2: st?.address_line2,
          city_locality: st?.city_locality,
          state_province: st?.state_province,
          postal_code: st?.postal_code,
          country_code: st?.country_code || 'US',
        }
      }
    }

    const shipment = {
      ship_to: toAddress,
      ship_from: fromAddress,
      packages: [
        {
          weight: { value: Number(weight?.value ?? weight) || 1, unit: (weight?.unit || 'pound') },
          dimensions: {
            length: Number(dimensions.length),
            width: Number(dimensions.width),
            height: Number(dimensions.height),
            unit: 'inch',
          },
        },
      ],
    }

    if (!SHIPENGINE_API_KEY) {
      return { statusCode: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing SHIPENGINE_API_KEY' }) }
    }

    // Create label directly using provided service + carrier or derive carrier from ShipEngine
    const labelReq = {
      shipment: {
        service_code,
        carrier_id: carrierId || undefined,
        ship_to: shipment.ship_to,
        ship_from: shipment.ship_from,
        packages: shipment.packages,
      },
      label_format: 'pdf',
      label_download_type: 'url',
      external_order_id: orderId || invoiceId || undefined,
    }

    const labelResp = await fetch('https://api.shipengine.com/v1/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'API-Key': SHIPENGINE_API_KEY },
      body: JSON.stringify(labelReq),
    })
    const labelData = await labelResp.json()
    if (!labelResp.ok) {
      const friendlyError =
        extractShipEngineErrorMessage(labelData) || `ShipEngine label request failed (HTTP ${labelResp.status})`
      return {
        statusCode: labelResp.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: friendlyError, details: labelData }),
      }
    }

    const trackingNumber = labelData?.tracking_number
    const labelUrl = labelData?.label_download?.href || labelData?.label_download?.pdf
    const trackingUrl =
      labelData?.tracking_url ||
      labelData?.trackingStatus?.public_url ||
      labelData?.tracking_status?.public_url ||
      undefined

    // Patch target doc with tracking/label if we know what to update
    try {
      if (orderId) {
        await sanity
          .patch(orderId)
          .set({ shippingLabelUrl: labelUrl, trackingNumber, trackingUrl })
          .setIfMissing({ shippingLog: [] })
          .append('shippingLog', [{ _type: 'shippingLogEntry', status: 'label_created', labelUrl, trackingNumber, trackingUrl, createdAt: new Date().toISOString() }])
          .commit({ autoGenerateArrayKeys: true })
        // Also create a Shipping Label document for reference
        try {
          await sanity.create({
            _type: 'shippingLabel',
            name: `Order ${orderId.slice(-6)} Label`,
            trackingNumber,
            labelUrl,
            createdAt: new Date().toISOString(),
          })
        } catch {}
      } else if (invoiceId) {
        await sanity.patch(invoiceId).set({ status: 'Shipped' }).commit({ autoGenerateArrayKeys: true })
      }
    } catch {}

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trackingNumber,
        trackingUrl,
        labelUrl,
        invoiceUpdated: Boolean(invoiceId),
        raw: labelData,
      }),
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'Label create failed' }),
    }
  }
}
