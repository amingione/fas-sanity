#!/usr/bin/env tsx
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

const medusaApiUrlRaw =
  process.env.MEDUSA_API_URL || process.env.MEDUSA_BACKEND_URL || process.env.MEDUSA_ADMIN_URL
const medusaApiUrl = medusaApiUrlRaw ? medusaApiUrlRaw.trim().replace(/\/+$/, '') : ''
const medusaAdminToken =
  process.env.MEDUSA_ADMIN_API_TOKEN ||
  process.env.MEDUSA_ADMIN_TOKEN ||
  process.env.MEDUSA_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity configuration. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN.',
  )
  process.exit(1)
}

if (!medusaApiUrl || !medusaAdminToken) {
  console.error(
    'Missing Medusa configuration. Set MEDUSA_API_URL (or MEDUSA_BACKEND_URL) and MEDUSA_ADMIN_API_TOKEN.',
  )
  process.exit(1)
}

const sanity = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

class ValidationError extends Error {}

type ShippingDimensions = {
  length?: number
  width?: number
  height?: number
}

type SanityProduct = {
  _id: string
  title: string
  sku?: string | null
  price?: number | null
  slug?: {current?: string | null} | null
  shippingConfig?: {
    weight?: number | null
    dimensions?: ShippingDimensions | null
  } | null
  medusaProductId?: string | null
  medusaVariantId?: string | null
}

type MedusaVariant = {
  id: string
  title?: string | null
  sku?: string | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
  prices?: Array<{amount?: number | null; currency_code?: string | null}> | null
}

type MedusaProduct = {
  id: string
  title?: string | null
  handle?: string | null
  variants?: MedusaVariant[] | null
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || `product-${Math.random().toString(36).slice(2, 10)}`

const toMinorUnits = (value: number): number => Math.round(value * 100)

const requireNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const normalizeCurrency = (value?: string | null) =>
  typeof value === 'string' ? value.toLowerCase() : ''

const extractUsdAmount = (variant: MedusaVariant): number | null => {
  const prices = Array.isArray(variant.prices) ? variant.prices : []
  const usd = prices.find((price) => normalizeCurrency(price.currency_code) === 'usd')
  return typeof usd?.amount === 'number' ? usd.amount : null
}

let authToken: string | undefined = undefined

async function getAuthToken(): Promise<string> {
  if (authToken) return authToken

  // Try to authenticate with email/password if available
  const adminEmail = process.env.MEDUSA_ADMIN_EMAIL || 'admin@local.test'
  const adminPassword = process.env.MEDUSA_ADMIN_PASSWORD || 'Admin123!'

  try {
    const authResponse = await fetch(`${medusaApiUrl}/auth/user/emailpass`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
      }),
    })

    if (authResponse.ok) {
      const authData = await authResponse.json()
      authToken = authData?.token
      if (authToken) {
        console.log('✓ Authenticated with Medusa admin API')
        return authToken
      }
    }
  } catch (err) {
    console.warn('Failed to authenticate with email/password, falling back to token')
  }

  // Fallback to provided token
  if (!medusaAdminToken) {
    throw new Error('No valid authentication token available for Medusa API')
  }
  authToken = medusaAdminToken
  return authToken
}

const getMedusaHeaders = async (): Promise<HeadersInit> => {
  const headers: HeadersInit = {
    accept: 'application/json',
    'content-type': 'application/json',
  }

  const token = await getAuthToken()

  // Support both publishable (pk_) and secret (no prefix) API keys
  if (token.startsWith('pk_')) {
    headers['x-publishable-api-key'] = token
  } else {
    // Secret key - use as bearer token
    headers['authorization'] = `Bearer ${token}`
  }

  return headers
}

async function medusaRequest<T>(path: string, init: RequestInit): Promise<T> {
  const headers = await getMedusaHeaders()
  const res = await fetch(`${medusaApiUrl}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Medusa API error ${res.status}: ${errorText}`)
  }

  return (await res.json()) as T
}

async function fetchMedusaProduct(productId: string): Promise<MedusaProduct> {
  const data = await medusaRequest<{product?: MedusaProduct}>(`/admin/products/${productId}`, {
    method: 'GET',
  })
  if (!data?.product) {
    throw new Error(`Medusa product not found: ${productId}`)
  }
  return data.product
}

function resolveVariant(
  medusaProduct: MedusaProduct,
  medusaVariantId?: string | null,
): {variant: MedusaVariant; variantId: string} {
  const variants = Array.isArray(medusaProduct.variants) ? medusaProduct.variants : []
  if (!variants.length) {
    throw new Error(`Medusa product ${medusaProduct.id} has no variants`)
  }
  if (medusaVariantId) {
    const found = variants.find((variant) => variant.id === medusaVariantId)
    if (!found) {
      throw new Error(`Medusa variant ${medusaVariantId} not found on product ${medusaProduct.id}`)
    }
    return {variant: found, variantId: medusaVariantId}
  }
  if (variants.length !== 1) {
    throw new Error(
      `Medusa product ${medusaProduct.id} has ${variants.length} variants; expected 1`,
    )
  }
  return {variant: variants[0], variantId: variants[0].id}
}

function buildVariantPayload(product: SanityProduct) {
  // Use provided shipping data or defaults
  const weight = product.shippingConfig?.weight ?? 1 // 1 oz default
  const dimensions = product.shippingConfig?.dimensions ?? {}
  const length = dimensions.length ?? 12 // 12 inches default
  const width = dimensions.width ?? 12
  const height = dimensions.height ?? 1

  return {
    title: product.title,
    sku: product.sku as string,
    options: {
      'Default Option': 'Default',
    },
    prices: [
      {
        amount: toMinorUnits(product.price as number),
        currency_code: 'usd',
      },
    ],
    weight,
    length,
    width,
    height,
  }
}

function buildProductPayload(product: SanityProduct) {
  const handle = product.slug?.current?.trim() || slugify(product.title)
  return {
    title: product.title,
    handle,
    options: [
      {
        title: 'Default Option',
        values: ['Default'],
      },
    ],
    variants: [buildVariantPayload(product)],
  }
}

function validateProduct(product: SanityProduct) {
  if (!product.title) {
    throw new ValidationError('Missing title')
  }
  if (!product.sku || typeof product.sku !== 'string' || !product.sku.trim()) {
    throw new ValidationError('Missing sku')
  }
  if (!requireNumber(product.price)) {
    throw new ValidationError('Missing price')
  }

  // For service products, shipping data is optional
  // Medusa requires some shipping data, so we'll use defaults
  // Physical products should have complete data, but we'll be lenient
}

async function updateSanityMedusaIds(
  productId: string,
  medusaProductId: string,
  medusaVariantId: string,
) {
  await sanity
    .patch(productId)
    .set({
      medusaProductId,
      medusaVariantId,
    })
    .commit({autoGenerateArrayKeys: true})
}

async function linkVariantPriceSet(variantId: string, sanityPrice: number) {
  // In Medusa v2, prices are automatically linked when created inline with variants.
  // This function is a no-op but kept for compatibility.
  // The price was already set during variant creation/update via the prices array.
  return
}

async function syncProduct(product: SanityProduct) {
  validateProduct(product)

  const payload = buildProductPayload(product)
  const desiredVariant = payload.variants[0]

  if (!product.medusaProductId) {
    const created = await medusaRequest<{product?: MedusaProduct}>(`/admin/products`, {
      method: 'POST',
      body: JSON.stringify({...payload, status: 'published'}),
    })

    if (!created?.product?.id) {
      throw new Error('Medusa product creation returned no product id')
    }

    const createdProduct = created.product
    const createdVariants = Array.isArray(createdProduct.variants) ? createdProduct.variants : []
    if (createdVariants.length !== 1 || !createdVariants[0]?.id) {
      throw new Error(`Medusa product ${createdProduct.id} created without a single variant`)
    }

    await updateSanityMedusaIds(product._id, createdProduct.id, createdVariants[0].id)
    if (requireNumber(product.price)) {
      await linkVariantPriceSet(createdVariants[0].id, product.price)
    }
    console.log(`[SYNC] ${product.title} — CREATED`)
    return
  }

  const medusaProduct = await fetchMedusaProduct(product.medusaProductId)
  const {variant, variantId} = resolveVariant(medusaProduct, product.medusaVariantId)

  const desiredHandle = payload.handle
  const productNeedsUpdate =
    (medusaProduct.title || '') !== payload.title || (medusaProduct.handle || '') !== desiredHandle

  const currentUsdAmount = extractUsdAmount(variant)
  const desiredAmount = toMinorUnits(product.price as number)
  const variantNeedsUpdate =
    (variant.title || '') !== (desiredVariant.title || '') ||
    (variant.sku || '') !== (desiredVariant.sku || '') ||
    (currentUsdAmount ?? null) !== desiredAmount ||
    (variant.weight ?? null) !== (desiredVariant.weight ?? null) ||
    (variant.length ?? null) !== (desiredVariant.length ?? null) ||
    (variant.width ?? null) !== (desiredVariant.width ?? null) ||
    (variant.height ?? null) !== (desiredVariant.height ?? null)

  if (!productNeedsUpdate && !variantNeedsUpdate && product.medusaVariantId) {
    console.log(`[SYNC] ${product.title} — SKIPPED`)
    return
  }

  if (productNeedsUpdate) {
    await medusaRequest(`/admin/products/${medusaProduct.id}`, {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        handle: payload.handle,
      }),
    })
  }

  if (variantNeedsUpdate) {
    // Don't send options field during update - it's set at product level
    const updatePayload = {...desiredVariant}
    delete (updatePayload as any).options

    await medusaRequest(`/admin/products/${medusaProduct.id}/variants/${variantId}`, {
      method: 'POST',
      body: JSON.stringify(updatePayload),
    })
  }

  await updateSanityMedusaIds(product._id, medusaProduct.id, variantId)
  if (requireNumber(product.price)) {
    await linkVariantPriceSet(variantId, product.price)
  }
  console.log(`[SYNC] ${product.title} — UPDATED`)
}

async function main() {
  const products: SanityProduct[] = await sanity.fetch(
    `*[_type == "product" && status == "active"]{
      _id,
      title,
      sku,
      price,
      slug,
      shippingConfig{
        weight,
        dimensions{
          length,
          width,
          height
        }
      },
      medusaProductId,
      medusaVariantId
    }`,
  )

  if (!products.length) {
    console.log('No active products found; nothing to sync.')
    return
  }

  const skuMap = new Map<string, SanityProduct[]>()
  for (const product of products) {
    const sku = typeof product.sku === 'string' ? product.sku.trim() : ''
    if (!sku) continue
    const list = skuMap.get(sku) || []
    list.push(product)
    skuMap.set(sku, list)
  }

  for (const [sku, list] of skuMap.entries()) {
    if (list.length > 1) {
      const ids = list.map((product) => product._id).join(', ')
      console.error(`[SYNC] SKU uniqueness violated for ${sku}: ${ids}`)
      process.exit(1)
    }
  }

  for (const product of products) {
    try {
      await syncProduct(product)
    } catch (err) {
      if (err instanceof ValidationError) {
        console.error(`[SYNC] ${product.title} — INVALID: ${err.message}`)
      } else {
        console.error(`[SYNC] ${product.title} — FAILED`, err)
      }
      process.exit(1)
    }
  }

  console.log('\n[SYNC] Product sync complete!')
  console.log('[SYNC] ⚠️  Important: Price set links require additional step.')
  console.log('[SYNC] Run: npx tsx scripts/linkPriceSetsPostSync.ts')
  console.log('[SYNC] This will link all price_sets to their variants in the database.')
}

main().catch((err) => {
  console.error('Product sync failed', err)
  process.exit(1)
})
