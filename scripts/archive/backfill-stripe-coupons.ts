#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import {config as loadEnv} from 'dotenv'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import {resolveStripeSecretKey, STRIPE_SECRET_ENV_KEY} from '../netlify/lib/stripeEnv'
import {STRIPE_API_VERSION} from '../netlify/lib/stripeConfig'
import {requireSanityCredentials} from '../netlify/lib/sanityEnv'
import {syncStripeCoupons} from '../netlify/lib/stripeCoupons'

function bootstrapEnv() {
  const cwd = process.cwd()
  const nodeEnv = process.env.NODE_ENV || 'development'
  const candidates = [
    '.env',
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
    '.env.local',
    '.env.development',
    '.env.development.local',
  ]

  for (const file of candidates) {
    const filePath = path.resolve(cwd, file)
    if (fs.existsSync(filePath)) {
      loadEnv({path: filePath, override: false})
    }
  }
}

async function main() {
  bootstrapEnv()

  const stripeKey = resolveStripeSecretKey()
  if (!stripeKey) {
    throw new Error(`Missing Stripe secret (set ${STRIPE_SECRET_ENV_KEY})`)
  }

  const sanityConfig = requireSanityCredentials()
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

  console.log(
    [
      'Stripe coupon backfill complete',
      `processed=${summary.processed}`,
      `created=${summary.created}`,
      `updated=${summary.updated}`,
      `deleted=${summary.deleted}`,
      `skipped=${summary.skipped}`,
      `errors=${summary.errors}`,
    ].join(' | '),
  )

  if (summary.errorDetails.length) {
    console.error('\nErrors:')
    summary.errorDetails.forEach((err) => {
      console.error(` - ${err.stripeId}: ${err.error}`)
    })
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
