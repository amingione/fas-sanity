#!/usr/bin/env tsx
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity configuration. Set SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN.')
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
}

function parseCliOptions(): CliOptions {
  const opts: CliOptions = {batchSize: 100}
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
      case '--help':
      case '-h':
        console.log('Usage: pnpm tsx scripts/backfillProductCoreFields.ts [--batch 100] [--max 500]')
        process.exit(0)
      default:
        break
    }
  }
  return opts
}

async function backfillProductCoreFields(batchSize = 100, maxDocs?: number) {
  let processed = 0
  console.log(
    `Starting product core field backfill (batch=${batchSize}, max=${maxDocs ?? '∞'})`,
  )
  while (true) {
    if (maxDocs && processed >= maxDocs) break
    const effectiveLimit = maxDocs ? Math.min(batchSize, maxDocs - processed) : batchSize
    if (effectiveLimit <= 0) break
    const products: Array<{_id: string; coreRequired?: boolean; promotionTagline?: string | null}> =
      await client.fetch(
        `*[_type == "product" && (!defined(coreRequired) || !defined(promotionTagline))][0...$limit]{
          _id,
          coreRequired,
          promotionTagline
        }`,
        {limit: effectiveLimit},
      )

    if (!products.length) {
      console.log('No products matched query – exiting.')
      break
    }
    console.log(`Fetched ${products.length} product(s) to update`)

    for (const product of products) {
      const setOps: Record<string, unknown> = {}
      if (product.coreRequired === undefined || product.coreRequired === null) {
        setOps.coreRequired = false
      }
      if (product.promotionTagline === undefined || product.promotionTagline === null) {
        setOps.promotionTagline = ''
      }
      if (Object.keys(setOps).length === 0) continue

      await client
        .patch(product._id)
        .set(setOps)
        .commit({autoGenerateArrayKeys: true})

      processed += 1
      console.log(`Updated product ${product._id}`)
    }
  }

  console.log(`Backfill complete. Updated ${processed} product${processed === 1 ? '' : 's'}.`)
}

const {batchSize, maxDocs} = parseCliOptions()

backfillProductCoreFields(batchSize, maxDocs).catch((err) => {
  console.error('Failed to backfill product fields', err)
  process.exit(1)
})
