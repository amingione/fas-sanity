#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {
  runOrderStripeBackfill,
  type OrderStripeBackfillOptions,
  type StripeBackfillKind,
} from '../netlify/lib/backfills/orderStripe'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']

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

function parseCliOptions(argv: string[]): OrderStripeBackfillOptions {
  let kind: StripeBackfillKind | undefined
  let limit = 100
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

async function main() {
  const options = parseCliOptions(process.argv.slice(2))
  const result = await runOrderStripeBackfill({
    ...options,
    logger: (message) => console.log(message),
  })

  console.log(
    `Summary: processed=${result.processed}, succeeded=${result.succeeded}, failed=${result.failed}, total=${result.total}${
      result.dryRun ? ' (dry run)' : ''
    }`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
