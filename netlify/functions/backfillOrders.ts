import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import { randomUUID } from 'crypto'

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) o = origin
    else if (DEFAULT_ORIGINS.includes(origin)) o = origin
  }
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

function toOrderCartItem(it: any) {
  if (!it || typeof it !== 'object') return null

  const cloned = { ...it }

  if (cloned._type === 'cartLine') {
    const qty = Number(cloned.quantity || cloned.qty || 1)
    const price = Number(cloned.amount_total || cloned.amount || cloned.total || 0)
    return {
      _type: 'orderCartItem',
      _key: typeof cloned._key === 'string' && cloned._key ? cloned._key : randomUUID(),
      name: cloned.description || cloned.name || 'Line item',
      sku: cloned.sku || undefined,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      price: Number.isFinite(price) ? price : undefined,
    }
  }

  if (!cloned._type) cloned._type = 'orderCartItem'
  if (cloned._type !== 'orderCartItem') return null
  if (typeof cloned._key !== 'string' || !cloned._key) cloned._key = randomUUID()
  return cloned
}

function fixCart(arr: any[]) {
  if (!Array.isArray(arr)) return null
  const transformed = arr
    .map((it) => toOrderCartItem(it))
    .filter((it): it is Record<string, any> => Boolean(it))

  return transformed
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  // Optional simple shared secret to avoid accidental clicks across environments
  const expected = (process.env.BACKFILL_SECRET || '').trim()
  const presented = ((event.headers?.authorization || '').replace(/^Bearer\s+/i, '') || (event.queryStringParameters?.token || '')).trim()
  if (expected && presented !== expected) return { statusCode: 401, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) }

  let dryRun = (event.queryStringParameters?.dryRun || '').toLowerCase() === 'true'
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}')
      if (typeof body.dryRun === 'boolean') dryRun = body.dryRun
    } catch {}
  }

  const pageSize = 100
  let cursor = ''
  let total = 0
  let changed = 0
  let migratedCustomer = 0
  let cartFixed = 0

  try {
    while (true) {
      const result: any[] = await sanity.fetch(
        `*[_type == "order" && _id > $cursor] | order(_id) {
          _id,
          cart,
          customerRef,
          customer
        }[0...$limit]`,
        { limit: pageSize, cursor }
      )

      if (!result || result.length === 0) break
      for (const doc of result) {
        total++
        const setOps: Record<string, any> = {}
        const unsetOps: string[] = []

        // Migrate customer -> customerRef (remove legacy `customer`)
        if (!doc.customerRef && doc.customer && doc.customer._ref) {
          setOps.customerRef = { _type: 'reference', _ref: doc.customer._ref }
          unsetOps.push('customer')
        } else if (doc.customer) {
          unsetOps.push('customer')
        }

        // Fix cart item types
        const fixedCart = fixCart(doc.cart)
        if (Array.isArray(fixedCart)) {
          const needs = (doc.cart || []).some((i: any) => i && typeof i === 'object' && !i._type)
          if (needs) setOps.cart = fixedCart
        }

        if (Object.keys(setOps).length || unsetOps.length) {
          changed++
          if (!dryRun) {
            try {
              await sanity.patch(doc._id).set(setOps).unset(unsetOps).commit({ autoGenerateArrayKeys: true })
            } catch (e) {
              // keep going
            }
          }
          if (setOps.customerRef) migratedCustomer++
          if (setOps.cart) cartFixed++
        }
        cursor = doc._id
      }
      if (result.length < pageSize) break
    }
  } catch (e: any) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e?.message || 'Backfill failed' }) }
  }

  let remainingCustomer = 0
  try {
    remainingCustomer = await sanity.fetch('count(*[_type == "order" && defined(customer)])')
  } catch {}

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, dryRun, total, changed, migratedCustomer, cartFixed, remainingCustomer }),
  }
}
