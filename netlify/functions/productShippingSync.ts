import type {Handler} from '@netlify/functions'
import crypto from 'crypto'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'

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

const stripe = new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION})

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

const formatDimensions = (dims?: {
  length?: number | null
  width?: number | null
  height?: number | null
}): string | undefined => {
  if (!dims) return undefined
  const {length, width, height} = dims
  if (
    typeof length !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(length) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return undefined
  }
  return [length, width, height].map((v) => Number(v.toFixed(2))).join('x')
}

const buildMetadata = (product: any): Record<string, string | undefined> => {
  const requiresShipping = product?.shippingConfig?.requiresShipping
  const weight = sanitizeNumber(
    product?.shippingConfig?.weight !== undefined
      ? product.shippingConfig.weight
      : product.shippingWeight,
  )
  const handling = sanitizeNumber(
    product?.shippingConfig?.handlingTime ?? product.handlingTime,
  )
  const dimensionsLabel =
    formatDimensions(product?.shippingConfig?.dimensions) || product.boxDimensions || undefined
  const shippingClass = product?.shippingConfig?.shippingClass || product.shippingClass
  const shipsAlone =
    product?.shippingConfig?.separateShipment !== undefined
      ? product.shippingConfig.separateShipment
      : product.shipsAlone

  if (requiresShipping === false || (product?.productType || '').toLowerCase() === 'service') {
    return {
      shipping_weight: undefined,
      shipping_dimensions: undefined,
      shipping_class: shippingClass || undefined,
      handling_time: handling !== undefined ? String(handling) : undefined,
      ships_alone: shipsAlone ? 'true' : undefined,
    }
  }

  return {
    shipping_weight: weight !== undefined ? String(weight) : undefined,
    shipping_dimensions: dimensionsLabel,
    shipping_class: shippingClass || undefined,
    handling_time: handling !== undefined ? String(handling) : undefined,
    ships_alone: shipsAlone ? 'true' : undefined,
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

async function updateStripePriceMetadata(
  stripeProductId: string,
  metadata: Record<string, string | undefined>,
) {
  const prices = await stripe.prices.list({product: stripeProductId, limit: 100, active: true})
  for (const price of prices.data) {
    const priceMetadata = mergeMetadata(price.metadata || {}, metadata)
    await stripe.prices.update(price.id, {metadata: priceMetadata})
  }
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
      shipsAlone,
      shippingConfig{
        weight,
        dimensions{
          length,
          width,
          height
        },
        shippingClass,
        handlingTime,
        requiresShipping,
        separateShipment
      }
    }`,
    {id: productId},
  )
  if (!product?.stripeProductId) {
    return {skipped: true, reason: 'Missing stripeProductId'}
  }
  if (product.productType === 'service' || product?.shippingConfig?.requiresShipping === false) {
    const clearedMetadata = {
      shipping_weight: undefined,
      shipping_dimensions: undefined,
      shipping_class: undefined,
      handling_time: undefined,
      ships_alone: undefined,
    }
    await updateStripeMetadata(product.stripeProductId, clearedMetadata)
    await updateStripePriceMetadata(product.stripeProductId, clearedMetadata)
    await sanity.patch(product._id).set({stripeLastSyncedAt: new Date().toISOString()}).commit()
    return {updated: true}
  }
  const metadata = buildMetadata(product)
  await updateStripeMetadata(product.stripeProductId, metadata)
  await updateStripePriceMetadata(product.stripeProductId, metadata)
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
