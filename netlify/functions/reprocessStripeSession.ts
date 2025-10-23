import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {createClient} from '@sanity/client'
import {randomUUID} from 'crypto'
import {resolveNetlifyBase, generatePackingSlipAsset} from '../lib/packingSlip'
import {syncOrderToShipStation} from '../lib/shipstation'
import {mapStripeLineItem} from '../lib/stripeCartItem'
import {enrichCartItemsFromSanity} from '../lib/cartEnrichment'
import type {CartItem} from '../lib/cartEnrichment'
import {updateCustomerProfileForOrder} from '../lib/customerSnapshot'
import {buildStripeSummary} from '../lib/stripeSummary'
import {resolveStripeShippingDetails} from '../lib/stripeShipping'

// CORS helper (same pattern used elsewhere)
const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')
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

function idVariants(id?: string): string[] {
  if (!id) return []
  const ids = [id]
  if (id.startsWith('drafts.')) ids.push(id.replace('drafts.', ''))
  else ids.push(`drafts.${id}`)
  return Array.from(new Set(ids))
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
  const core = id
    .toString()
    .trim()
    .replace(/^cs_(?:test|live)_/i, '')
  const digits = core.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function resolveOrderNumber(options: {
  metadataOrderNumber?: string
  invoiceNumber?: string
  fallbackId?: string
}): Promise<string> {
  const candidates = [
    sanitizeOrderNumber(options.metadataOrderNumber),
    sanitizeOrderNumber(options.invoiceNumber),
    candidateFromSessionId(options.fallbackId),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const exists = await sanity.fetch<number>(
      'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
      {num: candidate},
    )
    if (!Number(exists)) return candidate
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

function pickString(...values: Array<any>): string | undefined {
  for (const value of values) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      const trimmed = String(value).trim()
      if (trimmed) return trimmed
    }
  }
  return undefined
}

function buildStudioAddress(
  source: any,
  type: 'billTo' | 'shipTo',
  opts: {fallbackEmail?: string; fallbackName?: string} = {},
): Record<string, any> | undefined {
  if (!source || typeof source !== 'object') return undefined
  const name = pickString(source.name, source.fullName, opts.fallbackName)
  const email = pickString(source.email, opts.fallbackEmail)
  const phone = pickString(source.phone, source.phoneNumber)
  const address_line1 = pickString(source.address_line1, source.addressLine1, source.line1)
  const address_line2 = pickString(source.address_line2, source.addressLine2, source.line2)
  const city_locality = pickString(source.city_locality, source.city)
  const state_province = pickString(source.state_province, source.state, source.region)
  const postal_code = pickString(source.postal_code, source.postalCode, source.zip)
  const country_code = pickString(source.country_code, source.country)
  if (
    !name &&
    !email &&
    !phone &&
    !address_line1 &&
    !address_line2 &&
    !city_locality &&
    !state_province &&
    !postal_code &&
    !country_code
  ) {
    return undefined
  }
  const base: Record<string, any> = {_type: type}
  if (name) base.name = name
  if (email) base.email = email
  if (phone) base.phone = phone
  if (address_line1) base.address_line1 = address_line1
  if (address_line2) base.address_line2 = address_line2
  if (city_locality) base.city_locality = city_locality
  if (state_province) base.state_province = state_province
  if (postal_code) base.postal_code = postal_code
  if (country_code) base.country_code = country_code.toUpperCase()
  return base
}

function computeTaxRateFromAmounts(amountSubtotal?: any, amountTax?: any): number | undefined {
  const sub = Number(amountSubtotal)
  const tax = Number(amountTax)
  if (!Number.isFinite(sub) || sub <= 0) {
    if (Number.isFinite(tax) && tax === 0) return 0
    return undefined
  }
  if (!Number.isFinite(tax) || tax < 0) return undefined
  const pct = (tax / sub) * 100
  return Math.round(pct * 100) / 100
}

function dateStringFrom(value?: any): string | undefined {
  if (!value) return undefined
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return undefined
    return date.toISOString().slice(0, 10)
  } catch {
    return undefined
  }
}

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : (null as any)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const DEBUG_REPROCESS = process.env.DEBUG_REPROCESS === '1'

export const handler: Handler = async () => {
  return {
    statusCode: 400,
    body: 'Not implemented',
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
