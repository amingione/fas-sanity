import 'dotenv/config'
import {createClient} from '@sanity/client'
import {syncContact} from '../netlify/lib/resend/contacts'

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID
const dataset =
  process.env.SANITY_STUDIO_DATASET
const token =
  process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error(
    '[sync-resend-contacts] Missing Sanity credentials. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN (or equivalents).',
  )
  process.exit(1)
}

if (!process.env.RESEND_API_KEY) {
  console.error('[sync-resend-contacts] RESEND_API_KEY missing. Cannot sync contacts.')
  process.exit(1)
}

type CustomerDoc = {
  _id: string
  email?: string
  firstName?: string
  lastName?: string
  name?: string
  roles?: string[]
  emailMarketing?: {
    subscribed?: boolean
    unsubscribedAt?: string
  }
  emailOptIn?: boolean
  marketingOptIn?: boolean
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const deriveName = (customer: CustomerDoc) => {
  const first = customer.firstName || ''
  const last = customer.lastName || ''
  if (first || last) {
    return {
      firstName: first || undefined,
      lastName: last || undefined,
    }
  }

  const parts = (customer.name || '').split(' ').filter(Boolean)
  const [firstName, ...rest] = parts
  return {firstName: firstName || undefined, lastName: rest.length ? rest.join(' ') : undefined}
}

const deriveUnsubscribed = (customer: CustomerDoc): boolean => {
  const explicitUnsubscribed =
    customer.roles?.includes('unsubscribed') ||
    customer.emailMarketing?.subscribed === false ||
    Boolean(customer.emailMarketing?.unsubscribedAt)

  const hasOptedIn =
    customer.emailMarketing?.subscribed === true ||
    customer.emailOptIn === true ||
    customer.marketingOptIn === true

  if (explicitUnsubscribed) return true
  if (hasOptedIn) return false

  // If we don't have a positive opt-in, treat as unsubscribed to avoid accidental sends
  return true
}

async function syncAllCustomers() {
  console.log('Starting Resend contact sync...')
  console.log(
    `General audience: ${process.env.RESEND_AUDIENCE_GENERAL || '2b09020e-6039-4478-abd0-21c9a166f0ff'}`,
  )
  console.log(
    `Subscribers audience: ${
      process.env.RESEND_AUDIENCE_SUBSCRIBERS || '5c338174-537e-43f6-9f06-b9957c43ae12'
    }\n`,
  )

  const customers = await client.fetch<CustomerDoc[]>(
    `*[_type == "customer" && defined(email)]{
      _id,
      email,
      firstName,
      lastName,
      name,
      roles,
      emailMarketing,
      emailOptIn,
      marketingOptIn
    }`,
  )

  console.log(`Found ${customers.length} customers to sync\n`)

  let processed = 0
  let generalSynced = 0
  let subscriberSynced = 0
  let errors = 0

  for (const customer of customers) {
    const email = (customer.email || '').trim().toLowerCase()
    if (!email) continue

    const {firstName, lastName} = deriveName(customer)
    const unsubscribed = deriveUnsubscribed(customer)

    try {
      const results = await syncContact({
        email,
        firstName,
        lastName,
        unsubscribed,
      })

      if (results.general.success) generalSynced += 1
      else errors += 1

      if (!unsubscribed && results.subscribers.success) subscriberSynced += 1

      processed += 1
      console.log(
        `✓ ${email} | general:${results.general.action} | subscribers:${results.subscribers.action} | subscribed:${!unsubscribed}`,
      )
    } catch (err) {
      errors += 1
      console.error(`✗ Failed to sync ${email}`, err)
    }

    // Resend rate limits: be gentle
    await sleep(150)
  }

  console.log('\n=== Sync Complete ===')
  console.log(`Total processed: ${processed}`)
  console.log(`General audience synced: ${generalSynced}`)
  console.log(`Subscribers audience synced: ${subscriberSynced}`)
  console.log(`Errors: ${errors}`)
}

syncAllCustomers().catch((err) => {
  console.error('[sync-resend-contacts] Unexpected failure', err)
  process.exit(1)
})
