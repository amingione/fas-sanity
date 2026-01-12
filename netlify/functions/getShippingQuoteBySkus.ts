import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {randomUUID, createHash} from 'crypto'
import {getEasyPostFromAddress} from '../lib/ship-from'
import {getEasyPostAddressMissingFields, getEasyPostParcelMissingFields} from '../lib/easypostValidation'
import {easypostRequest, getEasyPostClient} from '../lib/easypostClient'

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

const FREIGHT_WEIGHT_THRESHOLD_LBS = 150

const SHIPPING_QUOTE_DOC_PREFIX = 'shippingQuote.'
const SHIPPING_QUOTE_CACHE_TTL_SECONDS = Number(
  process.env.SHIPPING_QUOTE_CACHE_TTL_SECONDS || 1800,
)

type QuoteCacheDestination = {
  addressLine1: string
  city: string
  state: string
  postalCode: string
  country: string
}

type QuoteCacheCartItem = {
  identifier: string
  quantity: number
}

const normalizeCacheDestination = (dest: Dest): QuoteCacheDestination => ({
  addressLine1: (dest.addressLine1 || dest.address_line1 || '').trim(),
  city: (dest.city || dest.city_locality || '').trim(),
  state: (dest.state || dest.state_province || '').trim().toUpperCase(),
  postalCode: (dest.postalCode || dest.postal_code || '').trim().replace(/\s+/g, '').toUpperCase(),
  country: (dest.country || dest.country_code || 'US').trim().toUpperCase(),
})

const normalizeCacheCartItems = (cart: CartItem[]): QuoteCacheCartItem[] =>
  cart.map((item) => {
    const quantity =
      typeof item.quantity === 'number' && Number.isFinite(item.quantity)
        ? Math.max(1, Math.floor(item.quantity))
        : 1
    const identifier =
      (item.sku && item.sku.trim()) ||
      (item.productId && item.productId.trim()) ||
      (item.id && item.id.trim()) ||
      (item._id && item._id.trim()) ||
      'custom_item'
    return {
      identifier,
      quantity,
    }
  })

const buildLocalQuoteKey = (cartItems: QuoteCacheCartItem[], destination: QuoteCacheDestination) => {
  const normalizedItems = [...cartItems].sort((a, b) =>
    a.identifier.localeCompare(b.identifier),
  )
  const canonical = {
    items: normalizedItems,
    destination: {
      addressLine1: destination.addressLine1.toLowerCase(),
      city: destination.city.toLowerCase(),
      state: destination.state,
      postalCode: destination.postalCode,
      country: destination.country,
    },
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

const buildCartSummary = (items: QuoteCacheCartItem[]): string => {
  return items
    .map((item) => `${item.identifier || 'item'} x${item.quantity}`)
    .filter((value) => !!value)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim()
}

const getQuoteCacheDocId = (quoteKey: string) => `${SHIPPING_QUOTE_DOC_PREFIX}${quoteKey}`

const isCacheValid = (expiresAt?: string | null) => {
  if (!expiresAt) return true
  const timestamp = Number(new Date(expiresAt).getTime())
  if (!Number.isFinite(timestamp)) return false
  return timestamp > Date.now()
}

async function readCachedQuote(
  quoteKey: string,
): Promise<{
  docId: string
  rates: NormalizedRate[]
  easyPostShipmentId?: string | null
  packages?: any[]
  missingProducts?: string[]
  carrierId?: string
  serviceCode?: string
  source?: string
  rateCount?: number
  cartSummary?: string
  createdAt?: string | null
  expiresAt?: string | null
} | null> {
  const docId = getQuoteCacheDocId(quoteKey)
  try {
    const cached = await sanity.fetch<{
      _id?: string
      rates?: NormalizedRate[]
      easyPostShipmentId?: string | null
      expiresAt?: string | null
      packages?: any[]
      missingProducts?: string[]
      carrierId?: string
      serviceCode?: string
      source?: string | null
      rateCount?: number
      cartSummary?: string
      createdAt?: string | null
    } | null>(
      '*[_id == $id][0]{_id, rates, easyPostShipmentId, expiresAt, packages, missingProducts, carrierId, serviceCode, source, rateCount, cartSummary, createdAt}',
      {id: docId},
    )
    if (
      !cached ||
      !Array.isArray(cached.rates) ||
      !cached.rates.length ||
      !isCacheValid(cached.expiresAt)
    ) {
      return null
    }
    return {
      docId,
      rates: cached.rates,
      easyPostShipmentId: cached.easyPostShipmentId,
      packages: cached.packages,
      missingProducts: cached.missingProducts,
      carrierId: cached.carrierId,
      serviceCode: cached.serviceCode,
      source: cached.source || 'fresh',
      rateCount:
        typeof cached.rateCount === 'number'
          ? cached.rateCount
          : Array.isArray(cached.rates)
            ? cached.rates.length
            : 0,
      cartSummary: cached.cartSummary || '',
      createdAt: cached.createdAt || null,
      expiresAt: cached.expiresAt || null,
    }
  } catch (error) {
    console.warn('readCachedQuote failed', {quoteKey, error})
    return null
  }
}

async function persistQuoteCache(params: {
  quoteKey: string
  quoteRequestId: string
  rates: NormalizedRate[]
  easyPostShipmentId: string
  destination: QuoteCacheDestination
  packages: any[]
  missingProducts: string[]
  carrierId?: string
  serviceCode?: string
  cartSummary: string
  rateCount: number
  source: 'fresh' | 'cache'
}): Promise<{docId: string; createdAt: string; expiresAt?: string}> {
  const {quoteKey, quoteRequestId, rates, easyPostShipmentId, destination, packages, missingProducts, carrierId, serviceCode} = params
  const docId = getQuoteCacheDocId(quoteKey)
  const nowIso = new Date().toISOString()
  const ttlSeconds = Number.isFinite(SHIPPING_QUOTE_CACHE_TTL_SECONDS)
    ? SHIPPING_QUOTE_CACHE_TTL_SECONDS
    : 0
  const expiresAt =
    ttlSeconds > 0 ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : undefined
  try {
    await sanity.createOrReplace({
      _id: docId,
      _type: 'shippingQuote',
      quoteKey,
      quoteRequestId,
      easyPostShipmentId,
      destination,
      rates,
      packages,
      missingProducts,
      carrierId,
      serviceCode,
      cartSummary: params.cartSummary,
      source: params.source,
      rateCount: params.rateCount,
      createdAt: nowIso,
      expiresAt,
      updatedAt: nowIso,
    })
    return {docId, createdAt: nowIso, expiresAt}
  } catch (error) {
    console.warn('persistQuoteCache failed', {quoteKey, error})
    return {docId, createdAt: nowIso, expiresAt}
  }
}

type NormalizedRate = {
  rateId?: string
  carrierId?: string
  carrierCode?: string
  carrier?: string
  service?: string
  serviceCode?: string
  amount: number
  currency?: string
  deliveryDays: number | null
  estimatedDeliveryDate: string | null
  accurateDeliveryDate?: string | null
  timeInTransit?: Record<string, any> | null
  deliveryConfidence?: number | null
  deliveryDateGuaranteed?: boolean
}

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

function selectBestRate(
  rates: NormalizedRate[],
  options?: {maxDays?: number; preferredCarrier?: string; confidenceThreshold?: number},
) {
  const opts = {
    maxDays: options?.maxDays ?? 5,
    preferredCarrier: options?.preferredCarrier,
    confidenceThreshold: options?.confidenceThreshold ?? 75,
  }

  if (!Array.isArray(rates) || rates.length === 0) return null

  const eligible = rates.filter((rate) => {
    const days =
      typeof rate?.timeInTransit?.percentile_75 === 'number'
        ? rate.timeInTransit.percentile_75
        : typeof rate?.deliveryDays === 'number'
          ? rate.deliveryDays
          : 999
    const confidence =
      typeof rate?.deliveryConfidence === 'number' ? rate.deliveryConfidence : 100
    return days <= opts.maxDays && confidence >= opts.confidenceThreshold
  })

  if (eligible.length === 0) {
    return [...rates].sort((a, b) => a.amount - b.amount)[0] || null
  }

  if (opts.preferredCarrier) {
    const preferred = eligible.find((r) =>
      (r.carrier || '').toLowerCase().includes(opts.preferredCarrier!.toLowerCase()),
    )
    if (preferred) return preferred
  }

  return [...eligible].sort((a, b) => a.amount - b.amount)[0] || null
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

  const providedQuoteKey =
    typeof body.quoteKey === 'string' && body.quoteKey.trim() ? body.quoteKey.trim() : undefined
  const providedQuoteRequestId =
    typeof body.quoteRequestId === 'string' && body.quoteRequestId.trim()
      ? body.quoteRequestId.trim()
      : undefined

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

  const cacheCartItems = normalizeCacheCartItems(cart)
  const cacheDestination = normalizeCacheDestination(dest)
  const cacheQuoteKey = providedQuoteKey || buildLocalQuoteKey(cacheCartItems, cacheDestination)
  const quoteRequestId = providedQuoteRequestId || randomUUID()
  const cartSummary = buildCartSummary(cacheCartItems)

  const cachedQuote = await readCachedQuote(cacheQuoteKey)
  if (cachedQuote) {
    const cachedBest = selectBestRate(cachedQuote.rates)
    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        success: true,
        freight: false,
        bestRate: cachedBest,
        rates: cachedQuote.rates,
        packages: cachedQuote.packages || [],
        installOnlySkus: [],
        missingProducts: cachedQuote.missingProducts || [],
        carrierId: cachedQuote.carrierId,
        serviceCode: cachedQuote.serviceCode,
        shippingQuoteId: cachedQuote.docId,
        easyPostShipmentId: cachedQuote.easyPostShipmentId,
        quoteKey: cacheQuoteKey,
        quoteRequestId,
        source: 'cache',
        rateCount: cachedQuote.rateCount,
        cartSummary: cachedQuote.cartSummary,
        createdAt: cachedQuote.createdAt,
        expiresAt: cachedQuote.expiresAt,
      }),
    }
  }

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
        productType,
        shippingWeight,
        boxDimensions,
        shippingConfig{
          weight,
          dimensions{
            length,
            width,
            height
          },
          shippingClass,
          requiresShipping,
          separateShipment
        },
        shipsAlone,
        shippingClass,
        coreRequired,
        promotionTagline
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

    // Package logic (mirrors fulfillOrder.ts)
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

      const shippingConfig = prod?.shippingConfig || {}
      const requiresShipping = shippingConfig.requiresShipping
      const shippingClass = (
        shippingConfig.shippingClass || prod?.shippingClass || ''
      ).toString()
      if (requiresShipping === false || (prod?.productType || '').toLowerCase() === 'service') {
        if (!installOnlyItems.includes(identifier)) installOnlyItems.push(identifier)
        continue
      }

      const rawWeight = shippingConfig.weight ?? prod?.shippingWeight
      const weight = Number(rawWeight ?? 0)
      const configDims = shippingConfig?.dimensions
      const dims =
        (configDims &&
          typeof configDims.length === 'number' &&
          typeof configDims.width === 'number' &&
          typeof configDims.height === 'number'
            ? {
                length: Number(configDims.length),
                width: Number(configDims.width),
                height: Number(configDims.height),
                unit: 'inch' as const,
              }
            : null) ||
        parseDims(prod?.boxDimensions || '') ||
        null
      const shipsAlone = Boolean(
        shippingConfig.separateShipment !== undefined
          ? shippingConfig.separateShipment
          : prod?.shipsAlone,
      )
      const installOnly = isInstallOnlyClass(shippingClass)

      if (installOnly) {
        const key = prod?.sku || prod?._id || identifier
        if (key && !installOnlyItems.includes(key)) installOnlyItems.push(key)
        continue
      }

      shippableCount += 1

      const isExplicitFreight = /^freight$/i.test(shippingClass)
      const dimSource =
        dims ||
        (defaultDims && {
          length: defaultDims.length,
          width: defaultDims.width,
          height: defaultDims.height,
        })

      const anyDim = dimSource ? Math.max(dimSource.length, dimSource.width, dimSource.height) : 0
      const combinedDims = dimSource
        ? dimSource.length + dimSource.width + dimSource.height
        : 0
      const totalPieceWeight = weight * qty

      const exceedsCarrierLimits =
        weight >= FREIGHT_WEIGHT_THRESHOLD_LBS ||
        totalPieceWeight >= FREIGHT_WEIGHT_THRESHOLD_LBS ||
        anyDim > 108 ||
        combinedDims > 165

      if (isExplicitFreight || exceedsCarrierLimits) freightRequired = true

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

    const missingTo = getEasyPostAddressMissingFields(easyPostToAddress)
    if (missingTo.length) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: `Missing ship_to fields: ${missingTo.join(', ')}`}),
      }
    }
    const missingFrom = getEasyPostAddressMissingFields(easyPostFromAddress)
    if (missingFrom.length) {
      return {
        statusCode: 500,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: `Missing ship_from fields: ${missingFrom.join(', ')}`}),
      }
    }
    const parcel = {
      length: Number(primaryPackage.dimensions.length.toFixed(2)),
      width: Number(primaryPackage.dimensions.width.toFixed(2)),
      height: Number(primaryPackage.dimensions.height.toFixed(2)),
      weight: Math.max(1, Math.round(primaryPackage.weight.value * 16)),
    }
    const missingParcel = getEasyPostParcelMissingFields(parcel)
    if (missingParcel.length) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: `Missing parcel fields: ${missingParcel.join(', ')}`}),
      }
    }

    const client = getEasyPostClient()
    const shipment = await client.Shipment.create({
      to_address: easyPostToAddress,
      from_address: easyPostFromAddress,
      parcel,
    } as any)

    // Fetch SmartRates for accurate delivery predictions
    let smartRates: any[] = []
    try {
      const smartRateResponse = await easypostRequest('GET', `/shipments/${shipment.id}/smartrate`)
      if (Array.isArray((smartRateResponse as any)?.result)) {
        smartRates = (smartRateResponse as any).result
      } else if (Array.isArray(smartRateResponse as any)) {
        smartRates = smartRateResponse as any[]
      }
    } catch (err) {
      console.warn('SmartRate unavailable, using basic rates', err)
    }

    const ratesArr: any[] = Array.isArray(shipment?.rates) ? shipment.rates : []
    const rates = ratesArr
      .map((rate: any) => {
        const smartData = smartRates.find(
          (sr) => sr?.carrier === rate?.carrier && sr?.service === rate?.service,
        )
        const smartDeliveryDate = smartData?.delivery_date
          ? new Date(smartData.delivery_date).toISOString()
          : null
        const smartPercentile = smartData?.time_in_transit?.percentile_75
        const amount = Number.parseFloat(rate?.rate || '0')
        const deliveryDate = rate?.delivery_date ? new Date(rate.delivery_date).toISOString() : null
        return {
          rateId: rate?.id,
          carrierId: rate?.carrier_account_id || '',
          carrierCode: rate?.carrier || '',
          carrier: rate?.carrier_display_name || rate?.carrier || '',
          service: rate?.service || '',
          serviceCode: rate?.service_code || '',
          amount: Number.isFinite(amount) ? amount : 0,
          currency: rate?.currency || 'USD',
          deliveryDays:
            typeof smartPercentile === 'number'
              ? smartPercentile
              : typeof rate?.delivery_days === 'number'
                ? rate.delivery_days
                : null,
          estimatedDeliveryDate: smartDeliveryDate || deliveryDate,
          accurateDeliveryDate: smartDeliveryDate || deliveryDate,
          timeInTransit: smartData?.time_in_transit || null,
          deliveryConfidence:
            typeof smartData?.delivery_date_confidence === 'number'
              ? smartData.delivery_date_confidence
              : null,
          deliveryDateGuaranteed: Boolean(smartData?.delivery_date_guaranteed),
        }
      })
      .filter((rate) => Number.isFinite(rate.amount) && rate.amount > 0)
      .sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0))

    const bestRate = selectBestRate(rates) || rates[0] || null

    const carrierId = bestRate?.carrierId || null
    const serviceCode = bestRate?.serviceCode || null

    const persistedQuote = await persistQuoteCache({
      quoteKey: cacheQuoteKey,
      quoteRequestId,
      rates,
      easyPostShipmentId: shipment.id,
      destination: cacheDestination,
      packages,
      missingProducts,
      carrierId,
      serviceCode,
      cartSummary,
      rateCount: rates.length,
      source: 'fresh',
    })

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
        shippingQuoteId: getQuoteCacheDocId(cacheQuoteKey),
        easyPostShipmentId: shipment.id,
        quoteKey: cacheQuoteKey,
        quoteRequestId,
        source: 'fresh',
        rateCount: rates.length,
        cartSummary,
        createdAt: persistedQuote.createdAt,
        expiresAt: persistedQuote.expiresAt,
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
export {buildLocalQuoteKey, buildCartSummary}
