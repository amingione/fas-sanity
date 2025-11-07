import Stripe from 'stripe'
import {
  coerceStringArray,
  deriveOptionsFromMetadata as deriveCartOptions,
  uniqueStrings,
} from '@fas/sanity-config/utils/cartItemDetails'

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
  image?: string
  productUrl?: string
  optionSummary?: string
  optionDetails?: string[]
  upgrades?: string[]
  customizations?: string[]
  price?: number
  quantity?: number
  categories?: string[]
  lineTotal?: number
  total?: number
  productRef?: {_type: 'reference'; _ref: string}
  validationIssues?: string[]
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

function sanitizeListInput(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/[\u2022•]/g, ',').replace(/[\r\n]+/g, ',')
  }
  return value
}

function pickFirst(map: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = map[key]
    if (value) return value
  }
  return undefined
}

function normalizeDetails(...values: Array<unknown>): string[] {
  const segments = values.flatMap((value) => coerceStringArray(sanitizeListInput(value)))
  if (segments.length === 0) return []
  return uniqueStrings(
    segments
      .map((segment) => segment.replace(/[\u2022•]/g, '•').replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  )
}

type MetadataMatcher = (...keys: string[]) => string | undefined

function createMetadataMatcher(map: Record<string, string>): MetadataMatcher {
  const entries = Object.entries(map).map(([key, value]) => ({
    raw: key,
    normalized: key.toLowerCase().replace(/[^a-z0-9]/g, ''),
    value,
  }))

  return (...keys: string[]) => {
    for (const candidate of keys) {
      if (!candidate) continue
      const normalizedCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '')
      for (const entry of entries) {
        if (entry.raw === candidate) return entry.value
        if (normalizedCandidate && entry.normalized === normalizedCandidate) {
          return entry.value
        }
      }
    }
    return undefined
  }
}

function pickString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return undefined
}

function parseAmountValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    if (!cleaned) return undefined
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

const PRODUCT_IMAGE_METADATA_KEYS = [
  'product_image_url',
  'product_image',
  'productimage',
  'productImage',
  'image_url',
  'imageurl',
  'image',
  'imageUrl',
  'featured_image',
  'featuredimage',
  'thumbnail',
  'thumb',
  'thumb_url',
  'thumburl',
  'photo',
  'product_photo',
]

const PRODUCT_URL_METADATA_KEYS = [
  'product_url',
  'producturl',
  'productUrl',
  'product_link',
  'productlink',
  'productLink',
  'product_page',
  'productpage',
  'product_permalink',
  'productpermalink',
  'url',
]

const LINE_TOTAL_METADATA_KEYS = [
  'line_total',
  'linetotal',
  'lineTotal',
  'line_amount',
  'lineamount',
  'amount_total',
  'amounttotal',
  'amountTotal',
  'subtotal',
  'sub_total',
  'item_total',
  'itemtotal',
  'itemTotal',
]

const TOTAL_METADATA_KEYS = [
  'total',
  'total_amount',
  'totalamount',
  'totalAmount',
  'grand_total',
  'grandtotal',
  'grandTotal',
  'order_total',
  'ordertotal',
  'orderTotal',
  'amount_total',
  'amounttotal',
  'amountTotal',
]

const CUSTOMIZATION_METADATA_KEYS = [
  'customizations',
  'customization',
  'custom_details',
  'custom_detail',
  'customDetails',
  'customDetail',
  'customization_details',
  'customization_detail',
  'customizationDetails',
  'customizationDetail',
  'custom_text',
  'customtext',
  'customText',
  'custom_message',
  'custommessage',
  'customMessage',
  'custom_notes',
  'customnotes',
  'customNotes',
  'engraving',
  'engraving_text',
  'engravingtext',
  'engrave_text',
  'engravingText',
  'personalization',
  'personalisation',
  'personalized_message',
  'personalizedmessage',
  'personalised_message',
  'personalizedMessage',
  'personalisedMessage',
  'monogram',
  'monogram_text',
  'monogramText',
  'inscription',
  'inscription_text',
  'inscriptionText',
  'gift_message',
  'giftmessage',
  'giftMessage',
  'item_note',
  'product_note',
  'order_item_note',
  'itemNote',
  'productNote',
  'orderItemNote',
]

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

  const getMetadataValue = createMetadataMatcher(metadata.map)

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

  const metadataDescription = getMetadataValue(
    'line_description',
    'linedescription',
    'description',
    'product_description',
    'productdescription',
    'item_description',
    'itemdescription',
  )
  const description = toStringValue(lineItem.description) || metadataDescription
  const productName = toStringValue(productObj?.name)
  const fallbackName =
    toStringValue(metadata.map.line_item_name) ||
    toStringValue(metadata.map.item_name) ||
    toStringValue(metadata.map.name)

  const baseName = description || fallbackName || productName
  const derivedOptions = deriveCartOptions(metadata.entries)
  const fallbackSummary = pickFirst(metadata.map, [
    'option_summary_display',
    'option_summary',
    'options_readable',
    'selected_options_display',
    'selected_options',
  ])
  const normalizedSummary = (derivedOptions.optionSummary || fallbackSummary || '').toString().trim()
  const summary = normalizedSummary ? normalizedSummary : undefined
  const summarySegments = summary ? normalizeDetails(summary) : []
  const optionDetailCandidates = normalizeDetails(
    derivedOptions.optionDetails,
    summarySegments,
    metadata.map.option_details_json,
    metadata.map.option_details,
    metadata.map.selected_options_json,
    metadata.map.selected_options,
    metadata.map.option_values,
    metadata.map.option_value_display,
  )
  const optionDetails = optionDetailCandidates.length ? optionDetailCandidates : undefined
  const upgradesCandidates = normalizeDetails(
    derivedOptions.upgrades,
    metadata.map.upgrades,
    metadata.map.upgrade_list,
    metadata.map.upgrade_summary,
    metadata.map.upgrade_details,
  )
  const upgrades = upgradesCandidates.length
    ? uniqueStrings(
        upgradesCandidates.map((entry) => {
          const match = entry.match(/^(?:upgrades?|add[-_ ]?ons?)[:\-\s]+(.+)/i)
          return match && match[1] ? match[1].trim() || entry : entry
        }),
      )
    : undefined
  const customizationCandidates = normalizeDetails(
    derivedOptions.customizations,
    ...CUSTOMIZATION_METADATA_KEYS.map((key) => metadata.map[key]),
  )
  const customizations = customizationCandidates.length ? customizationCandidates : undefined
  const name = baseName || undefined
  const categories = extractCategories(productObj, metadata.map)

  const productImage = Array.isArray(productObj?.images)
    ? productObj?.images.find((img) => typeof img === 'string' && img.trim())
    : undefined
  const image = pickString(getMetadataValue(...PRODUCT_IMAGE_METADATA_KEYS), productImage)

  const productUrl = pickString(
    getMetadataValue(...PRODUCT_URL_METADATA_KEYS),
    (typeof (productObj as any)?.url === 'string' && (productObj as any)?.url) || undefined,
  )

  const metadataLineTotal = parseAmountValue(getMetadataValue(...LINE_TOTAL_METADATA_KEYS))
  const metadataTotal = parseAmountValue(getMetadataValue(...TOTAL_METADATA_KEYS))
  const amountTotal =
    typeof lineItem.amount_total === 'number' && Number.isFinite(lineItem.amount_total)
      ? lineItem.amount_total / 100
      : undefined
  const amountSubtotal =
    typeof lineItem.amount_subtotal === 'number' && Number.isFinite(lineItem.amount_subtotal)
      ? lineItem.amount_subtotal / 100
      : undefined
  const quantityValue = Number.isFinite(quantity) && quantity > 0 ? quantity : undefined
  const derivedLineTotal =
    metadataLineTotal ??
    amountTotal ??
    amountSubtotal ??
    (typeof price === 'number' && quantityValue ? price * quantityValue : undefined)
  const derivedTotal = metadataTotal ?? amountTotal ?? amountSubtotal ?? derivedLineTotal

  return {
    id: productId,
    productSlug,
    stripeProductId,
    stripePriceId,
    sku,
    name,
    productName,
    description,
    image,
    productUrl,
    optionSummary: summary,
    optionDetails,
    upgrades,
    customizations,
    price,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
    categories,
    lineTotal: derivedLineTotal,
    total: derivedTotal,
    metadata: metadata.entries.length ? metadata.entries : undefined,
  }
}

export { deriveCartOptions as deriveOptionsFromMetadata }
