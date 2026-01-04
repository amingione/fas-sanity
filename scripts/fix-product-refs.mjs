import {createClient} from '@sanity/client'

const {SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN} = process.env

if (!SANITY_STUDIO_PROJECT_ID || !SANITY_STUDIO_DATASET || !SANITY_API_TOKEN) {
  throw new Error(
    'Missing SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, or SANITY_API_TOKEN. Load .env before running.',
  )
}

const client = createClient({
  projectId: SANITY_STUDIO_PROJECT_ID,
  dataset: SANITY_STUDIO_DATASET,
  token: SANITY_API_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const orderIds = ['39tr2dGATJPXMGnTVof7VT', '39tr2dGATJPXMGnTVohrHP', '7YAPOpJafhVNDYflcGNW6b']

const oldRef = 'drafts.product-3b1b40ae-3815-4344-99bb-fe7d9171524d'
const newRef = 'product-3b1b40ae-3815-4344-99bb-fe7d9171524d'

async function fixOrders() {
  for (const orderId of orderIds) {
    console.log(`Fixing order ${orderId}...`)

    await client
      .patch(orderId)
      .set({
        'cart[0].productRef._ref': newRef,
        'cart[0].metadataEntries[3].value': newRef,
      })
      .commit()

    console.log(`✓ Fixed ${orderId}`)
  }

  console.log('\n✓ All orders fixed! You can now publish your product.')
}

fixOrders().catch(console.error)
