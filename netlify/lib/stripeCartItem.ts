import Stripe from 'stripe'
import { deriveOptionsFromMetadata as deriveCartOptions } from '@fas/sanity-config/utils/cartItemDetails'

type MetadataSource = 'lineItem' | 'price' | 'product' | 'session'

export type CartMetadataEntry = {
  _type: 'orderCartItemMeta'
  key: string
  value: string
  source: MetadataSource | 'derived' | 'legacy'
}

export type MapLineItemOptions = {
  sessionMetadata?: Record<string, unknown>
}

export type MappedCartItem = {
  id?: string
  productSlug?: string
  stripeProductId?: string
  stripePriceId?: string
  sku?: string
  name?: string
  productName?: string
  description?: string
  optionSummary?: string
  optionDetails?: string[]
  upgrades?: string[]
  price?: number
  quantity?: number
  categories?: string[]
  metadata?: CartMetadataEntry[]
}

type MetadataCollection = {
  map: Record<string, string>
  entries: CartMetadataEntry[]
}

function toStringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function normalizeRecord(record?: Record<string, unknown> | null): Record<string, string> {
  const result: Record<string, string> = {}
  if (!record || typeof record !== 'object') return result
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = (rawKey || '').toString().trim()
    const value = toStringValue(rawValue)
    if (!key || !value) continue
    result[key] = value
  }
  return result
}

function collectMetadata(sources: Array<{ source: MetadataSource; data?: Record<string, unknown> | null }>): MetadataCollection {
  const combined: Record<string, string> = {}
  const entries: CartMetadataEntry[] = []
  const seenKeys = new Set<string>()

  for (const { source, data } of sources) {
    const normalized = normalizeRecord(data)
    for (const [key, value] of Object.entries(normalized)) {
      const entry: CartMetadataEntry = { _type: 'orderCartItemMeta', key, value, source }
      entries.push(entry)
      if (!seenKeys.has(key)) {
        combined[key] = value
        seenKeys.add(key)
      }
    }
  }

  return { map: combined, entries }
}

function pickFirst(map: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = map[key]
    if (value) return value
  }
  return undefined
}

function extractCategories(product: Stripe.Product | null, metadataMap: Record<string, string>): string[] | undefined {
  const categories: string[] = []
  const metaCandidate = metadataMap.categories || metadataMap.category
  const productMetaCandidate = product?.metadata?.categories || product?.metadata?.category

  const addFromValue = (value?: string) => {
    if (!value) return
    const trimmed = value.trim()
    if (!trimmed) return
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          parsed
            .map((item) => toStringValue(item))
            .filter(Boolean)
            .forEach((item) => categories.push(item as string))
          return
        }
      } catch {
        // ignore parse errors
      }
    }
    trimmed.split(',').map((part) => part.trim()).filter(Boolean).forEach((part) => categories.push(part))
  }

  addFromValue(metaCandidate)
  addFromValue(productMetaCandidate)

  return categories.length ? Array.from(new Set(categories)) : undefined
}

export function mapStripeLineItem(
  lineItem: Stripe.LineItem,
  options?: MapLineItemOptions,
): MappedCartItem {
  const priceObj = lineItem.price && typeof lineItem.price === 'object' ? (lineItem.price as Stripe.Price) : null
  const productObj =
    priceObj && priceObj.product && typeof priceObj.product === 'object'
      ? (priceObj.product as Stripe.Product)
      : null

  const metadata = collectMetadata([
    { source: 'lineItem', data: (lineItem as any)?.metadata },
    { source: 'price', data: (priceObj as any)?.metadata },
    { source: 'product', data: (productObj as any)?.metadata },
    { source: 'session', data: options?.sessionMetadata },
  ])

  const sku =
    pickFirst(metadata.map, [
      'sku',
      'SKU',
      'product_sku',
      'productSku',
      'item_sku',
      'variant_sku',
      'inventory_sku',
    ]) || undefined

  const productSlug =
    pickFirst(metadata.map, ['sanity_slug', 'product_slug', 'productSlug', 'slug', 'handle']) || undefined

  const stripeProductId = productObj?.id || pickFirst(metadata.map, ['stripe_product_id', 'stripeProductId'])
  const stripePriceId =
    (typeof lineItem.price === 'string' ? lineItem.price : priceObj?.id) ||
    pickFirst(metadata.map, ['stripe_price_id', 'stripePriceId', 'price_id'])
  const productId =
    pickFirst(metadata.map, [
      'product_id',
      'productId',
      'sanity_product_id',
      'sanityProductId',
      'item_id',
      'itemId',
    ]) ||
    productSlug ||
    stripeProductId ||
    undefined

  const quantity = Number(lineItem.quantity || 0)
  const unitAmount = Number((lineItem.price as any)?.unit_amount || 0) / 100
  const price =
    Number.isFinite(unitAmount) && unitAmount > 0
      ? unitAmount
      : Number.isFinite((lineItem as any)?.unit_price?.amount_total / 100)
        ? (lineItem as any)?.unit_price?.amount_total / 100
        : undefined

  const description = toStringValue(lineItem.description)
  const productName = toStringValue(productObj?.name)
  const fallbackName =
    toStringValue(metadata.map.line_item_name) ||
    toStringValue(metadata.map.item_name) ||
    toStringValue(metadata.map.name)

  const baseName = description || fallbackName || productName
  const derivedOptions = deriveCartOptions(metadata.entries)
  const optionSummary = derivedOptions.optionSummary
  const optionDetails = derivedOptions.optionDetails
  const upgrades = derivedOptions.upgrades
  const name = baseName || undefined
  const categories = extractCategories(productObj, metadata.map)

  return {
    id: productId,
    productSlug,
    stripeProductId,
    stripePriceId,
    sku,
    name,
    productName,
    description,
    optionSummary,
    optionDetails: optionDetails.length ? optionDetails : undefined,
    upgrades: upgrades.length ? upgrades : undefined,
    price,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
    categories,
    metadata: metadata.entries.length ? metadata.entries : undefined,
  }
}

export { deriveCartOptions as deriveOptionsFromMetadata }
