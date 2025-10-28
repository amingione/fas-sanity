#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {
  runPaymentFailuresBackfill,
  type PaymentFailuresBackfillOptions,
} from '../netlify/lib/backfills/paymentFailures'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function parseArgs(argv: string[]): PaymentFailuresBackfillOptions {
  const options: PaymentFailuresBackfillOptions = {}

  const getValue = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag)
    if (idx === -1) return undefined
    const value = argv[idx + 1]
    if (!value || value.startsWith('--')) return undefined
    return value
  }

  if (argv.includes('--dry-run') || argv.includes('--dryRun')) {
    options.dryRun = true
  }

  const limitValue = getValue('--limit')
  if (limitValue) {
    const parsed = Number.parseInt(limitValue, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid --limit value "${limitValue}" (expected positive integer).`)
    }
    options.limit = parsed
  }

  const orderId = getValue('--order')
  if (orderId) options.orderId = orderId.trim()

  const orderNumber = getValue('--order-number')
  if (orderNumber) options.orderNumber = orderNumber.trim()

  const pi = getValue('--pi') || getValue('--payment-intent') || getValue('--paymentIntent')
  if (pi) options.paymentIntentId = pi.trim()

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await runPaymentFailuresBackfill({
    ...options,
    logger: (message) => console.log(message),
  })

  console.log(
    `Summary: updated=${result.updated}, skipped=${result.skipped}, total=${result.total}${
      result.dryRun ? ' (dry run)' : ''
    }`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
