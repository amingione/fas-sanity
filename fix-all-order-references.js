import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'r4og35qd',
  dataset: 'production',
  token: process.env.SANITY_WRITE_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const DRAFT_ID = 'drafts.product-3b1b40ae-3815-4344-99bb-fe7d9171524d'
const PUBLISHED_ID = 'product-3b1b40ae-3815-4344-99bb-fe7d9171524d'

async function fixAllOrderReferences() {
  console.log('Finding all orders that reference the draft product...')

  const orders = await client.fetch(
    `*[_type == "order" && references($draftId)]{_id, orderNumber}`,
    {draftId: DRAFT_ID},
  )

  console.log(`Found ${orders.length} orders to fix:`)
  orders.forEach((o) => console.log(`  - ${o.orderNumber} (${o._id})`))

  let fixed = 0
  let errors = 0

  for (const orderRef of orders) {
    try {
      console.log(`\nFixing ${orderRef.orderNumber}...`)
      const order = await client.getDocument(orderRef._id)

      // Fix cart items
      if (order.cart) {
        order.cart.forEach((item, idx) => {
          if (item.productRef?._ref === DRAFT_ID) {
            console.log(`  ✓ Fixed cart[${idx}].productRef`)
            item.productRef._ref = PUBLISHED_ID
          }
        })
      }

      // Fix orderV2 items
      if (order.orderV2?.items) {
        order.orderV2.items.forEach((item, idx) => {
          if (item.productId === DRAFT_ID) {
            console.log(`  ✓ Fixed orderV2.items[${idx}].productId`)
            item.productId = PUBLISHED_ID
          }
        })
      }

      await client.createOrReplace(order)
      console.log(`  ✅ Updated ${orderRef.orderNumber}`)
      fixed++
    } catch (err) {
      console.error(`  ❌ Error fixing ${orderRef.orderNumber}:`, err.message)
      errors++
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`✅ Fixed: ${fixed}`)
  console.log(`❌ Errors: ${errors}`)
  console.log(`\nYou can now publish your product!`)
}

fixAllOrderReferences().catch((err) => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
