#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const PREFIX = 'VEN-'
const PAD_LENGTH = 3
const DEFAULT_START = 201
const SETTINGS_TYPE = 'siteSettings'
const NEXT_FIELD = 'nextVendorNumber'

const envFiles = ['.env.local', '.env.development', '.env']
for (const file of envFiles) {
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

const client = createClient({projectId, dataset, token, apiVersion: '2024-10-01', useCdn: false})
const dryRun = process.argv.includes('--dry-run')

const pad = (num: number) => String(num).padStart(PAD_LENGTH, '0')
const formatVendorNumber = (num: number) => `${PREFIX}${pad(num)}`
const parseVendorNumber = (value?: string | null) => {
  if (!value) return 0
  const match = String(value).match(/(\d+)/)
  const parsed = match ? parseInt(match[1], 10) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

async function fetchSettings() {
  const settings = await client.fetch<{_id?: string; [NEXT_FIELD]?: number} | null>(
    `*[_type == $type][0]{_id, ${NEXT_FIELD}}`,
    {type: SETTINGS_TYPE},
  )
  return settings || {}
}

async function ensureSettingsDoc(seedValue: number, settingsId: string) {
  await client.createIfNotExists({
    _id: settingsId,
    _type: SETTINGS_TYPE,
    title: 'Site Settings',
    [NEXT_FIELD]: seedValue,
  })
  if (!dryRun) {
    await client
      .patch(settingsId)
      .setIfMissing({[NEXT_FIELD]: seedValue})
      .commit({autoGenerateArrayKeys: true})
  }
}

async function run() {
  const settings = await fetchSettings()
  const settingsId = settings._id || SETTINGS_TYPE
  const nextFromSettings =
    typeof settings[NEXT_FIELD] === 'number' ? (settings[NEXT_FIELD] as number) : DEFAULT_START

  const existing = await client.fetch<Array<{vendorNumber?: string}>>(
    '*[_type == "vendor" && defined(vendorNumber)]{vendorNumber}',
  )
  const highestExisting = existing.reduce(
    (max, doc) => Math.max(max, parseVendorNumber(doc.vendorNumber)),
    0,
  )
  let counter = Math.max(nextFromSettings, highestExisting + 1, DEFAULT_START)

  const missing = await client.fetch<Array<{_id: string; _rev?: string; companyName?: string}>>(
    '*[_type == "vendor" && !defined(vendorNumber)] | order(_createdAt asc)[0...500]',
  )

  if (!missing.length) {
    console.log(
      JSON.stringify(
        {message: 'No vendors missing vendorNumber', nextVendorNumber: counter, dryRun},
        null,
        2,
      ),
    )
    if (!dryRun) {
      await client.patch(settingsId).set({[NEXT_FIELD]: counter}).commit({autoGenerateArrayKeys: true})
    }
    return
  }

  await ensureSettingsDoc(counter, settingsId)

  const patches = missing.map((vendor) => {
    const vendorNumber = formatVendorNumber(counter++)
    return {id: vendor._id, vendorNumber, rev: vendor._rev, companyName: vendor.companyName || ''}
  })

  const tx = client.transaction()
  for (const patch of patches) {
    const patchBuilder = client.patch(patch.id).set({vendorNumber: patch.vendorNumber})
    if (patch.rev) patchBuilder.ifRevisionId(patch.rev)
    tx.patch(patchBuilder)
  }
  tx.patch(settingsId, (p) => p.set({[NEXT_FIELD]: counter}))

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun,
          vendorsUpdated: patches.length,
          assigned: patches.map(({id, vendorNumber, companyName}) => ({
            id,
            vendorNumber,
            companyName,
          })),
          nextVendorNumber: counter,
        },
        null,
        2,
      ),
    )
    return
  }

  await tx.commit({autoGenerateArrayKeys: true})

  console.log(
    JSON.stringify(
      {
        dryRun,
        vendorsUpdated: patches.length,
        assigned: patches.map(({id, vendorNumber, companyName}) => ({
          id,
          vendorNumber,
          companyName,
        })),
        nextVendorNumber: counter,
      },
      null,
      2,
    ),
  )
}

run().catch((error) => {
  console.error('backfill-vendor-numbers failed', error)
  process.exit(1)
})
