import type {Handler} from '@netlify/functions'
import crypto from 'crypto'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || ''
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'
const token = process.env.SANITY_API_TOKEN || ''
const webhookSecret = process.env.SANITY_WEBHOOK_SECRET || ''
const stripeSecret = process.env.STRIPE_SECRET_KEY || ''

if (!projectId || !token || !stripeSecret) {
  throw new Error(
    'productShippingSync: Missing SANITY_STUDIO_PROJECT_ID, SANITY_API_TOKEN, or STRIPE_SECRET_KEY.',
  )
}

const sanity = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

const stripe = new Stripe(stripeSecret, {apiVersion: '2025-08-27.basil'})

const verifySignature = (body: string, signature?: string): boolean => {
  if (!webhookSecret) return true
  if (!signature) return false
  const hmac = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature))
}

const sanitizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const buildMetadata = (product: any): Record<string, string | undefined> => {
  const weight = sanitizeNumber(product.shippingWeight)
  const handling = sanitizeNumber(product.handlingTime)
  return {
    shipping_weight: weight !== undefined ? String(weight) : undefined,
    shipping_dimensions: product.boxDimensions || undefined,
    shipping_class: product.shippingClass || undefined,
    handling_time: handling !== undefined ? String(handling) : undefined,
    ships_alone: product.shipsAlone ? 'true' : undefined,
  }
}

const mergeMetadata = (
  current: Record<string, string>,
  updates: Record<string, string | undefined>,
): Record<string, string> => {
  const next = {...current}
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) delete next[key]
    else next[key] = value
  }
  return next
}

async function updateStripeMetadata(
  stripeProductId: string,
  updates: Record<string, string | undefined>,
) {
  const product = await stripe.products.retrieve(stripeProductId)
  const merged = mergeMetadata(product.metadata || {}, updates)
  await stripe.products.update(stripeProductId, {metadata: merged})
}

async function syncProduct(productId: string) {
  const product = await sanity.fetch(
    `*[_type == "product" && _id==$id][0]{
      _id,
      title,
      productType,
      stripeProductId,
      shippingWeight,
      boxDimensions,
      handlingTime,
      shippingClass,
      shipsAlone
    }`,
    {id: productId},
  )
  if (!product?.stripeProductId) {
    return {skipped: true, reason: 'Missing stripeProductId'}
  }
  if (product.productType === 'service') {
    await updateStripeMetadata(product.stripeProductId, {
      shipping_weight: undefined,
      shipping_dimensions: undefined,
      shipping_class: undefined,
      handling_time: undefined,
      ships_alone: undefined,
    })
    await sanity.patch(product._id).set({stripeLastSyncedAt: new Date().toISOString()}).commit()
    return {updated: true}
  }
  const metadata = buildMetadata(product)
  await updateStripeMetadata(product.stripeProductId, metadata)
  await sanity.patch(product._id).set({stripeLastSyncedAt: new Date().toISOString()}).commit()
  return {updated: true, metadata}
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }
  const rawBody = event.body || ''
  const signature = event.headers['x-sanity-signature'] || event.headers['X-Sanity-Signature']
  if (!verifySignature(rawBody, signature)) {
    return {statusCode: 401, body: 'Invalid signature'}
  }

  try {
    const payload = JSON.parse(rawBody)
    const docId: string =
      payload?.documentId || payload?.ids?.[0] || payload?.transition?.id || payload?.after?._id
    if (!docId) {
      return {statusCode: 200, body: 'No product id'}
    }
    const normalizedId = docId.startsWith('drafts.') ? docId.replace('drafts.', '') : docId
    const result = await syncProduct(normalizedId)
    return {
      statusCode: 200,
      body: JSON.stringify({ok: true, id: normalizedId, ...result}),
    }
  } catch (err: any) {
    console.error('productShippingSync failed', err)
    return {statusCode: 500, body: JSON.stringify({error: err?.message || err})}
  }
}

export {handler}
