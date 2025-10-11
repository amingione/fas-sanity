#!/usr/bin/env node
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@sanity/client')

for (const file of ['.env.local', '.env.development', '.env']) {
  const full = path.resolve(process.cwd(), file)
  try {
    dotenv.config({ path: full, override: false })
  } catch {}
}

const client = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID,
  dataset: process.env.SANITY_STUDIO_DATASET,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

async function run() {
  const docs = await client.fetch(
    `*[
      _type == "order" &&
      (
        defined(selectedShippingAmount) ||
        defined(selectedShippingCurrency) ||
        defined(shippingServiceCode) ||
        defined(shippingServiceName) ||
        defined(shippingDeliveryDays) ||
        defined(shippingEstimatedDeliveryDate) ||
        defined(shippingMetadata)
      )
    ]{
      _id,
      selectedShippingAmount,
      selectedShippingCurrency,
      shippingServiceCode,
      shippingServiceName,
      shippingDeliveryDays,
      shippingEstimatedDeliveryDate,
      shippingMetadata
    }`
  )

  console.log(`Found ${docs.length} orders to migrate`)

  for (const doc of docs) {
    const meta = doc.shippingMetadata || {}

    const amount =
      typeof doc.selectedShippingAmount === 'number'
        ? doc.selectedShippingAmount
        : meta.shipping_amount
        ? Number(meta.shipping_amount)
        : undefined

    const currency =
      doc.selectedShippingCurrency ||
      meta.shipping_currency ||
      (typeof amount === 'number' ? 'USD' : undefined)

    const serviceCode = doc.shippingServiceCode || meta.shipping_service_code
    const serviceName = doc.shippingServiceName || meta.shipping_service_name
    const carrierId = meta.shipping_carrier_id || undefined
    const carrier = meta.shipping_carrier || undefined
    const deliveryDays =
      typeof doc.shippingDeliveryDays === 'number'
        ? doc.shippingDeliveryDays
        : meta.shipping_delivery_days
        ? Number(meta.shipping_delivery_days)
        : undefined
    const estimatedDate =
      doc.shippingEstimatedDeliveryDate || meta.shipping_estimated_delivery_date || undefined

    const setOps = {}
    if (
      amount !== undefined ||
      currency ||
      serviceCode ||
      serviceName ||
      carrier ||
      carrierId ||
      deliveryDays !== undefined ||
      estimatedDate
    ) {
      setOps.selectedService = {
        carrierId,
        carrier,
        service: serviceName || serviceCode || undefined,
        serviceCode: serviceCode || undefined,
        amount: amount !== undefined ? amount : undefined,
        currency: currency || undefined,
        deliveryDays: deliveryDays !== undefined ? deliveryDays : undefined,
        estimatedDeliveryDate: estimatedDate || undefined,
      }
    }

    await client
      .patch(doc._id)
      .set(setOps)
      .unset([
        'selectedShippingAmount',
        'selectedShippingCurrency',
        'shippingServiceCode',
        'shippingServiceName',
        'shippingDeliveryDays',
        'shippingEstimatedDeliveryDate',
        'shippingMetadata',
      ])
      .commit({ autoGenerateArrayKeys: true })
  }

  console.log('Migration complete')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})

