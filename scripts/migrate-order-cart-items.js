#!/usr/bin/env node
/*
  migrate-order-cart-items
  - Finds orders whose cart items still use `_type: "orderCartItem"`
  - Rewrites those entries to `_type: "orderCartEntry"` so they match the schema
  - Supports --dry-run (or DRY_RUN=1) to preview changes
*/

const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
const {createClient} = require('@sanity/client')

const envFiles = ['.env.local', '.env.development', '.env']
for (const file of envFiles) {
  const resolved = path.resolve(process.cwd(), file)
  if (fs.existsSync(resolved)) dotenv.config({path: resolved, override: false})
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

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

const convertCartEntries = (cart) => {
  if (!Array.isArray(cart)) return null
  let mutated = false
  const updated = cart.map((item) => {
    if (!item || typeof item !== 'object') return item
    if (item._type !== 'orderCartItem') return item
    mutated = true
    return {...item, _type: 'orderCartEntry'}
  })
  return mutated ? updated : null
}

async function run() {
  const dry = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run')
  const pageSize = 100
  let cursor = ''
  let inspected = 0
  let updatedDocs = 0
  let convertedItems = 0

  while (true) {
    const orders = await client.fetch(
      `*[_type == "order" && _id > $cursor && count(cart[_type == "orderCartItem"]) > 0]
        | order(_id) {
          _id,
          cart
        }[0...$limit]`,
      {cursor, limit: pageSize},
    )

    if (!orders.length) break

    for (const doc of orders) {
      inspected++
      const nextCart = convertCartEntries(doc.cart)
      if (!nextCart) {
        cursor = doc._id
        continue
      }

      const replacedCount = nextCart.reduce(
        (sum, entry, idx) =>
          sum + (doc.cart[idx]?._type === 'orderCartItem' && entry?._type === 'orderCartEntry' ? 1 : 0),
        0,
      )

      if (!dry) {
        try {
          await client.patch(doc._id).set({cart: nextCart}).commit({autoGenerateArrayKeys: true})
        } catch (err) {
          console.error(`Failed to patch ${doc._id}:`, err?.message || err)
          cursor = doc._id
          continue
        }
      }

      updatedDocs++
      convertedItems += replacedCount
      cursor = doc._id
    }

    if (orders.length < pageSize) break
  }

  console.log(
    JSON.stringify(
      {
        dryRun: dry,
        inspected,
        updatedDocs,
        convertedItems,
      },
      null,
      2,
    ),
  )
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
