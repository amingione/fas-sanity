#!/usr/bin/env node
/**
 * Syncs shipping metadata from Sanity products into Stripe product metadata so shipping quotes stay accurate.
 *
 * Usage:
 *   SANITY_API_TOKEN=xxx SANITY_STUDIO_PROJECT_ID=xxx SANITY_STUDIO_DATASET=production STRIPE_SECRET_KEY=sk_live_xxx node scripts/sync-shipping-to-stripe.js
 */
const {createClient} = require('@sanity/client')
const Stripe = require('stripe')

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN
const stripeSecret = process.env.STRIPE_SECRET_KEY

if (!projectId || !dataset || !token || !stripeSecret) {
  console.error('Missing configuration. Set SANITY_API_TOKEN, SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and STRIPE_SECRET_KEY.')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

const stripe = new Stripe(stripeSecret, {apiVersion: '2023-10-16'})

const sanitizeNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const normalizeMetadata = (product) => {
  const weight = sanitizeNumber(product.shippingWeight)
  const handling = sanitizeNumber(product.handlingTime)
  return {
    shipping_weight: weight !== undefined ? String(weight) : undefined,
    shipping_dimensions: product.boxDimensions || undefined,
    shipping_class: product.shippingClass || undefined,
    handling_time: handling !== undefined ? String(handling) : undefined,
    ships_alone: product.shipsAlone ? 'true' : undefined,
  }
}

const idVariants = (id) => {
  if (!id) return []
  return id.startsWith('drafts.') ? [id, id.replace(/^drafts\./, '')] : [id, `drafts.${id}`]
}

async function patchSanity(docId) {
  const setOps = {stripeLastSyncedAt: new Date().toISOString()}
  for (const targetId of idVariants(docId)) {
    try {
      await client.patch(targetId).set(setOps).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      if (err?.response?.statusCode === 404) continue
      console.warn(`Failed to update ${targetId}`, err.message || err)
    }
  }
}

const cleanMetadata = (current, updates) => {
  const next = {...current}
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  return next
}

async function run() {
  const products = await client.fetch(
    `*[_type == "product" && defined(stripeProductId)]{
      _id,
      title,
      stripeProductId,
      shippingWeight,
      boxDimensions,
      handlingTime,
      shippingClass,
      shipsAlone
    }`,
  )

  let updated = 0
  for (const product of products) {
    if (!product?.stripeProductId) continue
    const metadataUpdates = normalizeMetadata(product)
    try {
      const stripeProduct = await stripe.products.retrieve(product.stripeProductId)
      const mergedMetadata = cleanMetadata(stripeProduct.metadata || {}, metadataUpdates)
      await stripe.products.update(product.stripeProductId, {metadata: mergedMetadata})
      await patchSanity(product._id)
      updated += 1
      console.log(
        `Updated Stripe metadata for ${product.title || product._id}:`,
        metadataUpdates,
      )
    } catch (err) {
      console.error(
        `Failed to update Stripe product ${product.stripeProductId} (${product.title || product._id})`,
        err.message || err,
      )
    }
  }

  console.log(`Stripe shipping metadata sync complete. Updated ${updated} products.`)
}

run().catch((err) => {
  console.error('sync-shipping-to-stripe failed', err)
  process.exit(1)
})
