import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {getEasyPostFromAddress} from '../lib/ship-from'
import {getEasyPostClient} from '../lib/easypostClient'

// CORS helper (uses CORS_ALLOW like other functions)
const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')
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
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

function parseDims(
  s?: string,
): {length: number; width: number; height: number; unit: 'inch'} | null {
  if (!s) return null
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/)
  if (!m) return null
  const [, L, W, H] = m
  return {length: Number(L), width: Number(W), height: Number(H), unit: 'inch' as const}
}

const isInstallOnlyClass = (value?: string) =>
  typeof value === 'string' && value.trim().toLowerCase().startsWith('install')

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST')
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }

  type CartItem = {
    sku?: string
    quantity?: number
    productId?: string
    id?: string
    _id?: string
    title?: string
    name?: string
    product?: {_id?: string; sku?: string; title?: string}
  }
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
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON'}),
    }
  }

  const cart: CartItem[] = Array.isArray(body?.cart) ? body.cart : []
  const dest: Dest = body?.destination || body?.to || {}

  if (!Array.isArray(cart) || cart.length === 0) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing cart (skus + qty)'}),
    }
  }
  if (
    !dest ||
    !(dest.addressLine1 || dest.address_line1) ||
    !(dest.postalCode || dest.postal_code) ||
    !(dest.country || dest.country_code)
  ) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing destination address fields'}),
    }
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

  const fromAddress = getEasyPostFromAddress()

  try {
    const normalizeId = (value?: string) => {
      if (!value) return ''
      return value.replace(/^drafts\./, '')
    }

    const skuSet = new Set<string>()
    const idSet = new Set<string>()
    const titleSet = new Set<string>()

    for (const item of cart) {
      const possibleSkus = [item?.sku, item?.product?.sku]
      possibleSkus.forEach((sku) => {
        const normalized = (sku || '').trim()
        if (normalized) skuSet.add(normalized)
      })

      const possibleIds = [item?.productId, item?.id, item?._id, item?.product?._id]
      possibleIds.forEach((pid) => {
        const normalized = normalizeId(pid)
        if (normalized) idSet.add(normalized)
      })

      const possibleTitles = [item?.title, item?.name, item?.product?.title]
      possibleTitles.forEach((title) => {
        const normalized = (title || '').trim()
        if (normalized) titleSet.add(normalized)
      })
    }

    const skus = Array.from(skuSet)
    const ids = Array.from(idSet)
    const titles = Array.from(titleSet)

    const products: any[] = await sanity.fetch(
      `*[_type == "product" && (sku in $skus || _id in $ids || _id in $draftIds || title in $titles)]{
        _id,
        title,
        sku,
        shippingWeight,
        boxDimensions,
        shipsAlone,
        shippingClass
      }`,
      {
        skus,
        ids,
        draftIds: ids.map((id) => `drafts.${id}`),
        titles,
      },
    )

    const productBySku = new Map<string, any>()
    const productById = new Map<string, any>()
    const productByTitle = new Map<string, any>()

    for (const prod of products) {
      const sku = (prod?.sku || '').trim()
      if (sku) productBySku.set(sku, prod)
      const id = normalizeId(prod?._id)
      if (id) productById.set(id, prod)
      const title = (prod?.title || '').trim()
      if (title) productByTitle.set(title, prod)
    }

    // Package logic (mirrors fulfill-order.ts)
    const defaultDims = {
      unit: 'inch' as const,
      length: Number(process.env.DEFAULT_PACKAGE_LENGTH_IN || 12),
      width: Number(process.env.DEFAULT_PACKAGE_WIDTH_IN || 9),
      height: Number(process.env.DEFAULT_PACKAGE_HEIGHT_IN || 4),
    }

    let combinedWeight = 0
    let maxDims = {...defaultDims}
    let freightRequired = false
    let shippableCount = 0
    const installOnlyItems: string[] = []
    const soloPackages: Array<{
      weight: number
      dims: typeof defaultDims
      sku?: string
      title?: string
      qty?: number
    }> = []
    const missingProducts: string[] = []

    function resolveProduct(item: CartItem) {
      const skuCandidates = [item?.sku, item?.product?.sku]
      for (const sku of skuCandidates) {
        const normalized = (sku || '').trim()
        if (normalized && productBySku.has(normalized)) return productBySku.get(normalized)
      }

      const idCandidates = [item?.productId, item?.id, item?._id, item?.product?._id]
      for (const raw of idCandidates) {
        const normalized = normalizeId(raw)
        if (normalized && productById.has(normalized)) return productById.get(normalized)
      }

      const titleCandidates = [item?.title, item?.name, item?.product?.title]
      for (const title of titleCandidates) {
        const normalized = (title || '').trim()
        if (normalized && productByTitle.has(normalized)) return productByTitle.get(normalized)
      }

      return null
    }

    for (const item of cart) {
      const qty = Number(item?.quantity || 1)
      const prod = resolveProduct(item)
      const identifier =
        (item?.sku || '').trim() ||
        normalizeId(item?.productId || item?.id || item?._id || item?.product?._id) ||
        (item?.title || item?.name || item?.product?.title || '').trim() ||
        'unknown'

      if (!prod) {
        missingProducts.push(identifier)
        continue
      }

      const weight = Number(prod?.shippingWeight || 0)
      const dims = parseDims(prod?.boxDimensions || '') || null
      const shipsAlone = Boolean(prod?.shipsAlone)
      const shippingClass = (prod?.shippingClass || '').toString()
      const installOnly = isInstallOnlyClass(shippingClass)

      if (installOnly) {
        const key = prod?.sku || prod?._id || identifier
        if (key && !installOnlyItems.includes(key)) installOnlyItems.push(key)
        continue
      }

      shippableCount += 1

      if (/^freight$/i.test(shippingClass)) freightRequired = true
      const anyDim = dims ? Math.max(dims.length, dims.width, dims.height) : 0
      const totalPieceWeight = weight * qty
      if (weight >= 70 || anyDim >= 60 || totalPieceWeight >= 150) freightRequired = true

      if (weight > 0) {
        if (shipsAlone) {
          for (let i = 0; i < qty; i++) {
            soloPackages.push({
              weight,
              dims: dims || defaultDims,
              sku: prod?.sku || identifier,
              title: prod?.title,
              qty: 1,
            })
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

    if (shippableCount === 0) {
      return {
        statusCode: 200,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          installOnly: true,
          message: 'All items are install-only; schedule installation instead of shipping.',
          installOnlySkus: installOnlyItems,
          missingProducts,
        }),
      }
    }

    if (combinedWeight === 0 && soloPackages.length === 0) {
      combinedWeight = Number(process.env.DEFAULT_PACKAGE_WEIGHT_LBS || 5)
    }

    const packages: Array<{
      weight: {value: number; unit: 'pound'}
      dimensions: typeof defaultDims
      sku?: string
      title?: string
    }> = []
    if (combinedWeight > 0)
      packages.push({weight: {value: combinedWeight, unit: 'pound'}, dimensions: maxDims})
    for (const p of soloPackages)
      packages.push({
        weight: {value: p.weight, unit: 'pound'},
        dimensions: p.dims,
        sku: p.sku,
        title: p.title,
      })

    if (freightRequired) {
      return {
        statusCode: 200,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          freight: true,
          message: 'Freight required due to weight/dimensions or product class.',
          packages,
          installOnlySkus: installOnlyItems,
        }),
      }
    }

    const primaryPackage = packages[0]
    if (!primaryPackage) {
      return {
        statusCode: 200,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          success: true,
          rates: [],
          packages,
          installOnlySkus: installOnlyItems,
          missingProducts,
        }),
      }
    }

    const easyPostToAddress = {
      name: toAddress.name,
      street1: toAddress.address_line1,
      street2: toAddress.address_line2,
      city: toAddress.city_locality,
      state: toAddress.state_province,
      zip: toAddress.postal_code,
      country: toAddress.country_code,
      phone: toAddress.phone,
    }

    const easyPostFromAddress = {
      name: fromAddress.name,
      street1: fromAddress.street1,
      street2: fromAddress.street2,
      city: fromAddress.city,
      state: fromAddress.state,
      zip: fromAddress.zip,
      country: fromAddress.country,
      phone: fromAddress.phone,
      email: fromAddress.email,
    }

    const client = getEasyPostClient()
    const shipment = await client.Shipment.create({
      to_address: easyPostToAddress,
      from_address: easyPostFromAddress,
      parcel: {
        length: Number(primaryPackage.dimensions.length.toFixed(2)),
        width: Number(primaryPackage.dimensions.width.toFixed(2)),
        height: Number(primaryPackage.dimensions.height.toFixed(2)),
        weight: Math.max(1, Math.round(primaryPackage.weight.value * 16)),
      },
    } as any)

    const ratesArr: any[] = Array.isArray(shipment?.rates) ? shipment.rates : []
    const rates = ratesArr
      .map((rate: any) => {
        const amount = Number.parseFloat(rate?.rate || '0')
        return {
          rateId: rate?.id,
          carrierId: rate?.carrier_account_id || '',
          carrierCode: rate?.carrier || '',
          carrier: rate?.carrier_display_name || rate?.carrier || '',
          service: rate?.service || '',
          serviceCode: rate?.service_code || '',
          amount: Number.isFinite(amount) ? amount : 0,
          currency: rate?.currency || 'USD',
          deliveryDays: typeof rate?.delivery_days === 'number' ? rate.delivery_days : null,
          estimatedDeliveryDate: rate?.delivery_date
            ? new Date(rate.delivery_date).toISOString()
            : null,
        }
      })
      .filter((rate) => Number.isFinite(rate.amount) && rate.amount > 0)
      .sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0))

    const bestRate = rates[0] || null

    const carrierId = bestRate?.carrierId || null
    const serviceCode = bestRate?.serviceCode || null

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        success: true,
        freight: false,
        bestRate,
        rates,
        packages,
        installOnlySkus: installOnlyItems,
        carrierId,
        serviceCode,
        missingProducts,
      }),
    }
  } catch (err: any) {
    console.error('getShippingQuoteBySkus error:', err)
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Server error'}),
    }
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
