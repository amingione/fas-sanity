import { createClient } from '@sanity/client'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
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
    *[_type == "order" && defined(paymentIntentId) && (
      !defined(cardBrand) || cardBrand == "" ||
      !defined(receiptUrl) || receiptUrl == ""
    )][0...50]{
      _id, orderNumber, paymentIntentId
    }
  `,
  )

  console.log(`Found ${orders.length} orders needing payment details`)

  for (const order of orders) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId, {
        expand: ['charges.data.payment_method_details'],
      })

      const charge = paymentIntent.charges.data[0]
      if (charge) {
        await client
          .patch(order._id)
          .set({
            cardBrand: charge.payment_method_details?.card?.brand || '',
            cardLast4: charge.payment_method_details?.card?.last4 || '',
            receiptUrl: charge.receipt_url || '',
          })
          .commit()
        console.log(`✅ ${order.orderNumber}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`❌ ${order.orderNumber}: ${error.message}`)
    }
  }
}

run()
