#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import type { HandlerEvent } from '@netlify/functions'
import { config as loadEnv } from 'dotenv'

type CliOptions = {
  mode: 'all' | 'missing'
  limit?: number
  ids?: string[]
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { mode: 'missing' }

  for (const arg of argv.slice(2)) {
    if (!arg) continue
    const [rawKey, rawValue] = arg.includes('=')
      ? arg.split('=')
      : [arg.replace(/^--/, ''), 'true']
    const key = rawKey.replace(/^--/, '').toLowerCase()
    const value = rawValue === undefined ? 'true' : rawValue

    switch (key) {
      case 'mode':
        opts.mode = value === 'all' ? 'all' : 'missing'
        break
      case 'limit':
        opts.limit = Number(value)
        break
      case 'ids':
      case 'id':
        opts.ids = value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
        break
      case 'help':
      case 'h':
      case '?':
        printHelp()
        process.exit(0)
        break
      default:
        // ignore unknown args
        break
    }
  }

  return opts
}

function printHelp(): void {
  console.log(`
Sync Sanity products to Stripe (backfill)

Usage:
  pnpm exec tsx scripts/backfill-stripe-products.ts [--mode all|missing] [--limit 50] [--ids id1,id2]

Options:
  --mode    'missing' (default) only syncs products lacking Stripe IDs; 'all' re-syncs every priced product
  --limit   Maximum number of products to fetch when --mode=missing (1-100, default 25)
  --ids     Comma-separated list of specific Sanity product document IDs to sync
`)
}

async function main() {
  const options = parseArgs(process.argv)
  bootstrapEnv()

  const { default: handler } = await import('../netlify/functions/syncStripeCatalog')
  const secret = (process.env.STRIPE_SYNC_SECRET || '').trim()

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.')
  }

  if (!secret && options.mode === 'missing') {
    console.warn('Warning: STRIPE_SYNC_SECRET is not set; continuing without Authorization header.')
  }

  const body: Record<string, unknown> = {
    mode: options.mode,
  }

  if (options.limit && Number.isFinite(options.limit)) {
    body.limit = Math.max(1, Math.min(100, Math.floor(options.limit)))
  }

  if (options.ids?.length) {
    body.productIds = options.ids
  }

  const event: HandlerEvent = {
    httpMethod: 'POST',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
    body: JSON.stringify(body),
    isBase64Encoded: false,
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    rawUrl: 'http://localhost/.netlify/functions/syncStripeCatalog',
    rawQuery: '',
    path: '/.netlify/functions/syncStripeCatalog',
  }

  const response = await handler(event, {} as any)

  if (response.statusCode >= 400) {
    console.error(`Sync failed with status ${response.statusCode}`)
    console.error(response.body)
    process.exit(1)
  }

  let payload: any = {}
  try {
    payload = response.body ? JSON.parse(response.body) : {}
  } catch {
    console.error('Failed to parse sync response body:', response.body)
    process.exit(1)
  }

  const processed: number = payload.processed ?? 0
  const results: any[] = Array.isArray(payload.results) ? payload.results : []
  const errors: any[] = Array.isArray(payload.errors) ? payload.errors : []

  console.log(
    [
      `Sync complete`,
      `mode=${payload.mode || options.mode}`,
      `processed=${processed}`,
      results.length ? `success=${results.filter((r) => r.status === 'synced').length}` : null,
      errors.length ? `errors=${errors.length}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
  )

  if (results.length) {
    for (const result of results) {
      const status = result.status || 'ok'
      const label = `${result.title || result.docId || 'Product'}`
      const price = result.stripePriceId ? ` price=${result.stripePriceId}` : ''
      const productId = result.stripeProductId ? ` product=${result.stripeProductId}` : ''
      console.log(` - [${status}] ${label}${productId}${price}${result.reason ? ` (${result.reason})` : ''}`)
    }
  }

  if (errors.length) {
    console.error('\nErrors:')
    errors.forEach((err) => {
      console.error(` - ${err.docId || err.title}: ${err.error || err.reason || 'Unknown error'}`)
    })
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

function bootstrapEnv() {
  const cwd = process.cwd()
  const nodeEnv = process.env.NODE_ENV || 'development'
  const candidates = [
    '.env',
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
    '.env.local',
    '.env.development',
    '.env.development.local',
  ]

  for (const file of candidates) {
    const filePath = path.resolve(cwd, file)
    if (fs.existsSync(filePath)) {
      loadEnv({ path: filePath, override: false })
    }
  }
}
