import fs from 'node:fs/promises'
import {existsSync} from 'node:fs'
import path from 'node:path'
import {parse} from 'csv-parse/sync'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const dotenvPaths = ['.env', '.env.local', '.env.development']
dotenvPaths.forEach((configPath) => {
  if (existsSync(configPath)) {
    dotenv.config({path: configPath, override: false})
  }
})

const MERCHANT_EXPECTED_COLUMNS = [
  'id',
  'gtin',
  'mpn',
  'title',
  'description',
  'link',
  'image_link',
  'availability',
  'price',
  'sale_price',
] as const

const CAMPAIGN_EXPECTED_COLUMNS = [
  'Campaign',
  'Ad Group',
  'SKU',
  'CPC Bid',
  'ROAS Target',
  'Performance Score',
] as const

type MerchantCsvRow = {
  id?: string
  gtin?: string
  mpn?: string
  title?: string
  description?: string
  link?: string
  image_link?: string
  availability?: string
  price?: string
  sale_price?: string
  brand?: string
  [key: string]: string | undefined
}

type CampaignCsvRow = {
  Campaign?: string
  'Ad Group'?: string
  SKU?: string
  'CPC Bid'?: string
  'ROAS Target'?: string
  'Performance Score'?: string
  [key: string]: string | undefined
}

type SanityProductRef = {_id: string}

type ImportCounters = {
  merchantCreated: number
  campaignCreated: number
  skippedNoProduct: number
  errors: number
}

const SANITY_PROJECT_ID =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd'
const SANITY_DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN

if (!SANITY_API_TOKEN) {
  throw new Error('SANITY_API_TOKEN must be set to import merchant data')
}

const client = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: '2024-04-10',
  useCdn: false,
  token: SANITY_API_TOKEN,
})

function resolveCsvPath(
  label: string,
  candidates: Array<string | undefined>,
  fallbackFilename: string,
): string {
  const resolvedCandidates = [
    ...candidates,
    path.resolve(process.cwd(), fallbackFilename),
    path.resolve('/mnt/data', fallbackFilename),
  ]

  for (const candidate of resolvedCandidates) {
    if (!candidate) continue
    const resolved = path.resolve(candidate)
    if (existsSync(resolved)) {
      return resolved
    }
  }

  throw new Error(
    `${label} CSV file not found. Provide a valid path via CLI argument or environment variable.`,
  )
}

async function readCsv<T extends Record<string, unknown>>(
  filePath: string,
  expectedColumns: readonly string[],
  label: string,
): Promise<T[]> {
  const fileBuffer = await fs.readFile(filePath)
  const records = parse(fileBuffer, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[]

  if (records.length === 0) {
    return []
  }

  const firstRecord = records[0]
  const recordKeys = Object.keys(firstRecord)
  const missingColumns = expectedColumns.filter((column) => !recordKeys.includes(column))
  if (missingColumns.length > 0) {
    throw new Error(
      `${label} CSV is missing required columns: ${missingColumns.join(', ')}. Check the feed format before retrying.`,
    )
  }

  return records
}

async function fetchProductRef(sku: string): Promise<string | null> {
  const product = await client.fetch<SanityProductRef | null>(
    '*[_type == "product" && sku == $sku][0]{_id}',
    {sku},
  )
  return product?._id ?? null
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const cleaned = value.replace(/[^0-9.-]/g, '')
  if (!cleaned) return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

function logDuplicate(prefix: string, sku: string) {
  console.warn(`[duplicate] ${prefix} SKU ${sku} encountered more than once. Subsequent rows will be ignored.`)
}

async function importMerchantFeed(
  rows: MerchantCsvRow[],
  counters: ImportCounters,
  linkedProducts: Set<string>,
  skippedSkus: Set<string>,
) {
  const processedSkus = new Set<string>()

  for (const row of rows) {
    const sku = row.id?.trim()
    if (!sku) {
      counters.errors += 1
      console.error('[merchant] Row is missing an SKU and will be skipped.')
      continue
    }

    if (processedSkus.has(sku)) {
      logDuplicate('Merchant feed', sku)
      continue
    }
    processedSkus.add(sku)

    const productRef = await fetchProductRef(sku)
    if (!productRef) {
      skippedSkus.add(sku)
      console.warn(`[merchant] Skipping SKU ${sku}: No matching product found in Sanity.`)
      continue
    }

    try {
      await client.createOrReplace({
        _type: 'merchantFeed',
        _id: `merchantFeed-${sku}`,
        sku,
        gtin: row.gtin?.trim() || undefined,
        mpn: row.mpn?.trim() || undefined,
        title: row.title?.trim() || undefined,
        description: row.description?.trim() || undefined,
        link: row.link?.trim() || undefined,
        image_link: row.image_link?.trim() || undefined,
        availability: row.availability?.trim() || undefined,
        price: row.price?.trim() || undefined,
        sale_price: row.sale_price?.trim() || undefined,
        brand: row.brand?.trim() || 'FAS Motorsports',
        linkedProduct: {_type: 'reference', _ref: productRef},
      })
      counters.merchantCreated += 1
      linkedProducts.add(productRef)
    } catch (error) {
      counters.errors += 1
      console.error(`[merchant] Failed to upsert SKU ${sku}:`, error)
    }
  }
}

async function importCampaignData(
  rows: CampaignCsvRow[],
  counters: ImportCounters,
  linkedProducts: Set<string>,
  skippedSkus: Set<string>,
) {
  const processedSkus = new Set<string>()

  for (const row of rows) {
    const sku = row.SKU?.trim()
    if (!sku) {
      counters.errors += 1
      console.error('[campaign] Row is missing an SKU and will be skipped.')
      continue
    }

    if (processedSkus.has(sku)) {
      logDuplicate('Campaign', sku)
      continue
    }
    processedSkus.add(sku)

    const productRef = await fetchProductRef(sku)
    if (!productRef) {
      skippedSkus.add(sku)
      console.warn(`[campaign] Skipping SKU ${sku}: No matching product found in Sanity.`)
      continue
    }

    const cpcBid = parseNumber(row['CPC Bid']) ?? 0
    const roasTarget = parseNumber(row['ROAS Target']) ?? 0
    const performanceScore = parseNumber(row['Performance Score']) ?? 0

    try {
      await client.createOrReplace({
        _type: 'shoppingCampaign',
        _id: `shoppingCampaign-${sku}`,
        campaign: row.Campaign?.trim() || undefined,
        adGroup: row['Ad Group']?.trim() || undefined,
        sku,
        cpcBid,
        roasTarget,
        performanceScore,
        linkedProduct: {_type: 'reference', _ref: productRef},
      })
      counters.campaignCreated += 1
      linkedProducts.add(productRef)
    } catch (error) {
      counters.errors += 1
      console.error(`[campaign] Failed to upsert SKU ${sku}:`, error)
    }
  }
}

async function importData() {
  const args = process.argv.slice(2)
  const merchantCsvPath = resolveCsvPath('Merchant feed', [args[0], process.env.MERCHANT_FEED_CSV, process.env.MERCHANT_FEED_CSV_PATH], 'FAS_Google_Shopping_Feed_6.7L_Kit.csv')
  const campaignCsvPath = resolveCsvPath('Campaign', [args[1], process.env.CAMPAIGN_FEED_CSV, process.env.CAMPAIGN_FEED_CSV_PATH], 'FAS_Shopping_Campaign_Structure.csv')

  const merchantRows = await readCsv<MerchantCsvRow>(merchantCsvPath, MERCHANT_EXPECTED_COLUMNS, 'Merchant feed')
  const campaignRows = await readCsv<CampaignCsvRow>(campaignCsvPath, CAMPAIGN_EXPECTED_COLUMNS, 'Campaign')

  const counters: ImportCounters = {
    merchantCreated: 0,
    campaignCreated: 0,
    skippedNoProduct: 0,
    errors: 0,
  }
  const linkedProducts = new Set<string>()
  const skippedSkus = new Set<string>()

  await importMerchantFeed(merchantRows, counters, linkedProducts, skippedSkus)
  await importCampaignData(campaignRows, counters, linkedProducts, skippedSkus)

  counters.skippedNoProduct = skippedSkus.size

  console.log('\n✅ Import Completed\n')
  console.log(`Products linked: ${linkedProducts.size}`)
  console.log(`Merchant feed docs created: ${counters.merchantCreated}`)
  console.log(`Campaign docs created: ${counters.campaignCreated}`)
  console.log(`Skipped (no SKU match): ${counters.skippedNoProduct}`)
  console.log(`Errors: ${counters.errors === 0 ? 'none' : counters.errors}`)
  console.log(`\nTimestamp: ${new Date().toISOString()} UTC\n`)
}

importData().catch((error) => {
  console.error('Import failed:', error)
  process.exitCode = 1
})
