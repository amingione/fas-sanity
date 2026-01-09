#!/usr/bin/env tsx
import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

type CliOptions = {dryRun?: boolean}

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

async function ensureBackupDir() {
  try {
    await fs.mkdir(BACKUP_DIR, {recursive: true})
  } catch (error) {
    console.error('Unable to create backup directory', error)
    throw error
  }
}

type ReferralRecord = {
  _id: string
  referredBy?: {_ref?: string | null} | null
  referralCount?: number | null
}

async function main() {
  const options = parseArgs()
  const projectId = getEnv('SANITY_STUDIO_PROJECT_ID', process.env.SANITY_STUDIO_PROJECT_ID)
  const dataset = getEnv('SANITY_STUDIO_DATASET', process.env.SANITY_STUDIO_DATASET || 'production')
  const token = getEnv('SANITY_API_TOKEN', process.env.SANITY_API_TOKEN)
  const apiVersion = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'

  const client = createClient({projectId, dataset, token, apiVersion, useCdn: false})

  const referrals: ReferralRecord[] = await client.fetch(`
    *[_type == "customer" && defined(referredBy)]{
      _id,
      referredBy{_ref},
      referralCount
    }
  `)

  if (!referrals.length) {
    console.log('No referral data found to export.')
    return
  }

  await ensureBackupDir()
  const backupPath = path.join(
    BACKUP_DIR,
    `customer-referrals-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  if (!options.dryRun) {
    await fs.writeFile(backupPath, JSON.stringify(referrals, null, 2))
    console.log(`Exported ${referrals.length} referral records to ${backupPath}`)
  } else {
    console.log(
      `[dry-run] would export ${referrals.length} referral records to backups/customer-referrals-backup-...`,
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
