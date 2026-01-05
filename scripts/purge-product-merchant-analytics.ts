#!/usr/bin/env tsx
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity configuration. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN.',
  )
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

type CliOptions = {
  batchSize: number
  maxDocs?: number
  dryRun: boolean
}

function parseCliOptions(): CliOptions {
  const opts: CliOptions = {batchSize: 100, dryRun: false}
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
        opts.dryRun = true
        break
      case '--help':
      case '-h':
        console.log(
          'Usage: pnpm tsx scripts/purge-product-merchant-analytics.ts [--batch 100] [--max 500] [--dry-run]',
        )
        process.exit(0)
      default:
        break
    }
  }
  return opts
}

async function purgeFields(batchSize = 100, maxDocs?: number, dryRun = false) {
  let processed = 0
  console.log(
    `Starting product cleanup (batch=${batchSize}, max=${maxDocs ?? '∞'}, dryRun=${dryRun})`,
  )

  while (true) {
    if (maxDocs && processed >= maxDocs) break
    const effectiveLimit = maxDocs ? Math.min(batchSize, maxDocs - processed) : batchSize
    if (effectiveLimit <= 0) break

    const products: Array<{_id: string}> = await client.fetch(
      `*[_type == "product" && (defined(merchantData) || defined(analytics))][0...$limit]{_id}`,
      {limit: effectiveLimit},
    )

    if (!products.length) {
      console.log('No products matched query – exiting.')
      break
    }

    console.log(`Fetched ${products.length} product(s) to update`)

    for (const product of products) {
      if (dryRun) {
        console.log(`[dry-run] Would unset merchantData + analytics for ${product._id}`)
      } else {
        await client
          .patch(product._id)
          .unset(['merchantData', 'analytics'])
          .commit({autoGenerateArrayKeys: true})
        console.log(`Updated product ${product._id}`)
      }
      processed += 1
    }

    if (dryRun) {
      console.log('Dry-run mode stops after the first batch to avoid repeat output.')
      break
    }
  }

  console.log(
    `Cleanup complete. ${dryRun ? 'Would update' : 'Updated'} ${processed} product${
      processed === 1 ? '' : 's'
    }.`,
  )
}

const {batchSize, maxDocs, dryRun} = parseCliOptions()

purgeFields(batchSize, maxDocs, dryRun).catch((err) => {
  console.error('Failed to purge merchantData/analytics', err)
  process.exit(1)
})
