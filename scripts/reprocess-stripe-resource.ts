#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import type { HandlerEvent } from '@netlify/functions'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const full = path.resolve(process.cwd(), filename)
  if (fs.existsSync(full)) {
    dotenv.config({ path: full, override: false })
  }
}

type CliOptions = {
  id?: string
  autoFulfill: boolean
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = { autoFulfill: false }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--auto-fulfill' || arg === '--autoFulfill') {
      options.autoFulfill = true
    } else if (arg === '--id') {
      options.id = args[i + 1]
      i += 1
    } else if (!arg.startsWith('-') && !options.id) {
      options.id = arg
    }
  }

  return options
}

async function main() {
  const { id, autoFulfill } = parseArgs()
  if (!id) {
    console.error('Usage: pnpm tsx scripts/reprocess-stripe-resource.ts --id <pi_or_cs_id> [--auto-fulfill]')
    process.exit(1)
  }

  const payload = { id, autoFulfill }
  const event: HandlerEvent = {
    httpMethod: 'POST',
    headers: {},
    queryStringParameters: {},
    body: JSON.stringify(payload),
    isBase64Encoded: false,
  }

  try {
    const module = await import('../netlify/functions/reprocessStripeSession')
    const reprocessHandler = module.handler as (
      event: HandlerEvent,
      context: Record<string, unknown>
    ) => Promise<{ statusCode: number; body?: string }>

    if (!reprocessHandler) {
      throw new Error('Unable to load reprocessStripeSession handler')
    }

    const response = await reprocessHandler(event, {} as any)
    const status = response?.statusCode ?? 500
    const body = (() => {
      if (!response?.body) return null
      try {
        return JSON.parse(response.body)
      } catch {
        return response.body
      }
    })()

    console.log('Status:', status)
    if (body !== null) {
      console.log('Response:', body)
    }

    if (status >= 400) {
      process.exitCode = 1
    }
  } catch (err) {
    console.error('Failed to reprocess Stripe resource:', (err as any)?.message || err)
    process.exit(1)
  }
}

main()
