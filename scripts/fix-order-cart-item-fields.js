#!/usr/bin/env node
/*
  fix-order-cart-item-fields
  - Ensures cart items always expose the fields you expect in Studio
  - Coerces `metadata.upgrades` to an array
  - Copies `metadata.option_summary` to `optionSummary` when missing
  - Backfills `sku` from metadata entries (`sanity_sku`/`sku`) when missing
  - Works for both `_type: "orderCartItem"` and `_type: "orderCartEntry"`
*/

const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
const {createClient} = require('@sanity/client')

const envFiles = ['.env.local', '.env.development', '.env']
for (const f of envFiles) {
  const p = path.resolve(process.cwd(), f)
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

function normalizeItem(it, lookups) {
  if (!it || typeof it !== 'object') return it
  const item = {...it}
  const metadata = item.metadata && typeof item.metadata === 'object' ? {...item.metadata} : null

  // Backfill optionSummary from metadata.option_summary
  if (!item.optionSummary && metadata && typeof metadata.option_summary === 'string') {
    const v = metadata.option_summary.trim()
    if (v) item.optionSummary = v
  }

  // Ensure metadata.upgrades is an array
  if (metadata) {
    const upgrades = metadata.upgrades
    if (typeof upgrades === 'string' && upgrades.trim()) {
      metadata.upgrades = [upgrades.trim()]
      item.metadata = metadata
    }
  }

  // Backfill sku from productRef/slug/id or metadataEntries / metadata
  if (!item.sku) {
    const ref = item.productRef && item.productRef._ref
    const slugOrId = item.productSlug || item.id
    let sku = (ref && lookups.skuById.get(ref)) || (slugOrId && lookups.skuBySlugOrId.get(slugOrId))
    if (!sku) {
      const entries = Array.isArray(item.metadataEntries) ? item.metadataEntries : []
      const all = [...entries]
      if (metadata && typeof metadata === 'object') {
        for (const key of Object.keys(metadata)) {
          const val = metadata[key]
          if (typeof val === 'string') {
            all.push({_type: 'orderCartItemMeta', key, value: val, source: 'legacy'})
          }
        }
      }
      const skuEntry = all.find(
        (e) =>
          e &&
          typeof e === 'object' &&
          (e.key === 'sanity_sku' || e.key === 'sku' || e.key === 'SKU' || e.key === 'product_sku'),
      )
      if (skuEntry && typeof skuEntry.value === 'string' && skuEntry.value.trim()) {
        sku = skuEntry.value.trim()
      }
    }
    if (sku) item.sku = sku
  }

  // Link productRef when possible
  if (!item.productRef || !item.productRef._ref) {
    const slugOrId = item.productSlug || item.id
    const foundId = (slugOrId && lookups.idBySlug.get(slugOrId)) || null
    if (foundId) {
      item.productRef = {_type: 'reference', _ref: foundId}
    }
  }

  // Ensure options array is present: if missing but we have a summary, fall back to [summary]
  if ((!Array.isArray(item.optionDetails) || item.optionDetails.length === 0) && item.optionSummary) {
    const summary = String(item.optionSummary).trim()
    if (summary) {
      item.optionDetails = [summary]
    }
  }

  // Reclassify any entries that look like upgrades out of optionDetails and into upgrades
  if (Array.isArray(item.optionDetails) && item.optionDetails.length) {
    const upgradeLabel = /^(upgrade|add-?on|accessory)\s*:\s*/i
    const split = (text) =>
      String(text)
        .split(/[,;|•]/g)
        .map((s) => s.trim())
        .filter(Boolean)
    const details = []
    const reclassifiedUpgrades = []
    for (const entry of item.optionDetails) {
      const segments = split(entry)
      for (const seg of segments) {
        const m = seg.match(upgradeLabel)
        if (m) {
          const val = seg.replace(upgradeLabel, '').trim()
          if (val) reclassifiedUpgrades.push(val)
        } else {
          details.push(seg)
        }
      }
    }
    if (reclassifiedUpgrades.length) {
      const existing = Array.isArray(item.upgrades) ? item.upgrades : []
      const merged = Array.from(new Set([...existing, ...reclassifiedUpgrades]))
      if (merged.length !== existing.length) item.upgrades = merged
    }
    const normalizedDetails = Array.from(new Set(details))
    if (normalizedDetails.length !== item.optionDetails.length || normalizedDetails.some((v, i) => v !== item.optionDetails[i])) {
      item.optionDetails = normalizedDetails
    }
  }

  // Ensure quantity defaults to 1 when missing/invalid
  const qtyNum = Number(item.quantity)
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
    item.quantity = 1
  } else {
    item.quantity = Math.round(qtyNum)
  }

  // Compute lineTotal/total when missing, using metadata or fallbacks
  try {
    const parseAmount = (v) => {
      if (v === null || v === undefined) return null
      const num = Number(String(v).replace(/[^0-9.+-]/g, ''))
      return Number.isFinite(num) ? num : null
    }

    const entries = Array.isArray(item.metadataEntries) ? item.metadataEntries : []
    const byKey = (k) => {
      const e = entries.find((e) => e && typeof e === 'object' && String(e.key || '').toLowerCase() === k)
      return e ? parseAmount(e.value) : null
    }

    const mLine = byKey('line_total') ?? byKey('linetotal') ?? byKey('amount_total')
    const mTotal = byKey('item_total') ?? byKey('total')

    const priceNum = parseAmount(item.price)
    const computedLine =
      mLine ?? (Number.isFinite(priceNum) ? Math.max(0, priceNum) * Math.max(1, Number(item.quantity || 1)) : null)

    if (computedLine !== null && (item.lineTotal === undefined || item.lineTotal === null)) {
      item.lineTotal = computedLine
    }

    const resolvedLine = Number.isFinite(Number(item.lineTotal)) ? Number(item.lineTotal) : computedLine
    const resolvedTotal = mTotal ?? resolvedLine
    if (resolvedTotal !== null && (item.total === undefined || item.total === null)) {
      item.total = resolvedTotal
    }
  } catch {}

  return item
}

async function run() {
  const dry = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run')
  const pageSize = 100
  let cursor = ''
  let inspected = 0
  let changed = 0
  let normalizedItems = 0

  while (true) {
    const docs = await client.fetch(
      `*[_type == "order" && _id > $cursor && defined(cart)][0...$limit] | order(_id){_id, cart}`,
      {cursor, limit: pageSize},
    )
    if (!docs.length) break
    for (const doc of docs) {
      inspected++
      // Build a product sku lookup for items in this doc that are missing SKU
      const productIds = new Set()
      const slugsOrIds = new Set()
      for (const it of doc.cart || []) {
        if (!it || typeof it !== 'object' || it.sku) continue
        if (it.productRef && it.productRef._ref) productIds.add(it.productRef._ref)
        if (it.productSlug) slugsOrIds.add(it.productSlug)
        if (it.id) slugsOrIds.add(it.id)
      }

      const productSkuLookupById = new Map()
      const productSkuLookupBySlugOrId = new Map()
      const productIdBySlug = new Map()
      if (productIds.size || slugsOrIds.size) {
        const lookup = await client.fetch(
          `{
            "byId": *[_type == "product" && _id in $ids]{_id, sku, slug},
            "bySlug": *[_type == "product" && slug.current in $slugs]{_id, "key": slug.current, sku}
          }`,
          {ids: Array.from(productIds), slugs: Array.from(slugsOrIds)},
        )
        for (const p of lookup.byId || []) {
          if (p && p._id) {
            if (p.sku) productSkuLookupById.set(p._id, p.sku)
            if (p.slug?.current) productIdBySlug.set(p.slug.current, p._id)
          }
        }
        for (const p of lookup.bySlug || []) {
          if (p && p.key) {
            if (p.sku) productSkuLookupBySlugOrId.set(p.key, p.sku)
            if (p._id) productIdBySlug.set(p.key, p._id)
          }
        }
      }
      let mutated = false
      const nextCart = (Array.isArray(doc.cart) ? doc.cart : []).map((it) => {
        const before = JSON.stringify(it)
        const afterObj = normalizeItem(it, {
          skuById: productSkuLookupById,
          skuBySlugOrId: productSkuLookupBySlugOrId,
          idBySlug: productIdBySlug,
        })
        const after = JSON.stringify(afterObj)
        if (before !== after) {
          mutated = true
          normalizedItems++
        }
        return afterObj
      })

      if (mutated) {
        changed++
        if (!dry) {
          try {
            await client.patch(doc._id).set({cart: nextCart}).commit({autoGenerateArrayKeys: true})
          } catch (err) {
            console.error(`Patch failed for ${doc._id}:`, err?.message || err)
          }
        }
      }

      cursor = doc._id
    }
    if (docs.length < pageSize) break
  }

  console.log(
    JSON.stringify({dryRun: dry, inspected, changed, normalizedItems}, null, 2),
  )
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
