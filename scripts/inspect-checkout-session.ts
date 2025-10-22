#!/usr/bin/env tsx

import Stripe from 'stripe'

const sessionId = process.argv[2]

if (!sessionId) {
  console.error('Usage: npm run inspect-checkout <sessionId>')
  process.exit(1)
}

const secret = process.env.STRIPE_SECRET_KEY
if (!secret) {
  console.error('Missing STRIPE_SECRET_KEY env var')
  process.exit(1)
}

async function main() {
  const stripe = new Stripe(secret, { apiVersion: '2024-06-20' })
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['customer', 'total_details.breakdown'],
  })

  console.log('metadata:', session.metadata)
  console.log('shipping_details:', session.shipping_details)
  console.log('shipping_cost:', session.shipping_cost)
  console.log('total_details:', session.total_details)
  console.log('customer_details:', session.customer_details)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
