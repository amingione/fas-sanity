import {existsSync} from 'node:fs'
import {GoogleAdsApi} from 'google-ads-api'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const dotenvPaths = ['.env', '.env.local', '.env.development']
dotenvPaths.forEach((configPath) => {
  if (existsSync(configPath)) {
    dotenv.config({path: configPath, override: false})
  }
})

const REQUIRED_ENV = {
  SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID,
  SANITY_DATASET: process.env.SANITY_DATASET,
  SANITY_WRITE_TOKEN: process.env.SANITY_WRITE_TOKEN,
  GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID,
  GOOGLE_ADS_CLIENT_SECRET: process.env.GOOGLE_ADS_CLIENT_SECRET,
  GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID,
  GOOGLE_ADS_REFRESH_TOKEN: process.env.GOOGLE_ADS_REFRESH_TOKEN,
}

function assertEnv() {
  const missing = Object.entries(REQUIRED_ENV)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

type AdsMetric = {
  impressions: number
  clicks: number
  conversions: number
  adSpend: number
  revenue: number
}

type Aggregated = AdsMetric & {ctr: number; roas: number}

async function fetchAdsPerformance(): Promise<Map<string, Aggregated>> {
  const api = new GoogleAdsApi({
    client_id: REQUIRED_ENV.GOOGLE_ADS_CLIENT_ID as string,
    client_secret: REQUIRED_ENV.GOOGLE_ADS_CLIENT_SECRET as string,
    developer_token: REQUIRED_ENV.GOOGLE_ADS_DEVELOPER_TOKEN as string,
  })

  const customer = api.Customer({
    customer_id: REQUIRED_ENV.GOOGLE_ADS_CUSTOMER_ID as string,
    refresh_token: REQUIRED_ENV.GOOGLE_ADS_REFRESH_TOKEN as string,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  })

  const query = `
    SELECT
      segments.product_item_id,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.cost_micros
    FROM shopping_performance_view
    WHERE segments.date DURING LAST_30_DAYS
  `

  const results = await customer.query(query)

  const map = new Map<string, Aggregated>()

  results.forEach((row: any) => {
    const sku = row.segments?.product_item_id
    if (!sku) return

    const impressions = Number(row.metrics?.impressions || 0)
    const clicks = Number(row.metrics?.clicks || 0)
    const conversions = Number(row.metrics?.conversions || 0)
    const revenue = Number(row.metrics?.conversions_value || 0)
    const adSpend = Number(row.metrics?.cost_micros || 0) / 1_000_000

    const existing = map.get(sku) || {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      adSpend: 0,
      revenue: 0,
      ctr: 0,
      roas: 0,
    }

    existing.impressions += impressions
    existing.clicks += clicks
    existing.conversions += conversions
    existing.adSpend += adSpend
    existing.revenue += revenue

    map.set(sku, existing)
  })

  for (const [sku, metrics] of map) {
    const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0
    const roas = metrics.adSpend > 0 ? metrics.revenue / metrics.adSpend : 0
    metrics.ctr = Number(ctr.toFixed(2))
    metrics.roas = Number(roas.toFixed(2))
    metrics.adSpend = Number(metrics.adSpend.toFixed(2))
    metrics.revenue = Number(metrics.revenue.toFixed(2))
  }

  return map
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

async function syncAdsPerformance() {
  assertEnv()
  const client = createClient({
    projectId: REQUIRED_ENV.SANITY_PROJECT_ID,
    dataset: REQUIRED_ENV.SANITY_DATASET,
    token: REQUIRED_ENV.SANITY_WRITE_TOKEN,
    apiVersion: '2024-10-01',
    useCdn: false,
  })

  console.log('Fetching Google Ads performance…')
  const adsData = await fetchAdsPerformance()
  console.log(`Fetched metrics for ${adsData.size} SKUs`)

  console.log('Loading Sanity products…')
  const products = await fetchSanityProducts(client)
  console.log(`Loaded ${products.size} products with SKU`)

  let updated = 0
  let skipped = 0

  for (const [sku, metrics] of adsData.entries()) {
    const productRef = products.get(sku)
    if (!productRef) {
      skipped++
      continue
    }

    const payload = {
      analytics: {
        ads: {
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          conversions: metrics.conversions,
          adSpend: metrics.adSpend,
          revenue: metrics.revenue,
          roas: metrics.roas,
          ctr: metrics.ctr,
          lastUpdated: new Date().toISOString(),
        },
      },
    }

    const patch = client.patch(productRef._id)
    if (productRef._rev) patch.ifRevisionId(productRef._rev)
    patch.set(payload as any)
    await patch.commit({autoGenerateArrayKeys: true})
    updated++
  }

  console.log(`Updated ${updated} products; skipped ${skipped} without matches`)
}

syncAdsPerformance().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
