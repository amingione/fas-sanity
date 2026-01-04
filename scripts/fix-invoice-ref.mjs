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

async function fixInvoicePublish() {
  console.log('🔧 Fixing invoice publish issue...\n')

  const orderId = 'RE3r5aYxzVFyL8S0l2X4AA'
  const draftInvoiceId = 'drafts.RE3r5aYxzVFyL8S0l2X4q7'
  const publishedInvoiceId = 'RE3r5aYxzVFyL8S0l2X4q7'

  try {
    // Step 1: Temporarily remove the invoice reference from the order.
    console.log('Step 1: Removing invoice reference from order...')
    await client.patch(orderId).unset(['invoiceRef']).commit()
    console.log('  ✓ Reference removed')

    // Step 2: Publish the invoice from the draft.
    console.log('\nStep 2: Publishing invoice...')
    const draftInvoice = await client.getDocument(draftInvoiceId)
    if (!draftInvoice) {
      throw new Error(`Draft invoice not found: ${draftInvoiceId}`)
    }

    await client.createOrReplace({
      ...draftInvoice,
      _id: publishedInvoiceId,
    })
    console.log('  ✓ Invoice published')

    // Step 3: Delete the draft.
    console.log('\nStep 3: Deleting draft invoice...')
    await client.delete(draftInvoiceId)
    console.log('  ✓ Draft deleted')

    // Step 4: Restore the reference to the published invoice.
    console.log('\nStep 4: Restoring invoice reference to order...')
    await client
      .patch(orderId)
      .set({
        invoiceRef: {
          _type: 'reference',
          _ref: publishedInvoiceId,
          _weak: true,
        },
      })
      .commit()
    console.log('  ✓ Reference restored')

    console.log('\n✅ Invoice successfully published and linked!')
  } catch (err) {
    console.error('\n❌ Error:', err.message)
    console.error(err)
    process.exit(1)
  }
}

fixInvoicePublish()
