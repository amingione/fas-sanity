import Stripe from 'stripe'

type MetadataSource = 'lineItem' | 'price' | 'product' | 'session'

export type CartMetadataEntry = {
  _type: 'orderCartItemMeta'
  key: string
  value: string
  source: MetadataSource | 'derived'
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

const OPTION_KEYWORDS = ['option', 'vehicle', 'fitment', 'model', 'variant', 'trim', 'package']
const UPGRADE_KEYWORDS = ['upgrade', 'addon', 'add_on', 'add-on', 'addOn']
const IGNORE_OPTION_KEYS = ['shipping_option', 'shipping_options', 'shippingoption']

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

function humanize(text: string): string {
  if (!text) return ''
  return text
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, (_, a, b) => `${a} ${b}`)
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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

function extractOptionDetails(metadataMap: Record<string, string>): { summary?: string; details: string[] } {
  const pairs = new Map<string, { name?: string; value?: string }>()
  const consumedKeys = new Set<string>()

  for (const [key, value] of Object.entries(metadataMap)) {
    const lowerKey = key.toLowerCase()
    const match = lowerKey.match(/^option(?:[_-]?|)([a-z0-9]+)?[_-]?(name|value)$/)
    if (match) {
      const slot = match[1] || ''
      const kind = match[2]
      const existing = pairs.get(slot) || {}
      if (kind === 'name') existing.name = value
      else existing.value = value
      pairs.set(slot, existing)
      consumedKeys.add(key)
    }
  }

  const details: string[] = []

  for (const [slot, pair] of pairs.entries()) {
    const value = pair.value?.trim()
    if (!value) continue
    const label = (pair.name || (slot ? humanize(slot) : '')).trim()
    if (label) details.push(`${label}: ${value}`)
    else details.push(value)
  }

  for (const [key, value] of Object.entries(metadataMap)) {
    const lowerKey = key.toLowerCase()
    if (consumedKeys.has(key)) continue
    if (IGNORE_OPTION_KEYS.some((ignore) => lowerKey.includes(ignore))) continue
    if (!OPTION_KEYWORDS.some((kw) => lowerKey.includes(kw))) continue
    const label = humanize(key)
    details.push(`${label}: ${value}`)
  }

  const uniqueDetails = Array.from(new Set(details.map((d) => d.trim()).filter(Boolean)))
  const summary = uniqueDetails.length ? uniqueDetails.join(', ') : undefined

  return { summary, details: uniqueDetails }
}

function extractUpgrades(metadataMap: Record<string, string>): string[] | undefined {
  const upgrades: string[] = []

  for (const [key, value] of Object.entries(metadataMap)) {
    const lowerKey = key.toLowerCase()
    if (!UPGRADE_KEYWORDS.some((kw) => lowerKey.includes(kw))) continue
    const tokens = value.split(/[,;|]/g).map((part) => part.trim()).filter(Boolean)
    if (tokens.length) upgrades.push(...tokens)
    else upgrades.push(value.trim())
  }

  const unique = Array.from(new Set(upgrades.filter(Boolean)))
  return unique.length ? unique : undefined
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
  const { summary: optionSummary, details: optionDetails } = extractOptionDetails(metadata.map)
  const upgrades = extractUpgrades(metadata.map)
  const extraParts: string[] = []

  if (optionSummary && (!baseName || !baseName.toLowerCase().includes(optionSummary.toLowerCase()))) {
    extraParts.push(optionSummary)
  }
  if (upgrades && upgrades.length) {
    const label = `Upgrades: ${upgrades.join(', ')}`
    if (!baseName || !baseName.toLowerCase().includes(label.toLowerCase())) {
      extraParts.push(label)
    }
  }

  const name = [baseName, ...extraParts].filter(Boolean).join(' • ') || undefined
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
    upgrades,
    price,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
    categories,
    metadata: metadata.entries.length ? metadata.entries : undefined,
  }
}
