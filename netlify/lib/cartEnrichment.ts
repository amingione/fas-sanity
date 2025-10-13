import type { SanityClient } from '@sanity/client'
import type { CartMetadataEntry } from './stripeCartItem'

type CartItem = {
  _type: 'orderCartItem'
  _key?: string
  id?: string
  sku?: string
  name?: string
  productName?: string
  productSlug?: string
  stripeProductId?: string
  stripePriceId?: string
  optionSummary?: string
  optionDetails?: string[]
  upgrades?: string[]
  categories?: string[]
  metadata?: CartMetadataEntry[]
}

type ProductSummary = {
  _id: string
  title?: string
  sku?: string
  slug?: { current?: string }
  categories?: string[]
}

const CART_METADATA_TYPE = 'orderCartItemMeta'

function slugifyValue(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || undefined
}

function ensureMetadataArray(item: CartItem): CartMetadataEntry[] {
  if (!Array.isArray(item.metadata)) return []
  return item.metadata.filter(
    (entry): entry is CartMetadataEntry =>
      Boolean(entry && typeof entry === 'object' && entry._type === CART_METADATA_TYPE && entry.key && entry.value)
  )
}

function appendMetadata(item: CartItem, key: string, value: string, source: CartMetadataEntry['source']) {
  const normalizedValue = value.trim()
  if (!normalizedValue) return
  const metadata = ensureMetadataArray(item)
  const already = metadata.find((entry) => entry.key === key && entry.value === normalizedValue && entry.source === source)
  if (already) return
  metadata.push({
    _type: CART_METADATA_TYPE,
    key,
    value: normalizedValue,
    source,
  })
  item.metadata = metadata
}

function looksLikeSanityId(value?: string | null): boolean {
  if (!value) return false
  return /^[a-zA-Z0-9]{1,2}[-a-zA-Z0-9]{8,}/.test(value) || value.startsWith('product-')
}

function findProductForItem(item: CartItem, products: ProductSummary[]): ProductSummary | null {
  const sku = item.sku?.trim().toLowerCase()
  if (sku) {
    const bySku = products.find((p) => (p.sku || '').toLowerCase() === sku)
    if (bySku) return bySku
  }

  const slugCandidates = [
    item.productSlug,
    slugifyValue(item.productName),
    slugifyValue(item.name),
  ].map((slug) => slug?.trim()).filter(Boolean) as string[]

  for (const slug of slugCandidates) {
    if (!slug) continue
    const bySlug = products.find((p) => (p.slug?.current || '').toLowerCase() === slug.toLowerCase())
    if (bySlug) return bySlug
  }

  const ids = [item.id].filter((id): id is string => Boolean(id && looksLikeSanityId(id)))
  for (const id of ids) {
    const byId = products.find((p) => p._id === id)
    if (byId) return byId
  }

  const titleCandidates = [item.productName, item.name].map((v) => v?.trim()).filter(Boolean) as string[]
  for (const title of titleCandidates) {
    const byTitle = products.find((p) => (p.title || '').trim().toLowerCase() === title.toLowerCase())
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

    if (item.productName) titles.add(item.productName.trim())
    if (item.name) titles.add(item.name.trim())

    if (item.id && looksLikeSanityId(item.id)) ids.add(item.id)
  })

  return {
    slugs: Array.from(slugs),
    skus: Array.from(skus),
    titles: Array.from(titles),
    ids: Array.from(ids),
  }
}

export async function enrichCartItemsFromSanity(cart: CartItem[], sanity: SanityClient): Promise<CartItem[]> {
  if (!Array.isArray(cart) || cart.length === 0) return cart

  const lookup = collectProductQueries(cart)
  if (lookup.slugs.length === 0 && lookup.skus.length === 0 && lookup.titles.length === 0 && lookup.ids.length === 0) {
    return cart
  }

  let products: ProductSummary[] = []
  try {
    products = await sanity.fetch<ProductSummary[]>(
      `*[_type == "product" && (
        slug.current in $slugs ||
        sku in $skus ||
        title in $titles ||
        _id in $ids
      )]{ _id, title, sku, slug, "categories": category[]->title }`,
      {
        slugs: lookup.slugs,
        skus: lookup.skus,
        titles: lookup.titles,
        ids: lookup.ids,
      }
    )
  } catch (err) {
    console.warn('cartEnrichment: failed to fetch product summaries', err)
    return cart
  }

  if (!products || products.length === 0) return cart

  return cart.map((item) => {
    if (!item || typeof item !== 'object') return item
    const product = findProductForItem(item, products)
    if (!product) return item

    if ((!item.sku || !item.sku.trim()) && product.sku) {
      item.sku = product.sku
      appendMetadata(item, 'sanity_sku', product.sku, 'derived')
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

    const categories = sanitizeCategories(product.categories)
    if ((!item.categories || item.categories.length === 0) && categories) {
      item.categories = categories
    }

    return item
  })
}
