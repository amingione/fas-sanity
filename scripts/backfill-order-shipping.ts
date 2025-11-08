#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {
  runOrderShippingBackfill,
  type OrderShippingBackfillOptions,
} from '../netlify/lib/backfills/orderShipping'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

function parseArgs(): OrderShippingBackfillOptions {
  const args = process.argv.slice(2)
  const options: OrderShippingBackfillOptions = {}

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--limit') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value "${value}" (expected positive integer)`)
      }
      options.limit = parsed
      i += 1
      continue
    }
    if (arg === '--dry-run' || arg === '--dryRun') {
      options.dryRun = true
      continue
    }
    if (arg === '--session') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --session')
      options.sessionId = value.trim()
      i += 1
      continue
    }
    if (arg === '--order') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --order')
      options.orderId = value.trim()
      i += 1
      continue
    }
  }

  return options
}

async function main() {
  const options = parseArgs()
  const result = await runOrderShippingBackfill({
    ...options,
    logger: (message) => console.log(message),
  })
  console.log(
    `Done. processed=${result.processed}, failures=${result.failures}, skipped=${result.skipped}, total=${result.total}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
