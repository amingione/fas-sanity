#!/usr/bin/env tsx
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

type CliOptions = {
  dryRun?: boolean
}

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filepath = path.resolve(process.cwd(), filename)
  if (fsSync.existsSync(filepath)) {
    dotenv.config({path: filepath, override: false})
  }
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes('--dry-run') || args.includes('--dryRun'),
  }
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

type CustomerOptInSource = {
  _id: string
  emailOptIn?: boolean | null
  marketingOptIn?: boolean | null
  textOptIn?: boolean | null
  emailMarketing?: {subscribed?: boolean | null; subscribedAt?: string | null; source?: string | null}
  communicationPreferences?: {marketingOptIn?: boolean | null; smsOptIn?: boolean | null}
  _updatedAt?: string | null
  _createdAt?: string | null
}

type PatchEntry = {
  _id: string
  patch: Record<string, unknown>
  backup: Omit<CustomerOptInSource, '_id'>
}

async function ensureBackupDir() {
  try {
    await fs.mkdir(BACKUP_DIR, {recursive: true})
  } catch (error) {
    console.error('Unable to create backup directory', error)
    throw error
  }
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

  const customers: CustomerOptInSource[] = await client.fetch(`
    *[_type == "customer" && (defined(emailOptIn) || defined(marketingOptIn) || defined(textOptIn))]{
      _id,
      emailOptIn,
      marketingOptIn,
      textOptIn,
      emailMarketing{ subscribed, subscribedAt, source },
      communicationPreferences{ marketingOptIn, smsOptIn },
      _updatedAt,
      _createdAt
    }
  `)

  const patches: PatchEntry[] = []
  for (const customer of customers) {
    if (!customer._id) continue
    const patch: Record<string, unknown> = {}
    const backup: PatchEntry['backup'] = {
      emailOptIn: customer.emailOptIn,
      marketingOptIn: customer.marketingOptIn,
      textOptIn: customer.textOptIn,
      emailMarketing: customer.emailMarketing,
      communicationPreferences: customer.communicationPreferences,
      _updatedAt: customer._updatedAt,
      _createdAt: customer._createdAt,
    }

    const timestamp =
      customer._updatedAt || customer._createdAt || new Date().toISOString()

    if (customer.emailOptIn === true && !customer.emailMarketing?.subscribed) {
      patch['emailMarketing.subscribed'] = true
      patch['emailMarketing.subscribedAt'] =
        customer.emailMarketing?.subscribedAt || timestamp
      patch['emailMarketing.source'] =
        customer.emailMarketing?.source || 'backfill'
    }

    if (customer.marketingOptIn === true && !customer.communicationPreferences?.marketingOptIn) {
      patch['communicationPreferences.marketingOptIn'] = true
    }

    if (customer.textOptIn === true && !customer.communicationPreferences?.smsOptIn) {
      patch['communicationPreferences.smsOptIn'] = true
    }

    if (Object.keys(patch).length > 0) {
      patches.push({
        _id: customer._id,
        patch,
        backup,
      })
    }
  }

  if (!patches.length) {
    console.log('No customers require opt-in migration.')
    return
  }

  await ensureBackupDir()
  const backupPath = path.join(
    BACKUP_DIR,
    `migrate-customer-opt-ins-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  await fs.writeFile(backupPath, JSON.stringify(patches.map((entry) => ({
    _id: entry._id,
    ...entry.backup,
  })), null, 2))
  console.log(`Exported ${patches.length} customer records to ${backupPath}`)

  const chunks = chunkArray(patches, 10)
  let processed = 0
  for (const chunk of chunks) {
    if (options.dryRun) {
      for (const entry of chunk) {
        console.log(`[dry-run] would patch ${entry._id}:`, entry.patch)
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
      `${options.dryRun ? '[dry-run]' : '[live]'} Processed ${processed} / ${patches.length} customers`,
    )
  }

  console.log(
    `Opt-in migration complete: total=${patches.length} dryRun=${Boolean(options.dryRun)}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
