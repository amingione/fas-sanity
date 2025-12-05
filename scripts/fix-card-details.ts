#!/usr/bin/env tsx

import path from 'node:path'
import dotenv from 'dotenv'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

dotenv.config({path: path.join(process.cwd(), '.env.development.local')})
dotenv.config({path: path.join(process.cwd(), '.env.local')})

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd'
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const token =
  process.env.SANITY_AUTH_TOKEN || process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN
const stripeSecret = process.env.STRIPE_SECRET_KEY

if (!token) {
  console.error('Missing SANITY token')
  process.exit(1)
}
if (!stripeSecret) {
  console.error('Missing STRIPE_SECRET_KEY')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  token,
  useCdn: false,
  apiVersion: '2024-10-01',
})

const stripe = new Stripe(stripeSecret)

async function main() {
  const orders: Array<{
    _id: string
    paymentIntentId?: string
    cardBrand?: string
    cardLast4?: string
  }> = await client.fetch(
    '*[_type == "order" && paymentIntentId != null && (cardBrand == "" || !defined(cardBrand) || cardLast4 == "" || !defined(cardLast4))][0...100]{_id,paymentIntentId,cardBrand,cardLast4}',
  )

  for (const order of orders) {
    if (!order.paymentIntentId) continue
    try {
      const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, {expand: ['latest_charge']})
      const charge =
        pi.latest_charge && typeof pi.latest_charge === 'object'
          ? (pi.latest_charge as Stripe.Charge)
          : null
      const pm = charge?.payment_method_details?.card
      const brand = pm?.brand || undefined
      const last4 = pm?.last4 || undefined
      if (!brand && !last4) continue
      await client.patch(order._id).set({
        cardBrand: brand ?? order.cardBrand ?? '',
        cardLast4: last4 ?? order.cardLast4 ?? '',
      }).commit({autoGenerateArrayKeys: true})
      console.log('Updated card info for', order._id, brand, last4)
    } catch (err) {
      console.error('Failed to update', order._id, (err as any)?.message || err)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
