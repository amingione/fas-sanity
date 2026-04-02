#!/usr/bin/env tsx
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

type CliOptions = { dryRun?: boolean }

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filepath = path.resolve(process.cwd(), filename)
  if (fsSync.existsSync(filepath)) {
    dotenv.config({path: filepath, override: false})
  }
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  return {dryRun: args.includes('--dry-run') || args.includes('--dryRun')}
}

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

const BACKUP_DIR = path.resolve(process.cwd(), 'backups')

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

type CustomerStatusSource = {
  _id: string
  customerStatus?: string | null
  orderCount?: number | null
  lifetimeSpend?: number | null
}

type StatusEntry = {
  _id: string
  patch: {customerStatus: string}
  backup: CustomerStatusSource
}

async function ensureBackupDir() {
  try {
    await fs.mkdir(BACKUP_DIR, {recursive: true})
  } catch (error) {
    console.error('Unable to create backup directory', error)
    throw error
  }
}

function determineStatus(orderCount?: number | null, lifetimeSpend?: number | null): string {
  const orders = typeof orderCount === 'number' ? orderCount : 0
  const spend = typeof lifetimeSpend === 'number' ? lifetimeSpend : 0
  if (orders > 0 && spend >= 10000) return 'vip'
  if (orders > 0) return 'customer'
  return 'visitor'
}

async function main() {
  const options = parseArgs()
  const projectId = getEnv('SANITY_STUDIO_PROJECT_ID', process.env.SANITY_STUDIO_PROJECT_ID)
  const dataset = getEnv('SANITY_STUDIO_DATASET', process.env.SANITY_STUDIO_DATASET || 'production')
  const token = getEnv('SANITY_API_TOKEN', process.env.SANITY_API_TOKEN)
  const apiVersion = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion,
    useCdn: false,
  })

  const customers: CustomerStatusSource[] = await client.fetch(`
    *[_type == "customer"]{_id, customerStatus, orderCount, lifetimeSpend}
  `)

  const entries: StatusEntry[] = []
  for (const customer of customers) {
    if (!customer._id) continue
    if (customer.customerStatus) continue
    const status = determineStatus(customer.orderCount, customer.lifetimeSpend)
    entries.push({
      _id: customer._id,
      patch: {customerStatus: status},
      backup: customer,
    })
  }

  if (!entries.length) {
    console.log('All customers already have customerStatus.')
    return
  }

  await ensureBackupDir()
  const backupPath = path.join(
    BACKUP_DIR,
    `migrate-customer-status-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  await fs.writeFile(backupPath, JSON.stringify(entries.map((entry) => entry.backup), null, 2))
  console.log(`Exported customer status backup (${entries.length} records) to ${backupPath}`)

  const chunks = chunkArray(entries, 10)
  let processed = 0
  for (const chunk of chunks) {
    if (options.dryRun) {
      for (const entry of chunk) {
        console.log(`[dry-run] would patch ${entry._id} => customerStatus=${entry.patch.customerStatus}`)
      }
    } else {
      const transaction = client.transaction()
      for (const entry of chunk) {
        transaction.patch(entry._id, {set: entry.patch})
      }
      await transaction.commit()
    }
    processed += chunk.length
    console.log(
      `${options.dryRun ? '[dry-run]' : '[live]'} Applied ${processed} / ${entries.length} customer status updates`,
    )
  }

  console.log(
    `Customer status migration complete: total=${entries.length} dryRun=${Boolean(options.dryRun)}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
