#!/usr/bin/env node
/* Backfill Customers: set userId from authId/auth0Id if missing; default opt-in flags; stamp updatedAt */
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
if (!projectId || !dataset || !token) { console.error('Missing SANITY envs'); process.exit(1) }

const client = createClient({ projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false })

async function run() {
  const dry = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1'
  const limit = 200
  let cursor = ''
  let total = 0, changed = 0, userIdSet = 0, optInDefaults = 0, updatedStamped = 0
  while (true) {
    const docs = await client.fetch(`*[_type == "customer" && _id > $cursor] | order(_id){_id, userId, authId, auth0Id, updatedAt, emailOptIn, marketingOptIn, textOptIn}[0...$limit]`, { cursor, limit })
    if (!docs?.length) break
    for (const d of docs) {
      total++
      const setOps = {}
      if (!d.userId && d.authId) { setOps.userId = d.authId; userIdSet++ }
      else if (!d.userId && d.auth0Id) { setOps.userId = d.auth0Id; userIdSet++ }
      let defaulted = false
      if (typeof d.emailOptIn === 'undefined') { setOps.emailOptIn = false; defaulted = true }
      if (typeof d.marketingOptIn === 'undefined') { setOps.marketingOptIn = false; defaulted = true }
      if (typeof d.textOptIn === 'undefined') { setOps.textOptIn = false; defaulted = true }
      if (defaulted) optInDefaults++
      if (Object.keys(setOps).length || !d.updatedAt) { setOps.updatedAt = new Date().toISOString(); updatedStamped++ }
      if (Object.keys(setOps).length) {
        changed++
        if (!dry) await client.patch(d._id).set(setOps).commit({ autoGenerateArrayKeys: true })
      }
      cursor = d._id
    }
    if (docs.length < limit) break
  }
  console.log(JSON.stringify({ total, changed, userIdSet, optInDefaults, updatedStamped }, null, 2))
}

run().catch((e) => { console.error(e); process.exit(1) })

