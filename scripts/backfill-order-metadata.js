import { createClient } from '@sanity/client'

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_WRITE_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

async function run() {
  const orders = await client.fetch(
    `
    *[_type == "order" && (
      !defined(orderType) ||
      !defined(customerName) || customerName == "" ||
      !defined(attribution)
    )][0...50]{
      _id, orderNumber, orderType, customerName, customerEmail, customerRef, attribution, createdAt
    }
  `,
  )

  console.log(`Found ${orders.length} orders needing metadata`)

  for (const order of orders) {
    const updates = {}

    if (!order.orderType) updates.orderType = 'online'

    if (!order.customerName || order.customerName === '') {
      if (order.customerRef) {
        const customer = await client.fetch(`*[_id == $id][0]{name}`, { id: order.customerRef._ref })
        updates.customerName = customer?.name || order.customerEmail?.split('@')[0] || 'Customer'
      } else {
        updates.customerName = order.customerEmail?.split('@')[0] || 'Customer'
      }
    }

    if (!order.attribution) {
      updates.attribution = {
        source: 'direct',
        medium: 'website',
        capturedAt: order.createdAt,
        device: 'unknown',
        touchpoints: 1,
      }
    }

    if (Object.keys(updates).length > 0) {
      await client.patch(order._id).set(updates).commit()
      console.log(`✅ ${order.orderNumber}`)
    }
  }
}

run()
