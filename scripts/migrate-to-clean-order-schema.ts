import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'YOUR_PROJECT_ID',
  dataset: 'production',
  token: 'YOUR_WRITE_TOKEN',
  apiVersion: '2024-01-01',
  useCdn: false,
})

async function migrateToCleanSchema() {
  console.log('🚀 Migrating orders to clean schema...')

  const orders = await client.fetch(`
    *[_type == "order"] {
      _id,
      shippingAddress,
      carrier,
      service,
      trackingNumber,
      shippedAt,
      deliveredAt,
      estimatedDeliveryDate,
      fulfillment,
      packageDimensions,
      packingSlipUrl,
      shippingLabelUrl,
      shippingLabelFile,
      invoiceRef
    }
  `)

  console.log(`📊 Found ${orders.length} orders to migrate`)

  for (const order of orders) {
    const patches: any = {}

    // Build shipping address text
    if (order.shippingAddress) {
      const addr = order.shippingAddress
      const addressText = [
        addr.name,
        addr.addressLine1,
        addr.addressLine2,
        `${addr.city}, ${addr.state} ${addr.postalCode}`,
        addr.country,
        addr.phone,
        addr.email,
      ]
        .filter(Boolean)
        .join('\n')

      patches['fulfillmentDetails.shippingAddress'] = addressText
    }

    // Build tracking details text
    if (order.trackingNumber) {
      const trackingText = [
        `Service: ${order.service || 'N/A'}`,
        `Tracking: ${order.trackingNumber}`,
        order.shippedAt ? `Shipped: ${new Date(order.shippedAt).toLocaleDateString()}` : null,
        order.deliveredAt
          ? `Delivered: ${new Date(order.deliveredAt).toLocaleDateString()}`
          : null,
        order.estimatedDeliveryDate
          ? `Est. Delivery: ${new Date(order.estimatedDeliveryDate).toLocaleDateString()}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')

      patches['fulfillmentDetails.trackingDetails'] = trackingText
      patches['fulfillmentDetails.trackingNumber'] = order.trackingNumber
    }

    // Migrate fulfillment status
    if (order.fulfillment?.status) {
      patches['fulfillmentDetails.status'] = order.fulfillment.status
    }

    if (order.fulfillment?.fulfillmentNotes) {
      patches['fulfillmentDetails.fulfillmentNotes'] = order.fulfillment.fulfillmentNotes
    }

    // Migrate package dimensions
    if (order.packageDimensions) {
      const dims = order.packageDimensions
      if (dims.weight) {
        patches['fulfillmentDetails.packageWeight'] = dims.weight
      }
      if (dims.length && dims.width && dims.height) {
        patches['fulfillmentDetails.packageDimensions'] = `${dims.length} × ${dims.width} × ${dims.height}`
      }
    }

    // Migrate documents to orderDocuments array
    const documents = []

    if (order.packingSlipUrl) {
      documents.push({
        _type: 'orderDocument',
        _key: generateKey(),
        documentType: 'packing_slip',
        url: order.packingSlipUrl,
        createdAt: new Date().toISOString(),
      })
    }

    if (order.shippingLabelUrl) {
      documents.push({
        _type: 'orderDocument',
        _key: generateKey(),
        documentType: 'shipping_label',
        url: order.shippingLabelUrl,
        createdAt: new Date().toISOString(),
      })
    }

    if (order.shippingLabelFile) {
      documents.push({
        _type: 'orderDocument',
        _key: generateKey(),
        documentType: 'shipping_label',
        file: order.shippingLabelFile,
        createdAt: new Date().toISOString(),
      })
    }

    if (documents.length > 0) {
      patches.orderDocuments = documents
    }

    // Apply patches if any
    if (Object.keys(patches).length > 0) {
      try {
        await client.patch(order._id).set(patches).commit()

        console.log(`✅ Migrated order ${order._id}`)
      } catch (error) {
        console.error(`❌ Error migrating ${order._id}:`, error)
      }
    }
  }

  console.log('🎉 Migration complete!')
}

function generateKey(): string {
  return Math.random().toString(36).substring(2, 15)
}

migrateToCleanSchema().catch(console.error)
