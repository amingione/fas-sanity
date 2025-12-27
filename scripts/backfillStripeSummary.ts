import dotenv from 'dotenv'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import {buildStripeSummary, serializeStripeSummaryData} from '../netlify/lib/stripeSummary'

dotenv.config()

// Hard-coded IDs for the backfill run; adjust if needed.
const orderId = '4e3xl4aFRE2qSir4YLQqvh'
const paymentIntentId = 'pi_3Saq8tP1CiCjkLwl0gy9UKfV'
const sessionId = 'cs_live_a110El6Ntd3ijnFuPw5Ug2VyRYGbr78Fe1RpAq7o15hxYEh274mphpf3HR'

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const sanityProjectId = process.env.SANITY_STUDIO_PROJECT_ID
  const sanityDataset = process.env.SANITY_STUDIO_DATASET
  const sanityToken = process.env.SANITY_API_TOKEN

  if (!stripeKey || !sanityProjectId || !sanityDataset || !sanityToken) {
    throw new Error('Missing STRIPE_SECRET_KEY or Sanity env vars')
  }

  // Use a stable, supported Stripe API version
  const stripe = new Stripe(stripeKey, {
    apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
  })
  const sanity = createClient({
    projectId: sanityProjectId,
    dataset: sanityDataset,
    apiVersion: '2024-10-01',
    token: sanityToken,
    useCdn: false,
  })

  const [paymentIntent, session] = await Promise.all([
    stripe.paymentIntents.retrieve(paymentIntentId),
    stripe.checkout.sessions.retrieve(sessionId),
  ])

  const summary = buildStripeSummary({
    paymentIntent,
    session,
    charge:
      typeof paymentIntent.latest_charge === 'object'
        ? (paymentIntent.latest_charge as Stripe.Charge)
        : null,
    eventType: 'manual.backfill',
    eventCreated: Date.now() / 1000,
  })

  await sanity
    .patch(orderId)
    .set({stripeSummary: serializeStripeSummaryData(summary)})
    .commit({autoGenerateArrayKeys: true})
  console.log('stripeSummary backfilled for order', orderId)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
