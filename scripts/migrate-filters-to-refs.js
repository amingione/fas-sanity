#!/usr/bin/env node
/*
 Create filterTag docs for existing string filters and convert product.filters strings -> references.

 Safe to run multiple times (idempotent): it reuses existing filterTag docs by slug.
*/
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const slugify = require('slug')
const { createClient } = require('@sanity/client')

for (const f of ['.env.local', '.env.development', '.env']) {
  const p = path.resolve(process.cwd(), f)
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false })
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const token = process.env.SANITY_API_TOKEN
if (!projectId || !dataset || !token) {
  console.error('Missing SANITY env (SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN).')
  process.exit(1)
}

const client = createClient({ projectId, dataset, apiVersion: '2024-10-01', token, useCdn: false })

function norm(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase() }

async function ensureFilterTag(title) {
  const slug = slugify(norm(title))
  // Try to find existing
  let doc = await client.fetch('*[_type=="filterTag" && slug.current==$s][0]{_id}', { s: slug })
  if (doc?._id) return { id: doc._id, slug }
  const id = `filterTag-${slug}`
  const created = await client.createIfNotExists({ _id: id, _type: 'filterTag', title, slug: { _type: 'slug', current: slug } })
  return { id: created._id, slug }
}

async function main() {
  // Gather unique string filters across all products
  const tags = await client.fetch('array::unique(*[_type=="product" && defined(filters)][].filters[])')
  const unique = Array.from(new Set((Array.isArray(tags) ? tags : []).map(norm).filter(Boolean)))
  console.log(`Unique tags: ${unique.length}`)

  // Ensure filterTag docs exist
  const tagToId = new Map()
  for (const t of unique) {
    const { id } = await ensureFilterTag(t)
    tagToId.set(t, id)
  }

  // Convert each product
  const prods = await client.fetch('*[_type=="product" && defined(filters)]{_id, filters}')
  let changed = 0
  for (const p of prods) {
    const arr = Array.isArray(p.filters) ? p.filters : []
    // If already references in this product, skip
    const hasObjects = arr.some((v) => v && typeof v === 'object')
    if (hasObjects) continue
    const refs = Array.from(new Set(arr.map(norm).filter(Boolean)))
      .map((t) => ({ _type: 'reference', _ref: tagToId.get(t) }))
      .filter((r) => r._ref)
    await client.patch(p._id).set({ filters: refs }).commit({ autoGenerateArrayKeys: true })
    changed++
  }
  console.log(JSON.stringify({ tags: unique.length, productsUpdated: changed }, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })

