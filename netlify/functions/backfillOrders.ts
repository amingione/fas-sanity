/**
 * FIELD MAPPING NOTE
 * This file must conform to:
 * .docs/reports/field-to-api-map.md
 *
 * Do not introduce new field names or mappings
 * without updating and authorizing changes
 * to the canonical field-to-API map.
 */
// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {updateCustomerProfileForOrder} from '../lib/customerSnapshot'
import {randomUUID} from 'crypto'
import Stripe from 'stripe'
import {mapStripeLineItem, sanitizeOrderCartItem} from '../lib/stripeCartItem'
import {enrichCartItemsFromSanity} from '../lib/cartEnrichment'
import {normalizeMetadataEntries} from '@fas/sanity-config/utils/cartItemDetails'
import {requireSanityCredentials} from '../lib/sanityEnv'
import {resolveStripeSecretKey} from '../lib/stripeEnv'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'

type MetadataNormalizationResult = {
  changed: boolean
  hasMetadata: boolean
}

function normalizeMetadataUpgrades(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry): entry is string => Boolean(entry))
  return normalized.length ? Array.from(new Set(normalized)) : []
}

function normalizeCartItemMetadataField(item: Record<string, any>): MetadataNormalizationResult {
  const result: MetadataNormalizationResult = {changed: false, hasMetadata: false}
  if (!item || typeof item !== 'object' || !('metadata' in item)) return result

  const rawMetadata = item.metadata

  if (!rawMetadata) {
    if (rawMetadata !== undefined) {
      delete item.metadata
      result.changed = true
    }
    return result
  }

  if (Array.isArray(rawMetadata) || typeof rawMetadata !== 'object') {
    delete item.metadata
    result.changed = true
    return result
  }

  const metadataObject = rawMetadata as Record<string, unknown>
  const rawSummary =
    typeof metadataObject.option_summary === 'string' ? metadataObject.option_summary : undefined
  const trimmedSummary = rawSummary?.trim() || ''
  const normalizedUpgrades = normalizeMetadataUpgrades(metadataObject.upgrades)

  if (!trimmedSummary && normalizedUpgrades.length === 0) {
    delete item.metadata
    result.changed = true
    return result
  }

  const normalizedMetadata: Record<string, unknown> = {}
  if (trimmedSummary) normalizedMetadata.option_summary = trimmedSummary
  if (normalizedUpgrades.length) normalizedMetadata.upgrades = normalizedUpgrades

  const rawUpgradesArray = Array.isArray(metadataObject.upgrades)
    ? (metadataObject.upgrades as unknown[])
    : []
  const summaryChanged = rawSummary !== normalizedMetadata.option_summary
  const upgradesChanged =
    JSON.stringify(rawUpgradesArray) !== JSON.stringify(normalizedMetadata.upgrades ?? [])
  const extraKeysChanged = Object.keys(metadataObject).some(
    (key) => key !== 'option_summary' && key !== 'upgrades',
  )

  if (summaryChanged || upgradesChanged || extraKeysChanged) {
    item.metadata = normalizedMetadata
    result.changed = true
  }

  result.hasMetadata = true
  return result
}

function hasMetadataSummary(item: any): boolean {
  if (!item || typeof item !== 'object') return false
  const metadata = item.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  const summary = typeof metadata.option_summary === 'string' ? metadata.option_summary.trim() : ''
  if (summary) return true
  if (!Array.isArray(metadata.upgrades)) return false
  return metadata.upgrades.some((entry: unknown) => typeof entry === 'string' && entry.trim())
}

function normalizeNameValue(value?: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed || looksLikeEmail(trimmed)) return ''
  return trimmed
}

function looksLikeEmail(value?: string): boolean {
  if (!value) return false
  return value.includes('@')
}

function deriveCustomerName(doc: any): string | undefined {
  const shippingName = normalizeNameValue(doc?.shippingAddress?.name)
  if (shippingName) return shippingName

  const refFirst = normalizeNameValue(doc?.customerRefFirstName)
  const refLast = normalizeNameValue(doc?.customerRefLastName)
  const combined = [refFirst, refLast].filter(Boolean).join(' ').trim()
  if (combined) return combined

  const legacyName = normalizeNameValue(doc?.customerRefLegacyName)
  if (legacyName) return legacyName

  const refShipping = normalizeNameValue(doc?.customerRefShippingName)
  if (refShipping) return refShipping

  return undefined
}

function normalizeOrigin(value?: string | null): string {
  if (!value) return ''
  return value.trim().replace(/\/+$/, '')
}

function isCheckoutSessionId(sessionId?: string | null): boolean {
  if (!sessionId) return false
  return sessionId.startsWith('cs_')
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

const {
  projectId: SANITY_STUDIO_PROJECT_ID,
  dataset: SANITY_STUDIO_DATASET,
  token: SANITY_API_TOKEN,
} = requireSanityCredentials()

const sanity = createClient({
  projectId: SANITY_STUDIO_PROJECT_ID,
  dataset: SANITY_STUDIO_DATASET,
  apiVersion: '2024-04-10',
  token: SANITY_API_TOKEN,
  useCdn: false,
})

const stripeSecret = resolveStripeSecretKey()
const stripe = stripeSecret ? new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION}) : null

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

  if (
    cloned.metadataEntries &&
    typeof cloned.metadataEntries === 'object' &&
    !Array.isArray(cloned.metadataEntries)
  ) {
    const normalized = normalizeMetadataEntries(cloned.metadataEntries as Record<string, unknown>)
    if (normalized.length) {
      cloned.metadataEntries = normalized.map(({key, value}) => ({
        _type: 'orderCartItemMeta',
        key,
        value,
        source: 'legacy',
      }))
    } else {
      delete cloned.metadataEntries
    }
  }

  // Handle legacy metadata field migration: arrays are moved to metadataEntries,
  // objects without option_summary/upgrades keys are normalized and moved to metadataEntries,
  // and objects with those keys are kept as structured metadata (handled by normalizeCartItemMetadataField below)
  if (Array.isArray(cloned.metadata)) {
    cloned.metadataEntries = cloned.metadata
    delete cloned.metadata
  } else if (
    cloned.metadata &&
    typeof cloned.metadata === 'object' &&
    !Array.isArray(cloned.metadata) &&
    !('option_summary' in cloned.metadata) &&
    !('upgrades' in cloned.metadata)
  ) {
    const normalized = normalizeMetadataEntries(cloned.metadata as Record<string, unknown>)
    if (normalized.length) {
      cloned.metadataEntries = normalized.map(({key, value}) => ({
        _type: 'orderCartItemMeta',
        key,
        value,
        source: 'legacy',
      }))
    }
    delete cloned.metadata
  }

  normalizeCartItemMetadataField(cloned)

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

function normalizeCartItems(
  existing: any[],
  next: any[],
): {items: any[]; metadataUpdated: boolean} {
  let metadataUpdated = false
  const items = next.map((item, index) => {
    const candidate = item && typeof item === 'object' ? {...item} : {_type: 'orderCartItem'}
    const existingKey = existing?.[index]?._key
    const key =
      typeof candidate._key === 'string' && candidate._key
        ? candidate._key
        : typeof existingKey === 'string' && existingKey
          ? existingKey
          : randomUUID()
    const metadataResult = normalizeCartItemMetadataField(candidate)
    if (metadataResult.changed && metadataResult.hasMetadata) {
      metadataUpdated = true
    }
    return {
      _type: 'orderCartItem',
      ...candidate,
      _key: key,
    }
  })
  return {items, metadataUpdated}
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
      item.sku || item.productSlug || item.stripeProductId || item.stripePriceId || item.productRef,
    )
    const hasMetadata =
      (Array.isArray(item.metadata) && item.metadata.length > 0) || hasMetadataSummary(item)
    const expectsVariant =
      Boolean(typeof item.optionSummary === 'string' && item.optionSummary.trim()) ||
      (Array.isArray(item.optionDetails) && item.optionDetails.length > 0)
    const missingVariant =
      expectsVariant &&
      !(typeof item.selectedVariant === 'string' && item.selectedVariant.trim().length > 0)
    const hasUpgrades =
      Array.isArray(item.upgrades) && item.upgrades.some((entry: any) => typeof entry === 'string')
    const missingAddOns = hasUpgrades && (!Array.isArray(item.addOns) || item.addOns.length === 0)
    const missingProductRef = !item.productRef
    return (
      !hasProductPointer || !hasMetadata || missingVariant || missingAddOns || missingProductRef
    )
  })
}

async function loadCartFromStripe(sessionId: string): Promise<any[] | null> {
  if (!stripe || !sessionId || !isCheckoutSessionId(sessionId)) return null
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
    mapped = mapped.map((item) => sanitizeOrderCartItem(item as Record<string, any>))
    return mapped
  } catch (err) {
    console.warn('backfillOrders: failed to load Stripe cart', err)
    return null
  }
}

// NEW: Calculate total package weight from cart items
function calculatePackageWeight(cart: any[]): number {
  if (!Array.isArray(cart) || cart.length === 0) return 0

  const totalWeight = cart.reduce((sum, item) => {
    const weight = Number(item?.weight || 0)
    const quantity = Number(item?.quantity || 1)
    return sum + weight * quantity
  }, 0)

  // Add packaging weight (estimate 1 lb for packaging materials)
  return totalWeight > 0 ? totalWeight + 1 : 0
}

// NEW: Calculate package dimensions (use largest item dimensions or default box)
function calculatePackageDimensions(
  cart: any[],
): {length: number; width: number; height: number} | null {
  if (!Array.isArray(cart) || cart.length === 0) return null

  let maxLength = 0
  let maxWidth = 0
  let maxHeight = 0

  for (const item of cart) {
    const dims = item?.dimensions
    if (dims && typeof dims === 'object') {
      maxLength = Math.max(maxLength, Number(dims.length || 0))
      maxWidth = Math.max(maxWidth, Number(dims.width || 0))
      maxHeight = Math.max(maxHeight, Number(dims.height || 0))
    }
  }

  // If no dimensions found, use default medium box
  if (maxLength === 0 && maxWidth === 0 && maxHeight === 0) {
    return {length: 12, width: 9, height: 6}
  }

  // Add 2 inches to each dimension for packaging
  return {
    length: maxLength + 2,
    width: maxWidth + 2,
    height: maxHeight + 2,
  }
}

async function fetchShippingDetailsFromStripe(sessionId: string): Promise<any> {
  if (!stripe || !sessionId || !isCheckoutSessionId(sessionId)) return null

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['shipping_cost.shipping_rate'],
    })

    // Cast to any to access shipping_details (it exists but isn't in type definition)
    const sessionData = session as any

    if (!sessionData.shipping_details && !session.shipping_cost) return null

    const shippingDetails: any = {}

    // Shipping address from customer_details or shipping_details
    const shippingInfo = sessionData.shipping_details || session.customer_details
    if (shippingInfo?.address) {
      shippingDetails.address = {
        name: shippingInfo.name || session.customer_details?.name || '',
        addressLine1: shippingInfo.address.line1 || '',
        addressLine2: shippingInfo.address.line2 || '',
        city: shippingInfo.address.city || '',
        state: shippingInfo.address.state || '',
        postalCode: shippingInfo.address.postal_code || '',
        country: shippingInfo.address.country || 'US',
      }
    }

    // Shipping cost
    if (session.shipping_cost?.amount_total) {
      shippingDetails.cost = session.shipping_cost.amount_total / 100
    }

    // Shipping rate ID
    if (session.shipping_cost?.shipping_rate) {
      const rateId =
        typeof session.shipping_cost.shipping_rate === 'string'
          ? session.shipping_cost.shipping_rate
          : (session.shipping_cost.shipping_rate as any)?.id
      if (rateId) {
        shippingDetails.shippingRateId = rateId
      }
    }

    // Shipping options (deprecated but may exist in older sessions)
    if (
      sessionData.shipping_options &&
      Array.isArray(sessionData.shipping_options) &&
      sessionData.shipping_options.length > 0
    ) {
      const option = sessionData.shipping_options[0]
      if (option.shipping_rate) {
        shippingDetails.carrier =
          typeof option.shipping_rate === 'string' ? option.shipping_rate : option.shipping_rate?.id
      }
      if (option.shipping_amount) {
        shippingDetails.amount = option.shipping_amount / 100
      }
    }

    return Object.keys(shippingDetails).length > 0 ? shippingDetails : null
  } catch (err) {
    console.warn('backfillOrders: failed to fetch shipping details from Stripe', err)
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
  let shippingBackfilled = 0
  let cardDetailsBackfilled = 0

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
          paymentIntentId,
          orderNumber,
          customerName,
          shippingAddress,
          packageWeight,
          packageDimensions,
          cardBrand,
          cardLast4,
          "customerRefFirstName": customerRef->firstName,
          "customerRefLastName": customerRef->lastName,
          "customerRefLegacyName": customerRef->name,
          "customerRefShippingName": customerRef->shippingAddress.name
        }[0...$limit]`,
        {limit: pageSize, cursor},
      )

      if (!result || result.length === 0) break
      for (const doc of result) {
        total++
        processed++
        const setOps: Record<string, any> = {}
        const unsetOps: string[] = []
        const originalCart = Array.isArray(doc.cart) ? doc.cart : []
        let metadataBackfilledForOrder = false

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
          if (needs) {
            setOps.cart = fixedCart
            const originalHasMetadata = originalCart.some((item: unknown) =>
              hasMetadataSummary(item),
            )
            const updatedHasMetadata = fixedCart.some((item: unknown) => hasMetadataSummary(item))
            if (updatedHasMetadata && !originalHasMetadata) {
              metadataBackfilledForOrder = true
            }
          }
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
              const normalized = normalizeCartItems(workingCart, stripeCart)
              enrichedCart = normalized.items
              metadataBackfilledForOrder = metadataBackfilledForOrder || normalized.metadataUpdated
            }
          }

          if (!enrichedCart) {
            const cloned = cloneCart(workingCart)
            const fallback = await enrichCartItemsFromSanity(cloned as any, sanity)
            if (hasCartChanged(workingCart, fallback)) {
              const normalized = normalizeCartItems(workingCart, fallback)
              enrichedCart = normalized.items
              metadataBackfilledForOrder = metadataBackfilledForOrder || normalized.metadataUpdated
            }
          }

          if (enrichedCart && hasCartChanged(workingCart, enrichedCart)) {
            setOps.cart = enrichedCart
            if (!metadataBackfilledForOrder) {
              const originalHasMetadata = originalCart.some((item: unknown) =>
                hasMetadataSummary(item),
              )
              const updatedHasMetadata = enrichedCart.some((item: unknown) =>
                hasMetadataSummary(item),
              )
              if (updatedHasMetadata && !originalHasMetadata) {
                metadataBackfilledForOrder = true
              }
            }
          }
        }

        // NEW: Backfill package weight and dimensions
        const finalCart = setOps.cart || workingCart
        if (Array.isArray(finalCart) && finalCart.length > 0) {
          if (!doc.packageWeight || doc.packageWeight === 0) {
            const calculatedWeight = calculatePackageWeight(finalCart)
            if (calculatedWeight > 0) {
              setOps.packageWeight = calculatedWeight
            }
          }

          if (!doc.packageDimensions) {
            const calculatedDimensions = calculatePackageDimensions(finalCart)
            if (calculatedDimensions) {
              setOps.packageDimensions = calculatedDimensions
            }
          }
        }

        // NEW: Backfill shipping details from Stripe
        if (stripe && doc.stripeSessionId && (!doc.shippingAddress || !doc.packageWeight)) {
          const shippingDetails = await fetchShippingDetailsFromStripe(doc.stripeSessionId)
          if (shippingDetails) {
            if (shippingDetails.address && !doc.shippingAddress) {
              setOps.shippingAddress = shippingDetails.address
              shippingBackfilled++
            }
          }
        }

        // UPDATED: Backfill card details from Stripe PaymentIntent
        if (stripe && (!doc.cardBrand || !doc.cardLast4) && doc.paymentIntentId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(doc.paymentIntentId, {
              expand: ['latest_charge'],
            })
            const charge =
              pi.latest_charge && typeof pi.latest_charge === 'object'
                ? (pi.latest_charge as Stripe.Charge)
                : null
            const pm = charge?.payment_method_details?.card
            const brand = pm?.brand || (charge?.payment_method_details as any)?.type
            const last4 = pm?.last4
            if (brand && !doc.cardBrand) {
              setOps.cardBrand = brand
              cardDetailsBackfilled++
            }
            if (last4 && !doc.cardLast4) {
              setOps.cardLast4 = last4
            }
          } catch (err) {
            console.warn('backfillOrders: failed to fetch card details', err)
          }
        }

        const rawCustomerName = typeof doc.customerName === 'string' ? doc.customerName.trim() : ''
        const hasValidCustomerName = rawCustomerName.length > 0 && !looksLikeEmail(rawCustomerName)

        if (!hasValidCustomerName) {
          const derivedName = deriveCustomerName(doc)
          if (derivedName) {
            setOps.customerName = derivedName
          } else if (rawCustomerName && looksLikeEmail(rawCustomerName)) {
            setOps.customerName = null
          }
        }

        const slugCurrent = typeof doc.slug === 'string' ? doc.slug : doc?.slug?.current
        const orderNumberCandidates = [doc.orderNumber, slugCurrent, doc.stripeSessionId, doc._id]
        const normalizedOrderNumber = orderNumberCandidates
          .map((candidate) => sanitizeOrderNumber(candidate))
          .find((candidate): candidate is string => Boolean(candidate))

        if (!doc.orderNumber && normalizedOrderNumber) {
          setOps.orderNumber = await generateUniqueOrderNumber([normalizedOrderNumber])
        } else if (
          doc.orderNumber &&
          normalizedOrderNumber &&
          normalizedOrderNumber !== doc.orderNumber
        ) {
          setOps.orderNumber = await generateUniqueOrderNumber([normalizedOrderNumber])
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
              if (metadataBackfilledForOrder) {
                console.log(
                  'Backfilled order:',
                  doc._id,
                  setOps.orderNumber || doc.orderNumber || '',
                )
              }
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
              shippingAddress: setOps.shippingAddress || doc.shippingAddress,
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
      shippingBackfilled,
      cardDetailsBackfilled,
      remainingCustomer,
      nextCursor: processed >= maxRecords || timedOut ? cursor : null,
      limit: maxRecords,
      runtimeMs: Date.now() - startedAt,
      timedOut,
    }),
  }
}
