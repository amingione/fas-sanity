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
  console.log('🔧 Step 1: Fixing draft references in orders...\n')

  // Fix product references
  const productOrderIds = [
    '39tr2dGATJPXMGnTVof7VT',
    '39tr2dGATJPXMGnTVohrHP',
    '7YAPOpJafhVNDYflcGNW6b',
  ]

  const productRef = 'product-3b1b40ae-3815-4344-99bb-fe7d9171524d'

  for (const orderId of productOrderIds) {
    try {
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

        console.log(`  ✓ Fixed product refs in ${orderId}`)
      }
    } catch (err) {
      console.error(`  ✗ Failed to fix ${orderId}:`, err.message)
    }
  }

  // Fix customer reference
  console.log('\n  Fixing customer reference in order RE3r5aYxzVFyL8S0l2X4AA...')

  try {
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
  } catch (err) {
    console.error('  ✗ Failed to fix customer ref:', err.message)
  }
}

async function migrateInvoicesToCustomers() {
  console.log('\n📊 Step 2: Migrating invoices to customer profiles...\n')

  // Get all invoices with customer references
  const invoices = await client.fetch(`
    *[_type == "invoice" && defined(customerRef)] {
      _id,
      invoiceNumber,
      status,
      _createdAt,
      total,
      customerRef
    }
  `)

  console.log(`  Found ${invoices.length} invoices to migrate`)

  // Group invoices by customer
  const invoicesByCustomer = {}

  for (const invoice of invoices) {
    const customerId = invoice.customerRef._ref
    if (!invoicesByCustomer[customerId]) {
      invoicesByCustomer[customerId] = []
    }

    invoicesByCustomer[customerId].push({
      _key: invoice._id,
      _type: 'customerInvoiceSummary',
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      createdAt: invoice._createdAt,
      total: invoice.total,
    })
  }

  console.log(`  Grouped into ${Object.keys(invoicesByCustomer).length} customers\n`)

  // Update each customer with their invoices
  let successCount = 0
  let failCount = 0

  for (const [customerId, invoiceSummaries] of Object.entries(invoicesByCustomer)) {
    try {
      const customer = await client.getDocument(customerId)

      await client.patch(customerId).set({invoices: invoiceSummaries}).commit()

      console.log(
        `  ✓ Updated ${customer.name || customerId} with ${invoiceSummaries.length} invoices`,
      )
      successCount++
    } catch (err) {
      console.error(`  ✗ Failed to update ${customerId}:`, err.message)
      failCount++
    }
  }

  console.log(`\n  Summary: ${successCount} customers updated, ${failCount} failed`)
}

async function publishDocuments() {
  console.log('\n📤 Step 3: Publishing documents...\n')

  const docsToPublish = [
    {
      id: 'product-3b1b40ae-3815-4344-99bb-fe7d9171524d',
      type: 'product',
      name: 'F.A.S. Predator Lower Pulley',
    },
    {id: 'uvA80wcSKMQCqyPGDKu6WL', type: 'customer', name: 'Christopher Quintana'},
  ]

  for (const doc of docsToPublish) {
    try {
      const draftId = `drafts.${doc.id}`
      const draft = await client.getDocument(draftId)

      if (draft) {
        // Create or replace the published version
        await client.createOrReplace({
          ...draft,
          _id: doc.id,
        })

        // Delete the draft
        await client.delete(draftId)

        console.log(`  ✓ Published ${doc.name}`)
      } else {
        console.log(`  ⚠ No draft found for ${doc.name}`)
      }
    } catch (err) {
      console.error(`  ✗ Failed to publish ${doc.name}:`, err.message)
    }
  }
}

async function main() {
  console.log('🚀 Starting migration and fix process...\n')
  console.log('='.repeat(60))

  try {
    await fixDraftReferences()
    await migrateInvoicesToCustomers()
    await publishDocuments()

    console.log('\n' + '='.repeat(60))
    console.log('✅ Migration complete!')
    console.log('\nNext steps:')
    console.log('1. Add an "invoices" field to your customer schema')
    console.log('2. The field should be: array of customerInvoiceSummary objects')
    console.log('3. Refresh your Studio to see invoices in customer activity tabs')
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message)
    console.error(err)
    process.exit(1)
  }
}

main()
