import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'r4og35qd',
  dataset: 'production',
  token: process.env.SANITY_WRITE_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

async function fixOrderReference() {
  console.log('Fetching order...')
  const order = await client.getDocument('7YAPOpJafhVNDYflcGNW6b')

  console.log('Current productRef:', order.cart[0].productRef._ref)

  // Update the cart item reference from draft to published
  order.cart[0].productRef._ref = 'product-3b1b40ae-3815-4344-99bb-fe7d9171524d'

  // Also update orderV2 if it exists
  if (order.orderV2?.items?.[0]) {
    order.orderV2.items[0].productId = 'product-3b1b40ae-3815-4344-99bb-fe7d9171524d'
  }

  console.log('Updating order...')
  await client.createOrReplace(order)

  console.log('✓ Fixed order reference - now points to published product')
  console.log('You can now publish your product!')
}

fixOrderReference().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
