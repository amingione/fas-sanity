import {createClient} from '@sanity/client'

const {SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN} = process.env

if (!SANITY_PROJECT_ID || !SANITY_DATASET || !SANITY_API_TOKEN) {
  throw new Error(
    'Missing SANITY_PROJECT_ID, SANITY_DATASET, or SANITY_API_TOKEN. Load .env before running.',
  )
}

const client = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  token: SANITY_API_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

async function fixDraftReferences() {
  console.log('🔍 Finding all documents with draft references...\n')

  // Fix product references in orders
  const productOrderIds = [
    '39tr2dGATJPXMGnTVof7VT',
    '39tr2dGATJPXMGnTVohrHP',
    '7YAPOpJafhVNDYflcGNW6b',
  ]

  const productRef = 'product-3b1b40ae-3815-4344-99bb-fe7d9171524d'

  for (const orderId of productOrderIds) {
    console.log(`Fixing product refs in order ${orderId}...`)

    const order = await client.getDocument(orderId)

    if (order.cart && order.cart[0]) {
      const updatedCart = [...order.cart]
      updatedCart[0] = {
        ...updatedCart[0],
        productRef: {
          _type: 'reference',
          _ref: productRef,
        },
      }

      if (updatedCart[0].metadataEntries && updatedCart[0].metadataEntries[3]) {
        updatedCart[0].metadataEntries[3] = {
          ...updatedCart[0].metadataEntries[3],
          value: productRef,
        }
      }

      await client.patch(orderId).set({cart: updatedCart}).commit()

      console.log(`  ✓ Fixed product refs`)
    }
  }

  // Fix customer reference in order
  console.log('\nFixing customer ref in order RE3r5aYxzVFyL8S0l2X4AA...')

  const customerOrder = await client.getDocument('RE3r5aYxzVFyL8S0l2X4AA')

  await client
    .patch('RE3r5aYxzVFyL8S0l2X4AA')
    .set({
      customerRef: {
        _type: 'reference',
        _ref: 'uvA80wcSKMQCqyPGDKu6WL',
      },
    })
    .commit()

  console.log('  ✓ Fixed customer ref')

  console.log('\n✅ All draft references fixed!')
  console.log('You can now publish:')
  console.log('  - F.A.S. Predator Lower Pulley product')
  console.log('  - Christopher Quintana customer')
}

fixDraftReferences().catch((err) => {
  console.error('❌ Error:', err.message)
  console.error(err)
  process.exit(1)
})
