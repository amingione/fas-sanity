import fs from 'node:fs/promises'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {createClient} from '@sanity/client'
import SftpClient from 'ssh2-sftp-client'
import dotenv from 'dotenv'

const dotenvPaths = ['.env', '.env.local', '.env.development']
dotenvPaths.forEach((configPath) => {
  if (existsSync(configPath)) {
    dotenv.config({path: configPath, override: false})
  }
})

type SanityProduct = {
  _id: string
  title?: string | null
  slug?: {current?: string | null} | null
  sku?: string | null
  mpn?: string | null
  price?: number | string | null
  salePrice?: number | string | null
  onSale?: boolean | null
  availability?: string | null
  condition?: string | null
  shippingWeight?: number | string | null
  boxDimensions?: string | null
  installOnly?: boolean | null
  shippingLabel?: string | null
  productHighlights?: unknown
  productDetails?: unknown
  specifications?: unknown
  attributes?: unknown
  options?: unknown
  color?: unknown
  size?: unknown
  material?: unknown
  productLength?: unknown
  productWidth?: unknown
  shortDescription?: unknown
  description?: unknown
  brand?: string | null
  canonicalUrl?: string | null
  images?: Array<{asset?: {url?: string | null} | null}> | string[]
  categories?: string[] | null
  googleProductCategory?: string | null
  google_product_category?: string | null
}

const SFTP_HOST =
  process.env.GOOGLE_MERCHANT_SFTP_HOST ||
  process.env.GMC_SFTP_HOST ||
  'partnerupload.google.com'
const SFTP_PORT = Number(
  process.env.GOOGLE_MERCHANT_SFTP_PORT || process.env.GMC_SFTP_PORT || 19321
)
const SFTP_USERNAME =
  process.env.GOOGLE_MERCHANT_SFTP_USERNAME || process.env.GMC_SFTP_USERNAME
const SFTP_PASSWORD =
  process.env.GOOGLE_MERCHANT_SFTP_PASSWORD || process.env.GMC_SFTP_PASSWORD
const SFTP_REMOTE_DIR = (
  process.env.GOOGLE_MERCHANT_SFTP_REMOTE_DIR || process.env.GMC_SFTP_REMOTE_DIR || '/'
).replace(/\/?$/, '/')
const SFTP_FILENAME =
  process.env.GOOGLE_MERCHANT_SFTP_FILENAME ||
  process.env.GMC_SFTP_FEED_FILENAME ||
  'products.txt'
const FEED_CURRENCY =
  process.env.GOOGLE_MERCHANT_FEED_CURRENCY || process.env.GMC_FEED_CURRENCY || 'USD'
const SITE_BASE_URL = (
  process.env.GOOGLE_MERCHANT_FEED_BASE_URL ||
  process.env.GMC_FEED_BASE_URL ||
  process.env.SITE_BASE_URL ||
  process.env.PUBLIC_SITE_URL ||
  ''
).replace(/\/$/, '')
const OUTPUT_DIR =
  process.env.GOOGLE_MERCHANT_FEED_OUTPUT_DIR ||
  process.env.GMC_FEED_OUTPUT_DIR ||
  path.resolve(process.cwd(), 'tmp')

const REQUIRED_ENV: Array<[string, string | undefined]> = [
  ['GOOGLE_MERCHANT_SFTP_USERNAME / GMC_SFTP_USERNAME', SFTP_USERNAME],
  ['GOOGLE_MERCHANT_SFTP_PASSWORD / GMC_SFTP_PASSWORD', SFTP_PASSWORD],
] as const

function assertEnv() {
  const missing = REQUIRED_ENV.filter(([, value]) => !value).map(([key]) => key)
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

const SANITY_PROJECT_ID =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  'r4og35qd'
const SANITY_DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'

if (!SANITY_PROJECT_ID || !SANITY_DATASET) {
  throw new Error('Sanity projectId and dataset must be configured')
}

const sanity = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: '2024-04-10',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
})

const QUERY = `*[_type == "product" && defined(price) && price > 0]{
  _id,
  title,
  slug,
  sku,
  mpn,
  price,
  salePrice,
  onSale,
  availability,
  condition,
  shippingWeight,
  boxDimensions,
  installOnly,
  shippingLabel,
  productHighlights,
  productDetails,
  specifications,
  attributes,
  options,
  color,
  size,
  material,
  productLength,
  productWidth,
  shortDescription,
  description,
  brand,
  canonicalUrl,
  "images": images[]{
    asset->{url}
  },
  "categories": category[]->title,
  googleProductCategory,
  google_product_category
}`

const FEED_COLUMNS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'availability',
  'price',
  'condition',
  'brand',
  'google_product_category',
  'product_type',
  'mpn',
  'sale_price',
  'shipping_weight',
] as const

type FeedRow = Record<(typeof FEED_COLUMNS)[number], string>

function condenseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function toPositiveNumber(value: unknown): number | undefined {
  const num = Number(value)
  if (Number.isFinite(num) && num > 0) {
    return Number(num.toFixed(2))
  }
  return undefined
}

function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = condenseWhitespace(String(value))
  return text.replace(/\t/g, ' ')
}

function portableTextToPlain(blocks: any): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (block?._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children.map((child: any) => child?.text || '').join('')
    })
    .filter((text) => text)
    .join('\n\n')
    .trim()
}

function selectDescription(product: SanityProduct): string {
  const shortDesc = portableTextToPlain(product.shortDescription)
  if (shortDesc) return shortDesc
  const fullDesc = portableTextToPlain(product.description)
  if (fullDesc) return fullDesc
  return sanitizeText(product.title)
}

function buildProductLink(product: SanityProduct): string {
  if (product.canonicalUrl) return sanitizeText(product.canonicalUrl)
  const slug = typeof product.slug === 'object' ? product.slug?.current : undefined
  if (SITE_BASE_URL && slug) {
    return `${SITE_BASE_URL}/product/${slug}`
  }
  return ''
}

function buildImageUrl(product: SanityProduct): string {
  if (Array.isArray(product.images)) {
    const first = product.images[0]
    if (typeof first === 'string') return sanitizeText(first)
    if (first?.asset?.url) return sanitizeText(first.asset.url)
  }
  return ''
}

function mapAvailability(value: string | null | undefined): string {
  const normalized = (value || '').toLowerCase()
  if (normalized === 'out_of_stock') return 'out of stock'
  if (normalized === 'preorder') return 'preorder'
  if (normalized === 'backorder') return 'backorder'
  return 'in stock'
}

function formatPrice(value: number | undefined, currency: string): string {
  if (!value) return ''
  return `${value.toFixed(2)} ${currency}`
}

function formatWeight(value: number | undefined): string {
  if (!value) return ''
  return `${value.toFixed(2)} lb`
}

function toProductType(categories: string[] | null | undefined): string {
  if (!Array.isArray(categories) || categories.length === 0) return ''
  return categories.join(' > ')
}

function deriveGoogleCategory(product: SanityProduct): string {
  const explicit = sanitizeText(product.googleProductCategory || product.google_product_category)
  if (explicit) return explicit
  return ''
}

function buildFeedRow(product: SanityProduct): FeedRow | null {
  const offerId = sanitizeText(product.sku || product._id)
  const price = toPositiveNumber(product.price)
  const link = buildProductLink(product)
  const image = buildImageUrl(product)

  if (!offerId || !price || !link || !image) {
    return null
  }

  const description = sanitizeText(selectDescription(product))
  const condition = sanitizeText(product.condition || 'new').toLowerCase() || 'new'
  const brand = sanitizeText(product.brand || '')
  const salePrice = product.onSale ? toPositiveNumber(product.salePrice) : undefined
  const shippingWeight = toPositiveNumber(product.shippingWeight)

  return {
    id: offerId,
    title: sanitizeText(product.title),
    description,
    link,
    image_link: image,
    availability: mapAvailability(product.availability),
    price: formatPrice(price, FEED_CURRENCY),
    condition,
    brand,
    google_product_category: deriveGoogleCategory(product),
    product_type: toProductType(product.categories),
    mpn: sanitizeText(product.mpn || offerId),
    sale_price: formatPrice(salePrice, FEED_CURRENCY),
    shipping_weight: formatWeight(shippingWeight),
  }
}

async function writeFeed(rows: FeedRow[]): Promise<string> {
  await fs.mkdir(OUTPUT_DIR, {recursive: true})
  const header = FEED_COLUMNS.join('\t')
  const lines = rows.map((row) => FEED_COLUMNS.map((column) => row[column] || '').join('\t'))
  const fileContent = [header, ...lines].join('\n')
  const outputPath = path.join(OUTPUT_DIR, SFTP_FILENAME)
  await fs.writeFile(outputPath, fileContent, 'utf8')
  return outputPath
}

async function uploadViaSftp(localPath: string): Promise<void> {
  const sftp = new SftpClient()
  try {
    await sftp.connect({
      host: SFTP_HOST,
      port: SFTP_PORT,
      username: SFTP_USERNAME,
      password: SFTP_PASSWORD,
      readyTimeout: 20000,
    })

    const remotePath = `${SFTP_REMOTE_DIR}${path.basename(localPath)}`
    await sftp.put(localPath, remotePath)
    console.log(`Uploaded feed to ${remotePath}`)
  } finally {
    sftp.end().catch(() => {
      // ignore
    })
  }
}

async function main() {
  assertEnv()

  console.log('Fetching products from Sanity…')
  const products: SanityProduct[] = await sanity.fetch(QUERY)
  console.log(`Fetched ${products.length} products`)

  const rows: FeedRow[] = []
  const skipped: Array<{id: string; reason: string}> = []

  products.forEach((product) => {
    const row = buildFeedRow(product)
    if (row) {
      rows.push(row)
    } else {
      skipped.push({
        id: product._id,
        reason: 'Missing offer ID, price, product link, or primary image',
      })
    }
  })

  if (rows.length === 0) {
    throw new Error('No valid products to include in feed')
  }

  console.log(`Writing feed with ${rows.length} products (skipped ${skipped.length})…`)
  const localPath = await writeFeed(rows)
  console.log(`Feed written to ${localPath}`)

  console.log(`Uploading ${path.basename(localPath)} via SFTP…`)
  await uploadViaSftp(localPath)

  if (skipped.length > 0) {
    console.warn('Skipped products:')
    skipped.forEach((entry) => {
      console.warn(` - ${entry.id}: ${entry.reason}`)
    })
  }

  console.log('Done.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
