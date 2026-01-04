#!/usr/bin/env node
/*
 Remove references to given document IDs from all documents in the dataset.

 Usage:
   # Preview (no writes) by product titles
   node scripts/remove-refs-to-ids.js --titles "Title A,Title B"

   # Preview by explicit IDs
   node scripts/remove-refs-to-ids.js --ids id1,id2,id3

   # Apply changes
   node scripts/remove-refs-to-ids.js --ids id1,id2 --yes

 Notes:
   - Loads env from .env.local/.env.development if present
   - Requires SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN
   - Strategy: fetch referencing docs, deep-remove any {_type:'reference', _ref in ids}, then createOrReplace()
*/
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const {createClient} = require('@sanity/client')

for (const f of ['.env.local', '.env.development', '.env']) {
  const p = path.resolve(process.cwd(), f)
  if (fs.existsSync(p)) dotenv.config({path: p, override: false})
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
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
    if (a === '--ids') args.ids = argv[++i]
    else if (a === '--titles') args.titles = argv[++i]
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
  console.log(
    '\nRemove references to given IDs\n' +
      'Usage:\n' +
      '  node scripts/remove-refs-to-ids.js --ids <id1,id2,...> [--yes]\n' +
      '  node scripts/remove-refs-to-ids.js --titles "Title A,Title B" [--yes]\n',
  )
}

async function idsFromTitles(titles) {
  const docs = await client.fetch('*[_type == "product" && title in $titles]{_id, title}', {titles})
  return docs.map((d) => d._id)
}

function deepRemoveRefs(node, idSet) {
  if (Array.isArray(node)) {
    const out = []
    let removed = 0
    for (const v of node) {
      const r = deepRemoveRefs(v, idSet)
      removed += r.removed
      if (r.keep) out.push(r.keep)
    }
    return {keep: out, removed}
  }
  if (node && typeof node === 'object') {
    if (node._type === 'reference' && node._ref && idSet.has(node._ref)) {
      return {keep: undefined, removed: 1}
    }
    const out = {}
    let removed = 0
    let changed = false
    for (const [k, v] of Object.entries(node)) {
      const r = deepRemoveRefs(v, idSet)
      if (typeof r.keep === 'undefined') {
        // removed
        removed += r.removed
        changed = true
      } else {
        out[k] = r.keep
        if (r.removed > 0) changed = true
      }
    }
    return {keep: changed ? out : node, removed}
  }
  return {keep: node, removed: 0}
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || (!args.ids && !args.titles)) return usage()

  let ids = []
  if (args.ids)
    ids = String(args.ids)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  if (args.titles) {
    const titles = String(args.titles)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const fromTitles = await idsFromTitles(titles)
    ids.push(...fromTitles)
  }
  ids = Array.from(new Set(ids))
  if (ids.length === 0) {
    console.log('No IDs found.')
    return
  }
  const idSet = new Set(ids)

  // Build an OR query for references() across ids
  const or = ids.map((id, i) => `references($id${i})`).join(' || ')
  const params = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]))
  const refDocs = await client.fetch(`*[${or}]{_id, _type}[0...1000]`, params)
  console.log(`Found ${refDocs.length} referencing doc(s) to clean.`)
  if (refDocs.length === 0) return

  let changed = 0
  for (const r of refDocs) {
    const doc = await client.fetch('*[_id == $id][0]', {id: r._id})
    if (!doc) continue
    // For dry-run, collect paths where matches occur for better visibility
    const paths = []
    ;(function collect(node, path) {
      if (Array.isArray(node)) {
        node.forEach((v, i) => collect(v, path.concat(String(i))))
      } else if (node && typeof node === 'object') {
        if (node._type === 'reference' && node._ref && idSet.has(node._ref)) {
          paths.push(path.join('.'))
          return
        }
        for (const [k, v] of Object.entries(node)) collect(v, path.concat(k))
      }
    })(doc, [])

    const {keep: next, removed} = deepRemoveRefs(doc, idSet)
    if (removed > 0 && next) {
      changed++
      if (args.yes) {
        await client.createOrReplace(next)
        console.log(`Updated ${doc._id} (${doc._type}) — removed ${removed} reference(s)`)
      } else {
        console.log(`[dry] Would update ${doc._id} (${doc._type}) — remove ${removed} reference(s)`)
        if (paths.length) console.log(`  paths: ${paths.join(', ')}`)
      }
    }
  }
  console.log(`${args.yes ? 'Updated' : 'Would update'} ${changed} doc(s).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
