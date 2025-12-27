#!/usr/bin/env node
const dotenv = require('dotenv')
dotenv.config()


const {createSanityClient} = require('./shared')

const BATCH_SIZE = Number(process.env.DUPLICATE_BATCH || 200)

function dedupeOrders(orders) {
  if (!Array.isArray(orders)) return {orders: [], removed: 0}
  const seen = new Set()
  const result = []
  for (const entry of orders) {
    const orderNumber = (entry?.orderNumber || '').toString().trim().toUpperCase()
    const createdAt = entry?.createdAt || ''
    const key = orderNumber || `${orderNumber}|${createdAt}`
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    result.push(entry)
  }
  return {orders: result, removed: orders.length - result.length}
}

async function run() {
  const sanity = createSanityClient()
  let offset = 0
  let updated = 0
  let inspected = 0

  while (true) {
    const query = `*[_type == "customer" && count(orders) > 0]|order(_updatedAt desc)[${offset}...${
      offset + BATCH_SIZE
    }]{_id, orders}`
    const customers = await sanity.fetch(query)
    if (!customers.length) break
    for (const customer of customers) {
      inspected += 1
      const {orders, removed} = dedupeOrders(customer.orders || [])
      if (removed > 0) {
        await sanity
          .patch(customer._id)
          .set({orders})
          .commit({autoGenerateArrayKeys: true})
        updated += 1
        console.log(
          `Customer ${customer._id} cleaned (${removed} duplicate order${
            removed === 1 ? '' : 's'
          } removed).`,
        )
      }
    }
    if (customers.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  console.log(`Duplicate cleanup completed. Processed ${inspected} customers, updated ${updated}.`)
}

run().catch((err) => {
  console.error('fix-duplicate-orders failed:', err)
  process.exit(1)
})
