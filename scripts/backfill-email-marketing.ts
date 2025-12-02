#!/usr/bin/env tsx
import 'dotenv/config'
import {createClient} from '@sanity/client'

type EmailPreferences = {
  newProducts?: boolean | null
  promotions?: boolean | null
  tips?: boolean | null
}

type EmailMarketing = {
  subscribed?: boolean | null
  subscribedAt?: string | null
  unsubscribedAt?: string | null
  source?: string | null
  preferences?: EmailPreferences | null
}

type Customer = {
  _id: string
  email?: string | null
  name?: string | null
  _createdAt?: string
  emailOptIn?: boolean | null
  marketingOptIn?: boolean | null
  textOptIn?: boolean | null
  emailMarketing?: EmailMarketing | null
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

function createSanityClient() {
  const projectId = requireEnv('SANITY_STUDIO_PROJECT_ID')
  const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
  const token = requireEnv('SANITY_API_WRITE_TOKEN')

  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-01-01',
    useCdn: false,
  })
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}

function asBoolean(value: boolean | null | undefined, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

async function fetchCustomersNeedingBackfill(client = createSanityClient()): Promise<Customer[]> {
  return client.fetch(
    `*[
      _type == "customer" && (
        !defined(emailMarketing.subscribed) ||
        emailMarketing.subscribed == null ||
        !defined(emailOptIn) || emailOptIn == null ||
        !defined(marketingOptIn) || marketingOptIn == null ||
        !defined(textOptIn) || textOptIn == null
      )
    ]{
      _id,
      email,
      name,
      _createdAt,
      emailOptIn,
      marketingOptIn,
      textOptIn,
      emailMarketing
    }`,
  )
}

async function backfillEmailMarketing() {
  const client = createSanityClient()

  console.log('Looking for customers missing email marketing defaults...')
  const customers = await fetchCustomersNeedingBackfill(client)
  console.log(`Found ${customers.length} customer(s) to update.\n`)

  if (!customers.length) {
    console.log('All customers already have email marketing defaults.')
    return
  }

  const defaultsMessage = [
    'This will set missing values to:',
    '  - emailOptIn: false (if null/missing)',
    '  - marketingOptIn: false (if null/missing)',
    '  - textOptIn: false (if null/missing)',
    '  - emailMarketing.subscribed: false (if null/missing)',
    '  - emailMarketing.source: "backfill" (if missing)',
    '  - emailMarketing.preferences: all true (if missing)',
  ]
  console.log(defaultsMessage.join('\n'))
  console.log('\nStarting backfill...\n')

  let updated = 0
  let failed = 0

  for (const customer of customers) {
    const marketing = customer.emailMarketing || {}
    const preferences = marketing.preferences || {}
    const patchedMarketing: EmailMarketing = {
      subscribed: asBoolean(marketing.subscribed, false),
      subscribedAt: marketing.subscribedAt ?? null,
      unsubscribedAt: marketing.unsubscribedAt ?? null,
      source: marketing.source || 'backfill',
      preferences: {
        newProducts: asBoolean(preferences.newProducts, true),
        promotions: asBoolean(preferences.promotions, true),
        tips: asBoolean(preferences.tips, true),
      },
    }

    try {
      await client
        .patch(customer._id)
        .set({
          emailOptIn: asBoolean(customer.emailOptIn, false),
          marketingOptIn: asBoolean(customer.marketingOptIn, false),
          textOptIn: asBoolean(customer.textOptIn, false),
          emailMarketing: patchedMarketing,
        })
        .commit()

      updated++
      const label = customer.email || customer.name || customer._id
      console.log(`[${updated}/${customers.length}] Updated ${label}`)
    } catch (error) {
      failed++
      console.error(`Failed to update ${customer._id}:`, error)
    }
  }

  console.log('\nBackfill complete.')
  console.log(`Updated: ${updated}`)
  console.log(`Failed: ${failed}`)
}

backfillEmailMarketing()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
