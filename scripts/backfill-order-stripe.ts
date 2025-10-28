#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import type {Handler, HandlerEvent} from '@netlify/functions'

type BackfillKind = 'checkout' | 'paymentIntent' | 'charge'

type CliOptions = {
  kind: BackfillKind
  limit: number
  dryRun: boolean
  id?: string
}

type OrderDoc = {
  _id: string
  orderNumber?: string
  stripeSessionId?: string
  paymentIntentId?: string
}

const ENV_FILES = [
  '.env.development.local',
  '.env.local',
  '.env.development',
  '.env',
]

for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function printUsageAndExit(message?: string, code = 1): never {
  if (message) {
    console.error(message)
  }
  console.log(`
Bulk Stripe order backfill

Usage:
  pnpm tsx scripts/backfill-order-stripe.ts --type <checkout|paymentIntent|charge> [--limit 25] [--dry-run]
  pnpm tsx scripts/backfill-order-stripe.ts --type <checkout|paymentIntent|charge> --id <cs_|pi_|ch_>

Examples:
  pnpm tsx scripts/backfill-order-stripe.ts --type checkout --limit 10
  pnpm tsx scripts/backfill-order-stripe.ts --type paymentIntent --dry-run
  pnpm tsx scripts/backfill-order-stripe.ts --type charge --id pi_123
`)
  process.exit(code)
}

function parseCliOptions(argv: string[]): CliOptions {
  let kind: BackfillKind | undefined
  let limit = 25
  let dryRun = false
  let id: string | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg) continue
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true
      continue
    }
    if (arg === '--limit') {
      const raw = argv[i + 1]
      if (!raw || raw.startsWith('--')) {
        printUsageAndExit('Missing value for --limit')
      }
      const parsed = Number(raw)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        printUsageAndExit(`Invalid --limit value "${raw}" (expected positive number)`)
      }
      limit = Math.floor(parsed)
      i += 1
      continue
    }
    if (arg === '--id') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        printUsageAndExit('Missing value for --id')
      }
      id = value.trim()
      i += 1
      continue
    }
    if (arg === '--type' || arg === '--kind') {
      const value = (argv[i + 1] || '').toLowerCase()
      if (!value) {
        printUsageAndExit('Missing value for --type')
      }
      if (value === 'checkout') kind = 'checkout'
      else if (value === 'paymentintent' || value === 'payment_intent') kind = 'paymentIntent'
      else if (value === 'charge') kind = 'charge'
      else printUsageAndExit(`Unknown --type "${value}"`)
      i += 1
      continue
    }
  }

  if (!kind) {
    printUsageAndExit('Expected --type <checkout|paymentIntent|charge>')
  }

  return {kind, limit, dryRun, id}
}

const sanityProjectId =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  ''
const sanityDataset =
  process.env.SANITY_STUDIO_DATASET ||
  process.env.SANITY_DATASET ||
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  'production'
const sanityToken = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

if (!sanityProjectId || !sanityDataset || !sanityToken) {
  console.error(
    'Missing Sanity configuration. Ensure SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN are set.',
  )
  process.exit(1)
}

const sanity = createClient({
  projectId: sanityProjectId,
  dataset: sanityDataset,
  apiVersion: '2024-04-10',
  token: sanityToken,
  useCdn: false,
})

const ORDER_QUERIES: Record<BackfillKind, string> = {
  checkout: `*[
    _type == "order" &&
    defined(stripeSessionId) &&
    (
      !defined(stripeCheckoutStatus) ||
      stripeCheckoutStatus == "" ||
      !defined(stripeCreatedAt) ||
      !defined(totalAmount)
    )
  ] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    stripeSessionId,
    paymentIntentId
  }`,
  paymentIntent: `*[
    _type == "order" &&
    defined(stripeSessionId) &&
    (
      !defined(paymentIntentId) ||
      paymentIntentId == "" ||
      !defined(stripePaymentIntentStatus) ||
      stripePaymentIntentStatus == ""
    )
  ] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    stripeSessionId,
    paymentIntentId
  }`,
  charge: `*[
    _type == "order" &&
    defined(stripeSessionId) &&
    (
      !defined(chargeId) ||
      chargeId == "" ||
      !defined(cardBrand) ||
      cardBrand == "" ||
      !defined(receiptUrl) ||
      receiptUrl == ""
    )
  ] | order(_createdAt asc)[0...$limit]{
    _id,
    orderNumber,
    stripeSessionId,
    paymentIntentId
  }`,
}

function formatOrderRef(doc: OrderDoc): string {
  return doc.orderNumber ? `${doc.orderNumber} (${doc._id})` : doc._id
}

function selectStripeId(doc: OrderDoc, kind: BackfillKind): string | null {
  if (kind === 'checkout') {
    return doc.stripeSessionId || null
  }
  if (kind === 'paymentIntent') {
    return doc.paymentIntentId || doc.stripeSessionId || null
  }
  // charge backfill prefers payment intent then session
  return doc.paymentIntentId || doc.stripeSessionId || null
}

async function fetchOrders(kind: BackfillKind, limit: number): Promise<OrderDoc[]> {
  const query = ORDER_QUERIES[kind]
  if (!query) return []
  return sanity.fetch<OrderDoc[]>(query, {limit})
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2))

  const {handler} = (await import('../netlify/functions/reprocessStripeSession')) as {
    handler: Handler
  }

  const targets: Array<{label: string; id: string}> = []

  if (options.id) {
    targets.push({label: options.id, id: options.id})
  } else {
    const docs = await fetchOrders(options.kind, options.limit)
    if (!docs.length) {
      console.log('No orders require backfill for the selected type.')
      return
    }

    for (const doc of docs) {
      const id = selectStripeId(doc, options.kind)
      if (!id) {
        console.warn(`Skipping ${formatOrderRef(doc)} (missing Stripe identifier)`)
        continue
      }
      targets.push({label: formatOrderRef(doc), id})
    }
  }

  if (!targets.length) {
    console.log('Nothing to process.')
    return
  }

  let success = 0
  let failure = 0

  for (const target of targets) {
    if (options.dryRun) {
      console.log(`[dry-run] Would reprocess ${target.label} via ${target.id}`)
      continue
    }

    try {
      const event: HandlerEvent = {
        httpMethod: 'POST',
        headers: {},
        multiValueHeaders: {},
        queryStringParameters: {},
        multiValueQueryStringParameters: {},
        body: JSON.stringify({id: target.id, autoFulfill: false}),
        isBase64Encoded: false,
        rawUrl: 'http://localhost/.netlify/functions/reprocessStripeSession',
        rawQuery: '',
        path: '/.netlify/functions/reprocessStripeSession',
      }

      const response = await handler(event, {} as any)
      const ok = response?.statusCode && response.statusCode >= 200 && response.statusCode < 300
      if (ok) {
        success += 1
        console.log(`✅ ${target.label} • ${target.id} • status=${response!.statusCode}`)
      } else {
        failure += 1
        console.warn(`⚠️ ${target.label} • ${target.id} • status=${response?.statusCode ?? 'n/a'}`)
        if (response?.body) {
          console.warn(response.body)
        }
      }
    } catch (err) {
      failure += 1
      console.error(`❌ ${target.label} • ${target.id}`, (err as any)?.message || err)
    }
  }

  if (!options.dryRun) {
    console.log(
      `Done. ${success} succeeded${failure ? `, ${failure} failed` : ''}${
        options.id ? '' : `, processed ${success + failure} records`
      }.`,
    )
  } else {
    console.log(`Dry run complete. ${targets.length} records matched.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
