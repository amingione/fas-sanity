#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

const ENV_FILES = ['.env.development.local', '.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const filePath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(filePath)) {
    dotenv.config({path: filePath, override: false})
  }
}

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  'r4og35qd'
const dataset =
  process.env.SANITY_STUDIO_DATASET ||
  process.env.SANITY_DATASET ||
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  'production'
const token =
  process.env.SANITY_AUTH_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_TOKEN
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

const stripe = new Stripe(stripeSecret, {
  apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
})

type OrderDoc = {
  _id: string
  paymentIntentId?: string
  cardBrand?: string
  cardLast4?: string
  stripeSummary?: {
    paymentIntentId?: string
  }
}

const ORDER_QUERY = `*[_type == "order" && (
  paymentIntentId != null || stripeSummary.paymentIntentId != null
) && (
  cardBrand == "" || !defined(cardBrand) || cardLast4 == "" || !defined(cardLast4)
)][0...100]{
  _id,
  paymentIntentId,
  cardBrand,
  cardLast4,
  stripeSummary{paymentIntentId}
}`

const PAYMENT_INTENT_EXPANSIONS: Stripe.PaymentIntentRetrieveParams['expand'] = [
  'latest_charge.payment_method_details',
  'charges.data.payment_method_details',
  'payment_method',
]

function resolvePaymentIntentId(order: OrderDoc): string | undefined {
  const candidates = [
    order.paymentIntentId,
    order.stripeSummary?.paymentIntentId,
  ].map((value) => (typeof value === 'string' ? value.trim() : ''))

  return candidates.find((value) => Boolean(value)) || undefined
}

function extractCardDetails(
  pi: Stripe.PaymentIntent,
): {brand?: string; last4?: string} {
  const cardFromPaymentMethod =
    typeof pi.payment_method === 'object' && pi.payment_method && 'card' in pi.payment_method
      ? (pi.payment_method as Stripe.PaymentMethod).card
      : undefined

  const piCharges = (pi as Stripe.PaymentIntent & {
    charges?: Stripe.ApiList<Stripe.Charge>
  }).charges

  const charges: Stripe.Charge[] = Array.isArray(piCharges?.data) ? piCharges.data : []
  const latestCharge =
    pi.latest_charge && typeof pi.latest_charge === 'object'
      ? (pi.latest_charge as Stripe.Charge)
      : undefined

  const chargeCandidates = [latestCharge, ...charges].filter(
    (charge): charge is Stripe.Charge => Boolean(charge),
  )

  for (const charge of chargeCandidates) {
    const pmDetails = charge.payment_method_details
    if (pmDetails?.card) {
      return {
        brand: pmDetails.card.brand || cardFromPaymentMethod?.brand,
        last4: pmDetails.card.last4 || cardFromPaymentMethod?.last4,
      }
    }
    if (cardFromPaymentMethod?.brand || cardFromPaymentMethod?.last4) {
      return {
        brand: cardFromPaymentMethod.brand,
        last4: cardFromPaymentMethod.last4,
      }
    }
  }

  if (cardFromPaymentMethod) {
    return {
      brand: cardFromPaymentMethod.brand || undefined,
      last4: cardFromPaymentMethod.last4 || undefined,
    }
  }

  return {}
}

async function main() {
  const orders: OrderDoc[] = await client.fetch(ORDER_QUERY)

  if (!orders.length) {
    console.log('No orders missing card metadata — all clear.')
    return
  }

  for (const order of orders) {
    const paymentIntentId = resolvePaymentIntentId(order)
    if (!paymentIntentId) continue

    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: PAYMENT_INTENT_EXPANSIONS,
      })
      const {brand, last4} = extractCardDetails(pi)
      if (!brand && !last4) {
        console.warn('No card details found for', paymentIntentId, order._id)
        continue
      }
      await client
        .patch(order._id)
        .set({
          cardBrand: brand ?? order.cardBrand ?? '',
          cardLast4: last4 ?? order.cardLast4 ?? '',
        })
        .commit({autoGenerateArrayKeys: true})
      console.log('Updated card info for', order._id, paymentIntentId, brand, last4)
    } catch (err) {
      console.error('Failed to update', order._id, paymentIntentId, (err as any)?.message || err)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
