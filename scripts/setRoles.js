#!/usr/bin/env node
/* scripts/setRoles.js
 * Usage: sanity exec scripts/setRoles.js --with-user-token [-- --dry-run]
 * Adds default roles to customer and vendor documents when missing.
 */
const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
const { createClient } = require('@sanity/client')

for (const f of ['.env.local', '.env.development', '.env']) {
  const p = path.resolve(process.cwd(), f)
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false })
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN
if (!projectId || !dataset || !token) {
  console.error('Missing SANITY envs (SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN)')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const client = createClient({ projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false })

async function backfill(type, fallbackRole) {
  const pageSize = 200
  let cursor = ''
  let total = 0
  let updated = 0

  while (true) {
    const docs = await client.fetch(
      `*[_type == $type && _id > $cursor] | order(_id){ _id, roles }[0...$limit]`,
      { type, cursor, limit: pageSize }
    )
    if (!docs.length) break

    for (const doc of docs) {
      total++
      if (!Array.isArray(doc.roles) || doc.roles.length === 0) {
        updated++
        if (!dryRun) {
          await client.patch(doc._id).set({ roles: [fallbackRole] }).commit({ autoGenerateArrayKeys: true })
        }
      }
      cursor = doc._id
    }

    if (docs.length < pageSize) break
  }

  return { total, updated }
}

async function run() {
  const customers = await backfill('customer', 'customer')
  const vendors = await backfill('vendor', 'vendor')
  console.log(JSON.stringify({ dryRun, customers, vendors }, null, 2))
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
