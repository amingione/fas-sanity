import {getCliClient} from 'sanity/cli'
import {Transaction} from '@sanity/client'

// USAGE:
// pnpm exec sanity exec migrations/fix-shipping-class-case.ts --with-user-token

const SCRIPT_NAME = 'fix-shipping-class-case'
const API_VERSION = '2024-10-01'
const SANITY_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_STUDIO_DATASET

const ALLOWED_SHIPPING_CLASSES = ['standard', 'freight', 'install_only']

const client = getCliClient({apiVersion: API_VERSION})

const fetchProductDocuments = async () => {
  const query = `*[_type == "product" && defined(shippingConfig.shippingClass)]`
  try {
    const docs = await client.fetch(query)
    console.log(`Found ${docs.length} product documents to check.`)
    return docs
  } catch (error) {
    console.error('Error fetching product documents:', error)
    return []
  }
}

const normalizeShippingClass = (value?: string | null): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const normalized = value.toLowerCase().replace(/\s+/g, '_')
  return ALLOWED_SHIPPING_CLASSES.includes(normalized) ? normalized : undefined
}

const run = async () => {
  if (!SANITY_PROJECT_ID || !SANITY_DATASET) {
    console.error(
      'Missing SANITY_STUDIO_PROJECT_ID or SANITY_STUDIO_DATASET from environment variables.',
    )
    process.exit(1)
  }

  console.log(`🚀 Starting ${SCRIPT_NAME} script...`)
  console.log(`Sanity Project ID: ${SANITY_PROJECT_ID}`)
  console.log(`Sanity Dataset: ${SANITY_DATASET}`)

  const products = await fetchProductDocuments()

  if (!products || products.length === 0) {
    console.log('No products found to process.')
    return
  }

  let transaction: Transaction | undefined
  let updatedCount = 0
  let checkedCount = 0

  for (const product of products) {
    checkedCount++
    const currentClass = product.shippingConfig?.shippingClass
    const normalizedClass = normalizeShippingClass(currentClass)

    if (currentClass && normalizedClass && currentClass !== normalizedClass) {
      if (!transaction) {
        transaction = client.transaction()
      }

      console.log(
        `- Scheduling update for product ${product._id}: from "${currentClass}" to "${normalizedClass}"`,
      )
      transaction.patch(product._id, {
        set: {'shippingConfig.shippingClass': normalizedClass},
      })
      updatedCount++

      if (updatedCount % 100 === 0) {
        console.log(`  ...committing batch of 100 updates.`)
        await transaction.commit()
        transaction = undefined
      }
    }
  }

  if (transaction) {
    console.log(`  ...committing final batch of ${updatedCount % 100} updates.`)
    await transaction.commit()
  }

  console.log(`✅ Script finished.`)
  console.log(`Checked ${checkedCount} product documents.`)
  console.log(`Updated ${updatedCount} product documents with incorrect shippingClass case.`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
