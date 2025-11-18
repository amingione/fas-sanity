#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import {
  buildAttributionDocument,
  extractAttributionFromMetadata,
  hasAttributionData,
  AttributionParams,
} from '../netlify/lib/attribution'

type StripeMetadataEntry = {
  key?: string
  value?: string
}

type OrderDoc = {
  _id: string
  attribution?: AttributionParams | null
  createdAt?: string
  _createdAt?: string
  stripeSummary?: {metadata?: StripeMetadataEntry[]}
}

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
  console.error('Missing SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, or SANITY_API_TOKEN')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

const metadataEntriesToRecord = (entries?: StripeMetadataEntry[]): Record<string, any> => {
  const record: Record<string, any> = {}
  if (!Array.isArray(entries)) return record
  for (const entry of entries) {
    const key = typeof entry?.key === 'string' ? entry.key.trim() : ''
    if (!key) continue
    const value = entry?.value
    record[key] = typeof value === 'string' ? value : value ? String(value) : ''
  }
  return record
}

async function run() {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  const orders = await client.fetch<OrderDoc[]>(
    `*[_type == "order"]{
      _id,
      attribution,
      createdAt,
      _createdAt,
      stripeSummary{metadata}
    }`,
  )

  let updated = 0

  for (const order of orders) {
    if (hasAttributionData(order.attribution)) continue

    const metadataRecord = metadataEntriesToRecord(order?.stripeSummary?.metadata)
    let params = extractAttributionFromMetadata(metadataRecord)

    if (!hasAttributionData(params)) {
      params = {
        source: 'direct',
        medium: 'none',
      }
    }

    const doc = buildAttributionDocument(params)
    if (!doc) continue
    if (!doc.capturedAt) {
      doc.capturedAt = order.createdAt || order._createdAt || new Date().toISOString()
    }

    updated += 1
    if (!dryRun) {
      await client
        .patch(order._id)
        .set({attribution: doc})
        .commit({autoGenerateArrayKeys: true})
    }
  }

  console.log(JSON.stringify({total: orders.length, updated, dryRun}, null, 2))
}

run().catch((err) => {
  console.error('backfill-order-attribution failed', err)
  process.exit(1)
})
