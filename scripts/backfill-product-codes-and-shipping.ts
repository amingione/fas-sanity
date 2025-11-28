#!/usr/bin/env tsx
import 'dotenv/config'
import {createClient} from '@sanity/client'
import {ensureProductCodes} from '../packages/sanity-config/src/utils/generateProductCodes'
import {ensureShippingConfig} from '../packages/sanity-config/src/utils/ensureShippingConfig'
import {ensureSalePricing} from '../packages/sanity-config/src/utils/ensureSalePricing'

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity configuration. Set SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN.',
  )
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

type CliOptions = {
  batchSize: number
  maxDocs?: number
  dryRun: boolean
}

function parseCliOptions(): CliOptions {
  const opts: CliOptions = {batchSize: 50, dryRun: false}
  for (const raw of process.argv.slice(2)) {
    const [key, value = 'true'] = raw.includes('=') ? raw.split('=') : [raw, undefined]
    switch (key) {
      case '--batch':
      case '--batchSize':
        if (value === undefined) break
        {
          const parsed = Number(value)
          if (Number.isFinite(parsed) && parsed > 0) {
            opts.batchSize = Math.floor(parsed)
          }
        }
        break
      case '--max':
      case '--limit':
        if (value === undefined) break
        {
          const parsed = Number(value)
          if (Number.isFinite(parsed) && parsed > 0) {
            opts.maxDocs = Math.floor(parsed)
          }
        }
        break
      case '--dry-run':
      case '--dryrun':
        opts.dryRun = true
        break
      case '--help':
      case '-h':
        console.log('Usage: pnpm tsx scripts/backfill-product-codes-and-shipping.ts [--batch 50] [--max 200] [--dry-run]')
        process.exit(0)
      default:
        break
    }
  }
  return opts
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function backfillProducts({batchSize, maxDocs, dryRun}: CliOptions) {
  console.log(
    `Starting product backfill (batch=${batchSize}, max=${maxDocs ?? '∞'}, dryRun=${dryRun})`,
  )

  const productIds = await client.fetch<string[]>(
    `*[_type == "product" && !(_id in path("drafts.**"))][]._id`,
  )

  const total = maxDocs ? Math.min(maxDocs, productIds.length) : productIds.length
  const ids = productIds.slice(0, total)
  console.log(`Found ${ids.length} published product(s) to process.`)

  let processed = 0
  let shippingUpdated = 0
  let saleUpdated = 0
  let codesGenerated = 0

  for (const group of chunk(ids, batchSize)) {
    for (const id of group) {
      if (dryRun) {
        console.log(`[dry-run] Would update shippingConfig, sale pricing, and SKU/MPN for ${id}`)
        processed += 1
        continue
      }

      const shippingResult = await ensureShippingConfig(id, client, {
        log: (...args) => console.log('[shipping-config]', ...args),
      })
      if (shippingResult.updated) shippingUpdated += 1

      const saleResult = await ensureSalePricing(id, client, {
        log: (...args) => console.log('[sale-pricing]', ...args),
      })
      if (saleResult.updated) saleUpdated += 1

      const codeResult = await ensureProductCodes(id, client, {
        log: (...args) => console.log('[product-codes]', ...args),
      })
      if (codeResult.generated) codesGenerated += 1

      processed += 1
    }
    console.log(
      `Progress: ${processed}/${ids.length} processed (shipping updated: ${shippingUpdated}, sale updated: ${saleUpdated}, codes generated: ${codesGenerated})`,
    )
  }

  console.log(
    `Backfill complete. Processed ${processed} product(s). Shipping updated=${shippingUpdated}, sale updated=${saleUpdated}, codes generated=${codesGenerated}.`,
  )
}

const opts = parseCliOptions()

backfillProducts(opts).catch((err) => {
  console.error('Backfill failed', err)
  process.exit(1)
})
