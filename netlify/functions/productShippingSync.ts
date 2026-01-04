import type {Handler} from '@netlify/functions'
import crypto from 'crypto'
import {createClient} from '@sanity/client'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || ''
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
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

const verifySignature = (body: string, signature?: string): boolean => {
  if (!webhookSecret) return true
  if (!signature) return false
  const hmac = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature))
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
  return {
    skipped: true,
    reason: 'Shipping metadata sync disabled; use syncStripeCatalog',
  }
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
