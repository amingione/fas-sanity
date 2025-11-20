#!/usr/bin/env tsx
import {config as loadEnv} from 'dotenv'
import {createClient} from '@sanity/client'
import {INVENTORY_DOCUMENT_TYPE} from '../shared/docTypes'

loadEnv()

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity credentials. Ensure SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN are set.')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

type ProductDoc = {_id: string; title?: string; price?: number}

async function inventoryExists(productId: string): Promise<boolean> {
  const count = await client.fetch<number>(
    `count(*[_type == "${INVENTORY_DOCUMENT_TYPE}" && product._ref == $productId])`,
    {productId},
  )
  return Number(count) > 0
}

async function main() {
  const products = await client.fetch<ProductDoc[]>(
    `*[_type == "product" && !(_id in path("drafts.**"))]{_id, title, price}`,
  )
  let created = 0

  for (const product of products) {
    if (!product?._id) continue
    const exists = await inventoryExists(product._id)
    if (exists) continue

    const unitCost = Number(product.price ?? 0) * 0.5
    const doc = {
      _type: INVENTORY_DOCUMENT_TYPE,
      product: {_type: 'reference', _ref: product._id},
      quantityOnHand: 0,
      quantityReserved: 0,
      quantityAvailable: 0,
      quantityInProduction: 0,
      reorderPoint: 5,
      reorderQuantity: 10,
      leadTimeDays: 0,
      unitCost,
      totalValue: 0,
      source: 'manufactured',
      lowStockAlert: true,
      outOfStock: true,
      overstocked: false,
      notes: 'Initialized via inventory migration',
    }
    await client.create(doc, {autoGenerateArrayKeys: true})
    created += 1
    console.log(`Initialized inventory for ${product.title || product._id}`)
  }

  console.log(`Completed inventory initialization. Created ${created} records.`)
}

main().catch((error) => {
  console.error('initialize-inventory failed', error)
  process.exit(1)
})
