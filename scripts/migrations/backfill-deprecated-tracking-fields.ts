#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient, type SanityClient} from '@sanity/client'
import {requireSanityCredentials} from '../../netlify/lib/sanityEnv'

type OrderRecord = {
  _id: string
  orderNumber?: string
  fulfillmentDetails?: {
    trackingNumber?: string | null
  } | null
}

type CliOptions = {
  limit?: number
  dryRun?: boolean
}

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = {}
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--limit') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --limit "${value}"`)
      options.limit = parsed
      i += 1
      continue
    }
    if (arg === '--dry-run' || arg === '--dryRun') {
      options.dryRun = true
      continue
    }
  }
  return options
}

function createSanityClient(): SanityClient {
  const {projectId, dataset, token} = requireSanityCredentials()
  return createClient({projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false})
}

async function fetchOrders(sanity: SanityClient, limit: number): Promise<OrderRecord[]> {
  const query = `*[_type == "order" && defined(fulfillmentDetails.trackingNumber) && !defined(trackingNumber)]
    | order(_createdAt asc)[0...$limit]{
      _id,
      orderNumber,
      fulfillmentDetails{trackingNumber}
    }`
  return sanity.fetch<OrderRecord[]>(query, {limit})
}

async function main() {
  const options = parseArgs()
  const sanity = createSanityClient()
  const limit = options.limit ?? 200
  const dryRun = Boolean(options.dryRun)

  const orders = await fetchOrders(sanity, limit)
  if (!orders.length) {
    console.log('No orders require tracking backfill.')
    return
  }

  console.log(`Found ${orders.length} order(s) with deprecated fulfillmentDetails.trackingNumber.`)

  let updated = 0
  let skipped = 0

  for (const order of orders) {
    const legacy = order.fulfillmentDetails?.trackingNumber?.trim()
    if (!legacy) {
      skipped += 1
      console.log(`Skipping ${order._id} (empty legacy tracking number)`)
      continue
    }

    if (dryRun) {
      updated += 1
      console.log(`[dry-run] Would set trackingNumber on ${order._id} -> ${legacy}`)
      continue
    }

    await sanity.patch(order._id).set({trackingNumber: legacy}).commit()
    updated += 1
    console.log(`Updated ${order._id} (${order.orderNumber || 'no orderNumber'})`)
  }

  console.log(`Done. updated=${updated}, skipped=${skipped}, total=${orders.length}`)
  if (dryRun) {
    console.log('Dry-run complete. Run without --dry-run to apply changes.')
  }
}

main().catch((error) => {
  console.error('Tracking backfill failed:', error)
  process.exit(1)
})
