#!/usr/bin/env node
/*
 Delete product documents by exact title match (case-sensitive) using Sanity API.

 Usage:
   # Dry run (lists matches)
   node scripts/delete-products-by-title.js --titles "Title A,Title B,Title C"

   # Show referencing docs for each match
   node scripts/delete-products-by-title.js --titles "Title A,Title B" --show-refs

   # Perform deletion (deletes both published and draft IDs)
   node scripts/delete-products-by-title.js --titles "Title A,Title B" --yes

 Env:
   Requires SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN
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
  const args = {yes: false, showRefs: false}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--titles') args.titles = argv[++i]
    else if (a === '--yes' || a === '-y') args.yes = true
    else if (a === '--show-refs') args.showRefs = true
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
    '\nDelete product documents by exact title\n' +
      'Usage:\n' +
      '  node scripts/delete-products-by-title.js --titles "Title A,Title B" [--show-refs] [--yes]\n',
  )
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.help || !args.titles) return usage()
  const titles = String(args.titles)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (titles.length === 0) return usage()

  const docs = await client.fetch(
    '*[_type == "product" && title in $titles]{_id, title, sku, _updatedAt} | order(title asc)',
    {titles},
  )
  console.log(`Found ${docs.length} product(s) with matching titles:`)
  for (const d of docs) {
    process.stdout.write(` - ${d._id} | ${d.title}${d.sku ? ' | ' + d.sku : ''}\n`)
    if (args.showRefs) {
      const refs = await client.fetch('count(*[references($id)])', {id: d._id})
      process.stdout.write(`    references: ${refs}\n`)
    }
  }
  if (!args.yes) {
    console.log('\nDry run. Add --yes to delete these documents (and drafts).')
    return
  }
  if (docs.length === 0) {
    console.log('No matches to delete.')
    return
  }
  const tx = client.transaction()
  for (const d of docs) {
    tx.delete(d._id)
    tx.delete(`drafts.${d._id}`)
  }
  await tx.commit({visibility: 'async'})
  console.log(`Requested deletion of ${docs.length} product(s). It may take a moment to reflect.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
