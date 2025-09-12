#!/usr/bin/env node
/*
  Backfill Invoices
  - Ensures lineItems have _key (via autoGenerateArrayKeys)
  - Migrates legacy `customer` -> `customerRef` and `order` -> `orderRef`
*/
const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')
const { createClient } = require('@sanity/client')

for (const f of ['.env.local', '.env.development', '.env']) {
  const p = path.resolve(process.cwd(), f)
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false })
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN
if (!projectId || !dataset || !token) {
  console.error('Missing SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, or SANITY_API_TOKEN')
  process.exit(1)
}

const client = createClient({ projectId, dataset, apiVersion: '2024-04-10', token, useCdn: false })

async function run() {
  const dry = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1'
  const limit = 100
  let cursor = ''
  let total = 0, changed = 0, migratedCustomer = 0, migratedOrder = 0, itemsFixed = 0, legacyConverted = 0

  while (true) {
    const docs = await client.fetch(
      `*[_type == "invoice" && _id > $cursor] | order(_id) {
        _id, lineItems, customerRef, customer, orderRef, order
      }[0...$limit]`,
      { cursor, limit }
    )
    if (!docs?.length) break

    for (const d of docs) {
      total++
      const setOps = {}
      const unsetOps = []

      // Migrate refs
      if (!d.customerRef && d.customer?. _ref) { setOps.customerRef = { _type: 'reference', _ref: d.customer._ref }; unsetOps.push('customer') }
      else if (d.customer) unsetOps.push('customer')
      if (!d.orderRef && d.order?. _ref) { setOps.orderRef = { _type: 'reference', _ref: d.order._ref }; unsetOps.push('order') }
      else if (d.order) unsetOps.push('order')

      // Normalize line items: add _key if missing and convert legacy _type: 'lineItem' to 'invoiceLineItem'
      if (Array.isArray(d.lineItems)) {
        const hasMissingKeys = d.lineItems.some((it) => it && typeof it === 'object' && !it._key)
        const hasLegacy = d.lineItems.some((it) => it && typeof it === 'object' && it._type === 'lineItem')
        if (hasLegacy) {
          // Try to link products via order cart when available
          let orderCart = []
          try {
            const orderId = d.orderRef?. _ref || d.order?. _ref
            if (orderId) {
              const od = await client.fetch(`*[_type == "order" && _id == $id][0]{ cart }`, { id: orderId })
              orderCart = Array.isArray(od?.cart) ? od.cart : []
            }
          } catch {}

          const mapped = await Promise.all(d.lineItems.map(async (li) => {
            if (!li || typeof li !== 'object') return li
            if (li._type !== 'lineItem') return li
            const qty = Number(li.quantity || 1)
            const lineTotal = Number(li.amount_total || li.line_total || 0)
            const unitPrice = qty > 0 && Number.isFinite(lineTotal) ? (lineTotal / qty) : undefined
            const desc = (li.description || li.name || '').toString()
            // Find in order cart by name
            let sku = ''
            let productId = ''
            const match = orderCart.find((c) => (c?.name || '').toString() === desc)
            if (match) {
              sku = (match.sku || '').toString()
            }
            if (sku) {
              try { productId = await client.fetch(`*[_type == "product" && sku == $sku][0]._id`, { sku }) || '' } catch {}
            }
            if (!productId && desc) {
              try { productId = await client.fetch(`*[_type == "product" && title == $t][0]._id`, { t: desc }) || '' } catch {}
            }
            return {
              _type: 'invoiceLineItem',
              _key: li._key,
              description: desc || undefined,
              quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
              unitPrice: typeof unitPrice === 'number' && Number.isFinite(unitPrice) ? unitPrice : undefined,
              lineTotal: Number.isFinite(lineTotal) && lineTotal > 0 ? lineTotal : undefined,
              sku: sku || undefined,
              product: productId ? { _type: 'reference', _ref: productId } : undefined,
            }
          }))
          setOps.lineItems = mapped
          legacyConverted++
        } else if (hasMissingKeys) {
          setOps.lineItems = d.lineItems
        }
      }

      if (Object.keys(setOps).length || unsetOps.length) {
        changed++
        if (!dry) {
          try {
            await client.patch(d._id).set(setOps).unset(unsetOps).commit({ autoGenerateArrayKeys: true })
          } catch (e) {
            console.warn('Patch failed for', d._id, e?.message || e)
          }
        }
        if (setOps.customerRef) migratedCustomer++
        if (setOps.orderRef) migratedOrder++
        if (setOps.lineItems) itemsFixed++
      }

      cursor = d._id
    }
    if (docs.length < limit) break
  }

  console.log(JSON.stringify({ total, changed, migratedCustomer, migratedOrder, itemsFixed, legacyConverted }, null, 2))
}

run().catch((e) => { console.error(e); process.exit(1) })
