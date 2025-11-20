#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const resolved = path.resolve(process.cwd(), filename)
  if (fs.existsSync(resolved)) {
    dotenv.config({path: resolved, override: false})
  }
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing SANITY credentials')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

async function run() {
  const dryRun = process.argv.includes('--dry-run')
  const orders = await client.fetch<Array<{_id: string; orderType?: string}>>(
    `*[_type == "order" && (!defined(orderType) || orderType in ["retail",""])]{_id, orderType}`,
  )
  let patched = 0
  for (const order of orders) {
    if (dryRun) {
      console.log(`[dry-run] would update ${order._id} (${order.orderType ?? 'unset'})`)
      continue
    }
    await client.patch(order._id).set({orderType: 'online'}).commit()
    patched += 1
  }
  console.log(
    JSON.stringify(
      {
        total: orders.length,
        updated: dryRun ? 0 : patched,
        dryRun,
      },
      null,
      2,
    ),
  )
}

run().catch((err) => {
  console.error('backfill-order-type-online failed', err)
  process.exit(1)
})
