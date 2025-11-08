#!/usr/bin/env node
const {createClient} = require('@sanity/client')
const fs = require('fs')
const path = require('path')
try {
  const dotenv = require('dotenv')
  for (const f of ['.env.local', '.env.development', '.env']) {
    const p = path.resolve(process.cwd(), f)
    if (fs.existsSync(p)) dotenv.config({path: p, override: false})
  }
} catch {}

function normalizeTag(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

async function run() {
  const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
  const token = process.env.SANITY_API_TOKEN
  if (!projectId || !dataset || !token) {
    console.error(
      'Missing SANITY env (SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN)',
    )
    process.exit(1)
  }

  const client = createClient({projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false})

  const docs = await client.fetch(`*[_type=="product"]{_id, filters}`)
  let total = 0,
    changed = 0
  for (const d of docs) {
    total++
    const arr = Array.isArray(d.filters) ? d.filters : []
    const next = Array.from(new Set(arr.map(normalizeTag).filter(Boolean)))
    const same = next.length === arr.length && next.every((v, i) => normalizeTag(arr[i]) === v)
    if (!same) {
      try {
        await client.patch(d._id).set({filters: next}).commit({autoGenerateArrayKeys: true})
        changed++
      } catch (e) {
        console.warn('Patch failed', d._id, e?.message || e)
      }
    }
  }
  console.log(JSON.stringify({total, changed}))
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
