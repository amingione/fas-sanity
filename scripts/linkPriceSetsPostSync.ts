#!/usr/bin/env tsx
/**
 * Post-Sync Price Set Linker - SQL Generator
 *
 * This script generates SQL to link price_sets to product variants after running syncProductsToMedusa.
 * It queries Sanity to find all products with medusaVariantId and generates SQL that:
 * 1. Finds the matching price_set by price amount and currency
 * 2. Creates the link in product_variant_price_set table
 *
 * Run this after syncProductsToMedusa to ensure all variants have proper price_set links.
 *
 * Usage:
 *   npx tsx scripts/linkPriceSetsPostSync.ts > /tmp/link-price-sets.sql
 *   docker exec -i medusa-postgres psql -U medusa -d medusa < /tmp/link-price-sets.sql
 */

import dotenv from 'dotenv'
import { createClient } from '@sanity/client'

dotenv.config()

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity configuration')
  process.exit(1)
}

const sanity = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

type SanityProduct = {
  _id: string
  title: string
  medusaVariantId?: string | null
  price?: number | null
}

async function main() {
  // Get all active products with medusaVariantId from Sanity
  const products: SanityProduct[] = await sanity.fetch(
    `*[_type == "product" && status == "active" && defined(medusaVariantId) && defined(price)]{
      _id,
      title,
      medusaVariantId,
      price
    }`,
  )

  if (!products.length) {
    console.error('-- No products with medusaVariantId and price found')
    return
  }

  const currencyCode = (process.env.SANITY_SYNC_CURRENCY || 'usd').toLowerCase()

  console.log('-- Link Price Sets to Product Variants')
  console.log(`-- Generated from Sanity: ${products.length} products`)
  console.log(`-- Currency: ${currencyCode}`)
  console.log('')

  // Generate SQL for each product
  for (const product of products) {
    const variantId = product.medusaVariantId
    const price = product.price

    if (!variantId || !price) {
      continue
    }

    const priceAmount = Math.round(price * 100)
    const linkId = `pvps_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`

    console.log(`-- ${product.title} ($${price})`)
    console.log(`INSERT INTO product_variant_price_set (id, variant_id, price_set_id, created_at, updated_at)`)
    console.log(`SELECT '${linkId}', '${variantId}', ps.id, NOW(), NOW()`)
    console.log(`FROM price_set ps`)
    console.log(`JOIN price p ON ps.id = p.price_set_id`)
    console.log(`WHERE p.amount = ${priceAmount}`)
    console.log(`  AND p.currency_code = '${currencyCode}'`)
    console.log(`  AND NOT EXISTS (`)
    console.log(`    SELECT 1 FROM product_variant_price_set`)
    console.log(`    WHERE variant_id = '${variantId}'`)
    console.log(`  )`)
    console.log(`ORDER BY ps.created_at DESC`)
    console.log(`LIMIT 1;`)
    console.log('')
  }

  console.log('-- Verify all links were created:')
  console.log('SELECT COUNT(*) as total_links FROM product_variant_price_set;')
}

main().catch((err) => {
  console.error('-- Link price sets failed:', err)
  process.exit(1)
})
