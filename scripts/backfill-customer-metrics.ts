#!/usr/bin/env tsx
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import {
  buildCustomerMetricsPatch,
  CUSTOMER_METRICS_QUERY,
  metricsChanged,
  type CustomerMetricsSource,
} from '../netlify/lib/customerSegments'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filepath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filepath)) {
    dotenv.config({path: filepath, override: false})
  }
}

type CliOptions = {
  dryRun?: boolean
  limit?: number
  customerId?: string
}

const DEFAULT_LIMIT = 5000

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const options: CliOptions = {}

  if (args.includes('--dry-run') || args.includes('--dryRun')) {
    options.dryRun = true
  }

  const getValue = (flag: string) => {
    const index = args.indexOf(flag)
    if (index === -1) return undefined
    const value = args[index + 1]
    if (!value || value.startsWith('--')) return undefined
    return value
  }

  const limitValue = getValue('--limit')
  if (limitValue) {
    const parsed = Number.parseInt(limitValue, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid --limit value "${limitValue}". Provide a positive integer.`)
    }
    options.limit = parsed
  }

  const customerValue = getValue('--customer') || getValue('--id')
  if (customerValue) {
    options.customerId = customerValue.replace(/^drafts\./, '').trim()
  }

  return options
}

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

async function main() {
  const options = parseArgs()
  const projectId = getEnv('SANITY_STUDIO_PROJECT_ID', process.env.SANITY_PROJECT_ID)
  const dataset = getEnv('SANITY_STUDIO_DATASET', process.env.SANITY_DATASET || 'production')
  const token = getEnv('SANITY_API_TOKEN', process.env.SANITY_WRITE_TOKEN)
  const apiVersion =
    process.env.SANITY_STUDIO_API_VERSION || process.env.SANITY_API_VERSION || '2024-10-01'

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion,
    useCdn: false,
  })

  const limit = options.limit ?? DEFAULT_LIMIT
  const params = {
    limit,
    customerId: options.customerId || undefined,
  }

  const customers = await client.fetch<CustomerMetricsSource[]>(CUSTOMER_METRICS_QUERY, params)
  const now = new Date()
  const summary = {
    total: customers.length,
    updated: 0,
    skipped: 0,
    dryRun: options.dryRun ?? false,
  }

  for (const customer of customers) {
    if (!customer?._id) {
      summary.skipped++
      continue
    }
    const patch = buildCustomerMetricsPatch(customer, now)
    if (!metricsChanged(patch, customer.current)) {
      summary.skipped++
      continue
    }
    if (options.dryRun) {
      console.log(`[dry-run] Would update ${customer._id}`, patch)
      summary.updated++
      continue
    }
    await client
      .patch(customer._id)
      .set(patch)
      .commit()
      .then(() => {
        summary.updated++
      })
      .catch((error) => {
        summary.skipped++
        console.warn(`Failed to update customer ${customer._id}`, error)
      })
  }

  console.log(
    `Customer metrics: total=${summary.total} updated=${summary.updated} skipped=${summary.skipped}${
      summary.dryRun ? ' (dry run)' : ''
    }`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
