#!/usr/bin/env node
/**
 * FIELD MAPPING NOTE
 * This file must conform to:
 * .docs/reports/field-to-api-map.md
 *
 * Do not introduce new field names or mappings
 * without updating and authorizing changes
 * to the canonical field-to-API map.
 */
/*
  standardize-order-cart-items
  - Converts any `_type: "orderCartEntry"` cart entries to `_type: "orderCartItem"`
  - Leaves everything else untouched (keys, fields, values)
  - Supports --dry-run (or DRY_RUN=1) to preview changes
*/

const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
const {createClient} = require('@sanity/client')

const envFiles = ['.env.local', '.env.development', '.env']
for (const file of envFiles) {
  const p = path.resolve(process.cwd(), file)
  if (fs.existsSync(p)) dotenv.config({path: p, override: false})
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, or SANITY_API_TOKEN in env',
  )
  process.exit(1)
}

const client = createClient({projectId, dataset, apiVersion: '2024-10-01', token, useCdn: false})

function convertCart(cart) {
  if (!Array.isArray(cart)) return null
  let mutated = false
  const next = cart.map((item) => {
    if (!item || typeof item !== 'object') return item
    if (item._type === 'orderCartEntry') {
      mutated = true
      return {...item, _type: 'orderCartItem'}
    }
    return item
  })
  return mutated ? next : null
}

async function run() {
  const dry = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run')
  const pageSize = 100
  let cursor = ''
  let inspected = 0
  let updatedDocs = 0
  let convertedItems = 0

  while (true) {
    const docs = await client.fetch(
      `*[_type == "order" && _id > $cursor && count(cart[_type == "orderCartEntry"]) > 0]
        | order(_id) { _id, cart } [0...$limit]`,
      {cursor, limit: pageSize},
    )
    if (!docs.length) break

    for (const doc of docs) {
      inspected++
      const next = convertCart(doc.cart)
      if (!next) {
        cursor = doc._id
        continue
      }
      const replaced = next.reduce(
        (sum, it, i) => sum + (doc.cart[i]?._type === 'orderCartEntry' && it?._type === 'orderCartItem' ? 1 : 0),
        0,
      )

      if (!dry) {
        try {
          await client.patch(doc._id).set({cart: next}).commit({autoGenerateArrayKeys: true})
        } catch (err) {
          console.error(`Patch failed for ${doc._id}:`, err?.message || err)
          cursor = doc._id
          continue
        }
      }

      updatedDocs++
      convertedItems += replaced
      cursor = doc._id
    }

    if (docs.length < pageSize) break
  }

  console.log(
    JSON.stringify({dryRun: dry, inspected, updatedDocs, convertedItems}, null, 2),
  )
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
