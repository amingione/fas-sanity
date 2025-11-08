import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {updateCustomerProfileForOrder} from '../lib/customerSnapshot'
import {randomUUID} from 'crypto'
import Stripe from 'stripe'
import {mapStripeLineItem} from '../lib/stripeCartItem'
import {enrichCartItemsFromSanity} from '../lib/cartEnrichment'
import {normalizeMetadataEntries} from '@fas/sanity-config/utils/cartItemDetails'

function normalizeOrigin(value?: string | null): string {
  if (!value) return ''
  return value.trim().replace(/\/+$/, '')
}

const DEFAULT_ORIGINS = (() => {
  const entries = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)
  return entries.length > 0 ? entries : ['http://localhost:3333']
})()
function makeCORS(origin?: string) {
  const normalizedOrigin = normalizeOrigin(origin)
  let allowed = DEFAULT_ORIGINS[0]
  if (normalizedOrigin) {
    if (/^http:\/\/localhost:\d+$/i.test(normalizedOrigin)) allowed = normalizedOrigin
    else if (DEFAULT_ORIGINS.includes(normalizedOrigin)) allowed = normalizedOrigin
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const SANITY_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || ''

const SANITY_DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'

if (!SANITY_PROJECT_ID) {
  throw new Error('Missing Sanity projectId for backfillOrders (set SANITY_STUDIO_PROJECT_ID).')
}

const sanity = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe = stripeSecret ? new Stripe(stripeSecret) : null

function toOrderCartItem(it: any) {
  if (!it || typeof it !== 'object') return null

  const cloned = {...it}

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

  if (cloned.metadata && typeof cloned.metadata === 'object' && !Array.isArray(cloned.metadata)) {
    const normalized = normalizeMetadataEntries(cloned.metadata as Record<string, unknown>)
    if (normalized.length) {
      cloned.metadata = normalized.map(({key, value}) => ({
        _type: 'orderCartItemMeta',
        key,
        value,
        source: 'legacy',
      }))
    } else {
      delete cloned.metadata
    }
  }

  return cloned
}

function fixCart(arr: any[]) {
  if (!Array.isArray(arr)) return null
  const transformed = arr
    .map((it) => toOrderCartItem(it))
    .filter((it): it is Record<string, any> => Boolean(it))

  return transformed
}

function cloneCart(arr: any[]): any[] {
  if (!Array.isArray(arr)) return []
  return arr.map((item) => {
    if (!item || typeof item !== 'object') return item
    const cloned = JSON.parse(JSON.stringify(item))
    if (item._key && typeof item._key === 'string') cloned._key = item._key
    return cloned
  })
}

function normalizeCartItems(existing: any[], next: any[]): any[] {
  return next.map((item, index) => {
    const candidate = item && typeof item === 'object' ? {...item} : {_type: 'orderCartItem'}
    const existingKey = existing?.[index]?._key
    const key =
      typeof candidate._key === 'string' && candidate._key
        ? candidate._key
        : typeof existingKey === 'string' && existingKey
          ? existingKey
          : randomUUID()
    return {
      _type: 'orderCartItem',
      ...candidate,
      _key: key,
    }
  })
}

function hasCartChanged(original: any[], next: any[]): boolean {
  if (!Array.isArray(original) && Array.isArray(next)) return true
  if (original.length !== next.length) return true
  for (let i = 0; i < next.length; i += 1) {
    const before = original[i]
    const after = next[i]
    if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) return true
  }
  return false
}

function cartNeedsEnrichment(cart: any[]): boolean {
  if (!Array.isArray(cart) || cart.length === 0) return false
  return cart.some((item) => {
    if (!item || typeof item !== 'object') return true
    const hasProductPointer = Boolean(
      item.sku || item.productSlug || item.stripeProductId || item.stripePriceId,
    )
    const hasMetadata = Array.isArray(item.metadata) && item.metadata.length > 0
    return !hasProductPointer || !hasMetadata
  })
}

async function loadCartFromStripe(sessionId: string): Promise<any[] | null> {
  if (!stripe || !sessionId) return null
  try {
    const result = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
      expand: ['data.price.product'],
    })
    let mapped: any[] = (result?.data || []).map((li: Stripe.LineItem) => ({
      _type: 'orderCartItem',
      _key: randomUUID(),
      ...mapStripeLineItem(li),
    }))
    if (!mapped.length) return []
    mapped = await enrichCartItemsFromSanity(mapped, sanity)
    return mapped
  } catch (err) {
    console.warn('backfillOrders: failed to load Stripe cart', err)
    return null
  }
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

async function generateUniqueOrderNumber(existingCandidates: string[] = []): Promise<string> {
  for (const candidate of existingCandidates) {
    const sanitized = sanitizeOrderNumber(candidate)
    if (!sanitized) continue
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      {num: sanitized},
    )
    if (!Number(exists)) return sanitized
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomCandidate = `${ORDER_NUMBER_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      {num: randomCandidate},
    )
    if (!Number(exists)) return randomCandidate
  }

  return `${ORDER_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET')
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }

  // Optional simple shared secret to avoid accidental clicks across environments
  const expected = (process.env.BACKFILL_SECRET || '').trim()
  const presented = (
    (event.headers?.authorization || '').replace(/^Bearer\s+/i, '') ||
    event.queryStringParameters?.token ||
    ''
  ).trim()
  if (expected && presented !== expected)
    return {
      statusCode: 401,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Unauthorized'}),
    }

  let dryRun = (event.queryStringParameters?.dryRun || '').toLowerCase() === 'true'
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}')
      if (typeof body.dryRun === 'boolean') dryRun = body.dryRun
    } catch {}
  }

  const parsedLimit = (() => {
    const value = event.queryStringParameters?.limit || event.queryStringParameters?.max
    if (!value) return NaN
    const num = Number(value)
    return Number.isFinite(num) ? num : NaN
  })()
  const maxRecords = Math.max(
    1,
    Math.min(Number.isNaN(parsedLimit) ? 50 : Math.floor(parsedLimit), 500),
  )
  const pageSize = Math.min(100, maxRecords)
  let cursor = (() => {
    const value = event.queryStringParameters?.cursor
    if (!value) return ''
    return String(value)
  })()
  let total = 0
  let changed = 0
  let migratedCustomer = 0
  let cartFixed = 0

  let processed = 0
  const startedAt = Date.now()
  // Netlify synchronous functions 504 when they run longer than ~10s; enforce a soft cap per invocation.
  const runtimeBudgetMs = Math.max(
    1000,
    (() => {
      const envBudget = Number(process.env.BACKFILL_RUNTIME_LIMIT_MS)
      if (Number.isFinite(envBudget) && envBudget > 0) return envBudget
      return dryRun ? 9000 : 7500
    })(),
  )
  let timedOut = false

  try {
    while (true) {
      const result: any[] = await sanity.fetch(
        `*[_type == "order" && _id > $cursor] | order(_id) {
          _id,
          cart,
          customerRef,
          customer,
          customerEmail,
          slug,
          stripeSessionId,
          orderNumber,
          customerName,
          shippingAddress
        }[0...$limit]`,
        {limit: pageSize, cursor},
      )

      if (!result || result.length === 0) break
      for (const doc of result) {
        total++
        processed++
        const setOps: Record<string, any> = {}
        const unsetOps: string[] = []

        // Migrate customer -> customerRef (remove legacy `customer`)
        if (!doc.customerRef && doc.customer && doc.customer._ref) {
          setOps.customerRef = {_type: 'reference', _ref: doc.customer._ref}
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

        const workingCart = Array.isArray(setOps.cart)
          ? setOps.cart
          : Array.isArray(doc.cart)
            ? doc.cart
            : []
        if (cartNeedsEnrichment(workingCart)) {
          let enrichedCart: any[] | null = null

          if (doc.stripeSessionId) {
            const stripeCart = await loadCartFromStripe(doc.stripeSessionId)
            if (Array.isArray(stripeCart) && stripeCart.length > 0) {
              enrichedCart = normalizeCartItems(workingCart, stripeCart)
            }
          }

          if (!enrichedCart) {
            const cloned = cloneCart(workingCart)
            const fallback = await enrichCartItemsFromSanity(cloned as any, sanity)
            if (hasCartChanged(workingCart, fallback)) {
              enrichedCart = normalizeCartItems(workingCart, fallback)
            }
          }

          if (enrichedCart && hasCartChanged(workingCart, enrichedCart)) {
            setOps.cart = enrichedCart
          }
        }

        if (!doc.customerName) {
          const shippingName = doc?.shippingAddress?.name
            ? String(doc.shippingAddress.name).trim()
            : ''
          if (shippingName) setOps.customerName = shippingName
        }

        if (!doc.orderNumber) {
          const slugCurrent = typeof doc.slug === 'string' ? doc.slug : doc?.slug?.current
          const candidates = [slugCurrent, doc.stripeSessionId, doc._id]
          setOps.orderNumber = await generateUniqueOrderNumber(candidates)
        }

        const slugSource = (
          setOps.orderNumber ||
          doc.orderNumber ||
          doc.stripeSessionId ||
          doc._id ||
          ''
        ).toString()
        const desiredSlug = createOrderSlug(slugSource, doc._id)
        const currentSlug = (() => {
          if (!doc?.slug) return ''
          if (typeof doc.slug === 'string') return doc.slug
          if (typeof doc.slug?.current === 'string') return doc.slug.current
          return ''
        })()
        if (desiredSlug && currentSlug !== desiredSlug) {
          setOps.slug = {_type: 'slug', current: desiredSlug}
        }

        if (Object.keys(setOps).length || unsetOps.length) {
          changed++
          if (!dryRun) {
            try {
              await sanity
                .patch(doc._id)
                .set(setOps)
                .unset(unsetOps)
                .commit({autoGenerateArrayKeys: true})
            } catch (err) {
              console.warn('backfillOrders: failed to patch order', doc._id, err)
            }
          }
          if (setOps.customerRef) migratedCustomer++
          if (setOps.cart) cartFixed++
        }
        if (!dryRun) {
          const resultingCustomerRef =
            (setOps.customerRef && setOps.customerRef._ref) ||
            (doc.customerRef && doc.customerRef._ref) ||
            (doc.customer && doc.customer._ref) ||
            null
          const customerEmail =
            (doc.customerEmail || doc.shippingAddress?.email || '').toString().trim() || undefined
          try {
            await updateCustomerProfileForOrder({
              sanity,
              orderId: doc._id,
              customerId: resultingCustomerRef,
              email: customerEmail,
              shippingAddress: doc.shippingAddress,
            })
          } catch (err) {
            console.warn('backfillOrders: failed to refresh customer profile', err)
          }
        }
        cursor = doc._id

        if (processed >= maxRecords) break
        if (Date.now() - startedAt >= runtimeBudgetMs) {
          timedOut = true
          break
        }
      }
      if (processed >= maxRecords || timedOut) break
      if (result.length < pageSize) break
    }
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: e?.message || 'Backfill failed'}),
    }
  }

  let remainingCustomer = 0
  try {
    remainingCustomer = await sanity.fetch('count(*[_type == "order" && defined(customer)])')
  } catch {}

  return {
    statusCode: 200,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      ok: true,
      dryRun,
      total,
      changed,
      migratedCustomer,
      cartFixed,
      remainingCustomer,
      nextCursor: processed >= maxRecords || timedOut ? cursor : null,
      limit: maxRecords,
      runtimeMs: Date.now() - startedAt,
      timedOut,
    }),
  }
}
