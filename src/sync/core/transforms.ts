// fas-sanity/src/sync/core/transforms.ts
import type {Product as CanonicalProduct, ProductVariant} from './types'

type SanityLikeProduct = {
  _id?: string
  title?: string
  slug?: {current?: string} | string
  description?: unknown
  shortDescription?: unknown
  images?: unknown[]
  status?: string
  productType?: string
  tags?: unknown[]
  sku?: string
  price?: number
  trackInventory?: boolean
  manualInventoryCount?: number
  availability?: string
  shippingConfig?: {
    requiresShipping?: boolean
    weight?: number
    dimensions?: {length?: number; width?: number; height?: number}
  } | null
  medusaProductId?: string
  medusaVariantId?: string
}

type MedusaLikeProduct = {
  id?: string
  title?: string
  handle?: string
  description?: string
  status?: string
  type?: {value?: string} | string
  tags?: Array<{value?: string} | string>
  options?: Array<{title?: string; values?: Array<{value?: string} | string>}>
  variants?: MedusaLikeVariant[]
}

type MedusaLikeVariant = {
  id?: string
  title?: string
  sku?: string
  prices?: Array<{amount?: number; currency_code?: string}>
  calculated_price?: {calculated_amount?: number}
  inventory_quantity?: number
  allow_backorder?: boolean
  manage_inventory?: boolean
  requires_shipping?: boolean
  weight?: number
  length?: number
  width?: number
  height?: number
  options?: Array<{option?: {title?: string}; value?: string}>
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const toSlug = (rawSlug: unknown, fallbackTitle: string): string => {
  const slug =
    typeof rawSlug === 'string'
      ? rawSlug
      : typeof rawSlug === 'object' && rawSlug !== null && 'current' in rawSlug
        ? asString((rawSlug as {current?: unknown}).current)
        : ''
  if (slug.trim()) return slug.trim()
  const fromTitle = fallbackTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return fromTitle || 'untitled-product'
}

const toMinorUnits = (value: unknown): number => Math.round(asNumber(value) * 100)

const mapStatus = (status: unknown): CanonicalProduct['status'] => {
  const normalized = asString(status).toLowerCase()
  if (normalized === 'active' || normalized === 'published') return 'active'
  if (normalized === 'archived' || normalized === 'paused' || normalized === 'rejected') {
    return 'archived'
  }
  return 'draft'
}

const mapProductType = (type: unknown): CanonicalProduct['type'] => {
  const normalized = asString(type).toLowerCase()
  if (normalized === 'service') return 'service'
  if (normalized === 'bundle') return 'bundle'
  return 'physical'
}

const extractImageUrl = (image: unknown): string | null => {
  if (typeof image === 'string' && image.trim()) return image
  if (typeof image !== 'object' || image === null) return null
  const record = image as Record<string, unknown>
  const candidateValues = [record.url, record.src, (record.asset as {url?: unknown})?.url]
  for (const value of candidateValues) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

const createDefaultVariant = (input: {
  sku: string
  title: string
  priceCents: number
  inventoryQuantity: number
  manageInventory: boolean
  allowBackorder: boolean
  requiresShipping: boolean
  sanityId?: string
  medusaId?: string
}): ProductVariant => ({
  sku: input.sku,
  title: input.title,
  price_cents: input.priceCents,
  inventory_quantity: input.inventoryQuantity,
  allow_backorder: input.allowBackorder,
  manage_inventory: input.manageInventory,
  requires_shipping: input.requiresShipping,
  options: {},
  sanityId: input.sanityId,
  medusaId: input.medusaId,
})

export function sanityProductToCanonical(product: SanityLikeProduct): CanonicalProduct {
  const title = asString(product.title).trim()
  const slug = toSlug(product.slug, title)
  const trackInventory = product.trackInventory !== false
  const quantity = trackInventory ? Math.max(0, Math.trunc(asNumber(product.manualInventoryCount))) : 0
  const availability = asString(product.availability).toLowerCase()
  const allowBackorder = availability === 'backorder' || availability === 'preorder'
  const requiresShipping =
    typeof product.shippingConfig?.requiresShipping === 'boolean'
      ? product.shippingConfig.requiresShipping
      : mapProductType(product.productType) !== 'service'

  const variant = createDefaultVariant({
    sku: asString(product.sku).trim() || slug || 'default-sku',
    title: title || 'Untitled Product',
    priceCents: toMinorUnits(product.price),
    inventoryQuantity: quantity,
    manageInventory: trackInventory,
    allowBackorder: allowBackorder,
    requiresShipping: requiresShipping,
    sanityId: product._id,
    medusaId: product.medusaVariantId,
  })

  const tags = (Array.isArray(product.tags) ? product.tags : [])
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim())

  const images = (Array.isArray(product.images) ? product.images : [])
    .map((image) => extractImageUrl(image))
    .filter((image): image is string => Boolean(image))

  return {
    sanityId: product._id,
    medusaId: asString(product.medusaProductId).trim() || undefined,
    title: title || 'Untitled Product',
    slug,
    description:
      typeof product.description === 'string'
        ? product.description
        : typeof product.shortDescription === 'string'
          ? product.shortDescription
          : '',
    images,
    options: [],
    variants: [variant],
    status: mapStatus(product.status),
    tags,
    type: mapProductType(product.productType),
  }
}

const medusaOptionPairs = (variant: MedusaLikeVariant): Record<string, string> => {
  const pairs: Record<string, string> = {}
  for (const option of Array.isArray(variant.options) ? variant.options : []) {
    const key = asString(option.option?.title).trim()
    const value = asString(option.value).trim()
    if (key && value) pairs[key] = value
  }
  return pairs
}

const medusaPriceCents = (variant: MedusaLikeVariant): number => {
  const prices = Array.isArray(variant.prices) ? variant.prices : []
  const usd = prices.find((price) => asString(price.currency_code).toLowerCase() === 'usd')
  if (typeof usd?.amount === 'number') return Math.round(usd.amount)
  const first = prices.find((price) => typeof price.amount === 'number')
  if (typeof first?.amount === 'number') return Math.round(first.amount)
  if (typeof variant.calculated_price?.calculated_amount === 'number') {
    return Math.round(variant.calculated_price.calculated_amount)
  }
  return 0
}

export function medusaProductToCanonical(product: MedusaLikeProduct): CanonicalProduct {
  const variants = (Array.isArray(product.variants) ? product.variants : []).map((variant) =>
    createDefaultVariant({
      sku: asString(variant.sku).trim() || asString(product.handle).trim() || 'default-sku',
      title: asString(variant.title).trim() || asString(product.title).trim() || 'Default',
      priceCents: medusaPriceCents(variant),
      inventoryQuantity: Math.max(0, Math.trunc(asNumber(variant.inventory_quantity))),
      allowBackorder: Boolean(variant.allow_backorder),
      manageInventory: variant.manage_inventory !== false,
      requiresShipping: variant.requires_shipping !== false,
      medusaId: variant.id,
    }),
  )

  const canonicalVariants = variants.length
    ? variants.map((variant, index) => ({
        ...variant,
        options: medusaOptionPairs((product.variants || [])[index] || {}),
      }))
    : [
        createDefaultVariant({
          sku: asString(product.handle).trim() || 'default-sku',
          title: asString(product.title).trim() || 'Default',
          priceCents: 0,
          inventoryQuantity: 0,
          allowBackorder: false,
          manageInventory: true,
          requiresShipping: mapProductType(product.type) !== 'service',
        }),
      ]

  const tags = (Array.isArray(product.tags) ? product.tags : [])
    .map((tag) => (typeof tag === 'string' ? tag : asString(tag.value)))
    .filter((tag): tag is string => Boolean(tag && tag.trim()))
    .map((tag) => tag.trim())

  const options = (Array.isArray(product.options) ? product.options : [])
    .map((option) => ({
      name: asString(option.title).trim(),
      values: (Array.isArray(option.values) ? option.values : [])
        .map((value) => (typeof value === 'string' ? value : asString(value.value)))
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim()),
    }))
    .filter((option) => option.name.length > 0)

  const typeSource =
    typeof product.type === 'string' ? product.type : asString((product.type as {value?: string})?.value)

  return {
    medusaId: product.id,
    title: asString(product.title).trim() || 'Untitled Product',
    slug: toSlug(product.handle, asString(product.title)),
    description: asString(product.description),
    images: [],
    options,
    variants: canonicalVariants,
    status: mapStatus(product.status),
    tags,
    type: mapProductType(typeSource),
  }
}
