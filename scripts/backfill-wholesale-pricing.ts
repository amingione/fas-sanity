#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const envFiles = ['.env.local', '.env.development', '.env']
for (const filename of envFiles) {
  const fullPath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(fullPath)) {
    dotenv.config({path: fullPath, override: false})
  }
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const token = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity configuration (SANITY_PROJECT_ID / SANITY_DATASET / SANITY_API_TOKEN).')
  process.exit(1)
}

const client = createClient({projectId, dataset, apiVersion: '2024-10-01', token, useCdn: false})
const dryRun = process.argv.includes('--dry-run')

const round = (value: number) => Math.round(value * 100) / 100

async function run() {
  const products: Array<{_id: string; price?: number | null}> = await client.fetch(
    `*[_type == "product" && defined(price) && productType != "service"]{_id, price}`,
  )
  let updated = 0
  for (const product of products) {
    const price = typeof product.price === 'number' ? product.price : null
    if (!price || price <= 0) continue
    const setOps = {
      wholesalePriceStandard: round(price * 0.8),
      wholesalePricePreferred: round(price * 0.7),
      wholesalePricePlatinum: round(price * 0.6),
      availableForWholesale: true,
      minimumWholesaleQuantity: 1,
    }
    updated += 1
    if (!dryRun) {
      await client.patch(product._id).set(setOps).commit({autoGenerateArrayKeys: true})
    }
  }
  console.log(
    JSON.stringify(
      {
        dryRun,
        productsChecked: products.length,
        productsUpdated: updated,
      },
      null,
      2,
    ),
  )
}

run().catch((error) => {
  console.error('backfill-wholesale-pricing failed', error)
  process.exit(1)
})
