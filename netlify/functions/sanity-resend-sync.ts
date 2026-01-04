import type {Handler} from '@netlify/functions'
import crypto from 'crypto'
import {createClient} from '@sanity/client'
import {syncContact} from '../lib/resend/contacts'

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID
const dataset =
  process.env.SANITY_STUDIO_DATASET || ''
const token =
  process.env.SANITY_API_TOKEN ||
  ''
const webhookSecret = process.env.SANITY_WEBHOOK_SECRET || ''

if (!projectId || !dataset || !token) {
  throw new Error(
    'sanity-resend-sync: Missing Sanity env. Set SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, and SANITY_API_TOKEN (or equivalents).',
  )
}

const sanity = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

type CustomerDoc = {
  _id: string
  _type: string
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

const verifySignature = (body: string, signature?: string) => {
  if (!webhookSecret) return true
  if (!signature) return false
  const hmac = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature))
}

const deriveName = (customer: CustomerDoc) => {
  if (customer.firstName || customer.lastName) {
    return {
      firstName: customer.firstName || undefined,
      lastName: customer.lastName || undefined,
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

  return true
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const rawBody = event.body || ''
  const signature = event.headers['x-sanity-signature'] || event.headers['X-Sanity-Signature']
  if (!verifySignature(rawBody, String(signature || ''))) {
    return {statusCode: 401, body: 'Invalid signature'}
  }

  let payload: any
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch (err) {
    console.error('sanity-resend-sync: invalid JSON', err)
    return {statusCode: 400, body: 'Invalid JSON'}
  }

  const inferredDoc =
    payload?.after || payload?.current || payload?.body || payload?.event?.body || payload

  const docId: string =
    inferredDoc?._id ||
    payload?.documentId ||
    payload?.ids?.[0] ||
    payload?.transition?.id ||
    payload?.eventId ||
    ''

  if (!docId) {
    return {statusCode: 200, body: 'No document id provided'}
  }

  const normalizedId = docId.startsWith('drafts.') ? docId.replace('drafts.', '') : docId

  let customer: CustomerDoc | null = null

  if (inferredDoc?._type === 'customer') {
    customer = inferredDoc as CustomerDoc
  } else {
    customer = await sanity.fetch<CustomerDoc | null>(
      `*[_type == "customer" && _id == $id][0]{
        _id,
        _type,
        email,
        firstName,
        lastName,
        name,
        roles,
        emailMarketing,
        emailOptIn,
        marketingOptIn
      }`,
      {id: normalizedId},
    )
  }

  if (!customer) {
    return {statusCode: 200, body: 'Customer not found; nothing to sync'}
  }

  if (customer._type !== 'customer') {
    return {statusCode: 200, body: 'Ignored non-customer document'}
  }

  const email = (customer.email || '').trim().toLowerCase()
  if (!email) {
    return {statusCode: 200, body: 'Customer missing email; skipped'}
  }

  const {firstName, lastName} = deriveName(customer)
  const unsubscribed = deriveUnsubscribed(customer)

  try {
    const results = await syncContact({
      email,
      firstName,
      lastName,
      unsubscribed,
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: results.general.success,
        general: results.general.action,
        subscribers: results.subscribers.action,
        unsubscribed,
      }),
    }
  } catch (err: any) {
    console.error('sanity-resend-sync: contact sync failed', err)
    return {
      statusCode: 500,
      body: JSON.stringify({error: err?.message || 'Failed to sync contact'}),
    }
  }
}

export {handler}
