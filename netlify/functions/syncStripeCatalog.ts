import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import Stripe from 'stripe'
import { mapStripeMetadata } from '../lib/stripeMetadata'

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  const normalized = origin && DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': normalized,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe = stripeSecret ? new Stripe(stripeSecret) : null

const SANITY_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || ''

const SANITY_DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'

if (!SANITY_PROJECT_ID) {
  throw new Error('syncStripeCatalog: missing Sanity project id (set SANITY_STUDIO_PROJECT_ID).')
}

const sanity = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const DEFAULT_CURRENCY = (process.env.STRIPE_DEFAULT_CURRENCY || 'usd').toLowerCase()
const SYNC_SECRET = (process.env.STRIPE_SYNC_SECRET || '').trim()
const MAX_LIMIT = 100

type PortableValue = any

type SanityStripePriceSnapshot = {
  priceId?: string
  active?: boolean
  [key: string]: any
}

type SanityProduct = {
  _id: string
  title?: string
  slug?: string
  sku?: string
  price?: number | string
  salePrice?: number | string
  onSale?: boolean
  availability?: string
  taxBehavior?: string
  taxCode?: string
  shortDescription?: PortableValue
  description?: PortableValue
  stripeProductId?: string
  stripeDefaultPriceId?: string
  stripePriceId?: string
  stripeLastSyncedAt?: string
  stripePrices?: SanityStripePriceSnapshot[]
  primaryImage?: string
}

type SyncOutcome = {
  docId: string
  title: string
  status: string
  stripeProductId?: string
  stripePriceId?: string
  reason?: string
}

function normalizeId(id?: string | null): string {
  if (!id) return ''
  const trimmed = id.toString().trim()
  if (!trimmed) return ''
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

function idVariants(id: string): string[] {
  const base = normalizeId(id)
  if (!base) return []
  const variants = new Set<string>([base, `drafts.${base}`])
  return Array.from(variants)
}

function toUnitAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.round(value * 100)
  }
  if (typeof value === 'string') {
    const num = Number(value)
    if (!Number.isFinite(num) || num <= 0) return null
    return Math.round(num * 100)
  }
  return null
}

function portableTextToPlain(blocks: PortableValue): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      if (block._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children.map((child: any) => (typeof child?.text === 'string' ? child.text : '')).join('')
    })
    .filter((text) => typeof text === 'string' && text.trim())
    .join('\n\n')
    .trim()
}

function selectDescription(product: SanityProduct): string {
  const shortDesc = portableTextToPlain(product.shortDescription)
  if (shortDesc) return shortDesc.slice(0, 5000)
  const fullDesc = portableTextToPlain(product.description)
  return fullDesc.slice(0, 5000)
}

function determineActive(product: SanityProduct): boolean {
  const availability = (product.availability || '').toLowerCase()
  if (availability === 'out_of_stock') return false
  return true
}

type PriceInfo = {
  amount: number
  amountMajor: number
  currency: string
  source: 'price' | 'salePrice'
  nickname: string
}

function selectPrice(product: SanityProduct): PriceInfo | null {
  const saleActive = Boolean(product.onSale)
  const saleAmount = saleActive ? toUnitAmount(product.salePrice) : null
  const baseAmount = toUnitAmount(product.price)

  const amount = saleAmount ?? baseAmount
  if (amount === null) return null

  const amountMajor = amount / 100
  const currency = (DEFAULT_CURRENCY || 'usd').toLowerCase()
  const source: PriceInfo['source'] = saleAmount !== null ? 'salePrice' : 'price'
  const nickname = saleAmount !== null ? 'Sale price' : 'Standard price'

  return { amount, amountMajor, currency, source, nickname }
}

function filterMetadata(meta: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (!key) continue
    if (value === undefined || value === null) continue
    const text = typeof value === 'string' ? value : String(value)
    const trimmed = text.trim()
    if (!trimmed) continue
    result[key] = trimmed.slice(0, 500)
  }
  return result
}

function buildMetadata(product: SanityProduct, normalizedId: string): Record<string, string> {
  return filterMetadata({
    sanity_product_id: normalizedId,
    sanity_slug: product.slug,
    sku: product.sku,
    sanity_project_id: SANITY_PROJECT_ID,
    sanity_dataset: SANITY_DATASET,
    sanity_title: product.title,
    sanity_availability: product.availability,
  })
}

function isStripeMissingError(err: any): boolean {
  if (!err) return false
  if (err?.statusCode === 404) return true
  const code = err?.code || err?.raw?.code || err?.raw?.error?.code
  return code === 'resource_missing'
}

function unixToIso(timestamp?: number | null): string | undefined {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return undefined
  return new Date(timestamp * 1000).toISOString()
}

function buildPriceSnapshot(price: Stripe.Price) {
  const metadataEntries = mapStripeMetadata(price.metadata as Record<string, unknown> | null)
  return {
    _type: 'stripePriceSnapshot',
    _key: price.id,
    priceId: price.id,
    nickname: price.nickname || undefined,
    currency: price.currency ? price.currency.toUpperCase() : undefined,
    unitAmount: typeof price.unit_amount === 'number' ? price.unit_amount / 100 : undefined,
    unitAmountRaw: typeof price.unit_amount === 'number' ? price.unit_amount : undefined,
    type: price.type,
    billingScheme: price.billing_scheme,
    recurringInterval: price.recurring?.interval || undefined,
    recurringIntervalCount: price.recurring?.interval_count ?? undefined,
    active: price.active,
    livemode: price.livemode,
    createdAt: unixToIso(price.created) || new Date().toISOString(),
    lookupKey: price.lookup_key || undefined,
    taxBehavior: price.tax_behavior || undefined,
    metadata: metadataEntries || undefined,
  }
}

async function patchSanityProduct(docId: string, setOps: Record<string, any>): Promise<void> {
  const variants = idVariants(docId)
  if (!variants.length) return
  for (const id of variants) {
    try {
      await sanity.patch(id).set(setOps).commit({ autoGenerateArrayKeys: true })
    } catch (err: any) {
      const code = err?.response?.body?.error?.code
      const description =
        err?.response?.body?.error?.description ||
        err?.response?.body?.error?.message ||
        err?.message
      const notFound =
        code === 'DOCUMENT_NOT_FOUND' ||
        code === 'mutationError.notFound' ||
        (typeof description === 'string' && /was not found/i.test(description))
      if (notFound) continue
      console.warn('syncStripeCatalog: failed to patch product', { id, error: description || err })
    }
  }
}

type EnsurePriceResult = {
  price: Stripe.Price
  created: boolean
  reactivated: boolean
  deactivated: string[]
}

async function ensureStripePrice(
  product: SanityProduct,
  stripeProductId: string,
  priceInfo: PriceInfo,
  metadata: Record<string, string>
): Promise<EnsurePriceResult> {
  if (!stripe) {
    throw new Error('Stripe not configured')
  }

  const prices = await stripe.prices.list({ product: stripeProductId, limit: 100 })

  let existing = prices.data.find(
    (p) => p.type === 'one_time' && p.currency === priceInfo.currency && p.unit_amount === priceInfo.amount
  )

  let created = false
  let reactivated = false

  if (existing && !existing.active) {
    await stripe.prices.update(existing.id, { active: true })
    existing = await stripe.prices.retrieve(existing.id)
    reactivated = true
  }

  if (!existing) {
    existing = await stripe.prices.create({
      product: stripeProductId,
      currency: priceInfo.currency,
      unit_amount: priceInfo.amount,
      nickname: priceInfo.nickname,
      metadata: {
        ...metadata,
        sanity_price_source: priceInfo.source,
      },
      tax_behavior: product.taxBehavior === 'exempt' ? 'exclusive' : 'exclusive',
    })
    created = true
  }

  const deactivated: string[] = []
  for (const price of prices.data) {
    if (price.id === existing.id) continue
    if (price.type !== 'one_time') continue
    if (!price.active) continue
    if (price.unit_amount === existing.unit_amount && price.currency === existing.currency) continue
    await stripe.prices.update(price.id, { active: false })
    deactivated.push(price.id)
  }

  return { price: existing, created, reactivated, deactivated }
}

async function syncProduct(product: SanityProduct): Promise<SyncOutcome> {
  const normalizedId = normalizeId(product._id)
  const title = (product.title || '').trim()

  if (!normalizedId) {
    return { docId: product._id, title, status: 'skipped', reason: 'Missing product id' }
  }
  if (!title) {
    return { docId: normalizedId, title, status: 'skipped', reason: 'Missing product title' }
  }
  if (!stripe) {
    return { docId: normalizedId, title, status: 'error', reason: 'Stripe not configured' }
  }

  const priceInfo = selectPrice(product)
  if (!priceInfo) {
    return { docId: normalizedId, title, status: 'skipped', reason: 'Missing product price' }
  }

  const metadata = buildMetadata(product, normalizedId)
  const description = selectDescription(product)
  const active = determineActive(product)
  const imageArray = product.primaryImage ? [product.primaryImage] : undefined

  let stripeProductId = (product.stripeProductId || '').trim()
  let productCreated = false
  let productUpdated = false
  let stripeProduct: Stripe.Product | null = null

  if (stripeProductId) {
    try {
      stripeProduct = await stripe.products.update(stripeProductId, {
        name: title,
        active,
        description: description || undefined,
        metadata,
        ...(imageArray ? { images: imageArray } : {}),
        ...(product.taxCode && product.taxCode.startsWith('txcd_') ? { tax_code: product.taxCode } : {}),
      })
      productUpdated = true
    } catch (err) {
      if (isStripeMissingError(err)) {
        stripeProductId = ''
      } else {
        throw err
      }
    }
  }

  if (!stripeProductId) {
    const created = await stripe.products.create({
      name: title,
      active,
      description: description || undefined,
      metadata,
      ...(imageArray ? { images: imageArray } : {}),
      ...(product.taxCode && product.taxCode.startsWith('txcd_') ? { tax_code: product.taxCode } : {}),
    })
    stripeProduct = created
    stripeProductId = created.id
    productCreated = true
  }

  if (!stripeProduct) {
    stripeProduct = await stripe.products.retrieve(stripeProductId, { expand: ['default_price'] })
  }

  const priceResult = await ensureStripePrice(product, stripeProductId, priceInfo, metadata)
  const defaultPriceId = priceResult.price.id

  const currentDefault = stripeProduct.default_price
  const currentDefaultId = typeof currentDefault === 'string' ? currentDefault : currentDefault?.id
  if (currentDefaultId !== defaultPriceId) {
    await stripe.products.update(stripeProductId, { default_price: defaultPriceId })
  }

  const priceSnapshot = buildPriceSnapshot(priceResult.price)
  const productMetadata = stripeProduct
    ? mapStripeMetadata(stripeProduct.metadata as Record<string, unknown> | null)
    : undefined
  const existingSnapshots = Array.isArray(product.stripePrices) ? product.stripePrices.filter(Boolean) : []
  const filteredSnapshots = existingSnapshots
    .filter((entry) => entry?.priceId && entry.priceId !== priceSnapshot.priceId)
    .map((entry) => {
      if (entry?.priceId && priceResult.deactivated.includes(entry.priceId)) {
        return { ...entry, active: false }
      }
      return entry
    })

  const setOps: Record<string, any> = {
    stripeProductId,
    stripeDefaultPriceId: defaultPriceId,
    stripePriceId: defaultPriceId,
    stripeActive: active,
    stripeUpdatedAt: new Date().toISOString(),
    stripeLastSyncedAt: new Date().toISOString(),
    stripePrices: [priceSnapshot, ...filteredSnapshots],
    stripeMetadata: productMetadata || [],
  }

  await patchSanityProduct(product._id, setOps)

  let status = 'synced'
  if (productCreated) status = 'product-created'
  else if (priceResult.created) status = 'price-created'
  else if (priceResult.reactivated) status = 'price-reactivated'
  else if (productUpdated) status = 'product-updated'

  return {
    docId: normalizedId,
    title,
    status,
    stripeProductId,
    stripePriceId: defaultPriceId,
  }
}

type RequestBody = {
  productId?: string
  productIds?: string[]
  limit?: number
  mode?: 'missing' | 'all'
}

function dedupeProducts(products: SanityProduct[]): SanityProduct[] {
  const byId = new Map<string, SanityProduct>()
  for (const product of products) {
    const normalized = normalizeId(product._id)
    if (!normalized) continue
    const isDraft = product._id.startsWith('drafts.')
    const existing = byId.get(normalized)
    if (!existing) {
      byId.set(normalized, product)
    } else {
      const existingIsDraft = existing._id.startsWith('drafts.')
      if (existingIsDraft && !isDraft) {
        byId.set(normalized, product)
      }
    }
  }
  return Array.from(byId.values())
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  if (!stripe) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Stripe not configured (missing STRIPE_SECRET_KEY)' }),
    }
  }

  const expectedSecret = SYNC_SECRET
  const providedSecret = (
    (event.headers?.authorization || '').replace(/^Bearer\s+/i, '') ||
    event.queryStringParameters?.token ||
    ''
  ).trim()
  if (expectedSecret && providedSecret !== expectedSecret) {
    return {
      statusCode: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    }
  }

  let body: RequestBody = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    }
  }

  const limitRaw = typeof body.limit === 'number' ? body.limit : Number(body.limit)
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? Number(limitRaw) : 25, MAX_LIMIT))
  const mode: 'missing' | 'all' = body.mode === 'all' ? 'all' : 'missing'

  const requestedIds = Array.isArray(body.productIds) ? body.productIds : body.productId ? [body.productId] : []
  const idSet = new Set<string>()
  requestedIds.forEach((id) => {
    const normalized = normalizeId(id)
    if (normalized) {
      idVariants(normalized).forEach((variant) => idSet.add(variant))
    }
  })

  let products: SanityProduct[] = []

  try {
    if (idSet.size > 0) {
      products = await sanity.fetch(
        `*[_type == "product" && _id in $ids]{
          _id,
          title,
          "slug": slug.current,
          sku,
          price,
          salePrice,
          onSale,
          availability,
          taxBehavior,
          taxCode,
          shortDescription,
          description,
          stripeProductId,
          stripeDefaultPriceId,
          stripePrices,
          "primaryImage": images[0].asset->url
        }`,
        { ids: Array.from(idSet) }
      )
    } else if (mode === 'all') {
      products = await sanity.fetch(
        `*[_type == "product" && defined(price) && price > 0] | order(_updatedAt desc){
          _id,
          title,
          "slug": slug.current,
          sku,
          price,
          salePrice,
          onSale,
          availability,
          taxBehavior,
          taxCode,
          shortDescription,
          description,
          stripeProductId,
          stripeDefaultPriceId,
          stripePrices,
          "primaryImage": images[0].asset->url
        }[0...$limit]`,
        { limit }
      )
    } else {
      products = await sanity.fetch(
        `*[_type == "product" && defined(price) && price > 0 && (!defined(stripeProductId) || stripeProductId == "" || !defined(stripeDefaultPriceId) || stripeDefaultPriceId == "")] | order(_updatedAt desc){
          _id,
          title,
          "slug": slug.current,
          sku,
          price,
          salePrice,
          onSale,
          availability,
          taxBehavior,
          taxCode,
          shortDescription,
          description,
          stripeProductId,
          stripeDefaultPriceId,
          stripePrices,
          "primaryImage": images[0].asset->url
        }[0...$limit]`,
        { limit }
      )
    }
  } catch (err: any) {
    console.error('syncStripeCatalog: product fetch failed', err)
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch products from Sanity', detail: err?.message }),
    }
  }

  if (!Array.isArray(products) || products.length === 0) {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, processed: 0, results: [], mode, limit }),
    }
  }

  const docs = dedupeProducts(products)
  const results: SyncOutcome[] = []
  const errors: Array<{ docId: string; title: string; error: string }> = []

  for (const product of docs) {
    try {
      const outcome = await syncProduct(product)
      results.push(outcome)
      if (outcome.status === 'error') {
        errors.push({ docId: outcome.docId, title: outcome.title, error: outcome.reason || 'Unknown error' })
      }
    } catch (err: any) {
      const docId = normalizeId(product._id)
      const title = product.title || ''
      const message = err?.message || String(err)
      console.error('syncStripeCatalog: failed to sync product', { docId, message })
      errors.push({ docId, title, error: message })
    }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: errors.length === 0,
      processed: docs.length,
      results,
      errors,
      mode,
      limit,
    }),
  }
}

export default handler
