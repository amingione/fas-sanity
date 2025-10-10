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

function createOrderSlug(source?: string | null, fallback?: string | null): string | null {
  const raw = (source || fallback || '').toString().trim()
  if (!raw) return null
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
  return slug || null
}

const ORDER_NUMBER_PREFIX = 'FAS'

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function candidateFromSessionId(id?: string | null): string | undefined {
  if (!id) return undefined
  const core = id.toString().trim().replace(/^cs_(?:test|live)_/i, '')
  const digits = core.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function generateUniqueOrderNumber(existingCandidates: string[] = []): Promise<string> {
  for (const candidate of existingCandidates) {
    const sanitized = sanitizeOrderNumber(candidate)
    if (!sanitized) continue
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      { num: sanitized }
    )
    if (!Number(exists)) return sanitized
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomCandidate = `${ORDER_NUMBER_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      { num: randomCandidate }
    )
    if (!Number(exists)) return randomCandidate
  }

  return `${ORDER_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
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
          customer,
          slug,
          stripeSessionId,
          orderNumber,
          customerName,
          shippingAddress
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
          const original = Array.isArray(doc.cart) ? doc.cart : []
          const lengthsDiffer = original.length !== fixedCart.length
          const needs =
            lengthsDiffer ||
            original.some((i: any) => {
              if (!i || typeof i !== 'object') return false
              if (i._type !== 'orderCartItem') return true
              return typeof i._key !== 'string' || i._key.length === 0
            })
          if (needs) setOps.cart = fixedCart
        }

        if (!doc.customerName) {
          const shippingName = doc?.shippingAddress?.name ? String(doc.shippingAddress.name).trim() : ''
          if (shippingName) setOps.customerName = shippingName
        }

        if (!doc.orderNumber) {
          const slugCurrent = typeof doc.slug === 'string' ? doc.slug : doc?.slug?.current
          const candidates = [slugCurrent, doc.stripeSessionId, doc._id]
          setOps.orderNumber = await generateUniqueOrderNumber(candidates)
        }

        const slugSource = (setOps.orderNumber || doc.orderNumber || doc.stripeSessionId || doc._id || '').toString()
        const desiredSlug = createOrderSlug(slugSource, doc._id)
        const currentSlug = (() => {
          if (!doc?.slug) return ''
          if (typeof doc.slug === 'string') return doc.slug
          if (typeof doc.slug?.current === 'string') return doc.slug.current
          return ''
        })()
        if (desiredSlug && currentSlug !== desiredSlug) {
          setOps.slug = { _type: 'slug', current: desiredSlug }
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
