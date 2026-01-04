import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

dotenv.config()

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  token: process.env.SANITY_API_TOKEN!,
  apiVersion: process.env.SANITY_STUDIO_API_VERSION || '2024-04-10',
  useCdn: false,
})

type ShipmentRecord = {
  _id: string
  trackingCode?: string
  brokenRef?: string
}

const looksLikeStripePaymentIntentId = (value?: string | null) =>
  typeof value === 'string' && /^pi_[a-z0-9]+$/i.test(value.trim())

type OrderRecord = {_id: string; orderNumber?: string}

async function findOrderByPaymentIntent(paymentIntent: string) {
  return sanity.fetch<OrderRecord | null>(
    `*[_type == "order" && (paymentIntentId == $piId || stripePaymentIntentId == $piId)][0]{_id, orderNumber}`,
    {piId: paymentIntent},
  )
}

async function fixBrokenShipmentReferences() {
  const shipments = await sanity.fetch<ShipmentRecord[]>(
    `*[_type == "shipment" && defined(order) && !defined(order->_id)]{
      _id,
      trackingCode,
      "brokenRef": order._ref
    }`,
  )

  console.log(`Found ${shipments.length} shipment(s) with broken order references.`)

  for (const shipment of shipments) {
    const paymentIntentId = looksLikeStripePaymentIntentId(shipment.brokenRef || '')
      ? shipment.brokenRef!.trim()
      : null

    try {
      if (paymentIntentId) {
        const order = await findOrderByPaymentIntent(paymentIntentId)
        if (order?._id) {
          await sanity
            .patch(shipment._id)
            .set({
              order: {_type: 'reference', _ref: order._id},
              stripePaymentIntentId: paymentIntentId,
            })
            .commit({autoGenerateArrayKeys: true})
          console.log(`✅ Linked ${shipment._id} to ${order.orderNumber || order._id}`)
          continue
        }
      }

      await sanity
        .patch(shipment._id)
        .unset(['order'])
        .set(
          paymentIntentId
            ? {stripePaymentIntentId: paymentIntentId}
            : {},
        )
        .commit({autoGenerateArrayKeys: true})
      console.log(
        `⚠️  Removed broken order ref from ${shipment._id}${
          paymentIntentId ? ' (stored payment intent for manual follow-up)' : ''
        }`,
      )
    } catch (err) {
      console.error(`❌ Failed to repair shipment ${shipment._id}:`, err)
    }
  }

  console.log('Cleanup complete.')
}

fixBrokenShipmentReferences().catch((err) => {
  console.error('Fatal error while fixing shipment references:', err)
  process.exit(1)
})
