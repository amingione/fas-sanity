#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const fullPath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(fullPath)) {
    dotenv.config({path: fullPath, override: false})
  }
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing SANITY env vars')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  token,
  useCdn: false,
})

const dryRun = process.argv.includes('--dry-run')

type ProductDoc = {
  _id: string
  title?: string
  description?: string
  price?: number
  images?: Array<{_key?: string; asset?: {_ref: string}}>
}

type CustomerDoc = {_id: string; customerType?: string}
type OrderDoc = {_id: string; orderType?: string}
type VendorDoc = {
  _id: string
  pricingTier?: string
  customDiscountPercentage?: number
  paymentTerms?: string
  taxExempt?: boolean
  shippingAddress?: Record<string, unknown>
  minimumOrderAmount?: number
  status?: string
}

const asReference = (id?: string | null) =>
  id
    ? {
        _type: 'reference' as const,
        _ref: id,
      }
    : undefined

async function migrateInstallOnlyProducts() {
  const products = await client.fetch<ProductDoc[]>(
    `*[_type == "product" && installOnly == true][0...10]{_id, title, description, price, images[]{asset}}`,
  )
  let created = 0
  for (const product of products) {
    const exists = await client.fetch<string | null>(
      `*[_type == "service" && sourceProductId == $id][0]._id`,
      {id: product._id},
    )
    if (exists) continue
    const doc = {
      _type: 'service',
      title: product.title || 'Service',
      description:
        product.description ||
        `Service package automatically migrated from product ${product._id}`,
      basePrice: product.price ?? 0,
      serviceType: 'installation',
      sourceProductId: product._id,
      requiredParts: product._id ? [{_key: randomUUID(), ...asReference(product._id)}] : [],
      images:
        product.images?.map((img) => ({
          ...img,
          _type: (img as any)?._type || 'image',
          _key: img._key || randomUUID(),
        })) ?? [],
    }
    created += 1
    if (!dryRun) {
      await client.create(doc, {autoGenerateArrayKeys: true})
    }
  }
  return {migratedProducts: products.length, servicesCreated: created}
}

async function defaultCustomerTypes() {
  const customers = await client.fetch<CustomerDoc[]>(
    `*[_type == "customer" && !defined(customerType)][0...200]{
      _id,
      customerType
    }`,
  )
  let patched = 0
  for (const customer of customers) {
    patched += 1
    if (!dryRun) {
      await client.patch(customer._id).set({customerType: 'retail'}).commit()
    }
  }
  return {customersChecked: customers.length, customersUpdated: patched}
}

async function defaultOrderTypes() {
  const orders = await client.fetch<OrderDoc[]>(
    `*[_type == "order" && (!defined(orderType) || orderType == "retail")][0...200]{_id}`,
  )
  let patched = 0
  for (const order of orders) {
    patched += 1
    if (!dryRun) {
      await client.patch(order._id).set({orderType: 'online'}).commit()
    }
  }
  return {ordersChecked: orders.length, ordersUpdated: patched}
}

async function seedWholesaleFields() {
  const products = await client.fetch<ProductDoc[]>(
    `*[_type == "product" && !defined(availableForWholesale)][0...500]{_id}`,
  )
  let patched = 0
  for (const product of products) {
    patched += 1
    if (!dryRun) {
      await client.patch(product._id).set({availableForWholesale: false}).commit()
    }
  }
  return {productsChecked: products.length, wholesaleDefaults: patched}
}

async function enhanceVendors() {
  const vendors = await client.fetch<VendorDoc[]>(
    `*[_type == "vendor"][0...200]{
      _id,
      pricingTier,
      customDiscountPercentage,
      paymentTerms,
      taxExempt,
      shippingAddress,
      minimumOrderAmount,
      status
    }`,
  )
  let patched = 0
  for (const vendor of vendors) {
    const setOps: Record<string, any> = {}
    if (!vendor.pricingTier) setOps.pricingTier = 'standard'
    if (typeof vendor.customDiscountPercentage !== 'number') setOps.customDiscountPercentage = 20
    if (!vendor.paymentTerms) setOps.paymentTerms = 'Net 30'
    if (typeof vendor.taxExempt !== 'boolean') setOps.taxExempt = false
    if (!vendor.shippingAddress) {
      setOps.shippingAddress = {street: '', city: '', state: '', postalCode: '', country: ''}
    }
    if (typeof vendor.minimumOrderAmount !== 'number') setOps.minimumOrderAmount = 0
    if (!vendor.status) setOps.status = 'active'
    if (Object.keys(setOps).length === 0) continue
    patched += 1
    if (!dryRun) {
      await client.patch(vendor._id).set(setOps).commit({autoGenerateArrayKeys: true})
    }
  }
  return {vendorsChecked: vendors.length, vendorsUpdated: patched}
}

async function run() {
  const summary = {
    dryRun,
    ...(await migrateInstallOnlyProducts()),
    ...(await defaultCustomerTypes()),
    ...(await defaultOrderTypes()),
    ...(await seedWholesaleFields()),
    ...(await enhanceVendors()),
  }
  console.log(JSON.stringify(summary, null, 2))
}

run().catch((error) => {
  console.error('migrate-service-workflows failed', error)
  process.exit(1)
})
