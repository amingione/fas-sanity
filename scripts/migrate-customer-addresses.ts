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

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

type Address = {
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  postalCode?: string | null
  country?: string | null
  label?: string | null
}

type ShippingAddress = {
  name?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}

type CustomerAddressSource = {
  _id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  addresses?: Address[] | null
  shippingAddress?: ShippingAddress | null
}

type AddressEntry = {
  _id: string
  patch: ShippingAddress
  backup: {addresses: Address[] | null}
}

function isAddressPopulated(address?: ShippingAddress | null): boolean {
  if (!address) return false
  return Boolean(Object.values(address).some((value) => typeof value === 'string' && value.trim()))
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

  const client = createClient({projectId, dataset, token, apiVersion, useCdn: false})

  const customers: CustomerAddressSource[] = await client.fetch(`
    *[_type == "customer" && defined(addresses) && count(addresses) > 0]{
      _id,
      firstName,
      lastName,
      email,
      addresses[]{street, city, state, country, zip, postalCode, label},
      shippingAddress{street, name, city, state, postalCode, country}
    }
  `)

  const entries: AddressEntry[] = []
  for (const customer of customers) {
    if (!customer._id) continue
    if (isAddressPopulated(customer.shippingAddress)) continue
    const primary = Array.isArray(customer.addresses) ? customer.addresses[0] || {} : {}
    const patch: ShippingAddress = {
      name:
        primary.label ||
        customer.firstName ||
        customer.lastName ||
        customer.email ||
        'Customer',
      street: primary.street || '',
      city: primary.city || '',
      state: primary.state || '',
      postalCode: primary.postalCode || primary.zip || '',
      country: primary.country || 'US',
    }
    entries.push({
      _id: customer._id,
      patch,
      backup: {addresses: customer.addresses ?? null},
    })
  }

  if (!entries.length) {
    console.log('No customer addresses require migration.')
    return
  }

  await ensureBackupDir()
  const backupPath = path.join(
    BACKUP_DIR,
    `migrate-customer-addresses-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  await fs.writeFile(
    backupPath,
    JSON.stringify(entries.map((entry) => ({_id: entry._id, ...entry.backup})), null, 2),
  )
  console.log(`Exported ${entries.length} addresses to ${backupPath}`)

  const chunks = chunkArray(entries, 10)
  let migrated = 0
  for (const chunk of chunks) {
    if (options.dryRun) {
      for (const entry of chunk) {
        console.log(`[dry-run] would patch ${entry._id} shippingAddress=`, entry.patch)
      }
    } else {
      const transaction = client.transaction()
      for (const entry of chunk) {
        transaction.patch(entry._id, {set: {shippingAddress: entry.patch}})
      }
      await transaction.commit()
    }
    migrated += chunk.length
    console.log(
      `${options.dryRun ? '[dry-run]' : '[live]'} Migrated ${migrated} / ${entries.length} shipping addresses`,
    )
  }

  console.log(
    `Address migration complete: total=${entries.length} dryRun=${Boolean(options.dryRun)}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
