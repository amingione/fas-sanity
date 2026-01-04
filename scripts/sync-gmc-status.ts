import {existsSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {google} from 'googleapis'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const dotenvPaths = ['.env', '.env.local', '.env.development']
dotenvPaths.forEach((configPath) => {
  if (existsSync(configPath)) {
    dotenv.config({path: configPath, override: false})
  }
})

const REQUIRED_ENV = {
  SANITY_STUDIO_PROJECT_ID: process.env.SANITY_STUDIO_PROJECT_ID,
  SANITY_STUDIO_DATASET: process.env.SANITY_STUDIO_DATASET,
  SANITY_API_TOKEN: process.env.SANITY_API_TOKEN,
  GMC_CONTENT_API_MERCHANT_ID: process.env.GMC_CONTENT_API_MERCHANT_ID,
}

function resolveServiceAccountKeyFile(): string {
  const explicitPath = process.env.GMC_SERVICE_ACCOUNT_KEY_FILE
  if (explicitPath) return explicitPath
  const inlineKey = process.env.GMC_SERVICE_ACCOUNT_KEY
  if (inlineKey) {
    const tempPath = path.join(process.cwd(), '.tmp-gmc-key.json')
    // Write synchronously to avoid races if multiple scripts run
    writeFileSync(tempPath, inlineKey, 'utf8')
    return tempPath
  }
  throw new Error('Set GMC_SERVICE_ACCOUNT_KEY_FILE or GMC_SERVICE_ACCOUNT_KEY')
}

function assertEnv() {
  const missing = Object.entries(REQUIRED_ENV)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  if (!process.env.GMC_SERVICE_ACCOUNT_KEY_FILE && !process.env.GMC_SERVICE_ACCOUNT_KEY) {
    throw new Error('Set GMC_SERVICE_ACCOUNT_KEY_FILE or GMC_SERVICE_ACCOUNT_KEY')
  }
}

type MerchantIssue = {
  code?: string | null
  description?: string | null
  severity?: string | null
}

type ProductStatus = {
  isApproved: boolean
  needsGtin: boolean
  needsMpn: boolean
  needsCategory: boolean
  issues: MerchantIssue[]
  lastSynced: string
}

async function fetchGmcProducts() {
  const keyFile = resolveServiceAccountKeyFile()
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/content'],
  })
  const content = google.content({version: 'v2.1', auth})
  const merchantId = REQUIRED_ENV.GMC_CONTENT_API_MERCHANT_ID as string

  const records: Array<{offerId?: string | null; issues: MerchantIssue[]; approved: boolean}> = []
  let pageToken: string | undefined

  do {
    const res = await content.products.list({
      merchantId,
      pageToken,
      maxResults: 250,
    })
    const items = res.data.resources || []
    items.forEach((item) => {
      const issues =
        (item as any).productIssues?.map((issue: any) => ({
          code: issue.code || null,
          description: issue.detail || issue.description || null,
          severity: issue.severity || null,
        })) || []
      const approved =
        ((item as any).destinationStatuses || []).some(
          (dest: any) => (dest.approvalStatus || '').toLowerCase() === 'approved',
        ) || false
      records.push({
        offerId: item.offerId,
        issues,
        approved,
      })
    })
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)

  return records
}

function deriveStatus(entry: {offerId?: string | null; issues: MerchantIssue[]; approved: boolean}) {
  const issues = entry.issues || []
  const needsGtin = issues.some((issue) => (issue.code || '').toLowerCase().includes('gtin'))
  const needsMpn = issues.some((issue) => (issue.code || '').toLowerCase().includes('mpn'))
  const needsCategory = issues.some((issue) =>
    (issue.code || '').toLowerCase().includes('google_product_category'),
  )
  const cleanedIssues = issues.map((issue) => ({
    code: issue.code || undefined,
    description: issue.description || undefined,
    severity: issue.severity || undefined,
  }))
  const status: ProductStatus = {
    isApproved: entry.approved,
    needsGtin,
    needsMpn,
    needsCategory,
    issues: cleanedIssues,
    lastSynced: new Date().toISOString(),
  }
  return status
}

async function fetchSanityProducts(client: ReturnType<typeof createClient>) {
  const products: Array<{_id: string; _rev?: string; sku?: string}> = await client.fetch(
    '*[_type == "product" && defined(sku)]{_id,_rev,sku}',
  )
  const bySku = new Map<string, {_id: string; _rev?: string}>()
  products.forEach((p) => {
    if (p.sku) bySku.set(p.sku, {_id: p._id, _rev: p._rev})
  })
  return bySku
}

async function syncStatuses() {
  assertEnv()
  const client = createClient({
    projectId: REQUIRED_ENV.SANITY_STUDIO_PROJECT_ID,
    dataset: REQUIRED_ENV.SANITY_STUDIO_DATASET,
    token: REQUIRED_ENV.SANITY_API_TOKEN,
    apiVersion: '2024-10-01',
    useCdn: false,
  })

  console.log('Fetching Merchant Center products…')
  const gmcProducts = await fetchGmcProducts()
  console.log(`Fetched ${gmcProducts.length} GMC records`)

  console.log('Loading Sanity products…')
  const sanityProducts = await fetchSanityProducts(client)
  console.log(`Loaded ${sanityProducts.size} products with SKU`)

  let updated = 0
  let skipped = 0

  for (const record of gmcProducts) {
    const sku = record.offerId
    if (!sku) {
      skipped++
      continue
    }
    const productRef = sanityProducts.get(sku)
    if (!productRef) {
      skipped++
      continue
    }
    const status = deriveStatus(record)
    const patch = client.patch(productRef._id)
    if (productRef._rev) patch.ifRevisionId(productRef._rev)
    patch.set({merchantCenterStatus: status})
    await patch.commit({autoGenerateArrayKeys: true})
    updated++
  }

  console.log(`Updated ${updated} products; skipped ${skipped} without matches`)
}

syncStatuses().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
