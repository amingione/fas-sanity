#!/usr/bin/env tsx
// NOTE: orderId is deprecated; prefer orderNumber for identifiers.

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {
  runCheckoutAsyncPaymentsBackfill,
  type CheckoutAsyncBackfillOptions,
} from '../netlify/lib/backfills/checkoutAsyncPayments'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const resolved = path.resolve(process.cwd(), filename)
  if (fs.existsSync(resolved)) {
    dotenv.config({path: resolved, override: false})
  }
}

type CliOptions = {
  dryRun: boolean
  limit: number
  status: 'all' | 'success' | 'failure'
  sessionId?: string
  orderId?: string
}

function normalizeSanityId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2)
  let dryRun = false
  let limit = 200
  let status: CliOptions['status'] = 'all'
  let sessionId: string | undefined
  let orderId: string | undefined

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true
    } else if (arg === '--limit') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = Number.parseInt(value, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value "${value}" (expected positive integer)`)
      }
      limit = parsed
      i += 1
    } else if (arg === '--status') {
      const value = (args[i + 1] || '').toLowerCase()
      if (!value) throw new Error('Missing value for --status')
      if (!['all', 'success', 'failure'].includes(value)) {
        throw new Error('Expected --status to be one of: all, success, failure')
      }
      status = value as CliOptions['status']
      i += 1
    } else if (arg === '--session') {
      sessionId = (args[i + 1] || '').trim() || undefined
      i += 1
    } else if (arg === '--order') {
      orderId = normalizeSanityId(args[i + 1])
      i += 1
    }
  }

  return {dryRun, limit, status, sessionId, orderId}
}

async function main() {
  const options = parseOptions()
  const normalized: CheckoutAsyncBackfillOptions = {
    dryRun: options.dryRun,
    limit: options.limit,
    status: options.status,
    sessionId: options.sessionId,
    orderId: normalizeSanityId(options.orderId),
    logger: (message) => console.log(message),
  }

  const result = await runCheckoutAsyncPaymentsBackfill(normalized)
  console.log(
    `Processed ${result.processed} session(s); skipped ${result.skipped}; total considered ${result.total}.`,
  )
}

main().catch((err) => {
  console.error('Backfill failed:', (err as any)?.message || err)
  process.exit(1)
})
