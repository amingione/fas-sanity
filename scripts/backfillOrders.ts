import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'

dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
})

const sanity = createClient({
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET!,
  token: process.env.SANITY_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const backfillOrder = async (orderId: string) => {
  console.log('\n=== Backfilling order:', orderId, '===')

  // Get order from Sanity
  const order = await sanity.fetch(
    `*[_id == $id][0]{
      _id,
      orderNumber,
      stripeSummary{
        checkoutSessionId,
        paymentIntentId
      }
    }`,
    {id: orderId},
  )

  if (!order) {
    console.log('Order not found')
    return
  }

  console.log('Order:', order.orderNumber)

  const sessionId = order.stripeSummary?.checkoutSessionId
  const paymentIntentId = order.stripeSummary?.paymentIntentId

  if (!sessionId && !paymentIntentId) {
    console.log('No Stripe session or payment intent ID')
    return
  }

  try {
    let paymentIntent: (Stripe.PaymentIntent & {charges?: Stripe.ApiList<Stripe.Charge>}) | null =
      null
    let session: Stripe.Checkout.Session | null = null

    // Try to get payment intent
    if (paymentIntentId) {
      console.log('Fetching payment intent:', paymentIntentId)
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['charges', 'charges.data.payment_method_details', 'charges.data.billing_details'],
      })
    } else if (sessionId) {
      console.log('Fetching session:', sessionId)
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: [
          'payment_intent',
          'payment_intent.charges',
          'payment_intent.charges.data.payment_method_details',
          'line_items',
        ],
      })
      paymentIntent = session.payment_intent as Stripe.PaymentIntent
    }

    if (!paymentIntent) {
      console.log('Could not retrieve payment intent')
      return
    }

    console.log('Payment intent retrieved:', paymentIntent.id)

    // Get charge details
    const charge = paymentIntent.charges?.data[0]
    if (!charge) {
      console.log('No charge found')
      return
    }

    console.log('Charge found:', charge.id)

    // Extract payment method details
    const paymentMethodDetails = charge.payment_method_details
    const card = paymentMethodDetails?.card
    const billingDetails = charge.billing_details
    const billingAddress = billingDetails?.address

    console.log('Card brand:', card?.brand)
    console.log('Card last 4:', card?.last4)
    console.log('Receipt URL:', charge.receipt_url)

    // Update order in Sanity
    const updates: any = {}

    if (card?.brand) {
      updates.cardBrand = card.brand
    }

    if (card?.last4) {
      updates.cardLast4 = card.last4
    }

    if (charge.receipt_url) {
      updates.receiptUrl = charge.receipt_url
    }

    if (billingAddress) {
      updates.billingAddress = {
        name: billingDetails?.name || '',
        phone: billingDetails?.phone || '',
        email: billingDetails?.email || '',
        addressLine1: billingAddress.line1 || '',
        addressLine2: billingAddress.line2 || '',
        city: billingAddress.city || '',
        state: billingAddress.state || '',
        postalCode: billingAddress.postal_code || '',
        country: billingAddress.country || '',
      }
    }

    // 🎉 NEW: Fetch and update cart fields (now that readOnly is false!)
    if (session) {
      const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
        expand: ['data.price.product'],
      })

      if (lineItems.data.length > 0) {
        const cartItems = lineItems.data.map((item) => {
          const product = item.price?.product as Stripe.Product
          return {
            _type: 'orderCartItem',
            sku: product?.metadata?.sku || '',
            name: item.description || '',
            quantity: item.quantity || 1,
            price: (item.amount_total || 0) / 100,
            variant: product?.metadata?.variant || '',
            addOns: product?.metadata?.addOns ? JSON.parse(product.metadata.addOns) : [],
          }
        })

        updates.cart = cartItems
        console.log('Cart items:', cartItems.length)
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log('Updating order with:', updates)
      await sanity.patch(orderId).set(updates).commit()
      console.log('✅ Order updated successfully')
    } else {
      console.log('No updates needed')
    }
  } catch (error) {
    console.error('Error backfilling order:', error)
  }
}

const backfillAllOrders = async () => {
  console.log('Fetching orders with missing card details...')

  const orders = await sanity.fetch(
    `*[_type == "order" && (cardBrand == "" || !defined(cardBrand))]{
      _id,
      orderNumber,
      _createdAt
    } | order(_createdAt desc)`,
  )

  console.log(`Found ${orders.length} orders to backfill`)

  for (const order of orders) {
    await backfillOrder(order._id)
    // Wait 1 second between requests to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  console.log('\n=== Backfill complete ===')
}

// Run backfill
backfillAllOrders().catch(console.error)
