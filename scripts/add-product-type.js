#!/usr/bin/env node
/**
 * Adds the new productType classification (physical/service/bundle) and migrates the legacy
 * simple/variable productType values into the variantStrategy field.
 *
 * Usage:
 *   SANITY_API_TOKEN=xxx SANITY_STUDIO_PROJECT_ID=xxx SANITY_STUDIO_DATASET=production node scripts/add-product-type.js
 */
const {createClient} = require('@sanity/client')

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity configuration. Set SANITY_API_TOKEN, SANITY_STUDIO_PROJECT_ID, and SANITY_STUDIO_DATASET.')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

const idVariants = (id) => {
  if (!id) return []
  return id.startsWith('drafts.') ? [id, id.replace(/^drafts\./, '')] : [id, `drafts.${id}`]
}

const determineProductType = (doc) => {
  if (doc.installOnly) return 'service'
  const title = (doc.title || '').toString()
  if (/package|kit/i.test(title)) return 'bundle'
  return 'physical'
}

const determineVariantStrategy = (doc) => {
  if (doc.variantStrategy) return doc.variantStrategy
  const legacy = (doc.productType || '').toString()
  if (legacy === 'variable') return 'variable'
  if (legacy === 'simple') return 'simple'
  return 'simple'
}

async function patchProduct(docId, setOps) {
  for (const targetId of idVariants(docId)) {
    try {
      await client.patch(targetId).set(setOps).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      if (err?.response?.statusCode === 404) continue
      console.warn(`Failed to patch ${targetId}`, err.message || err)
    }
  }
}

async function run() {
  const products = await client.fetch(
    `*[_type == "product"]{_id, title, installOnly, productType, variantStrategy}`,
  )
  let updated = 0
  for (const product of products) {
    const nextType = determineProductType(product)
    const nextVariant = determineVariantStrategy(product)
    const setOps = {
      productType: nextType,
      variantStrategy: nextVariant,
    }
    if (nextType === 'service') {
      setOps.installOnly = true
    } else if (product.installOnly) {
      setOps.installOnly = false
    }
    await patchProduct(product._id, setOps)
    updated += 1
    console.log(
      `Updated ${product._id}: productType=${nextType}, variantStrategy=${nextVariant}${
        setOps.installOnly !== undefined ? `, installOnly=${setOps.installOnly}` : ''
      }`,
    )
  }
  console.log(`Migration complete. Updated ${updated} products.`)
}

run().catch((err) => {
  console.error('add-product-type migration failed', err)
  process.exit(1)
})
