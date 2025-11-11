export const MERCHANT_FEED_COLUMNS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'availability',
  'price',
  'sale_price',
  'brand',
  'gtin',
  'mpn',
] as const

export type MerchantFeedColumn = (typeof MERCHANT_FEED_COLUMNS)[number]

export type MerchantFeedDocument = {
  _id?: string
  sku?: string | null
  title?: string | null
  description?: string | null
  link?: string | null
  image_link?: string | null
  availability?: string | null
  price?: string | null
  sale_price?: string | null
  brand?: string | null
  gtin?: string | null
  mpn?: string | null
}

export type MerchantFeedRow = Record<MerchantFeedColumn, string>

export type MerchantFeedSkipped = {id: string; reason: string}

export type MerchantFeedBuildResult = {
  rows: MerchantFeedRow[]
  skipped: MerchantFeedSkipped[]
  total: number
}

function condenseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return condenseWhitespace(String(value).replace(/[\r\n\t]/g, ' '))
}

function normalizeAvailability(value: unknown): string {
  const normalized = sanitizeText(value).toLowerCase()
  if (!normalized) return 'in stock'

  if (['in stock', 'in_stock', 'instock', 'available'].includes(normalized)) {
    return 'in stock'
  }
  if (['out of stock', 'out_of_stock', 'outofstock', 'sold out'].includes(normalized)) {
    return 'out of stock'
  }
  if (['preorder', 'pre-order'].includes(normalized)) {
    return 'preorder'
  }
  if (['backorder', 'back order'].includes(normalized)) {
    return 'backorder'
  }
  return normalized
}

function sanitizePrice(value: unknown): string {
  return sanitizeText(value)
}

export function buildMerchantFeedRows(documents: MerchantFeedDocument[]): MerchantFeedBuildResult {
  const rows: MerchantFeedRow[] = []
  const skipped: MerchantFeedSkipped[] = []

  documents.forEach((doc, index) => {
    const id = sanitizeText(doc.sku || doc._id)
    if (!id) {
      skipped.push({id: doc._id || `index-${index}`, reason: 'Missing SKU identifier'})
      return
    }

    const title = sanitizeText(doc.title)
    const link = sanitizeText(doc.link)
    const imageLink = sanitizeText(doc.image_link)
    const price = sanitizePrice(doc.price)

    if (!title || !link || !imageLink || !price) {
      skipped.push({
        id,
        reason: 'Missing required title, price, link, or image_link',
      })
      return
    }

    const description = sanitizeText(doc.description)
    const salePrice = sanitizePrice(doc.sale_price)
    const brand = sanitizeText(doc.brand) || 'FAS Motorsports'
    const gtin = sanitizeText(doc.gtin)
    const mpn = sanitizeText(doc.mpn) || id

    const row: MerchantFeedRow = {
      id,
      title,
      description,
      link,
      image_link: imageLink,
      availability: normalizeAvailability(doc.availability),
      price,
      sale_price: salePrice,
      brand,
      gtin,
      mpn,
    }

    rows.push(row)
  })

  return {rows, skipped, total: documents.length}
}

function escapeCsvValue(value: string): string {
  const needsEscaping = /[",\n\r]/.test(value)
  const sanitized = value.replace(/\u0000/g, '')
  if (needsEscaping) {
    return `"${sanitized.replace(/"/g, '""')}"`
  }
  return sanitized
}

export function merchantFeedRowsToCsv(rows: MerchantFeedRow[]): string {
  const header = MERCHANT_FEED_COLUMNS.join(',')
  const lines = rows.map((row) =>
    MERCHANT_FEED_COLUMNS.map((column) => escapeCsvValue(row[column] || '')).join(','),
  )
  return [header, ...lines].join('\r\n')
}
