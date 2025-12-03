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
        expand: ['charges.data.payment_method_details', 'latest_charge.payment_method_details', 'payment_method'],
      })

      let charge = paymentIntent.charges?.data?.[0]
      if (!charge && paymentIntent.latest_charge) {
        const latestId = typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent.latest_charge.id
        try {
          charge = await stripe.charges.retrieve(latestId, {expand: ['payment_method_details']})
        } catch (err) {
          console.warn(`Unable to retrieve latest_charge for ${order.orderNumber}`, err.message || err)
        }
      }

      const cardBrand =
        charge?.payment_method_details?.card?.brand ||
        (paymentIntent.payment_method && typeof paymentIntent.payment_method === 'object'
          ? paymentIntent.payment_method.card?.brand
          : '') ||
        ''
      const cardLast4 =
        charge?.payment_method_details?.card?.last4 ||
        (paymentIntent.payment_method && typeof paymentIntent.payment_method === 'object'
          ? paymentIntent.payment_method.card?.last4
          : '') ||
        ''
      const receiptUrl = charge?.receipt_url || ''

      await client
        .patch(order._id)
        .set({
          cardBrand,
          cardLast4,
          receiptUrl,
        })
        .commit()
      console.log(`✅ ${order.orderNumber}`)

      await new Promise((resolve) => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`❌ ${order.orderNumber}: ${error.message}`)
    }
  }
}

run()
