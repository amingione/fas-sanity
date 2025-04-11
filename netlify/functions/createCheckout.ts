import Stripe from 'stripe'
import { createClient } from '@sanity/client'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil'
})

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false
})

export const config = {
  api: {
    bodyParser: false
  }
}

export const handler = async (event: any) => {
  try {
    const { quoteId } = JSON.parse(event.body)

    const quote = await sanity.fetch(
      `*[_type == "buildQuote" && _id == $id][0]{
        quoteTotal,
        customerEmail,
        modList[]->{title, price}
      }`,
      { id: quoteId }
    )

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: quote.customerEmail,
      line_items: quote.modList.map((mod: any) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: mod.title || mod.name
          },
          unit_amount: Math.round(mod.price * 100)
        },
        quantity: 1
      })),
      mode: 'payment',
      success_url: `${process.env.SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/cancel`
    })

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url })
    }
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    }
  }
}

export const webhookHandler = async (event: any) => {
  const sig = event.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let stripeEvent

  try {
    const rawBody = Buffer.from(event.body, 'utf8')
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err: any) {
    return {
      statusCode: 400,
      body: `Webhook Error: ${err.message}`
    }
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session

    try {
      await sanity.create({
        _type: 'invoice',
        stripeSessionId: session.id,
        email: session.customer_email,
        total: session.amount_total! / 100,
        currency: session.currency,
        status: 'paid',
        date: new Date().toISOString()
      })

      return { statusCode: 200, body: 'Invoice saved to Sanity' }
    } catch (err: any) {
      return {
        statusCode: 500,
        body: `Sanity Error: ${err.message}`
      }
    }
  }

  return {
    statusCode: 200,
    body: 'Webhook received'
  }
}