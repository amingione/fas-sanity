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

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity configuration (SANITY_STUDIO_PROJECT_ID / SANITY_STUDIO_DATASET / SANITY_API_TOKEN).')
  process.exit(1)
}

const client = createClient({projectId, dataset, apiVersion: '2024-10-01', token, useCdn: false})
const dryRun = process.argv.includes('--dry-run')

async function run() {
  const vendors: Array<{_id: string}> = await client.fetch(`*[_type == "vendor"][0...500]{_id}`)
  let updated = 0
  for (const vendor of vendors) {
    const setOps: Record<string, any> = {
      pricingTier: 'standard',
      paymentTerms: 'net_30',
      creditLimit: 10000,
      accountStatus: 'active',
      status: 'active',
      minimumOrderAmount: 500,
    }
    updated += 1
    if (!dryRun) {
      await client
        .patch(vendor._id)
        .setIfMissing({currentBalance: 0, totalOrders: 0, totalRevenue: 0})
        .set(setOps)
        .commit({autoGenerateArrayKeys: true})
    }
  }
  console.log(
    JSON.stringify(
      {
        dryRun,
        vendorsChecked: vendors.length,
        vendorsUpdated: updated,
      },
      null,
      2,
    ),
  )
}

run().catch((error) => {
  console.error('enhance-existing-vendors failed', error)
  process.exit(1)
})
