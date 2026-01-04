import {schedule} from '@netlify/functions'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import {resolveStripeSecretKey, STRIPE_SECRET_ENV_KEY} from '../lib/stripeEnv'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'
import {requireSanityCredentials} from '../lib/sanityEnv'
import {syncStripeCoupons} from '../lib/stripeCoupons'

const handler = schedule('0 3 * * *', async () => {
  const stripeKey = resolveStripeSecretKey()
  if (!stripeKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: `Missing Stripe secret (set ${STRIPE_SECRET_ENV_KEY})`,
      }),
    }
  }

  let sanityConfig: {projectId: string; dataset: string; token: string}
  try {
    sanityConfig = requireSanityCredentials()
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({error: err instanceof Error ? err.message : String(err)}),
    }
  }

  const sanity = createClient({
    projectId: sanityConfig.projectId,
    dataset: sanityConfig.dataset,
    token: sanityConfig.token,
    apiVersion: '2024-10-01',
    useCdn: false,
  })

  const stripe = new Stripe(stripeKey, {apiVersion: STRIPE_API_VERSION})
  const summary = await syncStripeCoupons({
    stripe,
    sanity,
    syncedAt: new Date().toISOString(),
    logger: console,
    markMissingAsDeleted: true,
  })
  console.log('syncStripeCoupons: reconciliation complete', summary)

  return {
    statusCode: 200,
    body: JSON.stringify(summary),
  }
})

export {handler}
