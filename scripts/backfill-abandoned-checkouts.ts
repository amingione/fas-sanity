#!/usr/bin/env tsx

import 'dotenv/config'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'

type CliOptions = {
  dryRun: boolean
  limit?: number
  since?: string
}

const DEFAULT_SINCE = '2025-12-20T00:00:00Z'

function parseOptions(): CliOptions {
  const args = process.argv.slice(2)
  let dryRun = false
  let limit: number | undefined
  let since: string | undefined

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run' || arg === '--dryRun') {
      dryRun = true
    } else if (arg === '--limit') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --limit')
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --limit: ${value}`)
      limit = Math.floor(parsed)
      i += 1
    } else if (arg === '--since') {
      const value = args[i + 1]
      if (!value) throw new Error('Missing value for --since')
      since = value
      i += 1
    }
  }

  return {dryRun, limit, since}
}

const stripeKey =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_SECRET ||
  process.env.STRIPE_SK ||
  process.env.STRIPE_API_KEY ||
  ''
if (!stripeKey) {
  throw new Error('Missing Stripe secret key (STRIPE_SECRET_KEY or STRIPE_SECRET)')
}

const stripe = new Stripe(stripeKey, {apiVersion: '2024-06-20' as Stripe.LatestApiVersion})

const sanityProjectId =
  process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID
const sanityDataset =
  process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || process.env.SANITY_PROJECT_DATASET
const sanityToken =
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_ACCESS_TOKEN ||
  process.env.SANITY_TOKEN

if (!sanityProjectId || !sanityDataset || !sanityToken) {
  throw new Error('Missing Sanity credentials (projectId/dataset/token)')
}

const sanity = createClient({
  projectId: sanityProjectId,
  dataset: sanityDataset,
  token: sanityToken,
  apiVersion: '2024-04-10',
  useCdn: false,
})

const normalize = (value?: string | null): string | undefined => {
  const trimmed = (value || '').toString().trim()
  return trimmed || undefined
}

const metaValue = (meta: Record<string, any>, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = meta?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

async function resolveSessionContact(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  const metadata = (session.metadata || {}) as Record<string, any>
  const email =
    normalize(session.customer_details?.email) ||
    normalize(session.customer_email) ||
    metaValue(metadata, 'customer_email', 'customerEmail', 'email', 'bill_to_email', 'contact_email')
  const name =
    normalize(session.customer_details?.name) ||
    metaValue(metadata, 'customer_name', 'bill_to_name') ||
    email
  const phone =
    normalize(session.customer_details?.phone) ||
    metaValue(metadata, 'customer_phone', 'phone', 'shipping_phone')

  return {email, name, phone}
}

async function main() {
  const options = parseOptions()
  const since = options.since || DEFAULT_SINCE
  const filter = `*[_type == "abandonedCheckout" && (!defined(customerEmail) || customerEmail == "") && _createdAt > dateTime($since)]`
  const docs = await sanity.fetch<Array<{_id: string; stripeSessionId?: string | null}>>(filter, {
    since,
  })

  const limit = options.limit && options.limit > 0 ? Math.min(options.limit, docs.length) : docs.length
  let processed = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const doc of docs.slice(0, limit)) {
    if (!doc.stripeSessionId) {
      skipped += 1
      continue
    }

    try {
      const contact = await resolveSessionContact(doc.stripeSessionId)
      if (!contact.email) {
        skipped += 1
        continue
      }

      processed += 1
      if (options.dryRun) {
        console.log(`[dry-run] would backfill ${doc._id} -> ${contact.email}`)
        continue
      }

      await sanity
        .patch(doc._id)
        .set({
          customerEmail: contact.email,
          customerName: contact.name || contact.email,
          customerPhone: contact.phone || null,
        })
        .commit({autoGenerateArrayKeys: true})
      updated += 1
      console.log(`✅ Backfilled ${doc._id} (${contact.email})`)
    } catch (err: any) {
      failed += 1
      console.warn(`⚠️ Failed to backfill ${doc._id}: ${err?.message || err}`)
    }
  }

  console.log(
    `Finished. total=${docs.length} processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}${
      options.dryRun ? ' (dry run)' : ''
    }`,
  )
}

main().catch((err) => {
  console.error('Backfill failed', err)
  process.exit(1)
})
