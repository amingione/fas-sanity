#!/usr/bin/env tsx

import Stripe from 'stripe'

const sessionIdArg = process.argv[2]

if (!sessionIdArg) {
  console.error('Usage: npm run inspect-checkout <sessionId>')
  process.exit(1)
}

const secretEnv = process.env.STRIPE_SECRET_KEY
if (!secretEnv) {
  console.error('Missing STRIPE_SECRET_KEY env var')
  process.exit(1)
}

const sessionId = sessionIdArg
const stripeSecret = secretEnv

async function main() {
  const stripe = new Stripe(stripeSecret, {apiVersion: '2025-08-27.basil'})
  const sessionResponse = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['customer', 'total_details.breakdown'],
  })
  const session = sessionResponse as Stripe.Checkout.Session

  console.log('metadata:', session.metadata)
  console.log('shipping_details:', session.collected_information?.shipping_details)
  console.log('shipping_cost:', session.shipping_cost)
  console.log('total_details:', session.total_details)
  console.log('customer_details:', session.customer_details)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
