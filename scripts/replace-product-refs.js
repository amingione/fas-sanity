#!/usr/bin/env node
/*
 Replace references to one/many product IDs with another product ID across the dataset.

 Usage:
   # Preview changes (no writes)
   node scripts/replace-product-refs.js --from <oldId1,oldId2> --to <newId>

   # Apply changes
   node scripts/replace-product-refs.js --from <oldId1,oldId2> --to <newId> --yes

 Notes:
   - Loads env from .env.local/.env.development if present
   - Requires SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN
   - Operates by fetching referencing docs, deep-replacing _ref values, and createOrReplace()
*/
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const {createClient} = require('@sanity/client')

for (const f of ['.env.local', '.env.development', '.env']) {
  const p = path.resolve(process.cwd(), f)
  if (fs.existsSync(p)) dotenv.config({path: p, override: false})
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const token = process.env.SANITY_API_TOKEN
if (!projectId || !dataset || !token) {
  console.error(
    'Missing SANITY env (SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN).',
  )
  process.exit(1)
}

const client = createClient({projectId, dataset, apiVersion: '2024-10-01', token, useCdn: false})

function parseArgs(argv) {
  const args = {yes: false}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from') args.from = argv[++i]
    else if (a === '--to') args.to = argv[++i]
    else if (a === '--yes' || a === '-y') args.yes = true
    else if (a === '--help' || a === '-h') args.help = true
    else {
      console.error('Unknown arg:', a)
      args.help = true
    }
  }
  return args
}

function usage() {
  console.log(`\nReplace references to product IDs
Usage:
  node scripts/replace-product-refs.js --from <oldId1,oldId2> --to <newId> [--yes]
`)
}

function deepReplaceRefs(node, fromSet, toId) {
  if (Array.isArray(node)) return node.map((v) => deepReplaceRefs(v, fromSet, toId))
  if (node && typeof node === 'object') {
    // Replace direct reference objects
    if (node._type === 'reference' && fromSet.has(node._ref)) {
      return {...node, _ref: toId}
    }
    // Recurse
    const out = Array.isArray(node) ? [] : {}
    for (const [k, v] of Object.entries(node)) out[k] = deepReplaceRefs(v, fromSet, toId)
    return out
  }
  return node
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.from || !args.to) return usage()
  const fromIds = String(args.from)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const toId = String(args.to).trim()
  const fromSet = new Set(fromIds)

  // Collect referencing docs for any fromId
  const refs = await client.fetch('*[count((references($ids[]))) > 0]{_id, _type}[0...1000]', {
    ids: fromIds,
  })
  console.log(`Found ${refs.length} docs referencing any of: ${fromIds.join(', ')}`)
  if (refs.length === 0) return

  let changed = 0
  for (const r of refs) {
    const doc = await client.fetch('*[_id == $id][0]', {id: r._id})
    if (!doc) continue
    const next = deepReplaceRefs(doc, fromSet, toId)
    const modified = JSON.stringify(doc) !== JSON.stringify(next)
    if (!modified) continue
    changed++
    if (args.yes) {
      await client.createOrReplace(next)
      console.log(`Updated ${doc._id} (${doc._type})`)
    } else {
      console.log(`[dry] Would update ${doc._id} (${doc._type})`)
    }
  }
  console.log(`${args.yes ? 'Updated' : 'Would update'} ${changed} document(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
