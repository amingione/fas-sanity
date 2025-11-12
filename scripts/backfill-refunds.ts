#!/usr/bin/env tsx
// NOTE: orderId is deprecated; prefer orderNumber for identifiers.

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {runRefundBackfill, type RefundBackfillOptions} from '../netlify/lib/backfills/refunds'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function parseArgs(argv: string[]): RefundBackfillOptions {
  const options: RefundBackfillOptions = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg) continue
    if (arg === '--dry-run' || arg === '--dryRun') {
      options.dryRun = true
      continue
    }
    if (arg === '--limit') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --limit')
      }
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value "${value}" (expected positive number)`)
      }
      options.limit = Math.floor(parsed)
      i += 1
      continue
    }
    if (arg === '--order') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --order')
      }
      options.orderId = value.trim()
      i += 1
      continue
    }
    if (arg === '--pi' || arg === '--payment-intent' || arg === '--paymentIntent') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --payment-intent')
      }
      options.paymentIntentId = value.trim()
      i += 1
      continue
    }
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await runRefundBackfill({
    ...options,
    logger: (message) => console.log(message),
  })

  console.log(
    `Summary: applied=${result.applied}, evaluated=${result.totalRefundsEvaluated}, orders=${result.ordersConsidered}${
      result.dryRun ? ' (dry run)' : ''
    }`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
