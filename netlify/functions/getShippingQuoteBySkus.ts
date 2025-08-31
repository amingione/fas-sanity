import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'

// CORS helper (uses CORS_ALLOW like other functions)
const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) o = origin
    else if (DEFAULT_ORIGINS.includes(origin)) o = origin
  }
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

// Sanity client to read product shipping fields
const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN || process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false,
})

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY || ''

function parseDims(s?: string): { length: number; width: number; height: number; unit: 'inch' } | null {
  if (!s) return null
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/)
  if (!m) return null
  const [ , L, W, H ] = m
  return { length: Number(L), width: Number(W), height: Number(H), unit: 'inch' as const }
}

const looksLikeCarrierId = (s?: string) => typeof s === 'string' && /[a-f0-9]{8}-[a-f0-9]{4}-/i.test(s)

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  if (!SHIPENGINE_API_KEY) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing SHIPENGINE_API_KEY' }) }
  }

  type CartItem = { sku: string; quantity?: number }
  type Dest = {
    name?: string
    phone?: string
    email?: string
    address_line1?: string
    addressLine1?: string
    address_line2?: string
    addressLine2?: string
    city_locality?: string
    city?: string
    state_province?: string
    state?: string
    postal_code?: string
    postalCode?: string
    country_code?: string
    country?: string
  }

  let body: any = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const cart: CartItem[] = Array.isArray(body?.cart) ? body.cart : []
  const dest: Dest = body?.destination || body?.to || {}

  if (!Array.isArray(cart) || cart.length === 0) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing cart (skus + qty)' }) }
  }
  if (!dest || !(dest.addressLine1 || dest.address_line1) || !(dest.postalCode || dest.postal_code) || !(dest.country || dest.country_code)) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing destination address fields' }) }
  }

  const toAddress = {
    name: dest.name,
    phone: dest.phone,
    address_line1: (dest.addressLine1 || dest.address_line1) as string,
    address_line2: (dest.addressLine2 || dest.address_line2) as string | undefined,
    city_locality: (dest.city || dest.city_locality) as string | undefined,
    state_province: (dest.state || dest.state_province) as string | undefined,
    postal_code: (dest.postalCode || dest.postal_code) as string,
    country_code: (dest.country || dest.country_code) as string,
  }

  const fromAddress = {
    name: process.env.SHIP_FROM_NAME || 'F.A.S. Motorsports LLC',
    phone: process.env.SHIP_FROM_PHONE || '(812) 200-9012',
    address_line1: process.env.SHIP_FROM_ADDRESS1 || '6161 Riverside Dr',
    address_line2: process.env.SHIP_FROM_ADDRESS2 || undefined,
    city_locality: process.env.SHIP_FROM_CITY || 'Punta Gorda',
    state_province: process.env.SHIP_FROM_STATE || 'FL',
    postal_code: process.env.SHIP_FROM_POSTAL_CODE || '33982',
    country_code: process.env.SHIP_FROM_COUNTRY || 'US',
  }

  try {
    const skus = cart.map(c => (c?.sku || '').trim()).filter(Boolean)
    const qtyBySku = new Map<string, number>()
    for (const c of cart) {
      const sku = (c?.sku || '').trim()
      if (!sku) continue
      qtyBySku.set(sku, (qtyBySku.get(sku) || 0) + (Number(c?.quantity || 1)))
    }

    const products: any[] = await sanity.fetch(
      `*[_type == "product" && sku in $skus]{_id, title, sku, shippingWeight, boxDimensions, shipsAlone, shippingClass}`,
      { skus }
    )

    // Package logic (mirrors fulfill-order.ts)
    const defaultDims = {
      unit: 'inch' as const,
      length: Number(process.env.DEFAULT_PACKAGE_LENGTH_IN || 12),
      width: Number(process.env.DEFAULT_PACKAGE_WIDTH_IN || 9),
      height: Number(process.env.DEFAULT_PACKAGE_HEIGHT_IN || 4),
    }

    let combinedWeight = 0
    let maxDims = { ...defaultDims }
    let freightRequired = false
    const soloPackages: Array<{ weight: number; dims: typeof defaultDims; sku?: string; title?: string; qty?: number }> = []

    function bySku(sku: string) {
      return products.find(p => p?.sku === sku) || null
    }

    for (const sku of skus) {
      const qty = Number(qtyBySku.get(sku) || 1)
      const prod = bySku(sku)
      const weight = Number(prod?.shippingWeight || 0)
      const dims = parseDims(prod?.boxDimensions || '') || null
      const shipsAlone = Boolean(prod?.shipsAlone)
      const shippingClass = (prod?.shippingClass || '').toString()

      if (/^freight$/i.test(shippingClass)) freightRequired = true
      const anyDim = dims ? Math.max(dims.length, dims.width, dims.height) : 0
      const totalPieceWeight = weight * qty
      if (weight >= 70 || anyDim >= 60 || totalPieceWeight >= 150) freightRequired = true

      if (weight > 0) {
        if (shipsAlone) {
          for (let i = 0; i < qty; i++) {
            soloPackages.push({ weight, dims: dims || defaultDims, sku, title: prod?.title, qty: 1 })
          }
        } else {
          combinedWeight += weight * qty
          if (dims) {
            maxDims.length = Math.max(maxDims.length, dims.length)
            maxDims.width = Math.max(maxDims.width, dims.width)
            maxDims.height = Math.max(maxDims.height, dims.height)
          }
        }
      }
    }

    if (combinedWeight === 0 && soloPackages.length === 0) {
      combinedWeight = Number(process.env.DEFAULT_PACKAGE_WEIGHT_LBS || 5)
    }

    const packages: Array<{ weight: { value: number; unit: 'pound' }; dimensions: typeof defaultDims; sku?: string; title?: string }> = []
    if (combinedWeight > 0) packages.push({ weight: { value: combinedWeight, unit: 'pound' }, dimensions: maxDims })
    for (const p of soloPackages) packages.push({ weight: { value: p.weight, unit: 'pound' }, dimensions: p.dims, sku: p.sku, title: p.title })

    if (freightRequired) {
      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ freight: true, message: 'Freight required due to weight/dimensions or product class.', packages }),
      }
    }

    // Carrier selection
    let serviceCode = process.env.SHIPENGINE_SERVICE_CODE || process.env.DEFAULT_SHIPENGINE_SERVICE_CODE || ''
    let carrierId = process.env.SHIPENGINE_CARRIER_ID || process.env.DEFAULT_SHIPENGINE_CARRIER_ID || ''
    if (!looksLikeCarrierId(carrierId)) carrierId = ''

    let carrierIds: string[] = []
    if (carrierId) carrierIds = [carrierId]
    else {
      const carriersResp = await fetch('https://api.shipengine.com/v1/carriers', {
        headers: { 'API-Key': SHIPENGINE_API_KEY, 'Content-Type': 'application/json' },
      })
      const carriersJson: any = await carriersResp.json().catch(() => null)
      carrierIds = Array.isArray(carriersJson) ? carriersJson.map((c: any) => c.carrier_id).filter(Boolean) : []
    }

    const ratesResp = await fetch('https://api.shipengine.com/v1/rates', {
      method: 'POST',
      headers: { 'API-Key': SHIPENGINE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rate_options: { carrier_ids: carrierIds },
        shipment: {
          ship_to: toAddress,
          ship_from: fromAddress,
          packages,
        },
      }),
    })

    const ratesJson: any = await ratesResp.json().catch(() => null)
    if (!ratesResp.ok) {
      return { statusCode: ratesResp.status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: ratesJson }) }
    }

    const ratesArr: any[] = Array.isArray(ratesJson?.rate_response?.rates) ? ratesJson.rate_response.rates : []
    const rates = ratesArr.map((rate: any) => ({
      carrierId: rate.carrier_id,
      carrierCode: rate.carrier_code,
      carrier: rate.carrier_friendly_name,
      serviceName: rate.service_friendly_name || rate.service_type || rate.service_code,
      serviceCode: rate.service_code,
      amount: Number(rate.shipping_amount?.amount ?? 0),
      currency: rate.shipping_amount?.currency || 'USD',
      deliveryDays: rate.delivery_days ?? null,
      estimatedDeliveryDate: rate.estimated_delivery_date ?? null,
    }))

    rates.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0))
    const bestRate = rates[0] || null

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, freight: false, bestRate, rates, packages }),
    }
  } catch (err: any) {
    console.error('getShippingQuoteBySkus error:', err)
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: err?.message || 'Server error' }) }
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
