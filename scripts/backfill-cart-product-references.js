import { createClient } from '@sanity/client'

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_WRITE_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

async function run() {
  const orders = await client.fetch(
    `
    *[_type == "order" && defined(cart)][0...50]{
      _id, orderNumber,
      cart[]{ _key, name, sku, productRef, optionDetails, upgrades }
    }
  `,
  )

  console.log(`Processing ${orders.length} orders`)

  for (const order of orders) {
    let updated = false
    const updatedCart = []

    for (const item of order.cart) {
      const updates = { ...item }

      // Find product if missing
      if (!item.productRef && item.name) {
        const searchName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        const product = await client.fetch(
          `*[_type == "product" && lower(title) match "*${searchName}*"][0]{_id, sku}`,
        )

        if (product) {
          updates.productRef = { _type: 'reference', _ref: product._id }
          if (!item.sku) updates.sku = product.sku || ''
          updated = true
        }
      }

      // Fix null arrays
      if (item.optionDetails === null || item.optionDetails === undefined) {
        updates.optionDetails = []
        updated = true
      }
      if (item.upgrades === null || item.upgrades === undefined) {
        updates.upgrades = []
        updated = true
      }

      updatedCart.push(updates)
    }

    if (updated) {
      await client.patch(order._id).set({ cart: updatedCart }).commit()
      console.log(`✅ ${order.orderNumber}`)
    }
  }
}

run()
