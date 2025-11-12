#!/usr/bin/env tsx
import {createClient} from '@sanity/client'

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

async function backfillProductCoreFields(batchSize = 100) {
  let processed = 0
  while (true) {
    const products: Array<{_id: string; coreRequired?: boolean; promotionTagline?: string | null}> =
      await client.fetch(
        `*[_type == "product" && (!defined(coreRequired) || !defined(promotionTagline))][0...$limit]{
          _id,
          coreRequired,
          promotionTagline
        }`,
        {limit: batchSize},
      )

    if (!products.length) {
      break
    }

    for (const product of products) {
      const setOps: Record<string, unknown> = {}
      if (product.coreRequired === undefined) {
        setOps.coreRequired = false
      }
      if (product.promotionTagline === undefined) {
        setOps.promotionTagline = null
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

backfillProductCoreFields().catch((err) => {
  console.error('Failed to backfill product fields', err)
  process.exit(1)
})

