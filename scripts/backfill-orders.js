#!/usr/bin/env node
/*
  Backfill Orders
  - Ensures cart items have _type: 'orderCartItem' and _key
  - Migrates legacy `customer` -> `customerRef` and unsets `customer`
  - Leaves totals and payment fields as-is (schema now supports them)
*/

const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
const { createClient } = require('@sanity/client')

// Load env from common files if present (without overriding existing)
const envFiles = ['.env.local', '.env.development', '.env']
for (const f of envFiles) {
  const p = path.resolve(process.cwd(), f)
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false })
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, or SANITY_API_TOKEN in env')
  process.exit(1)
}

const client = createClient({ projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false })

function fixCart(arr) {
  if (!Array.isArray(arr)) return null
  const out = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const copy = { ...it }
    if (!copy._type) copy._type = 'orderCartItem'
    out.push(copy)
  }
  return out
}

async function run() {
  const dry = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run')
  const pageSize = 100
  let cursor = ''
  let total = 0
  let changed = 0
  let migratedCustomer = 0
  let cartFixed = 0

  while (true) {
    const result = await client.fetch(
      `*[_type == "order" && _id > $cursor] | order(_id) {
        _id,
        cart,
        customerRef,
        customer
      }[0...$limit]`,
      { limit: pageSize, cursor }
    )

    if (!result || result.length === 0) break
    for (const doc of result) {
      total++
      const setOps = {}
      const unsetOps = []

      // Migrate customer -> customerRef
      if (!doc.customerRef && doc.customer && doc.customer._ref) {
        setOps.customerRef = { _type: 'reference', _ref: doc.customer._ref }
        unsetOps.push('customer')
      } else if (doc.customer) {
        // Even if we already have customerRef, remove legacy field
        unsetOps.push('customer')
      }

      // Fix cart item types
      const fixedCart = fixCart(doc.cart)
      if (Array.isArray(fixedCart)) {
        // Only set if types were missing on any item
        const needs = (doc.cart || []).some((i) => i && typeof i === 'object' && !i._type)
        if (needs) setOps.cart = fixedCart
      }

      if (Object.keys(setOps).length || unsetOps.length) {
        changed++
        if (!dry) {
          try {
            await client.patch(doc._id)
              .set(setOps)
              .unset(unsetOps)
              .commit({ autoGenerateArrayKeys: true })
          } catch (e) {
            console.warn(`Patch failed for ${doc._id}`, e && e.message ? e.message : e)
          }
        }
        if (setOps.customerRef) migratedCustomer++
        if (setOps.cart) cartFixed++
      }
      cursor = doc._id
    }
    if (result.length < pageSize) break
  }

  // After pass, check if any orders still have legacy `customer`
  let remainingCustomer = 0
  try {
    remainingCustomer = await client.fetch('count(*[_type == "order" && defined(customer)])')
  } catch {}

  console.log(JSON.stringify({ total, changed, migratedCustomer, cartFixed, remainingCustomer }, null, 2))
}

run().catch((e) => { console.error(e); process.exit(1) })
