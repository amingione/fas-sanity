#!/usr/bin/env tsx
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    'Missing Sanity configuration. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN.',
  )
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

type OrderDoc = {
  _id: string
  orderId?: string | null
  orderNumber?: string | null
}

async function removeOrderIdField(batchSize = 20) {
  let processed = 0

  while (true) {
    const orders: OrderDoc[] = await client.fetch(
      `*[_type == "order" && defined(orderId)][0...$limit]{_id, orderId, orderNumber}`,
      {limit: batchSize},
    )

    if (!orders.length) break

    for (const order of orders) {
      if (!order?._id) continue

      if (!order.orderNumber) {
        console.warn(`Skipping ${order._id} because orderNumber is missing.`)
        continue
      }

      try {
        await client.patch(order._id).unset(['orderId']).commit({autoGenerateArrayKeys: true})
        processed += 1
        console.log(`Removed orderId from ${order._id}`)
      } catch (err) {
        console.error('Failed to remove orderId', {orderId: order._id, error: err})
      }
    }
  }

  console.log(`Removal complete. Updated ${processed} order${processed === 1 ? '' : 's'}.`)
}

removeOrderIdField().catch((err) => {
  console.error('Order orderId cleanup failed', err)
  process.exit(1)
})
