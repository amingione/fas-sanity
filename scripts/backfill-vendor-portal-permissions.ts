#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

type VendorDoc = {
  _id: string
  companyName?: string
  portalAccess?: {
    permissions?: string[]
    enabled?: boolean
  } | null
}

const REQUIRED_PERMISSIONS = [
  'view_own_orders',
  'create_wholesale_orders',
  'view_own_quotes',
  'view_wholesale_catalog',
  'send_support_messages',
  'view_payments',
  'view_analytics',
  'upload_invoices',
]

for (const file of ['.env.local', '.env.development', '.env']) {
  const fullPath = path.resolve(process.cwd(), file)
  if (fs.existsSync(fullPath)) {
    dotenv.config({path: fullPath, override: false})
  }
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity config (projectId/dataset/token).')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: '2024-10-01',
  useCdn: false,
})

const dryRun = process.argv.includes('--dry-run')

const normalizePermissions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  )
}

async function run() {
  const vendors = await client.fetch<VendorDoc[]>(
    '*[_type == "vendor"]{_id, companyName, portalAccess}',
  )

  let scanned = 0
  let updated = 0
  let unchanged = 0
  const pending: Array<{id: string; permissions: string[]}> = []

  for (const vendor of vendors) {
    scanned++
    const current = normalizePermissions(vendor.portalAccess?.permissions)
    const merged = Array.from(new Set([...current, ...REQUIRED_PERMISSIONS]))
    const hasChange =
      current.length !== merged.length || current.some((permission, idx) => permission !== merged[idx])

    if (!hasChange) {
      unchanged++
      continue
    }

    pending.push({id: vendor._id, permissions: merged})
    updated++
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          scanned,
          unchanged,
          updated,
          requiredPermissions: REQUIRED_PERMISSIONS,
          vendorIdsToUpdate: pending.map((item) => item.id),
        },
        null,
        2,
      ),
    )
    return
  }

  const batchSize = 50
  for (let i = 0; i < pending.length; i += batchSize) {
    const slice = pending.slice(i, i + batchSize)
    const tx = client.transaction()
    for (const patch of slice) {
      tx.patch(
        client
          .patch(patch.id)
          .setIfMissing({portalAccess: {}})
          .set({'portalAccess.permissions': patch.permissions}),
      )
    }
    await tx.commit({autoGenerateArrayKeys: true})
  }

  console.log(
    JSON.stringify(
      {
        dryRun: false,
        scanned,
        unchanged,
        updated,
      },
      null,
      2,
    ),
  )
}

run().catch((error) => {
  console.error('backfill-vendor-portal-permissions failed', error)
  process.exit(1)
})

