#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {
  runExpiredCheckoutBackfill,
  type ExpiredCheckoutBackfillOptions,
} from '../netlify/lib/backfills/expiredCheckouts'

const ENV_FILES = ['.env.local', '.env.development.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const resolved = path.resolve(process.cwd(), filename)
  if (fs.existsSync(resolved)) {
    dotenv.config({path: resolved, override: false})
  }
}

type CliOptions = {
  dryRun: boolean
  limit?: number
  since?: string
  sessionId?: string
}

function parseNumber(value?: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.floor(parsed)
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2)
  let dryRun = false
  let limit: number | undefined
  let since: string | undefined
  let sessionId: string | undefined

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true
    } else if (arg === '--limit') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = parseNumber(value)
      if (!parsed) throw new Error(`Invalid --limit value "${value}"`)
      limit = parsed
      i += 1
    } else if (arg === '--since') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --since')
      since = value
      i += 1
    } else if (arg === '--session') {
      sessionId = (args[i + 1] || '').trim() || undefined
      i += 1
    }
  }

  return {dryRun, limit, since, sessionId}
}

async function main() {
  const cli = parseOptions()
  const options: ExpiredCheckoutBackfillOptions = {
    dryRun: cli.dryRun,
    limit: cli.limit,
    since: cli.since,
    sessionId: cli.sessionId,
    logger: (message) => console.log(message),
  }

  const result = await runExpiredCheckoutBackfill(options)
  console.log(
    `Summary: total=${result.total}, processed=${result.processed}, succeeded=${result.succeeded}, failed=${result.failed}${
      result.dryRun ? ' (dry run)' : ''
    }`,
  )
}

main().catch((err) => {
  console.error('Expired checkout backfill failed:', (err as any)?.message || err)
  process.exit(1)
})
