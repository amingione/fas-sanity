#!/usr/bin/env node
/*
 Delete Sanity product documents from the command line.

 Usage examples:
   # List products by SKU or title (no deletes)
   node scripts/delete-products.js --sku ABC123
   node scripts/delete-products.js --title "My Product"

   # Delete by a specific document ID (deletes draft + published)
   node scripts/delete-products.js --id <docId> --yes

   # Delete multiple IDs at once
   node scripts/delete-products.js --ids <id1,id2,id3> --yes

   # Show documents that reference a given ID (to clean up links before/after delete)
   node scripts/delete-products.js --id <docId> --show-refs

 Environment:
   Requires SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN.
   Values are typically in .env.local or .env.development in this repo.
*/
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const {createClient} = require('@sanity/client')

// Load env files if present (no override of existing process.env)
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
  const args = {yes: false, delete: false, showRefs: false}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--yes' || a === '-y') args.yes = true
    else if (a === '--delete' || a === '-D') args.delete = true
    else if (a === '--show-refs') args.showRefs = true
    else if (a === '--id') args.id = argv[++i]
    else if (a === '--ids') args.ids = argv[++i]
    else if (a === '--sku') args.sku = argv[++i]
    else if (a === '--title') args.title = argv[++i]
    else if (a === '--help' || a === '-h') args.help = true
    else {
      console.error('Unknown arg:', a)
      args.help = true
    }
  }
  return args
}

function usage() {
  console.log(`\nDelete Sanity product documents
Usage:
  node scripts/delete-products.js --sku <sku>
  node scripts/delete-products.js --title "<title>"
  node scripts/delete-products.js --id <docId> --show-refs
  node scripts/delete-products.js --id <docId> --yes
  node scripts/delete-products.js --ids <id1,id2,...> --yes

Flags:
  --yes, -y      Proceed with deletion without prompt
  --delete, -D   Optional; implied when --yes with --id/--ids
  --show-refs    List documents that reference the given --id
`)
}

async function listBySku(sku) {
  const docs = await client.fetch(
    '*[_type == "product" && sku == $sku]{_id, title, sku, _updatedAt} | order(_updatedAt desc)',
    {sku},
  )
  console.log(JSON.stringify(docs, null, 2))
}

async function listByTitle(title) {
  const q = `${title}*`
  const docs = await client.fetch(
    '*[_type == "product" && title match $q]{_id, title, sku, _updatedAt}[0...200] | order(title asc)',
    {q},
  )
  console.log(JSON.stringify(docs, null, 2))
}

async function showRefs(id) {
  const refs = await client.fetch('*[_references($id)]{_id, _type, _updatedAt}[0...500]', {id})
  console.log(`Found ${refs.length} referencing docs for ${id}`)
  console.log(JSON.stringify(refs, null, 2))
}

async function deleteIds(ids, yes) {
  if (!ids.length) {
    console.log('No IDs provided.')
    return
  }
  // Fetch titles for context
  const docs = await client.fetch('*[_id in $ids]{_id, _type, title, sku}', {ids})
  const map = Object.fromEntries(docs.map((d) => [d._id, d]))
  console.log('About to delete these documents (and drafts if exist):')
  for (const id of ids) {
    const d = map[id]
    console.log(
      ` - ${id} ${d ? `(${d._type} | ${d.title || ''} ${d.sku ? `| ${d.sku}` : ''})` : ''}`,
    )
  }
  if (!yes) {
    console.log('\nDry run. Add --yes to perform deletion.')
    return
  }
  const tx = client.transaction()
  for (const id of ids) {
    tx.delete(id)
    tx.delete(`drafts.${id}`)
  }
  await tx.commit({visibility: 'async'})
  console.log('Delete requested. It may take a moment to reflect in queries.')
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) return usage()
  if (args.sku) return listBySku(args.sku)
  if (args.title) return listByTitle(args.title)
  if (args.id && args.showRefs) return showRefs(args.id)
  if (args.id || args.ids) {
    const ids = []
    if (args.id) ids.push(args.id)
    if (args.ids)
      ids.push(
        ...String(args.ids)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    return deleteIds(ids, args.yes || args.delete)
  }
  return usage()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
