import type {SanityClient} from '@sanity/client'
import {
  normalizeMetadataEntries,
  normalizeOptionSelections,
  normalizeCartItemChoices,
  resolveUpgradeTotal,
} from '@fas/sanity-config/utils/cartItemDetails'
import {
  validateCartSelections,
  type ProductCustomizationRequirement,
  type ProductOptionRequirement,
} from '../../shared/cartValidation'
import type {CartMetadataEntry} from './stripeCartItem'

export type CartItem = {
  _type: 'orderCartItem'
  _key?: string
  id?: string
  sku?: string
  name?: string
  productName?: string
  productSlug?: string
  description?: string
  image?: string
  productUrl?: string
  lineItem?: string
  stripeProductId?: string
  stripePriceId?: string
  quantity?: number
  price?: number
  lineTotal?: number
  total?: number
  optionSummary?: string
  optionDetails?: string[]
  upgrades?: string[]
  upgradesTotal?: number
  customizations?: string[]
  categories?: string[]
  selectedVariant?: string
  addOns?: string[]
  productRef?: {_type: 'reference'; _ref: string}
  validationIssues?: string[]
  metadata?: {
    option_summary?: string
    upgrades?: string[]
  } | null
  metadataEntries?: CartMetadataEntry[] | Record<string, unknown> | null
}

export type CartProductSummary = {
  _id: string
  title?: string
  sku?: string
  slug?: {current?: string}
  stripeProductId?: string | null
  stripeDefaultPriceId?: string | null
  stripePriceId?: string | null
  stripePrices?: {priceId?: string | null}[] | null
  price?: number | null
  salePrice?: number | null
  compareAtPrice?: number | null
  discountType?: string | null
  discountValue?: number | null
  discountPercent?: number | null
  onSale?: boolean | null
  categories?: string[]
  shippingWeight?: number | null
  boxDimensions?: string | null
  shipsAlone?: boolean | null
  shippingClass?: string | null
  shippingConfig?: {
    weight?: number | null
    dimensions?: {length?: number | null; width?: number | null; height?: number | null} | null
    shippingClass?: string | null
    handlingTime?: number | null
    separateShipment?: boolean | null
    requiresShipping?: boolean | null
  } | null
  productType?: string | null
  coreRequired?: boolean | null
  promotionTagline?: string | null
  optionRequirements?: ProductOptionRequirement[]
  customizationRequirements?: ProductCustomizationRequirement[]
}

type ShipmentWeight = {
  _type: 'shipmentWeight'
  value: number
  unit: 'pound'
}

type PackageDimensions = {
  _type: 'packageDimensions'
  length: number
  width: number
  height: number
}

export type ShippingMetrics = {
  weight?: ShipmentWeight
  dimensions?: PackageDimensions
}

const CART_METADATA_TYPE = 'orderCartItemMeta'
const DIMENSION_PATTERN = /(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)/i

function slugifyValue(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || undefined
  )
}

function ensureMetadataArray(item: CartItem): CartMetadataEntry[] {
  if (Array.isArray(item.metadataEntries)) {
    const filtered = item.metadataEntries.filter((entry): entry is CartMetadataEntry =>
      Boolean(
        entry &&
          typeof entry === 'object' &&
          entry._type === CART_METADATA_TYPE &&
          entry.key &&
          entry.value,
      ),
    )
    if (filtered.length !== item.metadataEntries.length) {
      item.metadataEntries = filtered
    }
    return filtered
  }

  if (Array.isArray(item.metadata)) {
    const filtered = item.metadata.filter((entry): entry is CartMetadataEntry =>
      Boolean(
        entry &&
          typeof entry === 'object' &&
          entry._type === CART_METADATA_TYPE &&
          entry.key &&
          entry.value,
      ),
    )
    if (filtered.length) {
      item.metadataEntries = filtered
      delete item.metadata
      return filtered
    }
  }

  if (item.metadataEntries && typeof item.metadataEntries === 'object') {
    const normalized = normalizeMetadataEntries(item.metadataEntries as Record<string, unknown>)
    if (normalized.length) {
      const upgraded = normalized.map<CartMetadataEntry>(({key, value}) => ({
        _type: CART_METADATA_TYPE,
        key,
        value,
        source: 'legacy',
      }))
      item.metadataEntries = upgraded
      return upgraded
    }
  }

  if (
    item.metadata &&
    typeof item.metadata === 'object' &&
    !Array.isArray(item.metadata) &&
    !('option_summary' in item.metadata) &&
    !('upgrades' in item.metadata)
  ) {
    const normalized = normalizeMetadataEntries(item.metadata as Record<string, unknown>)
    if (normalized.length) {
      const upgraded = normalized.map<CartMetadataEntry>(({key, value}) => ({
        _type: CART_METADATA_TYPE,
        key,
        value,
        source: 'legacy',
      }))
      item.metadataEntries = upgraded
      return upgraded
    }
  }

  return []
}

function syncMetadataSummary(item: CartItem) {
  const summary = typeof item.optionSummary === 'string' ? item.optionSummary.trim() : ''
  const normalizedSummary = summary ? summary : undefined
  const normalizedUpgrades = Array.isArray(item.upgrades)
    ? item.upgrades
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry): entry is string => Boolean(entry))
    : []

  if (normalizedSummary || normalizedUpgrades.length) {
    item.metadata = {
      option_summary: normalizedSummary,
      upgrades: normalizedUpgrades.length ? normalizedUpgrades : undefined,
    }
  } else if (item.metadata) {
    delete item.metadata
  }
}

function appendMetadata(
  item: CartItem,
  key: string,
  value: string,
  source: CartMetadataEntry['source'],
) {
  const normalizedValue = value.trim()
  if (!normalizedValue) return
  const metadata = ensureMetadataArray(item)
  const already = metadata.find(
    (entry) => entry.key === key && entry.value === normalizedValue && entry.source === source,
  )
  if (already) return
  metadata.push({
    _type: CART_METADATA_TYPE,
    key,
    value: normalizedValue,
    source,
  })
  item.metadataEntries = metadata
}

function looksLikeSanityId(value?: string | null): boolean {
  if (!value) return false
  return /^[a-zA-Z0-9]{1,2}[-a-zA-Z0-9]{8,}/.test(value) || value.startsWith('product-')
}

export function findProductForItem(
  item: CartItem,
  products: CartProductSummary[],
): CartProductSummary | null {
  if (!Array.isArray(products) || products.length === 0) return null
  const sku = item.sku?.trim().toLowerCase()
  const stripePriceId = item.stripePriceId?.trim().toLowerCase()
  const stripeProductId = item.stripeProductId?.trim().toLowerCase()
  if (sku) {
    const bySku = products.find((p) => (p.sku || '').toLowerCase() === sku)
    if (bySku) return bySku
  }

  if (stripePriceId) {
    const byPriceId = products.find((p) => (p.stripePriceId || '').toLowerCase() === stripePriceId)
    if (byPriceId) return byPriceId
    const byPriceSnapshot = products.find((p) =>
      (p.stripePrices || []).some(
        (snap) => (snap?.priceId || '').toLowerCase() === stripePriceId,
      ),
    )
    if (byPriceSnapshot) return byPriceSnapshot
  }

  if (stripeProductId) {
    const byProductId = products.find(
      (p) => (p.stripeProductId || '').toLowerCase() === stripeProductId,
    )
    if (byProductId) return byProductId
  }

  const slugCandidates = [item.productSlug, slugifyValue(item.productName), slugifyValue(item.name)]
    .map((slug) => slug?.trim())
    .filter(Boolean) as string[]
  for (const slug of slugCandidates) {
    const match = products.find((p) => (p.slug?.current || '').toLowerCase() === slug.toLowerCase())
    if (match) return match
  }

  const ids = [item.id].filter((id): id is string => Boolean(id && looksLikeSanityId(id)))
  for (const id of ids) {
    const byId = products.find((p) => p._id === id)
    if (byId) return byId
  }

  const titleCandidates = [item.productName, item.name]
    .map((v) => v?.trim())
    .filter(Boolean) as string[]
  for (const title of titleCandidates) {
    const byTitle = products.find(
      (p) => (p.title || '').trim().toLowerCase() === title.toLowerCase(),
    )
    if (byTitle) return byTitle
  }

  return null
}

function sanitizeCategories(categories: unknown): string[] | undefined {
  if (!Array.isArray(categories)) return undefined
  const normalized = categories
    .map((cat) => {
      if (typeof cat === 'string') return cat.trim()
      if (cat && typeof cat === 'object' && typeof (cat as any).title === 'string') {
        return (cat as any).title.trim()
      }
      return undefined
    })
    .filter((value): value is string => Boolean(value))
  const unique = Array.from(new Set(normalized))
  return unique.length ? unique : undefined
}

function collectProductQueries(cart: CartItem[]) {
  const slugs = new Set<string>()
  const skus = new Set<string>()
  const titles = new Set<string>()
  const ids = new Set<string>()
  const priceIds = new Set<string>()
  const productIds = new Set<string>()

  cart.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const slugCandidates = [
      item.productSlug,
      slugifyValue(item.productName),
      slugifyValue(item.name),
    ]
    slugCandidates.forEach((slug) => {
      if (slug) slugs.add(slug)
    })
    if (item.sku) skus.add(item.sku.trim())
    if (item.stripePriceId) priceIds.add(item.stripePriceId.trim())
    if (item.stripeProductId) productIds.add(item.stripeProductId.trim())
    if (item.productName) titles.add(item.productName.trim())
    if (item.name) titles.add(item.name.trim())
    if (item.id && looksLikeSanityId(item.id)) ids.add(item.id)
  })

  return {
    slugs: Array.from(slugs),
    skus: Array.from(skus),
    titles: Array.from(titles),
    ids: Array.from(ids),
    priceIds: Array.from(priceIds),
    productIds: Array.from(productIds),
  }
}

function parseBoxDimensions(
  value?: string | null,
): {length: number; width: number; height: number} | null {
  if (!value) return null
  const match = String(value).match(DIMENSION_PATTERN)
  if (!match) return null
  const [, rawLength, rawWidth, rawHeight] = match
  const length = Number(rawLength)
  const width = Number(rawWidth)
  const height = Number(rawHeight)
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }
  if (length <= 0 || width <= 0 || height <= 0) return null
  return {length, width, height}
}

function toPositiveNumber(value: unknown): number | null {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

function resolveQuantity(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 1
  return Math.max(1, Math.round(num))
}

function resolveShippingWeight(product: CartProductSummary): number | null {
  const configWeight = toPositiveNumber(product.shippingConfig?.weight)
  if (configWeight !== null) return configWeight
  return toPositiveNumber(product.shippingWeight)
}

function resolveShippingDimensions(
  product: CartProductSummary,
): {length: number; width: number; height: number} | null {
  const dims = product.shippingConfig?.dimensions
  const length = toPositiveNumber(dims?.length)
  const width = toPositiveNumber(dims?.width)
  const height = toPositiveNumber(dims?.height)
  if (length && width && height) {
    return {length, width, height}
  }
  return parseBoxDimensions(product.boxDimensions)
}

function resolveDefaultDimensions(): {length: number; width: number; height: number} {
  const fallback = {length: 12, width: 9, height: 4}
  const length = toPositiveNumber(process.env.DEFAULT_PACKAGE_LENGTH_IN) ?? fallback.length
  const width = toPositiveNumber(process.env.DEFAULT_PACKAGE_WIDTH_IN) ?? fallback.width
  const height = toPositiveNumber(process.env.DEFAULT_PACKAGE_HEIGHT_IN) ?? fallback.height
  return {
    length,
    width,
    height,
  }
}

function resolveDefaultWeight(): number | null {
  const envWeight = toPositiveNumber(process.env.DEFAULT_PACKAGE_WEIGHT_LBS)
  if (envWeight) return envWeight
  return 5
}

export async function fetchProductsForCart(
  cart: CartItem[],
  sanity: SanityClient,
): Promise<CartProductSummary[]> {
  if (!Array.isArray(cart) || cart.length === 0) return []
  const lookup = collectProductQueries(cart)
  if (
    lookup.slugs.length === 0 &&
    lookup.skus.length === 0 &&
    lookup.titles.length === 0 &&
    lookup.ids.length === 0 &&
    lookup.priceIds.length === 0 &&
    lookup.productIds.length === 0
  ) {
    return []
  }

  try {
    const result = await sanity.fetch<CartProductSummary[]>(
      `*[_type == "product" && (
        slug.current in $slugs ||
        sku in $skus ||
        title in $titles ||
        _id in $ids ||
        stripePriceId in $priceIds ||
        stripeDefaultPriceId in $priceIds ||
        stripeProductId in $productIds ||
        stripePrices[].priceId in $priceIds
      )]{
        _id,
        title,
        sku,
        slug,
        stripeProductId,
        stripeDefaultPriceId,
        stripePriceId,
        stripePrices[]{
          priceId
        },
        price,
        salePrice,
        compareAtPrice,
        discountType,
        discountValue,
        discountPercent,
        onSale,
        "categories": category[]->title,
        shippingWeight,
        boxDimensions,
        shipsAlone,
        shippingClass,
        shippingConfig{
          weight,
          dimensions{
            length,
            width,
            height
          },
          shippingClass,
          handlingTime,
          separateShipment,
          requiresShipping
        },
        productType,
        coreRequired,
        promotionTagline,
        "optionRequirements": coalesce(options[]{
          "name": coalesce(title, name),
          "required": select(defined(required) => required, true)
        }, []),
        "customizationRequirements": coalesce(customizations[]{
          "name": coalesce(title, name),
          "required": select(defined(required) => required, false)
        }, []),
      }`,
      lookup,
    )

    if (!Array.isArray(result) || result.length === 0) return []
    const deduped = new Map<string, CartProductSummary>()
    for (const product of result) {
      if (!product || typeof product !== 'object') continue
      if (typeof product._id !== 'string' || !product._id) continue
      // Sanitize option requirements to strict typing
      const opts = Array.isArray((product as any).optionRequirements)
        ? ((product as any).optionRequirements as any[])
            .map((o) => ({
              name: typeof o?.name === 'string' ? o.name.trim() : '',
              required: o?.required === false ? false : true,
            }))
            .filter((o) => Boolean(o.name))
        : []
      const customs = Array.isArray((product as any).customizationRequirements)
        ? ((product as any).customizationRequirements as any[])
            .map((c) => ({
              name: typeof c?.name === 'string' ? c.name.trim() : '',
              required: c?.required === true,
            }))
            .filter((c) => Boolean(c.name))
        : []
      deduped.set(product._id, {
        ...product,
        optionRequirements: opts,
        customizationRequirements: customs,
      })
    }
    return Array.from(deduped.values())
  } catch (err) {
    console.warn('cartEnrichment: failed to fetch product summaries', err)
    return []
  }
}

export async function enrichCartItemsFromSanity(
  cart: CartItem[],
  sanity: SanityClient,
  options: {onProducts?: (list: CartProductSummary[]) => void} = {},
): Promise<CartItem[]> {
  if (!Array.isArray(cart) || cart.length === 0) return cart

  const products = await fetchProductsForCart(cart, sanity)
  if (!products.length) return cart
  if (options.onProducts) {
    try {
      options.onProducts(products)
    } catch (err) {
      console.warn('cartEnrichment: onProducts callback failed', err)
    }
  }

  return cart.map((item) => {
    if (!item || typeof item !== 'object') return item
    const product = findProductForItem(item, products)
    const metadataEntries = ensureMetadataArray(item)
    const metadataMap = metadataEntries.reduce<Record<string, string>>((acc, entry) => {
      if (entry.key && entry.value) acc[entry.key] = entry.value
      return acc
    }, {})
    if (!product) {
      const metaProductId =
        metadataMap.sanity_product_id ||
        metadataMap.sanity_product_id_actual ||
        metadataMap.sanity_product_ref
      if (!item.productRef && metaProductId) {
        item.productRef = {_type: 'reference', _ref: metaProductId}
      }
      if (!item.sku && metadataMap.sanity_sku) {
        item.sku = metadataMap.sanity_sku
      }
      // Even without a product, derive variant/add-ons/lineTotal
    }
    if (!product) {
      const choices = normalizeCartItemChoices({
        selectedOption: item.selectedVariant,
        addOns: item.addOns,
        optionSummary: item.optionSummary,
        optionDetails: item.optionDetails,
        upgrades: item.upgrades,
      })
      if (!item.selectedVariant && choices.selectedOption) {
        item.selectedVariant = choices.selectedOption
      }
      if ((!item.addOns || !item.addOns.length) && choices.addOns.length) {
        item.addOns = choices.addOns
      }
      if (item.lineTotal === undefined || item.lineTotal === null) {
        const qty = resolveQuantity(item.quantity)
        const base = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0
        const upg =
          typeof item.upgradesTotal === 'number' && Number.isFinite(item.upgradesTotal)
            ? item.upgradesTotal
            : 0
        const total = qty * base + upg
        item.lineTotal = total
      }
      return item
    }

    const normalizedOptions = normalizeOptionSelections({
      optionSummary: item.optionSummary,
      optionDetails: item.optionDetails,
      upgrades: item.upgrades,
    })
    const upgrades = normalizedOptions.upgrades
    item.optionSummary = normalizedOptions.optionSummary
    item.optionDetails = normalizedOptions.optionDetails.length
      ? normalizedOptions.optionDetails
      : undefined
    item.upgrades = normalizedOptions.upgrades.length ? normalizedOptions.upgrades : undefined
    if (item.upgradesTotal === undefined) {
      const map = ensureMetadataArray(item).reduce<Record<string, string>>((acc, entry) => {
        acc[entry.key] = entry.value
        return acc
      }, {})
      const derivedUpgradesTotal = resolveUpgradeTotal({
        metadataMap: map,
        price: item.price,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        total: item.total,
      })
      if (derivedUpgradesTotal !== undefined) {
        item.upgradesTotal = derivedUpgradesTotal
      }
    }

    if (product.sku) {
      if (!item.sku || item.sku.trim() !== product.sku) {
        item.sku = product.sku
      }
      appendMetadata(item, 'sanity_sku', product.sku, 'derived')
    } else if (!item.sku && metadataMap.sanity_sku) {
      item.sku = metadataMap.sanity_sku
    }

    const productSlug = product.slug?.current
    if ((!item.productSlug || !item.productSlug.trim()) && productSlug) {
      item.productSlug = productSlug
      appendMetadata(item, 'sanity_slug', productSlug, 'derived')
    }

    if (!item.id || item.id === item.stripeProductId || item.id === item.stripePriceId) {
      if (productSlug) item.id = productSlug
      else item.id = product._id
    }

    if (product._id) {
      item.productRef = {_type: 'reference', _ref: product._id}
      appendMetadata(item, 'sanity_product_ref', product._id, 'derived')
    }

    const categories = sanitizeCategories(product.categories)
    if ((!item.categories || item.categories.length === 0) && categories) {
      item.categories = categories
    }

    const optionSummary = typeof item.optionSummary === 'string' ? item.optionSummary : undefined
    const optionDetails = Array.isArray(item.optionDetails) ? item.optionDetails : undefined
    const customSelections =
      Array.isArray(item.customizations) && item.customizations.length
        ? item.customizations
        : undefined

    const shouldCheckCustomizations = Boolean(product.customizationRequirements?.length)

    const issues = validateCartSelections(
      {
        productTitle: product.title,
        options: product.optionRequirements,
        customizations: shouldCheckCustomizations ? product.customizationRequirements : undefined,
      },
      {
        optionSummary,
        optionDetails,
        customizations: customSelections,
      },
    )

    if (issues.length) {
      const messages = Array.from(
        new Set(issues.map((issue) => issue.message.trim()).filter(Boolean)),
      )
      if (messages.length) {
        item.validationIssues = messages
        messages.forEach((message) => appendMetadata(item, 'validation_issue', message, 'derived'))
      }
    } else if (item.validationIssues?.length) {
      delete item.validationIssues
    }

    const choices = normalizeCartItemChoices({
      selectedOption: item.selectedVariant,
      addOns: item.addOns,
      optionSummary,
      optionDetails,
      upgrades,
    })
    if (!item.selectedVariant && choices.selectedOption) {
      item.selectedVariant = choices.selectedOption
    }
    if ((!item.addOns || !item.addOns.length) && choices.addOns.length) {
      item.addOns = choices.addOns
    }

    if (item.lineTotal === undefined || item.lineTotal === null) {
      const qty = resolveQuantity(item.quantity)
      const base = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0
      const upg =
        typeof item.upgradesTotal === 'number' && Number.isFinite(item.upgradesTotal)
          ? item.upgradesTotal
          : 0
      const total = qty * base + upg
      item.lineTotal = total
    }

    syncMetadataSummary(item)

    return item
  })
}

export function computeShippingMetrics(
  cart: CartItem[],
  products: CartProductSummary[],
): ShippingMetrics {
  if (!Array.isArray(cart) || cart.length === 0) return {}

  const defaults = resolveDefaultDimensions()
  const fallbackWeight = resolveDefaultWeight()

  let totalWeight = 0
  let maxLength = 0
  let maxWidth = 0
  let stackedHeight = 0
  let hasDimensionData = false

  for (const item of cart) {
    if (!item || typeof item !== 'object') continue
    const product = findProductForItem(item, products)
    if (!product) continue

    if ((product.productType || '').toLowerCase() === 'service') {
      continue
    }

    const shippingClass = String(
      product.shippingConfig?.shippingClass || product.shippingClass || '',
    ).toLowerCase()
    const requiresShipping = product.shippingConfig?.requiresShipping
    if (requiresShipping === false) {
      continue
    }
    if (shippingClass.includes('install')) {
      continue
    }

    const quantity = resolveQuantity(item.quantity)
    const weight = resolveShippingWeight(product)
    if (weight) {
      totalWeight += weight * quantity
    }

    const dims = resolveShippingDimensions(product)
    if (dims) {
      hasDimensionData = true
      maxLength = Math.max(maxLength, dims.length)
      maxWidth = Math.max(maxWidth, dims.width)
      stackedHeight += dims.height * quantity
    }
  }

  const metrics: ShippingMetrics = {}
  const resolvedWeight = totalWeight > 0 ? totalWeight : fallbackWeight
  if (resolvedWeight && resolvedWeight > 0) {
    metrics.weight = {
      _type: 'shipmentWeight',
      value: Number(resolvedWeight.toFixed(2)),
      unit: 'pound',
    }
  }

  if (hasDimensionData) {
    const length = maxLength > 0 ? maxLength : defaults.length
    const width = maxWidth > 0 ? maxWidth : defaults.width
    const height = stackedHeight > 0 ? stackedHeight : defaults.height
    if (length > 0 && width > 0 && height > 0) {
      metrics.dimensions = {
        _type: 'packageDimensions',
        length: Number(length.toFixed(2)),
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
      }
    }
  } else if (defaults.length > 0 && defaults.width > 0 && defaults.height > 0) {
    metrics.dimensions = {
      _type: 'packageDimensions',
      length: defaults.length,
      width: defaults.width,
      height: defaults.height,
    }
  }

  return metrics
}
