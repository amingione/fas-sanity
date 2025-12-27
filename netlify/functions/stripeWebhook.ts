// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
/* eslint-disable typescript/no-unused-vars */
import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import type {CartItem, CartProductSummary} from '../lib/cartEnrichment'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {randomUUID} from 'crypto'
import {logFunctionExecution} from '../../utils/functionLogger'
import {computeCustomerName, splitFullName} from '../../shared/customerName'
import {generatePackingSlipAsset} from '../lib/packingSlip'
import {mapStripeLineItem, type CartMetadataEntry} from '../lib/stripeCartItem'
import {
  enrichCartItemsFromSanity,
  computeShippingMetrics,
  fetchProductsForCart,
  findProductForItem,
} from '../lib/cartEnrichment'
import {updateCustomerProfileForOrder} from '../lib/customerSnapshot'
import {
  buildStripeSummary,
  parseStripeSummaryData,
  serializeStripeSummaryData,
} from '../lib/stripeSummary'
import {resolveStripeShippingDetails} from '../lib/stripeShipping'
import {
  normalizeMetadataEntries,
  deriveOptionsFromMetadata,
  remainingMetadataEntries,
  coerceStringArray,
  resolveUpgradeTotal,
  normalizeOptionSelections,
  uniqueStrings,
  sanitizeCartItemName,
} from '@fas/sanity-config/utils/cartItemDetails'
import {
  hydrateDiscountResources,
  removeCustomerDiscountRecord,
  syncCustomerDiscountRecord,
} from '../lib/customerDiscounts'
import {
  buildAttributionDocument,
  extractAttributionFromMetadata,
  hasAttributionData,
  AttributionParams,
} from '../lib/attribution'
import {reserveInventoryForItems} from '../../shared/inventory'
import {runOrderPlacedAutomations} from '../lib/emailAutomations'
import {
  applyShippingDetailsToDoc,
  deriveFulfillmentFromMetadata,
} from '../lib/fulfillmentFromMetadata'
import {
  simplifyCartForAbandonedCheckout,
  buildAbandonedCartSummary,
  upsertAbandonedCheckoutDocument,
  markAbandonedCheckoutRecovered,
} from '../lib/abandonedCheckouts'
import {resolveStripeSecretKey, STRIPE_SECRET_ENV_KEYS} from '../lib/stripeEnv'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'
import {resolveResendApiKey} from '../../shared/resendEnv'
import {
  linkCheckoutSessionToCustomer,
  linkInvoiceToCustomer,
  linkOrderToCustomer,
  linkOrderToInvoice,
} from '../lib/referenceIntegrity'

function cleanCartItemForStorage(item: CartItem): CartItem {
  const normalizeAddOnLabel = (value: string): string | undefined => {
    if (!value) return undefined
    let label = value.trim()
    if (!label) return undefined
    // If it contains multiple colons, keep the last meaningful segment
    if (/:/.test(label)) {
      const parts = label
        .split(':')
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length > 1) {
        label = parts[parts.length - 1]
      }
    }
    label = label.replace(/^option\s*\d*\s*:?\s*/i, '').trim()
    label = label.replace(/^(upgrade|add[-\s]?on)s?\s*:?\s*/i, '').trim()
    label = label
      .replace(/\s*[-–—]?\s*\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:usd|dollars))?$/i, '')
      .replace(/\s*\(\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*\)\s*$/i, '')
      .trim()
    if (!label) return undefined
    return label
  }

  const parseNumericValue = (value?: string | null): number | undefined => {
    if (!value) return undefined
    const match = value.match(/-?\$?\s*([\d,]+(?:\.\d+)?)/)
    if (!match?.[1]) return undefined
    const parsed = Number.parseFloat(match[1].replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const selectedVariant =
    normalizeAddOnLabel((item as any).selectedVariant) ||
    normalizeAddOnLabel(
      item.optionDetails
        ?.find((opt: string) => !opt.toLowerCase().includes('upgrade'))
        ?.split(':')
        .pop() || '',
    )

  const rawUpgrades =
    (Array.isArray(item.upgrades) && item.upgrades.length
      ? item.upgrades
      : Array.isArray(item.optionDetails)
        ? item.optionDetails.filter((opt) => typeof opt === 'string' && /upgrade/i.test(opt))
        : []) || []

  const upgradeCosts = rawUpgrades
    .map((upgrade) => parseNumericValue(upgrade))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

  const cleanAddOns = Array.from(
    new Set(
      [...rawUpgrades, ...(Array.isArray(item.addOns) ? item.addOns : [])]
        .map((upgrade: string) => normalizeAddOnLabel(upgrade))
        .filter((v): v is string => Boolean(v)),
    ),
  )

  const quantity = typeof item.quantity === 'number' ? item.quantity : 1
  const unitPrice = typeof item.price === 'number' ? item.price : 0
  const derivedUpgradeTotal =
    typeof item.upgradesTotal === 'number' && Number.isFinite(item.upgradesTotal)
      ? item.upgradesTotal
      : typeof item.total === 'number' && Number.isFinite(item.total)
        ? Math.max(0, item.total - unitPrice * quantity)
        : undefined
  const upgradesTotal =
    typeof derivedUpgradeTotal === 'number'
      ? derivedUpgradeTotal
      : upgradeCosts.length
        ? upgradeCosts.reduce((a, b) => a + b, 0)
        : 0
  const lineTotal =
    typeof item.total === 'number' && Number.isFinite(item.total)
      ? item.total
      : typeof item.lineTotal === 'number' && Number.isFinite(item.lineTotal)
        ? item.lineTotal
        : unitPrice * quantity + upgradesTotal

  const cleanedName =
    sanitizeCartItemName(item.name) ||
    sanitizeCartItemName((item as any).productName) ||
    sanitizeCartItemName((item as any).description) ||
    sanitizeCartItemName((item as any).productSlug) ||
    sanitizeCartItemName(item.sku) ||
    'Order item'

  return {
    _type: 'orderCartItem',
    _key: (item as any)._key || randomUUID(),
    name: cleanedName,
    productRef: (item as any).productRef,
    id: (item as any).id,
    sku: item.sku,
    image: (item as any).image,
    productUrl: (item as any).productUrl,
    quantity,
    price: unitPrice,
    total: lineTotal,
    lineTotal,
    selectedVariant,
    addOns: cleanAddOns.length ? cleanAddOns : undefined,
    optionDetails: item.optionDetails || undefined,
    optionSummary: item.optionSummary || undefined,
    upgrades: item.upgrades || undefined,
    upgradesTotal: upgradesTotal > 0 ? upgradesTotal : undefined,
    productSlug: (item as any).productSlug,
    stripePriceId: (item as any).stripePriceId,
    stripeProductId: (item as any).stripeProductId,
    metadataEntries: (item as any).metadataEntries || undefined,
    metadata:
      item.optionSummary || (item.upgrades && item.upgrades.length)
        ? {
            option_summary: item.optionSummary || undefined,
            upgrades: item.upgrades || undefined,
          }
        : undefined,
  }
}

// Netlify delivers body as string; may be base64-encoded
function getRawBody(event: any): Buffer {
  const body = event.body || ''
  if (event.isBase64Encoded) return Buffer.from(body, 'base64')
  return Buffer.from(body)
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
const QUOTE_NUMBER_PREFIX = 'QT'

const FAILED_CHECKOUT_PAYMENT_STATUSES = new Set([
  'failed',
  'unpaid',
  'requires_payment_method',
  'requires_action',
  'requires_customer_action',
  'requires_source',
  'requires_source_action',
  'requires_confirmation',
])

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function normalizeOrderNumberForStorage(value?: string | null): string | undefined {
  const sanitized = sanitizeOrderNumber(value)
  if (sanitized) return sanitized
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  return trimmed || undefined
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

async function customerIsVendor(customerId?: string | null): Promise<boolean> {
  if (!customerId) return false
  try {
    const customer = await sanity.fetch<{customerType?: string; roles?: string[]}>(
      `*[_type == "customer" && _id == $id][0]{customerType, roles}`,
      {id: customerId},
    )
    const type = customer?.customerType || ''
    const roles = Array.isArray(customer?.roles) ? customer?.roles : []
    if (type === 'vendor' || type === 'both') return true
    if (roles.includes('vendor')) return true
    return false
  } catch (error) {
    console.warn('stripeWebhook: failed to resolve customer vendor status', error)
    return false
  }
}

async function maybeApplyWholesaleOrderType(orderId?: string | null, customerId?: string | null) {
  if (!orderId || !customerId) return
  if (!(await customerIsVendor(customerId))) return
  try {
    await sanity.patch(orderId).set({orderType: 'wholesale'}).commit({autoGenerateArrayKeys: true})
  } catch (error) {
    console.warn('stripeWebhook: failed to tag wholesale order', error)
  }
}

async function generateRandomOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${ORDER_NUMBER_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    try {
      const existing = await sanity.fetch<number>(
        'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
        {num: candidate},
      )
      if (!Number(existing)) return candidate
    } catch (err) {
      console.warn('stripeWebhook: order number uniqueness check failed', err)
      return candidate
    }
  }
  return `${ORDER_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
}

function sanitizeQuoteNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^QT-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${QUOTE_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

async function generateRandomQuoteNumber(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomValue = Math.floor(Math.random() * 1_000_000)
    const candidate = `${QUOTE_NUMBER_PREFIX}-${randomValue.toString().padStart(6, '0')}`
    try {
      const existing = await sanity.fetch<number>(
        'count(*[_type == "quote" && quoteNumber == $num])',
        {num: candidate},
      )
      if (!Number(existing)) return candidate
    } catch (err) {
      console.warn('stripeWebhook: quote number uniqueness check failed', err)
      return candidate
    }
  }
  return `${QUOTE_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
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
  if (candidates.length > 0) return candidates[0]
  return generateRandomOrderNumber()
}

type EventRecordInput = {
  eventType: string
  status?: string
  label?: string
  message?: string
  amount?: number
  currency?: string
  stripeEventId?: string
  metadata?: Record<string, unknown> | null
  occurredAt?: number | string | null
}

const safeJsonStringify = (value: unknown, maxLength = 15000): string | undefined => {
  if (!value) return undefined

  try {
    const json = JSON.stringify(value, null, 2)
    if (!json) return undefined
    if (json.length > maxLength) return `${json.slice(0, maxLength - 3)}...`
    return json
  } catch {
    return undefined
  }
}

const toIsoTimestamp = (value?: number | string | null): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 10_000_000_000) return new Date(value).toISOString()
    return new Date(value * 1000).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return toIsoTimestamp(parsed)
    }
    return new Date(value).toISOString()
  }
  return new Date().toISOString()
}

const isoDateOnly = (iso?: string | null): string | undefined => {
  if (!iso) return undefined
  const trimmed = iso.toString().trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, 10)
}

const isoDateFromUnix = (value?: number | null): string | undefined => {
  const iso = unixToIso(value)
  return isoDateOnly(iso)
}
function pruneUndefined<T extends Record<string, any>>(input: T): T {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result as T
}

function firstString(values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function summarizeEventType(eventType?: string): string {
  if (!eventType) return 'Processed event'
  const friendly = eventType.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!friendly) return 'Processed event'
  return friendly.charAt(0).toUpperCase() + friendly.slice(1)
}

type ComputedShippingMetrics = ReturnType<typeof computeShippingMetrics>

const resolveCartItemQuantity = (value: unknown): number => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 1
  return Math.max(1, Math.round(num))
}

const deriveWeightFromProducts = (
  cart: CartItem[],
  products: CartProductSummary[],
): number | null => {
  if (!Array.isArray(cart) || !Array.isArray(products) || !products.length) return null
  let total = 0
  let found = false
  for (const item of cart) {
    if (!item || typeof item !== 'object') continue
    const product = findProductForItem(item, products)
    if (!product) continue
    const rawWeight =
      typeof product.shippingConfig?.weight === 'number' && product.shippingConfig.weight > 0
        ? product.shippingConfig.weight
        : typeof product.shippingWeight === 'number' && product.shippingWeight > 0
          ? product.shippingWeight
          : null
    if (!rawWeight) continue
    const qty = resolveCartItemQuantity((item as any)?.quantity)
    total += rawWeight * qty
    found = true
  }
  if (!found) return null
  return Number(total.toFixed(2))
}

const deriveDimensionsFromProducts = (
  cart: CartItem[],
  products: CartProductSummary[],
): {length: number; width: number; height: number} | null => {
  if (!Array.isArray(cart) || !Array.isArray(products) || !products.length) return null
  let maxLength = 0
  let maxWidth = 0
  let stackedHeight = 0
  let hasDimensions = false
  for (const item of cart) {
    if (!item || typeof item !== 'object') continue
    const product = findProductForItem(item, products)
    if (!product) continue
    const dims = product.shippingConfig?.dimensions
    if (!dims) continue
    const length = typeof dims.length === 'number' && dims.length > 0 ? dims.length : null
    const width = typeof dims.width === 'number' && dims.width > 0 ? dims.width : null
    const height = typeof dims.height === 'number' && dims.height > 0 ? dims.height : null
    if (length === null || width === null || height === null) continue
    const qty = resolveCartItemQuantity((item as any)?.quantity)
    maxLength = Math.max(maxLength, length)
    maxWidth = Math.max(maxWidth, width)
    stackedHeight += height * qty
    hasDimensions = true
  }
  if (!hasDimensions || maxLength <= 0 || maxWidth <= 0 || stackedHeight <= 0) return null
  return {
    length: Number(maxLength.toFixed(2)),
    width: Number(maxWidth.toFixed(2)),
    height: Number(stackedHeight.toFixed(2)),
  }
}

function ensureShippingMetricsFromProducts(
  metrics: ComputedShippingMetrics | null | undefined,
  cart: CartItem[],
  products: CartProductSummary[],
): ComputedShippingMetrics {
  const next: ComputedShippingMetrics = metrics ? {...metrics} : {}
  if (!next.weight || !next.weight.value || next.weight.value <= 0) {
    const fallbackWeight = deriveWeightFromProducts(cart, products)
    if (fallbackWeight) {
      next.weight = {_type: 'shipmentWeight', value: fallbackWeight, unit: 'pound'}
    }
  }
  if (!next.dimensions) {
    const fallbackDimensions = deriveDimensionsFromProducts(cart, products)
    if (fallbackDimensions) {
      next.dimensions = {_type: 'packageDimensions', ...fallbackDimensions}
    }
  }
  return next
}

function applyShippingMetrics(
  target: Record<string, any>,
  metrics: ComputedShippingMetrics | null | undefined,
) {
  if (!metrics) return
  if (metrics.weight) target.weight = metrics.weight
  if (metrics.dimensions) target.dimensions = metrics.dimensions
}

function applyPackageDimensions(
  target: Record<string, any>,
  metrics: ComputedShippingMetrics | null | undefined,
  weightOverride?: number,
) {
  if (!metrics) return
  const existing = (target.fulfillment as any)?.packageDimensions || {}
  const length = metrics.dimensions?.length || existing.length
  const width = metrics.dimensions?.width || existing.width
  const height = metrics.dimensions?.height || existing.height
  const weight = weightOverride ?? metrics.weight?.value ?? existing.weight
  const unit = existing.weightUnit || 'lb'
  const weightLabel =
    weight !== undefined && Number.isFinite(weight)
      ? `${Number(weight.toFixed(2))} ${unit}`
      : existing.weightDisplay
  const dimensionsLabel =
    length || width || height
      ? [length, width, height]
          .map((v) => (Number.isFinite(v as number) ? Number((v as number).toFixed(2)) : ''))
          .filter((v) => v !== '')
          .join(' x ') + (length || width || height ? ' in' : '')
      : existing.dimensionsDisplay
  if (length === undefined && width === undefined && height === undefined && weight === undefined) {
    return
  }

  const next = {
    ...existing,
    ...(length !== undefined ? {length} : {}),
    ...(width !== undefined ? {width} : {}),
    ...(height !== undefined ? {height} : {}),
    ...(weight !== undefined ? {weight} : {}),
    weightUnit: unit,
    dimensionUnit: 'in',
    ...(weightLabel ? {weightDisplay: weightLabel} : {}),
    ...(dimensionsLabel ? {dimensionsDisplay: dimensionsLabel} : {}),
  }

  if (!target.fulfillment) target.fulfillment = {status: 'unfulfilled'}
  if (typeof target.fulfillment !== 'object') return
  ;(target.fulfillment as any).packageDimensions = next
}

const parsePounds = (value?: string | number | null): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value)
  if (typeof value !== 'string') return undefined
  const match = value.match(/([\d.]+)/)
  if (!match?.[1]) return undefined
  const parsed = Number.parseFloat(match[1])
  return Number.isFinite(parsed) ? parsed : undefined
}

function resolveShippingWeightLbs(
  session?: Stripe.Checkout.Session | null,
  meta?: Record<string, string>,
): number | undefined {
  const metaSource = meta || ((session?.metadata || {}) as Record<string, string>)
  const candidates: Array<string | number | null | undefined> = [
    (session as any)?.shipping_total_weight_lbs,
    metaSource['shipping_total_weight_lbs'],
    metaSource['shipping_total_weight'],
    metaSource['shipping_weight_lbs'],
    metaSource['shipping_weight'],
    (session as any)?.shipping_summary,
  ]
  for (const candidate of candidates) {
    const parsed = parsePounds(candidate as any)
    if (parsed !== undefined) return parsed
    if (typeof candidate === 'string' && candidate) {
      const summaryMatch = candidate.match(/total\s*=\s*([\d.]+)\s*lb/i)
      if (summaryMatch?.[1]) {
        const summaryParsed = Number.parseFloat(summaryMatch[1])
        if (Number.isFinite(summaryParsed)) return summaryParsed
      }
    }
  }
  return undefined
}

type StripeContactInfo = {
  name?: string | null
  email?: string | null
  phone?: string | null
}

type NormalizedContactAddress = {
  name?: string
  email?: string
  phone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

function normalizeStripeContactAddress(
  address?: Stripe.Address | null,
  contact?: StripeContactInfo,
): NormalizedContactAddress | undefined {
  if (!address) return undefined
  const normalized: NormalizedContactAddress = {}
  if (contact?.name) normalized.name = contact.name
  if (contact?.email) normalized.email = contact.email
  if (contact?.phone) normalized.phone = contact.phone
  if (address.line1) normalized.addressLine1 = address.line1
  if (address.line2) normalized.addressLine2 = address.line2
  if (address.city) normalized.city = address.city
  if (address.state) normalized.state = address.state
  if (address.postal_code) normalized.postalCode = address.postal_code
  if (address.country) normalized.country = address.country
  return normalized
}

function extractCompleteShippingAddress(
  session: Stripe.Checkout.Session,
  stripeSummary?: any,
  fallbackEmail?: string | null,
): NormalizedContactAddress | undefined {
  const summary = parseStripeSummaryData(stripeSummary)
  if (summary?.shippingAddress) {
    const addr = summary.shippingAddress
    return {
      name: addr.name || session.customer_details?.name || '',
      email: addr.email || session.customer_details?.email || fallbackEmail || '',
      phone: addr.phone || session.customer_details?.phone || '',
      addressLine1: addr.line1 || addr.addressLine1 || '',
      addressLine2: addr.line2 || addr.addressLine2 || '',
      city: addr.city || '',
      state: addr.state || '',
      postalCode: addr.postal_code || addr.postalCode || '',
      country: addr.country || 'US',
    }
  }

  const shippingDetails = (session as any)?.shipping_details
  if (shippingDetails?.address) {
    return {
      name: shippingDetails.name || session.customer_details?.name || '',
      email: session.customer_details?.email || fallbackEmail || '',
      phone: session.customer_details?.phone || '',
      addressLine1: shippingDetails.address.line1 || '',
      addressLine2: shippingDetails.address.line2 || '',
      city: shippingDetails.address.city || '',
      state: shippingDetails.address.state || '',
      postalCode: shippingDetails.address.postal_code || '',
      country: shippingDetails.address.country || 'US',
    }
  }

  if (session.customer_details?.address) {
    return {
      name: session.customer_details.name || '',
      email: session.customer_details.email || fallbackEmail || '',
      phone: session.customer_details.phone || '',
      addressLine1: session.customer_details.address.line1 || '',
      addressLine2: session.customer_details.address.line2 || '',
      city: session.customer_details.address.city || '',
      state: session.customer_details.address.state || '',
      postalCode: session.customer_details.address.postal_code || '',
      country: session.customer_details.address.country || 'US',
    }
  }

  return undefined
}

function resolveStripeCustomerId(
  value?: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') {
    return value.trim() || undefined
  }
  if (typeof value === 'object' && typeof (value as Stripe.Customer).id === 'string') {
    const id = (value as Stripe.Customer).id
    return id ? id.trim() || undefined : undefined
  }
  return undefined
}

async function ensureCustomerStripeDetails(options: {
  customerId?: string | null
  stripeCustomerId?: string | null
  billingAddress?: NormalizedContactAddress | undefined
}): Promise<void> {
  const customerId = options.customerId
  if (!customerId) return
  const patch: Record<string, any> = {}
  if (options.stripeCustomerId) patch.stripeCustomerId = options.stripeCustomerId
  if (options.billingAddress) patch.billingAddress = options.billingAddress
  patch.stripeLastSyncedAt = new Date().toISOString()
  if (!options.stripeCustomerId && !options.billingAddress && Object.keys(patch).length <= 1) {
    return
  }
  try {
    await sanity.patch(customerId).set(patch).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to upsert customer Stripe metadata', err)
  }
}

async function findInvoiceDocumentIdForEvent(input: {
  metadata?: Record<string, any> | null
  stripeInvoiceId?: string
  invoiceNumber?: string
  paymentIntentId?: string | null
}): Promise<string | null> {
  const metadata = (input.metadata || {}) as Record<string, string>
  const metaId = INVOICE_METADATA_ID_KEYS.map((key) => normalizeSanityId(metadata[key])).find(
    Boolean,
  )
  if (metaId) {
    const docId = await sanity.fetch<string | null>(`*[_type == "invoice" && _id in $ids][0]._id`, {
      ids: idVariants(metaId),
    })
    if (docId) return docId
  }

  if (input.stripeInvoiceId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && stripeInvoiceId == $id][0]._id`,
      {id: input.stripeInvoiceId},
    )
    if (docId) return docId
  }

  const metaNumber = firstString(
    INVOICE_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
  )
  const invoiceNumber = metaNumber || input.invoiceNumber
  if (invoiceNumber) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && invoiceNumber == $num][0]._id`,
      {num: invoiceNumber},
    )
    if (docId) return docId
  }

  if (input.paymentIntentId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && paymentIntentId == $pi][0]._id`,
      {pi: input.paymentIntentId},
    )
    if (docId) return docId
  }

  return null
}

async function findOrderDocumentIdForEvent(input: {
  metadata?: Record<string, any> | null
  paymentIntentId?: string | null
  chargeId?: string | null
  sessionId?: string | null
  invoiceDocId?: string | null
  invoiceNumber?: string | null
}): Promise<string | null> {
  const metadata = (input.metadata || {}) as Record<string, string>
  const metaId = ORDER_METADATA_ID_KEYS.map((key) => normalizeSanityId(metadata[key])).find(Boolean)
  if (metaId) {
    const docId = await sanity.fetch<string | null>(`*[_type == "order" && _id in $ids][0]._id`, {
      ids: idVariants(metaId),
    })
    if (docId) return docId
  }

  if (input.invoiceDocId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "order" && invoiceRef._ref == $invoiceId][0]._id`,
      {invoiceId: input.invoiceDocId},
    )
    if (docId) return docId
  }

  const tryOrderNumberLookup = async (candidate?: string | null): Promise<string | null> => {
    if (!candidate) return null
    const trimmed = candidate.toString().trim()
    if (!trimmed) return null
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "order" && orderNumber == $num][0]._id`,
        {num: trimmed},
      )
      return docId || null
    } catch (err) {
      console.warn('stripeWebhook: failed order lookup by number', err)
      return null
    }
  }

  const metaOrderNumber = firstString(
    ORDER_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
  )
  const invoiceNumber = input.invoiceNumber || metaOrderNumber
  if (invoiceNumber) {
    const docId =
      (await tryOrderNumberLookup(invoiceNumber)) ||
      (await tryOrderNumberLookup(sanitizeOrderNumber(invoiceNumber)))
    if (docId) return docId
  }

  if (input.paymentIntentId || input.chargeId || input.sessionId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "order" && (
        ($pi != '' && paymentIntentId == $pi) ||
        ($charge != '' && chargeId == $charge) ||
        ($session != '' && stripeSessionId == $session)
      )][0]._id`,
      {
        pi: input.paymentIntentId || '',
        charge: input.chargeId || '',
        session: input.sessionId || '',
      },
    )
    if (docId) return docId
  }

  return null
}

async function recordStripeWebhookEvent(options: {
  event: Stripe.Event
  status: 'processed' | 'ignored' | 'error'
  summary?: string
}): Promise<void> {
  const {event, status, summary} = options
  if (!event?.id) return

  const payload = event.data?.object as Record<string, any> | undefined
  const metadata = (payload?.metadata || {}) as Record<string, string>

  const paymentIntentId = (() => {
    if (!payload) return undefined
    const raw = payload.payment_intent
    if (typeof raw === 'string') return raw
    if (raw && typeof raw === 'object' && typeof raw.id === 'string') return raw.id
    return undefined
  })()

  const chargeId = (() => {
    if (!payload) return undefined
    const raw = payload.charge
    if (typeof raw === 'string') return raw
    if (raw && typeof raw === 'object' && typeof raw.id === 'string') return raw.id
    const latestCharge = payload.latest_charge
    if (typeof latestCharge === 'string') return latestCharge
    if (latestCharge && typeof latestCharge === 'object' && typeof latestCharge.id === 'string') {
      return latestCharge.id
    }
    return undefined
  })()

  const sessionId = (() => {
    const candidates: Array<unknown> = SESSION_METADATA_KEYS.map((key) => metadata[key])
    candidates.push((payload as any)?.checkout_session)
    candidates.push((payload as any)?.session)
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return undefined
  })()

  const invoiceNumberCandidate = (() => {
    if (typeof payload?.number === 'string' && payload.number.trim()) {
      return payload.number.trim()
    }
    const metaNumber = firstString(
      INVOICE_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
    )
    if (metaNumber) return metaNumber
    const orderNumberMeta = firstString(
      ORDER_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
    )
    return orderNumberMeta
  })()

  const invoiceDocId = await findInvoiceDocumentIdForEvent({
    metadata,
    stripeInvoiceId:
      payload && payload.object === 'invoice' && typeof payload.id === 'string'
        ? payload.id
        : undefined,
    invoiceNumber: invoiceNumberCandidate,
    paymentIntentId: paymentIntentId || null,
  })

  const orderDocId = await findOrderDocumentIdForEvent({
    metadata,
    paymentIntentId: paymentIntentId || null,
    chargeId: chargeId || null,
    sessionId: sessionId || null,
    invoiceDocId,
    invoiceNumber: invoiceNumberCandidate || null,
  })

  const metadataString =
    metadata && Object.keys(metadata).length > 0 ? safeJsonStringify(metadata) : undefined
  const rawPayload = payload ? safeJsonStringify(payload) : undefined
  const summaryText = summary || `Processed ${event.type}`

  const orderNumber = firstString(
    ORDER_METADATA_NUMBER_KEYS.map((key) => metadata[key as keyof typeof metadata]),
  )

  const document = pruneUndefined({
    _id: `${WEBHOOK_DOCUMENT_PREFIX}${event.id}`,
    _type: 'stripeWebhook',
    stripeEventId: event.id,
    eventType: event.type,
    status,
    summary: summaryText,
    occurredAt: toIsoTimestamp(event.created),
    processedAt: new Date().toISOString(),
    resourceType: typeof payload?.object === 'string' ? payload.object : undefined,
    resourceId: typeof payload?.id === 'string' ? payload.id : undefined,
    invoiceNumber: invoiceNumberCandidate,
    invoiceStatus: typeof payload?.status === 'string' ? payload.status : undefined,
    paymentIntentId,
    chargeId,
    customerId:
      typeof payload?.customer === 'string'
        ? payload.customer
        : payload?.customer && typeof payload.customer === 'object'
          ? (payload.customer as {id?: string}).id
          : undefined,
    requestId:
      typeof event.request === 'string'
        ? event.request
        : (event.request as Stripe.Event.Request | null | undefined)?.id,
    livemode: event.livemode ?? undefined,
    orderNumber,
    metadata: metadataString,
    rawPayload,
    orderId: orderDocId || undefined,
    invoiceId: invoiceDocId || undefined,
    orderRef: orderDocId ? {_type: 'reference', _ref: orderDocId} : undefined,
    invoiceRef: invoiceDocId ? {_type: 'reference', _ref: invoiceDocId} : undefined,
  })

  try {
    await webhookSanityClient.createOrReplace(document, {autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to record webhook event', err)
  }
}

const buildOrderEventRecord = (input: EventRecordInput) => {
  const event: Record<string, any> = {
    _type: 'orderEvent',
    _key: randomUUID(),
    type: input.eventType,
    createdAt: toIsoTimestamp(input.occurredAt),
  }
  if (input.status) event.status = input.status
  if (input.label) event.label = input.label
  if (input.message) event.message = input.message
  if (typeof input.amount === 'number' && Number.isFinite(input.amount)) event.amount = input.amount
  if (input.currency) event.currency = input.currency.toUpperCase()
  if (input.stripeEventId) event.stripeEventId = input.stripeEventId
  const metadataString = safeJsonStringify(input.metadata)
  if (metadataString) event.metadata = metadataString
  return event
}

const appendEventsToDocument = async (
  docId: string | null | undefined,
  field: string,
  events: Array<Record<string, any>>,
) => {
  if (!docId || !events.length) return
  try {
    await sanity
      .patch(docId)
      .setIfMissing({[field]: []})
      .append(field, events)
      .commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn(`stripeWebhook: failed to append ${field} on ${docId}`, err)
  }
}

const appendOrderEvent = async (
  orderId: string | null | undefined,
  event: EventRecordInput,
): Promise<void> => {
  if (!orderId) return
  await appendEventsToDocument(orderId, 'orderEvents', [buildOrderEventRecord(event)])
}

const autoReserveInventoryForOrder = async (
  orderId: string | null | undefined,
  items: CartItem[] | undefined,
  orderNumber?: string | null,
) => {
  if (!orderId || !Array.isArray(items) || items.length === 0) return
  const payload = items
    .filter((item): item is CartItem => Boolean(item?.productRef?._ref))
    .map((item) => ({
      productRef: item.productRef,
      quantity: item.quantity,
      name: item.name,
    }))
  if (!payload.length) return
  try {
    const result = await reserveInventoryForItems({
      client: sanity,
      items: payload,
      referenceDocId: orderId,
      referenceLabel: orderNumber || undefined,
      createdBy: 'stripeWebhook',
    })
    if (result.insufficient.length || result.missing.length) {
      const messages = [
        ...result.insufficient.map(
          (entry) =>
            `${entry.productTitle || entry.productId || 'Item'} needs ${entry.required} | available ${entry.available}`,
        ),
        ...result.missing.map((entry) => entry.reason || 'Missing inventory record'),
      ]
      await appendOrderEvent(orderId, {
        eventType: 'inventory.reservation',
        status: 'insufficient',
        label: 'Inventory reservation issue',
        message: messages.join(' • '),
      })
    } else {
      await appendOrderEvent(orderId, {
        eventType: 'inventory.reservation',
        status: 'reserved',
        label: 'Inventory reserved',
        message: `Reserved ${payload.length} line items`,
      })
    }
  } catch (error) {
    console.warn('stripeWebhook: autoReserveInventoryForOrder failed', error)
    try {
      await appendOrderEvent(orderId, {
        eventType: 'inventory.reservation',
        status: 'error',
        label: 'Inventory reservation error',
        message: (error as Error)?.message,
      })
    } catch {
      // ignore logging failure
    }
  }
}

type StripeWebhookCategory = 'source' | 'person' | 'issuing_dispute'

const humanizeSegments = (value: string) =>
  value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')

const recordStripeWebhookResourceEvent = async (
  webhookEvent: Stripe.Event,
  category: StripeWebhookCategory,
): Promise<void> => {
  try {
    const dataObject = webhookEvent.data?.object as Record<string, any> | null
    const metadataString =
      dataObject && typeof dataObject === 'object' && 'metadata' in dataObject
        ? safeJsonStringify((dataObject as any).metadata, 6000)
        : undefined
    const dataSnapshot = dataObject ? safeJsonStringify(dataObject, 12000) : undefined
    const payloadSnapshot = safeJsonStringify(webhookEvent, 15000)
    const resourceId =
      dataObject && typeof dataObject === 'object' && typeof (dataObject as any).id === 'string'
        ? (dataObject as any).id
        : undefined
    const resourceType =
      dataObject && typeof dataObject === 'object' && typeof (dataObject as any).object === 'string'
        ? (dataObject as any).object
        : undefined
    let status: string | undefined
    if (dataObject && typeof dataObject === 'object') {
      const candidateStatus = (dataObject as any).status
      if (typeof candidateStatus === 'string') {
        status = candidateStatus
      } else if (typeof (dataObject as any).verification?.status === 'string') {
        status = (dataObject as any).verification.status
      }
    }
    const amount =
      dataObject && typeof (dataObject as any).amount === 'number'
        ? (dataObject as any).amount
        : undefined
    const currency =
      dataObject && typeof (dataObject as any).currency === 'string'
        ? (dataObject as any).currency.toUpperCase()
        : undefined
    const requestId =
      typeof webhookEvent.request === 'string' ? webhookEvent.request : webhookEvent.request?.id
    const categoryLabel = humanizeSegments(category)
    const remainder = webhookEvent.type.startsWith(`${category}.`)
      ? webhookEvent.type.slice(category.length + 1)
      : webhookEvent.type
    const actionLabel = humanizeSegments(remainder.replace(/\./g, ' '))
    const baseSummary = [categoryLabel, actionLabel].filter(Boolean).join(' ') || webhookEvent.type

    const doc = {
      _id: `stripeWebhookEvent.${webhookEvent.id}`,
      _type: 'stripeWebhookEvent',
      eventId: webhookEvent.id,
      eventType: webhookEvent.type,
      category,
      summary: resourceId ? `${baseSummary} • ${resourceId}` : baseSummary,
      status,
      livemode: Boolean(webhookEvent.livemode),
      amount,
      currency,
      resourceId,
      resourceType,
      requestId,
      apiVersion: webhookEvent.api_version || undefined,
      metadata: metadataString,
      data: dataSnapshot,
      payload: payloadSnapshot,
      createdAt: toIsoTimestamp(webhookEvent.created),
      receivedAt: new Date().toISOString(),
    }

    const cleanedDoc = Object.fromEntries(
      Object.entries(doc).filter(([, value]) => value !== undefined && value !== null),
    ) as Record<string, any> & {_id: string; _type: 'stripeWebhookEvent'}

    await sanity.createOrReplace(cleanedDoc)
  } catch (err) {
    console.warn('stripeWebhook: failed to record generic webhook event', err)
  }
}

const buildMetadataEntries = (
  metadata: Record<string, string>,
): Array<{
  _type: 'stripeMetadataEntry'
  key: string
  value: string
}> =>
  normalizeMetadataEntries(metadata).map((entry) => ({
    _type: 'stripeMetadataEntry',
    key: entry.key,
    value: entry.value,
  }))

const parseCartMetadataNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '')
    if (!cleaned) return undefined
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const parseCartMetadataString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

const FALLBACK_OPTION_SUMMARY_KEYS = [
  'option_summary_display',
  'option_summary',
  'options_readable',
  'selected_options_display',
  'selected_options',
]

const OPTION_DETAIL_FIELD_KEYS = [
  'optionDetails',
  'option_details',
  'selected_options',
  'selected_options_json',
  'option_values',
  'option_value_display',
]

const UPGRADE_FIELD_KEYS = [
  'upgrades',
  'upgrade_list',
  'upgrade_summary',
  'upgrade_details',
  'addons',
  'add_ons',
  'addOns',
]

const DESCRIPTION_METADATA_KEYS = [
  'description',
  'line_description',
  'linedescription',
  'product_description',
  'productdescription',
  'item_description',
  'itemdescription',
  'stripe_line_description',
]

const IMAGE_METADATA_KEYS = [
  'image',
  'image_url',
  'imageurl',
  'image_link',
  'imagelink',
  'imageUrl',
  'product_image',
  'productimage',
  'productImage',
  'product_image_url',
  'productimageurl',
  'featured_image',
  'featuredimage',
  'thumbnail',
  'thumb',
  'thumb_url',
  'thumburl',
  'photo',
  'product_photo',
]

const PRODUCT_URL_METADATA_KEYS = [
  'product_url',
  'producturl',
  'productUrl',
  'product_link',
  'productlink',
  'productLink',
  'product_page',
  'productpage',
  'product_permalink',
  'productpermalink',
  'url',
]

const LINE_TOTAL_METADATA_KEYS = [
  'line_total',
  'linetotal',
  'lineTotal',
  'line_amount',
  'lineamount',
  'amount_total',
  'amounttotal',
  'amountTotal',
  'subtotal',
  'sub_total',
  'item_total',
  'itemtotal',
  'itemTotal',
]

const TOTAL_METADATA_KEYS = [
  'total',
  'total_amount',
  'totalamount',
  'totalAmount',
  'grand_total',
  'grandtotal',
  'grandTotal',
  'order_total',
  'ordertotal',
  'orderTotal',
  'amount_total',
  'amounttotal',
  'amountTotal',
]

const CATEGORY_FIELD_KEYS = [
  'categories',
  'category',
  'category_list',
  'category_tags',
  'categoryTags',
]

const CART_METADATA_SOURCE_VALUES: CartMetadataEntry['source'][] = [
  'lineItem',
  'price',
  'product',
  'session',
  'derived',
  'legacy',
]

const CART_METADATA_SOURCE_SET = new Set(CART_METADATA_SOURCE_VALUES)

const normalizeCartMetadataSource = (value: unknown): CartMetadataEntry['source'] => {
  if (typeof value === 'string') {
    const normalized = value.trim() as CartMetadataEntry['source']
    if (normalized && CART_METADATA_SOURCE_SET.has(normalized)) {
      return normalized
    }
  }
  return 'legacy'
}

const consumeRecordValue = (source: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key]
      delete source[key]
      return value
    }
  }
  return undefined
}

const normalizeMetadataKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '')

const findMetadataValue = (
  map: Record<string, string>,
  normalized: Record<string, string>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const lower = key.toLowerCase()
    if (map[lower]) return map[lower]
    const normalizedKey = normalizeMetadataKey(key)
    if (normalizedKey && normalized[normalizedKey]) return normalized[normalizedKey]
  }
  return undefined
}

const extractSlugFromUrl = (value?: string | null): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const segments = trimmed.split('/').filter(Boolean)
  if (!segments.length) return trimmed
  return segments[segments.length - 1] || trimmed
}

const convertLegacyCartEntry = (entry: unknown): CartItem | null => {
  if (!entry || typeof entry !== 'object') return null

  const record = entry as Record<string, unknown>
  const working = {...record}

  delete working._type
  const existingKey =
    typeof (record as any)._key === 'string' ? ((record as any)._key as string) : undefined
  delete working._key

  const metadataInputs: unknown[] = []
  const metadataValue = consumeRecordValue(working, ['metadata'])
  if (metadataValue !== undefined) metadataInputs.push(metadataValue)
  const rawMetadataValue = consumeRecordValue(working, ['raw_metadata', 'rawMetadata'])
  if (rawMetadataValue !== undefined) metadataInputs.push(rawMetadataValue)

  const stripeProductId = parseCartMetadataString(
    consumeRecordValue(working, ['stripeProductId', 'stripe_product_id']),
  )
  const stripePriceId = parseCartMetadataString(
    consumeRecordValue(working, ['stripePriceId', 'stripe_price_id', 'price_id']),
  )
  let productSlug = parseCartMetadataString(
    consumeRecordValue(working, ['productSlug', 'product_slug', 'slug', 'handle']),
  )
  const productName = parseCartMetadataString(
    consumeRecordValue(working, ['productName', 'product_name', 'stripe_product_name']),
  )
  const sku = parseCartMetadataString(
    consumeRecordValue(working, [
      'sku',
      'SKU',
      'product_sku',
      'productSku',
      'item_sku',
      'variant_sku',
      'inventory_sku',
    ]),
  )
  const id = parseCartMetadataString(
    consumeRecordValue(working, [
      'id',
      'productId',
      'product_id',
      'sanity_product_id',
      'sanityProductId',
      'item_id',
      'itemId',
    ]),
  )

  const rawUrl =
    parseCartMetadataString(record.url as string | undefined) ||
    parseCartMetadataString(record.product_url as string | undefined) ||
    parseCartMetadataString(record.productUrl as string | undefined) ||
    undefined
  if (!productSlug && rawUrl) {
    productSlug = extractSlugFromUrl(rawUrl)
  }

  const quantity = parseCartMetadataNumber(
    consumeRecordValue(working, ['quantity', 'qty', 'amount', 'q']),
  )
  const price = parseCartMetadataNumber(
    consumeRecordValue(working, [
      'price',
      'unit_price',
      'base_price',
      'amount',
      'total',
      'line_total',
      'line_amount',
      'p',
      'amount_total',
    ]),
  )

  const optionSummaryFromRecord = parseCartMetadataString(
    consumeRecordValue(working, [
      'optionSummary',
      'option_summary',
      'option_summary_display',
      'options_readable',
      'selected_options_display',
    ]),
  )
  const optionDetailsValue = consumeRecordValue(working, OPTION_DETAIL_FIELD_KEYS)
  const upgradesValue = consumeRecordValue(working, UPGRADE_FIELD_KEYS)
  const categoriesValue = consumeRecordValue(working, CATEGORY_FIELD_KEYS)

  const nameCandidate =
    parseCartMetadataString(consumeRecordValue(working, ['name', 'display_name', 'title', 'n'])) ||
    productName ||
    productSlug ||
    sku ||
    id ||
    'Item'

  if (Object.keys(working).length > 0) {
    metadataInputs.push(working)
  }

  const normalizedMetadata = metadataInputs.flatMap((input) =>
    normalizeMetadataEntries(input as any),
  )
  const derivedOptions = deriveOptionsFromMetadata(normalizedMetadata)

  const metadataMap: Record<string, string> = {}
  const normalizedMetadataMap: Record<string, string> = {}
  for (const {key, value} of normalizedMetadata) {
    const lower = key.toLowerCase()
    if (!metadataMap[lower]) metadataMap[lower] = value
    const normalizedKey = normalizeMetadataKey(key)
    if (normalizedKey && !normalizedMetadataMap[normalizedKey]) {
      normalizedMetadataMap[normalizedKey] = value
    }
  }
  const fallbackSummary =
    findMetadataValue(metadataMap, normalizedMetadataMap, ...FALLBACK_OPTION_SUMMARY_KEYS) ||
    undefined

  const metadataDescription = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...DESCRIPTION_METADATA_KEYS,
  )
  const metadataImage = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...IMAGE_METADATA_KEYS,
  )
  const metadataProductUrl = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...PRODUCT_URL_METADATA_KEYS,
  )
  const metadataLineTotalValue = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...LINE_TOTAL_METADATA_KEYS,
  )
  const metadataTotalValue = findMetadataValue(
    metadataMap,
    normalizedMetadataMap,
    ...TOTAL_METADATA_KEYS,
  )
  const metadataLineTotal = parseCartMetadataNumber(metadataLineTotalValue)
  const metadataTotal = parseCartMetadataNumber(metadataTotalValue)

  const optionSummary =
    optionSummaryFromRecord || derivedOptions.optionSummary || fallbackSummary || undefined

  const optionDetailsCandidates = uniqueStrings([
    ...coerceStringArray(optionDetailsValue),
    ...derivedOptions.optionDetails,
  ])
  const normalizedSelections = normalizeOptionSelections({
    optionSummary,
    optionDetails: optionDetailsCandidates,
    upgrades: [...coerceStringArray(upgradesValue), ...derivedOptions.upgrades],
  })
  const optionDetails = normalizedSelections.optionDetails
  const upgrades = normalizedSelections.upgrades
  const upgradesTotal = resolveUpgradeTotal({
    metadataMap,
    price,
    quantity,
    lineTotal: metadataLineTotal ?? undefined,
    total: metadataTotal ?? undefined,
  })
  const categories = uniqueStrings(coerceStringArray(categoriesValue))

  const resolvedDescription =
    parseCartMetadataString(metadataDescription) ||
    parseCartMetadataString((record as any).description) ||
    undefined
  const resolvedImage = parseCartMetadataString(metadataImage) || undefined
  const resolvedProductUrl =
    parseCartMetadataString(metadataProductUrl) || parseCartMetadataString(rawUrl) || undefined

  const typedMetadata: CartMetadataEntry[] = []
  const seenMetaKeys = new Set<string>()

  if (Array.isArray(metadataValue)) {
    for (const candidate of metadataValue) {
      if (!candidate || typeof candidate !== 'object') continue
      const key = parseCartMetadataString((candidate as any).key)
      const value = parseCartMetadataString((candidate as any).value)
      if (!key || !value) continue
      const dedupeKey = `${key.toLowerCase()}:::${value}`
      if (seenMetaKeys.has(dedupeKey)) continue
      seenMetaKeys.add(dedupeKey)
      typedMetadata.push({
        _type: 'orderCartItemMeta',
        key,
        value,
        source: normalizeCartMetadataSource((candidate as any).source),
      })
    }
  }

  const remainingEntries = remainingMetadataEntries(normalizedMetadata, derivedOptions.consumedKeys)
  for (const {key, value} of remainingEntries) {
    const trimmedKey = key.trim()
    const trimmedValue = value.trim()
    if (!trimmedKey || !trimmedValue) continue
    const dedupeKey = `${trimmedKey.toLowerCase()}:::${trimmedValue}`
    if (seenMetaKeys.has(dedupeKey)) continue
    seenMetaKeys.add(dedupeKey)
    typedMetadata.push({
      _type: 'orderCartItemMeta',
      key: trimmedKey,
      value: trimmedValue,
      source: 'legacy',
    })
  }

  const item: CartItem = {
    _type: 'orderCartItem',
    _key: existingKey || randomUUID(),
    name: nameCandidate,
  }

  if (id) item.id = id
  if (sku) item.sku = sku
  if (productSlug) item.productSlug = productSlug
  if (stripeProductId) item.stripeProductId = stripeProductId
  if (stripePriceId) item.stripePriceId = stripePriceId
  if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    item.quantity = Math.max(1, Math.round(quantity))
  }
  if (typeof price === 'number' && Number.isFinite(price)) {
    item.price = Number(price)
  }
  if (resolvedImage) item.image = resolvedImage
  if (resolvedProductUrl) item.productUrl = resolvedProductUrl
  if (normalizedSelections.optionSummary) item.optionSummary = normalizedSelections.optionSummary
  if (optionDetails.length) item.optionDetails = optionDetails
  if (upgrades.length) item.upgrades = upgrades
  if (upgradesTotal !== undefined) item.upgradesTotal = upgradesTotal
  const resolvedQuantityValue =
    typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : undefined
  const resolvedPriceValue =
    typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : undefined
  const derivedLineTotal =
    metadataLineTotal !== undefined
      ? metadataLineTotal
      : resolvedPriceValue !== undefined && resolvedQuantityValue !== undefined
        ? resolvedPriceValue * resolvedQuantityValue
        : undefined
  const derivedTotal =
    metadataTotal !== undefined
      ? metadataTotal
      : derivedLineTotal !== undefined
        ? derivedLineTotal
        : undefined
  if (derivedLineTotal !== undefined) item.lineTotal = derivedLineTotal
  if (derivedTotal !== undefined) item.total = derivedTotal
  if (typedMetadata.length) {
    item.metadataEntries = typedMetadata
  }

  const metadataSummary = typeof item.optionSummary === 'string' ? item.optionSummary.trim() : ''
  const metadataUpgrades = Array.isArray(item.upgrades)
    ? item.upgrades
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry): entry is string => Boolean(entry))
    : []

  if (metadataSummary || metadataUpgrades.length) {
    item.metadata = {
      option_summary: metadataSummary || undefined,
      upgrades: metadataUpgrades.length ? metadataUpgrades : undefined,
    }
  }

  return item
}

function cartItemsFromMetadata(metadata: Record<string, string>): CartItem[] {
  const rawCandidates = [
    metadata['cart'],
    metadata['cart_items'],
    metadata['cartItems'],
    metadata['line_items'],
  ]
  const raw = rawCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim())
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const items: CartItem[] = []
    for (const entry of parsed) {
      const item = convertLegacyCartEntry(entry)
      if (item) items.push(item)
    }
    return items
  } catch (err) {
    console.warn('stripeWebhook: failed to parse cart metadata', err)
    return []
  }
}

function determineOrderType(metadata?: Record<string, string | undefined>): string {
  const source = metadata || {}
  const explicit = (source['orderType'] || source['order_type'] || '').toString().trim()
  if (explicit) return explicit

  const sourceHint = (source['source'] || '').toString().trim().toLowerCase()
  if (sourceHint === 'pos' || sourceHint === 'in-store') return 'in-store'

  const customerType = (source['customer_type'] || '').toString().trim().toLowerCase()
  if (customerType === 'wholesale') return 'wholesale'

  return 'online'
}

type PaymentDetailInput = {
  brand?: string | null | undefined
  cardBrand?: string | null | undefined
  last4?: string | null | undefined
  cardLast4?: string | null | undefined
  receiptUrl?: string | null | undefined
  paymentMethod?: {brand?: string | null; last4?: string | null} | null
}

function ensureRequiredPaymentDetails(
  target: Record<string, any>,
  details: PaymentDetailInput,
  contextLabel: string,
) {
  const summary = parseStripeSummaryData(target?.stripeSummary)
  const brand =
    details.brand ||
    details.cardBrand ||
    (details as {paymentMethod?: {brand?: string | null}})?.paymentMethod?.brand ||
    summary?.paymentMethod?.brand ||
    ''
  const last4 =
    details.last4 ||
    details.cardLast4 ||
    (details as {paymentMethod?: {last4?: string | null}})?.paymentMethod?.last4 ||
    summary?.paymentMethod?.last4 ||
    ''
  const receipt = (details.receiptUrl || '').toString().trim()

  const normalizedBrand = brand ? brand.toString().trim() : ''
  const normalizedLast4 = last4 ? last4.toString().trim() : ''

  if (normalizedBrand) {
    target.cardBrand = normalizedBrand
  } else if (!target.cardBrand) {
    target.cardBrand = null
  }

  if (normalizedLast4) {
    target.cardLast4 = normalizedLast4
  } else if (!target.cardLast4) {
    target.cardLast4 = null
  }

  if (receipt) {
    target.receiptUrl = receipt
  } else if (!target.receiptUrl) {
    target.receiptUrl = null
  }

  if (!normalizedBrand || !normalizedLast4 || !receipt) {
    const missing = []
    if (!normalizedBrand) missing.push('cardBrand')
    if (!normalizedLast4) missing.push('cardLast4')
    if (!receipt) missing.push('receiptUrl')
    console.warn(
      `stripeWebhook: missing payment details [${missing.join(', ')}] (${contextLabel})`,
    )
  }
}

type CartRequirementContext = {
  source?: string
  sessionId?: string | null
  orderId?: string | null
}

function describeCartContext(context?: CartRequirementContext): string {
  if (!context) return ''
  const parts: string[] = []
  if (context.source) parts.push(`source=${context.source}`)
  if (context.sessionId) parts.push(`session=${context.sessionId}`)
  if (context.orderId) parts.push(`order=${context.orderId}`)
  return parts.length ? ` (${parts.join(' | ')})` : ''
}

function normalizeRequiredStringArray(value: unknown): string[] {
  return uniqueStrings(coerceStringArray(value))
}

function enforceCartRequirements(
  cart: CartItem[],
  products: CartProductSummary[],
  context?: CartRequirementContext,
): CartItem[] {
  if (!Array.isArray(cart)) return []

  const productIndex = new Map<string, CartProductSummary>()
  for (const product of products) {
    if (product?._id) {
      productIndex.set(product._id, product)
    }
  }

  return cart.map((item, index) => {
    if (!item || typeof item !== 'object') return item
    const normalized: CartItem = {...item}

    const referencedProduct = normalized.productRef?._ref
      ? productIndex.get(normalized.productRef._ref)
      : undefined
    const matchedProduct =
      referencedProduct || findProductForItem(normalized, products) || undefined

    if (!normalized.productRef && matchedProduct?._id) {
      normalized.productRef = {_type: 'reference', _ref: matchedProduct._id}
    }

    if (!normalized.sku && matchedProduct?.sku) {
      normalized.sku = matchedProduct.sku
    }

    if (Array.isArray(normalized.addOns)) {
      normalized.addOns = normalized.addOns
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => Boolean(entry))
    }

    normalized.optionDetails = normalizeRequiredStringArray(normalized.optionDetails)
    normalized.upgrades = normalizeRequiredStringArray(normalized.upgrades)

    const hasVariantMetadata =
      normalized.optionDetails.some((opt) => !/upgrade/i.test(opt)) ||
      Boolean(normalized.selectedVariant)
    if (!normalized.selectedVariant && hasVariantMetadata) {
      normalized.selectedVariant =
        normalized.optionDetails
          .find((opt) => !/upgrade/i.test(opt))
          ?.split(':')
          .pop()
          ?.trim() || normalized.selectedVariant
    }

    const missing: string[] = []
    if (!normalized.productRef?._ref) missing.push('productRef')
    if (!normalized.sku) missing.push('sku')

    if (missing.length) {
      console.error(
        `stripeWebhook: cart item missing required fields [${missing.join(', ')}]${describeCartContext(context)}`,
        {index, item: normalized},
      )
    }

    return normalized
  })
}

async function buildCartFromSessionLineItems(
  sessionId: string,
  metadata: Record<string, string>,
  options?: {lineItems?: Stripe.LineItem[] | null},
): Promise<{items: CartItem[]; products: CartProductSummary[]}> {
  if (!stripe) return {items: [], products: []}
  try {
    const listResponse =
      options?.lineItems && Array.isArray(options.lineItems)
        ? {data: options.lineItems}
        : await stripe.checkout.sessions.listLineItems(sessionId, {
            limit: 100,
            expand: ['data.price', 'data.price.product'],
          })
    const lineItems = (listResponse?.data || []) as Stripe.LineItem[]
    let cartItems = lineItems.map((li: Stripe.LineItem) => ({
      _type: 'orderCartItem',
      _key: randomUUID(),
      ...mapStripeLineItem(li, {sessionMetadata: metadata}),
    })) as CartItem[]
    if (!cartItems.length) {
      cartItems = cartItemsFromMetadata(metadata)
    }
    if (!cartItems.length) return {items: [], products: []}

    let productSummaries: CartProductSummary[] = []
    const enriched = await enrichCartItemsFromSanity(cartItems, sanity, {
      onProducts: (list) => {
        productSummaries = list
      },
    })
    cartItems = enriched
    if (!productSummaries.length && cartItems.length) {
      productSummaries = await fetchProductsForCart(cartItems, sanity)
    }
    if (lineItems.length) {
      cartItems = await Promise.all(
        cartItems.map(async (item, index) => {
          const sourceLineItem = lineItems[index]
          if (!sourceLineItem) return item
          if (item.productRef?._ref && item.sku && item.image) return item
          const product = await strictFindProductForCartItem(sourceLineItem)
          if (!product) return item
          const nextItem = {...item}
          if (!nextItem.productRef && product._id) {
            nextItem.productRef = {_type: 'reference', _ref: product._id}
          }
          if (!nextItem.sku && product.sku) {
            nextItem.sku = product.sku
          }
          if (!nextItem.image && (product as any)?.primaryImage) {
            nextItem.image = (product as any).primaryImage
          }
          return nextItem
        }),
      )
    }
    const normalizedCart = enforceCartRequirements(cartItems, productSummaries, {
      source: 'checkout.session',
      sessionId,
    })
    const cleanedCart = normalizedCart.map(cleanCartItemForStorage)
    return {items: cleanedCart, products: productSummaries}
  } catch (err) {
    console.warn('stripeWebhook: listLineItems failed', err)
    let fallback = cartItemsFromMetadata(metadata)
    if (!fallback.length) return {items: [], products: []}
    try {
      let productSummaries: CartProductSummary[] = []
      const enriched = await enrichCartItemsFromSanity(fallback, sanity, {
        onProducts: (list) => {
          productSummaries = list
        },
      })
      fallback = enriched
      if (!productSummaries.length && fallback.length) {
        productSummaries = await fetchProductsForCart(fallback, sanity)
      }
      const normalizedFallback = enforceCartRequirements(fallback, productSummaries, {
        source: 'checkout.session',
        sessionId,
      })
      const cleanedFallback = normalizedFallback.map(cleanCartItemForStorage)
      return {items: cleanedFallback, products: productSummaries}
    } catch {
      const productSummaries = fallback.length ? await fetchProductsForCart(fallback, sanity) : []
      const normalizedFallback = enforceCartRequirements(fallback, productSummaries, {
        source: 'checkout.session',
        sessionId,
      })
      const cleanedFallback = normalizedFallback.map(cleanCartItemForStorage)
      return {items: cleanedFallback, products: productSummaries}
    }
  }
}

const DISCOUNT_LABEL_KEYS = [
  'discount_label',
  'discountlabel',
  'sale_label',
  'salelabel',
  'promotion',
  'promotion_label',
  'promotionlabel',
  'promotion_tagline',
  'promotiontagline',
  'sale',
  'sale_name',
  'campaign',
  'campaign_name',
]

function toCurrencyNumber(value?: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.round(value * 100) / 100
}

function parseBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  return undefined
}

function normalizeLabel(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const cleaned = raw.toString().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return undefined
  return cleaned
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function extractLabelsFromMetadata(
  source?: Record<string, unknown> | null,
  keys: string[] = DISCOUNT_LABEL_KEYS,
): string[] {
  const labels = new Set<string>()
  if (!source || typeof source !== 'object') return []
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const normalizedKey = rawKey
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
    if (!normalizedKey) continue
    if (keys.some((key) => normalizedKey === key.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
      const formatted = normalizeLabel(typeof rawValue === 'string' ? rawValue : String(rawValue))
      if (formatted) labels.add(formatted)
    }
  }
  return Array.from(labels)
}

function computeCartPricingSummary(cart: CartItem[], products: CartProductSummary[]) {
  let subtotal = 0
  let saleDiscount = 0
  const labels = new Set<string>()

  for (const item of cart) {
    if (!item) continue
    const product = findProductForItem(item, products) || null
    const qtyRaw = typeof item.quantity === 'number' ? item.quantity : Number(item.quantity || 1)
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1
    const priceCandidates = [
      product?.compareAtPrice,
      product?.price,
      typeof item.price === 'number' ? item.price : undefined,
    ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    const basePrice = priceCandidates.length ? priceCandidates[0] : undefined
    const salePriceCandidates = [
      typeof item.price === 'number' ? item.price : undefined,
      product?.salePrice,
      product?.price,
    ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    const salePrice = salePriceCandidates.length ? salePriceCandidates[0] : basePrice

    if (basePrice) subtotal += basePrice * quantity
    else if (salePrice) subtotal += salePrice * quantity

    if (basePrice && salePrice && basePrice > salePrice) {
      saleDiscount += (basePrice - salePrice) * quantity
      const productLabel =
        normalizeLabel(product?.promotionTagline) ||
        normalizeLabel(product?.discountType) ||
        normalizeLabel(product?.discountValue ? `${product.discountValue}` : undefined)
      if (productLabel) labels.add(productLabel)
    }

    if (Array.isArray(item.metadataEntries)) {
      for (const entry of item.metadataEntries) {
        const label = normalizeLabel(entry?.value as string)
        const key = (entry?.key || '')
          .toString()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
        if (label && DISCOUNT_LABEL_KEYS.includes(key)) labels.add(label)
      }
    }
  }

  return {
    subtotal: toCurrencyNumber(subtotal) ?? 0,
    saleDiscount: toCurrencyNumber(saleDiscount) ?? 0,
    labels: Array.from(labels),
  }
}

function validateOrderData(order: any): string[] {
  const issues: string[] = []
  const cart = Array.isArray(order?.cart) ? order.cart : []

  if (!cart.length) {
    issues.push('Cart is empty')
  }

  cart.forEach((item: CartItem, index: number) => {
    if (!item) return
    if (!item.sku) issues.push(`cart[${index}] missing sku`)
    if (!item.productRef?._ref) issues.push(`cart[${index}] missing productRef`)
    if (Array.isArray(item.optionDetails) && item.optionDetails.length && !item.selectedVariant) {
      issues.push(`cart[${index}] missing selectedVariant`)
    }
    if (!item.image && !(item as any)?.productImage) {
      issues.push(`cart[${index}] missing image`)
    }
    if (item.total === undefined || item.total === null) {
      issues.push(`cart[${index}] missing total`)
    }
  })

  if (!order?.stripeSummary) issues.push('Missing stripeSummary')
  if (!order?.cardBrand) issues.push('Missing card brand')
  if (!order?.cardLast4) issues.push('Missing card last4')
  if (!order?.receiptUrl) issues.push('Missing receiptUrl')

  const pkg = order?.fulfillment?.packageDimensions
  if (pkg) {
    if (pkg.weight === undefined && !pkg.weightDisplay) {
      issues.push('Missing package weight')
    }
    const hasDims = pkg.length && pkg.width && pkg.height
    if (!hasDims && !pkg.dimensionsDisplay) {
      issues.push('Missing package dimensions')
    }
  }

  const paidStatuses = new Set(['paid', 'fulfilled', 'shipped', 'completed'])
  if (paidStatuses.has((order?.status || '').toString().toLowerCase())) {
    if (!(order?.customerRef?._ref || order?.customer?._ref)) {
      issues.push('Missing customer reference')
    }
    if (!order?.invoiceRef?._ref) {
      issues.push('Missing invoice reference')
    }
  }

  return issues
}

function normalizeShippingMetadata(
  source?: Record<string, unknown> | null,
): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!source || typeof source !== 'object') return normalized
  for (const [key, value] of Object.entries(source)) {
    if (!key) continue
    const strValue =
      value === null || value === undefined ? '' : typeof value === 'string' ? value : String(value)
    const trimmed = strValue.trim()
    if (trimmed) normalized[key] = trimmed
  }
  return normalized
}

function mapShippingStatus(raw?: string | null): string | undefined {
  const normalized = (raw || '').toString().toLowerCase()
  if (!normalized) return undefined
  if (normalized.includes('delivered')) return 'delivered'
  if (normalized.includes('out_for_delivery')) return 'out_for_delivery'
  if (normalized.includes('transit')) return 'in_transit'
  if (normalized.includes('shipped')) return 'shipped'
  if (normalized.includes('purchas')) return 'label_created'
  if (normalized.includes('label')) return 'label_created'
  if (normalized.includes('exception')) return 'exception'
  if (normalized.includes('fail')) return 'failed'
  if (normalized.includes('return')) return 'returned'
  return normalized
}

async function handleShippingStatusSync(
  payload: any,
  context: {eventType?: string; stripeEventId?: string; eventCreated?: number | null},
): Promise<void> {
  const metadata = normalizeShippingMetadata((payload as any)?.metadata)
  const sessionId =
    metadata.checkout_session ||
    metadata.checkout_session_id ||
    metadata.session_id ||
    metadata.sessionId ||
    undefined
  const invoiceNumber = metadata.invoice_number || metadata.invoiceNumber || undefined
  const orderId = await findOrderDocumentIdForEvent({
    metadata,
    sessionId,
    invoiceNumber,
  })
  if (!orderId) return

  const trackingNumber =
    (payload as any)?.tracking_number ||
    (payload as any)?.tracking?.tracking_number ||
    (payload as any)?.tracking?.number ||
    metadata.tracking_number ||
    metadata.trackingNumber
  // Legacy Parcelcraft metadata values are still parsed for historical orders.
  const trackingUrl =
    (payload as any)?.tracking_url ||
    (payload as any)?.tracking?.url ||
    metadata.tracking_url ||
    metadata.trackingUrl ||
    metadata.parcelcraft_tracking_url
  const labelUrl =
    (payload as any)?.label_url ||
    (payload as any)?.label_pdf ||
    (payload as any)?.label?.url ||
    metadata.label_url ||
    metadata.labelUrl ||
    metadata.parcelcraft_label_url ||
    metadata.pc_label_url
  const carrier =
    (payload as any)?.carrier ||
    (payload as any)?.tracking?.carrier ||
    metadata.carrier ||
    metadata.shipping_carrier
  const service =
    (payload as any)?.service ||
    (payload as any)?.selected_rate?.service ||
    (payload as any)?.tracking?.service ||
    metadata.service ||
    metadata.shipping_service
  const statusRaw =
    (payload as any)?.status ||
    (payload as any)?.tracking_status ||
    (payload as any)?.tracking?.status ||
    metadata.tracking_status ||
    metadata.status
  const status = mapShippingStatus(statusRaw || (labelUrl ? 'label_created' : ''))
  const purchasedAtRaw =
    (payload as any)?.purchased_at ??
    (payload as any)?.created ??
    metadata.label_purchased_at ??
    metadata.label_created_at
  const purchasedAt = purchasedAtRaw ? toIsoTimestamp(purchasedAtRaw) : undefined
  const etaRaw =
    (payload as any)?.estimated_delivery ??
    metadata.estimated_delivery ??
    metadata.estimated_delivery_date ??
    (payload as any)?.tracking?.estimated_delivery
  const eta = etaRaw ? toIsoTimestamp(etaRaw) : undefined

  const eventLabelParts = [
    status ? status.replace(/_/g, ' ') : null,
    trackingNumber ? `#${trackingNumber}` : null,
    carrier ? carrier : null,
  ].filter(Boolean)

  const setOps: Record<string, any> = {}
  if (status) setOps['fulfillment.status'] = status
  if (trackingNumber) {
    setOps.trackingNumber = trackingNumber
  }
  if (trackingUrl) {
    setOps.trackingUrl = trackingUrl
  }
  if (labelUrl) {
    setOps.shippingLabelUrl = labelUrl
  }
  if (carrier) setOps.carrier = carrier
  if (service) setOps.service = service
  if (purchasedAt) setOps.labelCreatedAt = purchasedAt
  if (eta) setOps.estimatedDeliveryDate = eta

  try {
    await sanity.patch(orderId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to sync shipping status', err)
  }

  try {
    await appendOrderEvent(orderId, {
      eventType: context.eventType || 'shipping.update',
      status: status || 'label_created',
      label: eventLabelParts.join(' • ') || 'Shipping update',
      stripeEventId: context.stripeEventId,
      occurredAt: context.eventCreated ?? null,
      metadata,
    })
  } catch {
    // ignore event append failures
  }
}

function simplifyCartForCheckoutSession(cart: CartItem[]): Array<Record<string, any>> {
  if (!Array.isArray(cart)) return []
  return cart.map((item) =>
    pruneUndefined({
      name:
        (item as any)?.name ||
        (item as any)?.productName ||
        (item as any)?.sku ||
        (item as any)?.id ||
        (item as any)?.productSlug,
      productRef: (item as any)?.productRef?._ref ? (item as any).productRef : undefined,
      sku: (item as any)?.sku,
      id: (item as any)?.id,
      productSlug: (item as any)?.productSlug,
      image: typeof (item as any)?.image === 'string' ? (item as any).image : undefined,
      productUrl: (item as any)?.productUrl,
      optionDetails: Array.isArray((item as any)?.optionDetails)
        ? (item as any).optionDetails
        : undefined,
      upgrades: Array.isArray((item as any)?.upgrades) ? (item as any).upgrades : undefined,
      price: typeof (item as any)?.price === 'number' ? (item as any).price : undefined,
      quantity: typeof (item as any)?.quantity === 'number' ? (item as any).quantity : undefined,
      total:
        typeof (item as any)?.total === 'number'
          ? (item as any).total
          : typeof (item as any)?.lineTotal === 'number'
            ? (item as any).lineTotal
            : undefined,
    }),
  )
}

async function upsertCheckoutSessionDocument(
  session: Stripe.Checkout.Session,
  opts: {
    cart: CartItem[]
    metadata: Record<string, string>
    createdAt: string
    expiresAt?: string | null
    expiredAt?: string | null
    amountSubtotal?: number
    amountTax?: number
    amountShipping?: number
    amountTotal?: number
    currency?: string
    customerName?: string
    customerId?: string | null
    checkoutUrl?: string | null
    attribution?: AttributionParams | null
  },
): Promise<string | null> {
  if (!sanity) return null

  const cartForDoc = simplifyCartForCheckoutSession(opts.cart)
  const metadataRaw = opts.metadata || {}
  let metadataJson: string | undefined
  try {
    metadataJson = JSON.stringify(metadataRaw, null, 2)
  } catch {
    metadataJson = undefined
  }

  const email =
    (session.customer_details?.email || session.customer_email || '').toString().trim() || undefined

  const existing = await sanity.fetch<{_id: string} | null>(
    `*[_type == "checkoutSession" && sessionId == $sid][0]{_id}`,
    {sid: session.id},
  )

  const baseDoc = pruneUndefined({
    sessionId: session.id,
    status: session.status || 'expired',
    createdAt: opts.createdAt,
    expiresAt: opts.expiresAt || undefined,
    expiredAt: opts.expiredAt || undefined,
    customerEmail: email,
    customerName: opts.customerName || undefined,
    customerPhone: session.customer_details?.phone || undefined,
    customerRef: opts.customerId ? {_type: 'reference', _ref: opts.customerId} : undefined,
    cart: cartForDoc.length ? cartForDoc : undefined,
    amountSubtotal: opts.amountSubtotal,
    amountTax: opts.amountTax,
    amountShipping: opts.amountShipping,
    totalAmount: opts.amountTotal,
    currency: opts.currency,
    stripeCheckoutUrl: opts.checkoutUrl || undefined,
    attribution: opts.attribution || undefined,
    metadata: metadataJson ? {raw: metadataJson} : undefined,
  })

  if (existing?._id) {
    await sanity
      .patch(existing._id)
      .set(baseDoc)
      .setIfMissing({recoveryEmailSent: false, recovered: false})
      .commit({autoGenerateArrayKeys: true})
    return existing._id
  }

  const docToCreate = {
    _type: 'checkoutSession',
    ...baseDoc,
    recoveryEmailSent: false,
    recovered: false,
  }

  try {
    const created = await sanity.create(docToCreate as any, {autoGenerateArrayKeys: true})
    return created?._id || null
  } catch (err) {
    console.warn('stripeWebhook: failed to create checkoutSession document', err)
    return null
  }
}

async function addToAbandonedCartAudience(email?: string | null, customerName?: string | null) {
  if (!email || !RESEND_ABANDONED_AUDIENCE || !resendClient) return
  const trimmed = email.trim()
  if (!trimmed) return
  const [firstName, ...rest] = (customerName || '').trim().split(/\s+/).filter(Boolean)
  try {
    await resendClient.contacts.create({
      audienceId: RESEND_ABANDONED_AUDIENCE,
      email: trimmed,
      firstName: firstName || undefined,
      lastName: rest.join(' ') || undefined,
      unsubscribed: false,
    })
  } catch (err: any) {
    const message = err?.message || ''
    if (!message.toLowerCase().includes('already exists')) {
      console.warn('stripeWebhook: failed to add abandoned cart contact', err)
    }
  }
}

const stripeKey = resolveStripeSecretKey()
if (!stripeKey) {
  console.error(
    `stripeWebhook: missing Stripe secret (set one of: ${STRIPE_SECRET_ENV_KEYS.join(', ')})`,
  )
}
const stripe = stripeKey ? new Stripe(stripeKey, {apiVersion: STRIPE_API_VERSION}) : (null as any)
const RESEND_API_KEY = resolveResendApiKey() || ''
const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null
const RESEND_ABANDONED_AUDIENCE =
  process.env.RESEND_AUDIENCE_ABANDONED_CART || process.env.RESEND_AUDIENCE_ABANDONED_CART_ID || ''

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

// Dedicated client for strict order creation + backfill requirements.
const webhookSanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET!,
  token: (process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN) as string,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const money = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : ''

const renderAddressHtml = (address?: any): string => {
  if (!address) return ''
  const lines = [
    address?.name,
    address?.addressLine1,
    address?.addressLine2,
    [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', '),
    address?.country,
  ].filter((line) => Boolean(line && String(line).trim()))
  if (lines.length === 0) return ''
  return lines.map((line) => `<div>${line}</div>`).join('')
}

const renderAddressText = (address?: any): string => {
  if (!address) return ''
  const lines = [
    address?.name,
    address?.addressLine1,
    address?.addressLine2,
    [address?.city, address?.state, address?.postalCode].filter(Boolean).join(', '),
    address?.country,
  ].filter((line) => Boolean(line && String(line).trim()))
  return lines.join('\n')
}

const normalizeString = (value?: string | null): string | undefined => {
  const trimmed = (value || '').toString().trim()
  return trimmed || undefined
}

const metaValue = (meta: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

async function resolveCheckoutCustomerContact(
  checkoutSession: Stripe.Checkout.Session,
): Promise<{email?: string; name?: string; phone?: string; stripeCustomerId?: string | null}> {
  const metadata = (checkoutSession.metadata || {}) as Record<string, string>
  const email =
    normalizeString(checkoutSession.customer_details?.email) ||
    normalizeString(checkoutSession.customer_email) ||
    metaValue(
      metadata,
      'customer_email',
      'customerEmail',
      'customer_email_prefilled',
      'customerEmailPrefilled',
      'email',
      'bill_to_email',
      'contact_email',
      'prefilled_email',
      'guest_email',
    )
  const name =
    normalizeString(checkoutSession.customer_details?.name) ||
    normalizeString((checkoutSession as any)?.shipping_details?.name) ||
    metaValue(metadata, 'customer_name', 'bill_to_name', 'shipping_name') ||
    email
  const phone =
    normalizeString(checkoutSession.customer_details?.phone) ||
    normalizeString((checkoutSession as any)?.shipping_details?.phone) ||
    metaValue(metadata, 'customer_phone', 'phone', 'shipping_phone')
  const stripeCustomerId =
    typeof checkoutSession.customer === 'string'
      ? checkoutSession.customer
      : checkoutSession.customer?.id || null

  if ((!email || !name || !phone) && stripeCustomerId && stripe) {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId)
      if (!customer || (customer as any)?.deleted) {
        return {email, name, phone, stripeCustomerId}
      }
      return {
        email: email || normalizeString((customer as Stripe.Customer).email),
        name: name || normalizeString((customer as Stripe.Customer).name) || email,
        phone: phone || normalizeString((customer as Stripe.Customer).phone),
        stripeCustomerId,
      }
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve Stripe customer details', err)
    }
  }

  return {
    email,
    name,
    phone,
    stripeCustomerId,
  }
}

// ---------------------------------------------------------------------------
// Strict order creation helpers (mandatory field enforcement)
// ---------------------------------------------------------------------------

async function strictFindOrCreateCustomer(checkoutSession: Stripe.Checkout.Session) {
  const contact = await resolveCheckoutCustomerContact(checkoutSession)
  const email = contact.email || ''
  const name = contact.name || ''
  const nameParts = splitFullName(name)
  const computedName = computeCustomerName({
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    email,
    fallbackName: name,
  })
  const stripeCustomerId = contact.stripeCustomerId || null

  let customer = await webhookSanityClient.fetch<{
    _id: string
    name?: string
    email?: string
    stripeCustomerId?: string | null
    stripeLastSyncedAt?: string | null
    customerType?: string | null
    roles?: string[] | null
    firstName?: string | null
    lastName?: string | null
  } | null>(
    `*[_type == "customer" && email == $email][0]{_id, name, email, stripeCustomerId, customerType, roles, firstName, lastName}`,
    {email},
  )

  if (!customer) {
    const newCustomerId = `customer.${randomUUID()}`
    customer = await webhookSanityClient.create<{
      _id: string
      name?: string
      email?: string
      stripeCustomerId?: string | null
      stripeLastSyncedAt?: string | null
      customerType?: string | null
      roles?: string[] | null
      firstName?: string | null
      lastName?: string | null
    }>({
      _id: newCustomerId,
      _type: 'customer',
      email: email || undefined,
      name: computedName || email || 'Customer',
      firstName: nameParts.firstName || undefined,
      lastName: nameParts.lastName || undefined,
      stripeCustomerId,
      stripeLastSyncedAt: new Date().toISOString(),
      customerType: 'retail',
      roles: ['customer'],
    })
    console.log(`✅ Created new customer: ${customer.name || email}`)
  } else {
    const patch: Record<string, any> = {}
    if (nameParts.firstName && !customer.firstName) patch.firstName = nameParts.firstName
    if (nameParts.lastName && !customer.lastName) patch.lastName = nameParts.lastName
    const resolvedName = computeCustomerName({
      firstName: patch.firstName ?? customer.firstName,
      lastName: patch.lastName ?? customer.lastName,
      email,
      fallbackName: name,
    })
    if (resolvedName && resolvedName !== customer.name) patch.name = resolvedName
    const needsStripeIdUpdate = stripeCustomerId && customer.stripeCustomerId !== stripeCustomerId
    if (needsStripeIdUpdate) {
      patch.stripeCustomerId = stripeCustomerId
    }
    if (stripeCustomerId || needsStripeIdUpdate) {
      patch.stripeLastSyncedAt = new Date().toISOString()
    }
    if (Object.keys(patch).length > 0) {
      try {
        await webhookSanityClient
          .patch(customer._id)
          .set(patch)
          .commit({autoGenerateArrayKeys: true})
        customer = {...customer, ...patch}
      } catch (err) {
        console.warn('stripeWebhook: failed to refresh customer name parts', err)
      }
    }
  }

  return customer
}

async function strictGetPaymentDetails(paymentIntentId?: string | null) {
  const details: {
    cardBrand: string
    cardLast4: string
    receiptUrl: string
    billingAddress?: {
      name?: string | null
      addressLine1?: string | null
      addressLine2?: string | null
      city?: string | null
      state?: string | null
      postalCode?: string | null
      country?: string | null
      phone?: string | null
      email?: string | null
    } | null
    paymentIntent?: Stripe.PaymentIntent | null
    charge?: Stripe.Charge | null
  } = {
    cardBrand: '',
    cardLast4: '',
    receiptUrl: '',
    paymentIntent: null,
    charge: null,
  }

  if (!paymentIntentId || !stripe) return details

  try {
    let expandRejected = false
    let paymentIntent = null as Stripe.PaymentIntent | null
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: [
          'charges.data.payment_method_details',
          'latest_charge.payment_method_details',
          'payment_method',
        ],
      })
    } catch (err) {
      if (isDisallowedExpandError(err)) {
        expandRejected = true
        console.warn(
          'stripeWebhook: Stripe rejected payment intent expand, retrying without it',
          {paymentIntentId},
        )
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
      } else {
        throw err
      }
    }
    if (!paymentIntent) return details
    const expandedCharges = (
      paymentIntent as Stripe.PaymentIntent & {charges?: Stripe.ApiList<Stripe.Charge> | null}
    ).charges
    let charge = expandedCharges?.data?.[0] || null
    let latestCharge = paymentIntent.latest_charge as Stripe.Charge | string | null | undefined

    if (expandRejected || !charge?.payment_method_details?.card) {
      charge = await hydrateChargeWithDetails(charge)
    }
    if (!charge) {
      charge = await hydrateChargeWithDetails(latestCharge)
    }
    latestCharge = await hydrateChargeWithDetails(latestCharge)

    if (charge) {
      if (charge.payment_method_details?.card) {
        details.cardBrand = charge.payment_method_details.card.brand || ''
        details.cardLast4 = charge.payment_method_details.card.last4 || ''
      }
      if (charge.receipt_url) details.receiptUrl = charge.receipt_url
      const billingDetails = charge.billing_details
      if (billingDetails?.address) {
        details.billingAddress = {
          name: billingDetails.name || undefined,
          addressLine1: billingDetails.address.line1 || undefined,
          addressLine2: billingDetails.address.line2 || undefined,
          city: billingDetails.address.city || undefined,
          state: billingDetails.address.state || undefined,
          postalCode: billingDetails.address.postal_code || undefined,
          country: billingDetails.address.country || undefined,
          phone: billingDetails.phone || undefined,
          email: billingDetails.email || undefined,
        }
      }
    }
    if (!charge && latestCharge) {
      charge = latestCharge
    }
    if (!details.cardBrand && latestCharge?.payment_method_details?.card?.brand) {
      details.cardBrand = latestCharge.payment_method_details.card.brand || ''
    }
    if (!details.cardLast4 && latestCharge?.payment_method_details?.card?.last4) {
      details.cardLast4 = latestCharge.payment_method_details.card.last4 || ''
    }
    if (!details.receiptUrl && latestCharge?.receipt_url) {
      details.receiptUrl = latestCharge.receipt_url || ''
    }
    if (paymentIntent.payment_method && typeof paymentIntent.payment_method === 'object') {
      const pm = paymentIntent.payment_method as Stripe.PaymentMethod
      if (pm?.card) {
        if (!details.cardBrand && pm.card.brand) details.cardBrand = pm.card.brand
        if (!details.cardLast4 && pm.card.last4) details.cardLast4 = pm.card.last4
      }
    }
    details.paymentIntent = paymentIntent
    details.charge = charge || latestCharge || null
  } catch (error: any) {
    console.error('Error fetching payment details:', error?.message || error)
  }

  return details
}

function isDisallowedExpandError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const payload = err as {type?: string; message?: string; error?: {message?: string}}
  if ((payload.type || (payload as any)?.error?.type) !== 'invalid_request_error') return false
  const message = payload.message || payload.error?.message || ''
  if (typeof message !== 'string') return false
  return message.includes('cannot be expanded')
}

async function hydrateChargeWithDetails(
  chargeRef: Stripe.Charge | string | null | undefined,
): Promise<Stripe.Charge | null> {
  if (!stripe || !chargeRef) return null
  if (typeof chargeRef === 'object') {
    if (chargeRef.payment_method_details?.card) return chargeRef
    if (!chargeRef.id) return chargeRef
    try {
      return await stripe.charges.retrieve(chargeRef.id, {
        expand: ['payment_method_details'],
      })
    } catch (err) {
      console.warn('stripeWebhook: unable to hydrate charge details', err)
      return chargeRef
    }
  }
  const chargeId = chargeRef.trim()
  if (!chargeId || !chargeId.startsWith('ch_')) return null
  try {
    return await stripe.charges.retrieve(chargeId, {
      expand: ['payment_method_details'],
    })
  } catch (err) {
    console.warn('stripeWebhook: unable to hydrate charge details', err)
    return null
  }
}

function extractShippingAddressFromSession(
  session: Stripe.Checkout.Session,
  fallbackEmail?: string | null,
): NormalizedContactAddress | undefined {
  return extractCompleteShippingAddress(session, undefined, fallbackEmail)
}

async function strictFindProductForCartItem(item: Stripe.LineItem) {
  const metadata = item.price?.metadata || {}
  const stripeProductId =
    typeof item.price?.product === 'string' ? item.price.product : item.price?.product?.id

  // Strategy 1: SKU from metadata
  if (metadata.sku) {
    const product = await webhookSanityClient.fetch(
      `*[_type == "product" && sku == $sku][0]{
        _id,
        title,
        sku,
        shippingConfig,
        shippingWeight,
        boxDimensions,
        "primaryImage": images[0].asset->url,
        options
      }`,
      {sku: metadata.sku},
    )
    if (product) return product
  }

  // Strategy 2: sanity_product_id from metadata
  if ((metadata as any)?.sanity_product_id) {
    const product = await webhookSanityClient.fetch(
      `*[_type == "product" && _id match $id][0]{
        _id,
        title,
        sku,
        shippingConfig,
        shippingWeight,
        boxDimensions,
        "primaryImage": images[0].asset->url,
        options
      }`,
      {id: `*${(metadata as any).sanity_product_id}*`},
    )
    if (product) return product
  }

  // Strategy 3: Stripe product ID
  if (stripeProductId) {
    const product = await webhookSanityClient.fetch(
      `*[_type == "product" && stripeProductId == $id][0]{
        _id,
        title,
        sku,
        shippingConfig,
        shippingWeight,
        boxDimensions,
        "primaryImage": images[0].asset->url,
        options
      }`,
      {id: stripeProductId},
    )
    if (product) return product
  }

  // Strategy 4: Name search (last resort)
  const searchName = (item.description || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (searchName) {
    const product = await webhookSanityClient.fetch(
      `*[_type == "product" && lower(title) match "*${searchName}*"][0]{
        _id,
        title,
        sku,
        shippingConfig,
        shippingWeight,
        boxDimensions,
        "primaryImage": images[0].asset->url,
        options
      }`,
    )
    if (product) return product
  }

  console.error('❌ No product found for line item:', {
    description: item.description,
    priceId: item.price?.id,
    stripeProductId,
    metadata,
  })

  return null
}

function strictParseOptions(metadata?: Stripe.Metadata | null): string[] {
  if (!metadata?.options) return []
  if (Array.isArray(metadata.options)) return metadata.options as unknown as string[]
  if (typeof metadata.options === 'string') {
    return metadata.options
      .split(',')
      .map((opt) => opt.trim())
      .filter(Boolean)
  }
  return []
}

function strictParseUpgrades(metadata?: Stripe.Metadata | null): string[] {
  if (!metadata?.upgrades) return []
  if (Array.isArray(metadata.upgrades)) return metadata.upgrades as unknown as string[]
  if (typeof metadata.upgrades === 'string') {
    return metadata.upgrades
      .split(',')
      .map((opt) => opt.trim())
      .filter(Boolean)
  }
  return []
}

async function strictBuildCartItems(lineItems: Stripe.ApiList<Stripe.LineItem>) {
  const cart: CartItem[] = []

  for (const item of lineItems.data) {
    const product = await strictFindProductForCartItem(item)
    const metadata = (item.price?.metadata || (item as any)?.metadata || {}) as Stripe.Metadata
    cart.push({
      _type: 'orderCartItem',
      _key: Math.random().toString(36).substr(2, 9),
      name: item.description ?? undefined,
      productRef: product ? {_type: 'reference', _ref: product._id} : undefined,
      sku: product?.sku || metadata.sku || '',
      optionDetails: strictParseOptions(metadata),
      upgrades: strictParseUpgrades(metadata),
      price: item.price?.unit_amount ? item.price.unit_amount / 100 : undefined,
      quantity: item.quantity ?? undefined,
      total: item.amount_total ? item.amount_total / 100 : undefined,
    })
  }

  return cart
}

function strictDetermineOrderType(session: Stripe.Checkout.Session): string {
  const meta = (session.metadata || {}) as Record<string, string>
  if (meta.orderType) return meta.orderType
  if (meta.source === 'pos' || meta.location) return 'in-store'
  const customerType = (session.customer_details as any)?.metadata?.customerType
  if (customerType === 'wholesale') return 'wholesale'
  return 'online'
}

function strictCaptureAttribution(session: Stripe.Checkout.Session) {
  const metadata = (session.metadata || {}) as Record<string, string>
  return {
    source: metadata.utm_source || 'direct',
    medium: metadata.utm_medium || 'website',
    campaign: metadata.utm_campaign || null,
    content: metadata.utm_content || null,
    term: metadata.utm_term || null,
    landingPage: metadata.landing_page || null,
    referrer: metadata.referrer || null,
    capturedAt: new Date().toISOString(),
    device: metadata.device || 'unknown',
    browser: metadata.browser || null,
    os: metadata.os || null,
    sessionId: metadata.session_id || null,
    touchpoints: 1,
    firstTouch: new Date().toISOString(),
    lastTouch: new Date().toISOString(),
    campaignRef: null,
  }
}

function buildInvoiceLineItems(
  orderCart: any[],
  products: CartProductSummary[] | null | undefined,
): any[] {
  if (!Array.isArray(orderCart) || !orderCart.length) return []
  return orderCart.map((item: any) => {
    const product = findProductForItem(item, products || []) || null
    const quantity = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 1
    const baseCandidates = [
      product?.compareAtPrice,
      product?.price,
      product?.salePrice,
      typeof item.price === 'number' ? item.price : undefined,
    ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    const baseUnitPrice = baseCandidates.length ? baseCandidates[0] : 0
    const total = baseUnitPrice * (quantity || 1)
    return {
      _type: 'invoiceLineItem',
      _key: item._key || Math.random().toString(36).substr(2, 9),
      description: item.name,
      sku: item.sku || '',
      quantity: quantity || 1,
      unitPrice: toCurrencyNumber(baseUnitPrice) ?? 0,
      lineTotal: toCurrencyNumber(total) ?? total,
      total: toCurrencyNumber(total) ?? total,
      optionSummary: item.optionSummary,
      optionDetails: item.optionDetails,
      upgrades: item.upgrades,
      metadata: item.metadata,
      metadataEntries: item.metadataEntries,
    }
  })
}

async function strictCreateInvoice(
  order: any,
  customer: {_id: string; name?: string} | null,
  options: {
    cartProducts?: CartProductSummary[]
    amountDiscount?: number
    discountLabel?: string
    amountSubtotal?: number
    totalAmount?: number
  } = {},
) {
  const invoiceSubtotal =
    toCurrencyNumber(options.amountSubtotal) ?? toCurrencyNumber(order.amountSubtotal) ?? 0
  const invoiceDiscount =
    toCurrencyNumber(options.amountDiscount) ?? toCurrencyNumber(order.amountDiscount) ?? 0
  const invoiceTotal =
    toCurrencyNumber(options.totalAmount) ?? toCurrencyNumber(order.totalAmount) ?? 0

  const invoice = await webhookSanityClient.create({
    _type: 'invoice',
    title: `Invoice for ${order.orderNumber}`,
    invoiceNumber: (order.orderNumber || '').toString().replace('FAS-', 'INV-'),
    status: 'paid',
    invoiceDate: order.createdAt,
    dueDate: order.createdAt,
    paymentTerms: 'Paid in full',
    customerRef:
      customer?._id || order?.customerRef?._ref
        ? {
            _type: 'reference',
            _ref: customer?._id || order?.customerRef?._ref,
          }
        : undefined,
    orderRef: {
      _type: 'reference',
      _ref: order._id,
    },
    billTo: {
      name: order.customerName,
      email: order.customerEmail,
    },
    lineItems: buildInvoiceLineItems(order.cart || [], options.cartProducts),
    subtotal: invoiceSubtotal || 0,
    discountLabel: options.discountLabel || order.discountLabel || undefined,
    discountType: invoiceDiscount ? 'amount' : 'none',
    discountValue: invoiceDiscount || undefined,
    tax: order.amountTax || 0,
    shipping: order.amountShipping || 0,
    total: invoiceTotal || 0,
  })

  return invoice
}

async function createOrderFromCheckout(checkoutSession: Stripe.Checkout.Session) {
  let expandedSession: Stripe.Checkout.Session | null = null
  try {
    expandedSession = await stripe.checkout.sessions.retrieve(checkoutSession.id, {
      expand: [
        'line_items',
        'line_items.data.price',
        'line_items.data.price.product',
        'payment_intent',
        'customer',
      ],
    })
  } catch (err) {
    console.warn('stripeWebhook: failed to expand checkout session', err)
  }

  const session = expandedSession || checkoutSession
  const paymentStatusValue = (session.payment_status || '').toString().toLowerCase()
  const isPaid =
    paymentStatusValue === 'paid' ||
    paymentStatusValue === 'succeeded' ||
    paymentStatusValue === 'complete'
  if (!isPaid) {
    console.warn('stripeWebhook: skipping checkout order creation (payment not paid)', {
      sessionId: session.id,
      payment_status: session.payment_status,
    })
    return
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null | undefined)?.id
  if (!paymentIntentId) {
    console.warn('stripeWebhook: skipping checkout order creation (missing payment_intent)', {
      sessionId: session.id,
    })
    return
  }

  const existingOrder = await webhookSanityClient.fetch<{
    _id: string
    status?: string
    invoiceRef?: {_ref: string}
    orderNumber?: string
    cart?: any[]
    fulfillment?: Record<string, unknown> | null
    trackingNumber?: string | null
    trackingUrl?: string | null
    shippingLabelUrl?: string | null
    carrier?: string | null
    service?: string | null
    labelCreatedAt?: string | null
    deliveryDays?: number | null
    estimatedDeliveryDate?: string | null
    easyPostShipmentId?: string | null
    easyPostTrackerId?: string | null
    easypostRateId?: string | null
    labelCost?: number | null
    labelPurchased?: boolean | null
    labelPurchasedAt?: string | null
    labelPurchasedBy?: string | null
  } | null>(
    `*[_type == "order" && (
      stripeSessionId == $sid ||
      paymentIntentId == $pid ||
      stripePaymentIntentId == $pid
    )][0]{_id, status, invoiceRef, orderNumber, cart, trackingNumber, trackingUrl, shippingLabelUrl, fulfillment, carrier, service, labelCreatedAt, deliveryDays, estimatedDeliveryDate, easyPostShipmentId, easyPostTrackerId, easypostRateId, labelCost, labelPurchased, labelPurchasedAt, labelPurchasedBy}`,
    {sid: session.id, pid: paymentIntentId},
  )

  if (
    existingOrder?.status &&
    ['canceled', 'cancelled', 'refunded'].includes(existingOrder.status.toLowerCase())
  ) {
    console.log(
      `stripeWebhook: checkout.session.completed ignored for terminal order ${existingOrder.orderNumber}`,
    )
    return
  }

  const customer = await strictFindOrCreateCustomer(session)
  const paymentDetails = await strictGetPaymentDetails(paymentIntentId)
  const sessionPaymentIntent =
    typeof session.payment_intent === 'object' && session.payment_intent
      ? (session.payment_intent as Stripe.PaymentIntent)
      : null
  const sessionCharge =
    (sessionPaymentIntent?.latest_charge as Stripe.Charge | null | undefined) ||
    (
      sessionPaymentIntent as Stripe.PaymentIntent & {
        charges?: Stripe.ApiList<Stripe.Charge> | null
      }
    )?.charges?.data?.[0] ||
    null

  if (!paymentDetails.paymentIntent && sessionPaymentIntent) {
    paymentDetails.paymentIntent = sessionPaymentIntent
  }
  if (!paymentDetails.charge && sessionCharge) {
    paymentDetails.charge = sessionCharge
  }
  if (sessionCharge) {
    const cardDetails = sessionCharge.payment_method_details?.card
    if (!paymentDetails.cardBrand && cardDetails?.brand) {
      paymentDetails.cardBrand = cardDetails.brand
    }
    if (!paymentDetails.cardLast4 && cardDetails?.last4) {
      paymentDetails.cardLast4 = cardDetails.last4
    }
    if (!paymentDetails.receiptUrl && sessionCharge.receipt_url) {
      paymentDetails.receiptUrl = sessionCharge.receipt_url
    }
    if (!paymentDetails.billingAddress && sessionCharge.billing_details?.address) {
      paymentDetails.billingAddress = {
        name: sessionCharge.billing_details.name || undefined,
        addressLine1: sessionCharge.billing_details.address?.line1 || undefined,
        addressLine2: sessionCharge.billing_details.address?.line2 || undefined,
        city: sessionCharge.billing_details.address?.city || undefined,
        state: sessionCharge.billing_details.address?.state || undefined,
        postalCode: sessionCharge.billing_details.address?.postal_code || undefined,
        country: sessionCharge.billing_details.address?.country || undefined,
        phone: sessionCharge.billing_details.phone || undefined,
        email: sessionCharge.billing_details.email || undefined,
      }
    }
  }

  if (!paymentDetails.paymentIntent) {
    try {
      const fallbackPi = await fetchPaymentIntentResource(paymentIntentId)
      if (fallbackPi) {
        paymentDetails.paymentIntent = fallbackPi
        const fallbackCharge =
          paymentDetails.charge ||
          (fallbackPi.latest_charge as Stripe.Charge | null | undefined) ||
          ((fallbackPi as any).charges?.data?.[0] as Stripe.Charge | null | undefined) ||
          null
        if (fallbackCharge) {
          paymentDetails.charge = fallbackCharge
          const cardDetails = fallbackCharge.payment_method_details?.card
          if (!paymentDetails.cardBrand && cardDetails?.brand) {
            paymentDetails.cardBrand = cardDetails.brand
          }
          if (!paymentDetails.cardLast4 && cardDetails?.last4) {
            paymentDetails.cardLast4 = cardDetails.last4
          }
          if (!paymentDetails.receiptUrl && fallbackCharge.receipt_url) {
            paymentDetails.receiptUrl = fallbackCharge.receipt_url
          }
          if (!paymentDetails.billingAddress && fallbackCharge.billing_details?.address) {
            paymentDetails.billingAddress = {
              name: fallbackCharge.billing_details.name || undefined,
              addressLine1: fallbackCharge.billing_details.address?.line1 || undefined,
              addressLine2: fallbackCharge.billing_details.address?.line2 || undefined,
              city: fallbackCharge.billing_details.address?.city || undefined,
              state: fallbackCharge.billing_details.address?.state || undefined,
              postalCode: fallbackCharge.billing_details.address?.postal_code || undefined,
              country: fallbackCharge.billing_details.address?.country || undefined,
              phone: fallbackCharge.billing_details.phone || undefined,
              email: fallbackCharge.billing_details.email || undefined,
            }
          }
        }
      }
    } catch (err) {
      console.warn('stripeWebhook: unable to backfill payment intent for checkout session', err)
    }
  }
  const sessionMeta = (session.metadata || {}) as Record<string, string>
  const expandedLineItems = expandedSession?.line_items?.data as Stripe.LineItem[] | undefined
  const {items: cartItems, products: cartProducts} = await buildCartFromSessionLineItems(
    session.id,
    sessionMeta,
    {lineItems: expandedLineItems},
  )

  const normalizedCart = cartItems.map((item) => ({
    ...item,
    optionDetails: Array.isArray(item.optionDetails) ? item.optionDetails : [],
    upgrades: Array.isArray(item.upgrades) ? item.upgrades : [],
  }))

  let shippingMetrics = ensureShippingMetricsFromProducts(
    computeShippingMetrics(normalizedCart, cartProducts),
    normalizedCart,
    cartProducts,
  )
  const sessionWeight =
    resolveShippingWeightLbs(session, sessionMeta) ||
    resolveShippingWeightLbs(undefined, paymentDetails.paymentIntent?.metadata as any)
  if (
    sessionWeight !== undefined &&
    (!shippingMetrics.weight || !shippingMetrics.weight.value || shippingMetrics.weight.value <= 0)
  ) {
    shippingMetrics = {
      ...shippingMetrics,
      weight: {_type: 'shipmentWeight', value: sessionWeight, unit: 'pound'},
    }
  }

  // Extract amounts from Stripe session FIRST
  const stripeSubtotal = toMajorUnits(session.amount_subtotal) ?? 0
  const amountTax = toMajorUnits(session.total_details?.amount_tax) ?? 0
  const amountShippingRaw = toMajorUnits(
    session.total_details?.amount_shipping ?? session.shipping_cost?.amount_total,
  )

  const shippingDetails = await resolveStripeShippingDetails({
    metadata: sessionMeta,
    session,
    fallbackAmount: amountShippingRaw,
    stripe,
  })
  const currencyUpper = (session.currency || '').toString().toUpperCase() || undefined
  const currencyLower = (session.currency || '').toString().toLowerCase() || undefined

  const resolvedShippingAmount =
    shippingDetails.amount !== undefined ? shippingDetails.amount : amountShippingRaw

  const cartPricing = computeCartPricingSummary(normalizedCart, cartProducts)
  const stripeDiscountAmount =
    toCurrencyNumber(toMajorUnits((session as any)?.total_details?.amount_discount)) ?? 0
  const amountSubtotal =
    toCurrencyNumber(cartPricing.subtotal || stripeSubtotal) ??
    toCurrencyNumber(stripeSubtotal) ??
    0
  const saleDiscount = cartPricing.saleDiscount || 0
  const amountDiscount = toCurrencyNumber(saleDiscount + stripeDiscountAmount) ?? 0
  const resolvedDiscountLabel = undefined

  const computedTotal =
    amountSubtotal - amountDiscount + (amountTax || 0) + (resolvedShippingAmount || 0)
  const totalAmount =
    toCurrencyNumber(toMajorUnits(session.amount_total ?? undefined)) ??
    toCurrencyNumber(computedTotal) ??
    0

  const emailOptInValue =
    parseBooleanFlag(
      sessionMeta['email_opt_in'] ||
        sessionMeta['emailOptIn'] ||
        sessionMeta['newsletter'] ||
        sessionMeta['newsletter_opt_in'],
    ) ?? undefined
  const marketingOptInValue =
    parseBooleanFlag(
      sessionMeta['marketing_opt_in'] ||
        sessionMeta['marketingOptIn'] ||
        sessionMeta['promo_opt_in'] ||
        sessionMeta['promoOptIn'],
    ) ?? emailOptInValue
  const textOptInValue = parseBooleanFlag(
    sessionMeta['text_opt_in'] ||
      sessionMeta['textOptIn'] ||
      sessionMeta['sms_opt_in'] ||
      sessionMeta['smsOptIn'],
  )
  const userIdValue =
    sessionMeta['user_id'] ||
    sessionMeta['userId'] ||
    sessionMeta['auth0_user_id'] ||
    sessionMeta['auth_user_id'] ||
    undefined

  const orderNumber = existingOrder?.orderNumber || (await generateRandomOrderNumber())
  const nowIso = new Date().toISOString()
  const customerEmail = (session.customer_details?.email || session.customer_email || '')
    .toString()
    .trim()
  const preliminaryStripeSummary = buildStripeSummary({
    session,
    paymentIntent: paymentDetails.paymentIntent || undefined,
    charge: paymentDetails.charge || undefined,
    eventType: 'checkout.session.completed',
    eventCreated: session.created,
  })
  const shippingAddress = extractCompleteShippingAddress(
    session,
    preliminaryStripeSummary,
    customerEmail,
  )
  const billingAddress =
    paymentDetails.billingAddress ||
    (sessionCharge?.billing_details?.address
      ? normalizeStripeContactAddress(sessionCharge.billing_details.address, {
          name: sessionCharge.billing_details.name || customer?.name || undefined,
          email: sessionCharge.billing_details.email || customerEmail || undefined,
          phone: sessionCharge.billing_details.phone || undefined,
        })
      : undefined) ||
    normalizeStripeContactAddress(session.customer_details?.address || null, {
      name: session.customer_details?.name || customer?.name || undefined,
      email: session.customer_details?.email || customerEmail || undefined,
      phone: session.customer_details?.phone || undefined,
    })
  const cardBrandFromSummary = preliminaryStripeSummary?.paymentMethod?.brand
  const cardLast4FromSummary = preliminaryStripeSummary?.paymentMethod?.last4
  if (cardBrandFromSummary && !paymentDetails.cardBrand) {
    paymentDetails.cardBrand = cardBrandFromSummary
  }
  if (cardLast4FromSummary && !paymentDetails.cardLast4) {
    paymentDetails.cardLast4 = cardLast4FromSummary
  }
  console.log('stripeWebhook: checkout shipping details', (session as any).shipping_details)
  console.log('stripeWebhook: checkout customer address', session.customer_details?.address)
  console.log('stripeWebhook: extracted checkout shipping address', shippingAddress)
  if (!shippingAddress) {
    console.warn('stripeWebhook: skipping checkout order creation (missing shipping address)', {
      sessionId: session.id,
    })
    return
  }
  const customerName =
    customer?.name ||
    shippingAddress?.name ||
    session.customer_details?.name ||
    (session as any)?.shipping_details?.name ||
    'Customer'

  const captureMethod =
    paymentDetails.paymentIntent?.capture_method ||
    sessionPaymentIntent?.capture_method ||
    'automatic'
  const paymentIntentStatus = (paymentDetails.paymentIntent?.status || '').toLowerCase()
  const metadataCaptureStrategyRaw =
    sessionMeta['capture_strategy'] ||
    (paymentDetails.paymentIntent?.metadata?.capture_strategy as string) ||
    (captureMethod === 'manual' ? 'manual' : 'auto')
  const paymentCaptureStrategy =
    metadataCaptureStrategyRaw === 'manual' ? 'manual' : ('auto' as 'auto' | 'manual')
  const paymentCaptured =
    paymentCaptureStrategy === 'auto' || ['succeeded', 'paid'].includes(paymentIntentStatus)
  const paymentCapturedAt =
    paymentCaptured && paymentDetails.charge?.created
      ? unixToIso(paymentDetails.charge.created)
      : paymentCaptured
        ? nowIso
        : undefined

  const baseOrderPayload: any = {
    _type: 'order',
    stripeSessionId: session.id,
    orderNumber,
    orderType: strictDetermineOrderType(session),
    status: 'paid',
    createdAt: nowIso,
    paymentStatus: session.payment_status || 'paid',
    customerName,
    customerEmail: customerEmail || '',
    customerRef: customer?._id
      ? {
          _type: 'reference',
          _ref: customer._id,
        }
      : undefined,
    cardBrand: paymentDetails.cardBrand || cardBrandFromSummary || null,
    cardLast4: paymentDetails.cardLast4 || cardLast4FromSummary || null,
    receiptUrl: paymentDetails.receiptUrl || null,
    paymentIntentId: paymentIntentId,
    stripePaymentIntentId: paymentIntentId,
    cart: normalizedCart,
    amountDiscount,
    totalAmount,
    amountSubtotal,
    amountTax,
    amountShipping: resolvedShippingAmount ?? 0,
    currency: currencyUpper || currencyLower || 'USD',
    paymentCaptureStrategy,
    paymentCaptured,
    paymentCapturedAt,
    labelPurchased: existingOrder?.labelPurchased ?? false,
    labelPurchasedAt: existingOrder?.labelPurchasedAt ?? null,
    labelPurchasedBy: existingOrder?.labelPurchasedBy ?? null,
    shippingAddress: shippingAddress || undefined,
    billingAddress: billingAddress || undefined,
    packageWeight: sessionWeight || shippingMetrics?.weight?.value || null,
    packageDimensions: shippingMetrics?.dimensions || {length: 12, width: 9, height: 6},
  }

  // Apply shipping metrics to nested fulfillment data as well
  applyShippingMetrics(baseOrderPayload, shippingMetrics)
  applyPackageDimensions(baseOrderPayload, shippingMetrics, sessionWeight)
  applyShippingDetailsToDoc(baseOrderPayload, shippingDetails, currencyUpper)

  baseOrderPayload.stripeSummary = serializeStripeSummaryData(preliminaryStripeSummary)
  if (!baseOrderPayload.cardBrand && preliminaryStripeSummary?.paymentMethod?.brand) {
    baseOrderPayload.cardBrand = preliminaryStripeSummary.paymentMethod.brand
  }
  if (!baseOrderPayload.cardLast4 && preliminaryStripeSummary?.paymentMethod?.last4) {
    baseOrderPayload.cardLast4 = preliminaryStripeSummary.paymentMethod.last4
  }

  const fulfillmentResult = deriveFulfillmentFromMetadata(
    sessionMeta,
    shippingDetails,
    nowIso,
    (existingOrder as any)?.fulfillment,
  )

  if (fulfillmentResult) {
    const mergedFulfillment = existingOrder?.fulfillment
      ? {...existingOrder.fulfillment, ...fulfillmentResult.fulfillment}
      : fulfillmentResult.fulfillment
    baseOrderPayload.fulfillment = mergedFulfillment

    const topFields = fulfillmentResult.topLevelFields || {}
    if (topFields.trackingNumber && !existingOrder?.trackingNumber) {
      baseOrderPayload.trackingNumber = topFields.trackingNumber
    }
    if (topFields.trackingUrl && !existingOrder?.trackingUrl) {
      baseOrderPayload.trackingUrl = topFields.trackingUrl
    }
    if (topFields.shippingLabelUrl && !existingOrder?.shippingLabelUrl) {
      baseOrderPayload.shippingLabelUrl = topFields.shippingLabelUrl
    }
    if (topFields.carrier && !existingOrder?.carrier) {
      baseOrderPayload.carrier = topFields.carrier
    }
    if (topFields.service && !existingOrder?.service) {
      baseOrderPayload.service = topFields.service
    }
    if (topFields.labelCreatedAt && !existingOrder?.labelCreatedAt) {
      baseOrderPayload.labelCreatedAt = topFields.labelCreatedAt
    }
    if (typeof topFields.deliveryDays === 'number' && existingOrder?.deliveryDays === undefined) {
      baseOrderPayload.deliveryDays = topFields.deliveryDays
    }
    if (topFields.estimatedDeliveryDate && !existingOrder?.estimatedDeliveryDate) {
      baseOrderPayload.estimatedDeliveryDate = topFields.estimatedDeliveryDate
    }
    if (topFields.easyPostShipmentId && !existingOrder?.easyPostShipmentId) {
      baseOrderPayload.easyPostShipmentId = topFields.easyPostShipmentId
    }
    if (topFields.easyPostTrackerId && !existingOrder?.easyPostTrackerId) {
      baseOrderPayload.easyPostTrackerId = topFields.easyPostTrackerId
    }
    if (topFields.easypostRateId && !existingOrder?.easypostRateId) {
      baseOrderPayload.easypostRateId = topFields.easypostRateId
    }
    if (typeof topFields.labelCost === 'number' && existingOrder?.labelCost === undefined) {
      baseOrderPayload.labelCost = topFields.labelCost
    }
  }

  if (shippingAddress) {
    if (baseOrderPayload.fulfillment) {
      const fulfillmentWithAddress = baseOrderPayload.fulfillment as Record<string, any>
      if (!fulfillmentWithAddress.shippingAddress) {
        baseOrderPayload.fulfillment = {...fulfillmentWithAddress, shippingAddress}
      }
    } else {
      baseOrderPayload.fulfillment = {status: 'unfulfilled', shippingAddress}
    }
  }

  if (baseOrderPayload.fulfillment) {
    const fulfillmentWithDefaults = baseOrderPayload.fulfillment as Record<string, any>
    if (!fulfillmentWithDefaults.status) {
      fulfillmentWithDefaults.status = 'unfulfilled'
    }
    if (!fulfillmentWithDefaults.packageDimensions) {
      fulfillmentWithDefaults.packageDimensions = {
        weight: sessionWeight ?? null,
        length: null,
        width: null,
        height: null,
      }
    }
    baseOrderPayload.fulfillment = fulfillmentWithDefaults
  }

  const desiredFulfillmentStatus = paymentCaptured ? 'ready_to_ship' : 'awaiting_capture'
  if (baseOrderPayload.fulfillment) {
    const fulfillment = baseOrderPayload.fulfillment as Record<string, any>
    if (!fulfillment.status || fulfillment.status === 'unfulfilled') {
      fulfillment.status = desiredFulfillmentStatus
    }
  } else {
    baseOrderPayload.fulfillment = {status: desiredFulfillmentStatus}
  }

  const validationIssues = validateOrderData(baseOrderPayload)
  if (validationIssues.length) {
    console.warn('stripeWebhook: order validation issues', {
      sessionId: session.id,
      issues: validationIssues,
    })
    if (validationIssues.includes('Cart is empty')) {
      throw new Error('stripeWebhook: cannot create order without cart items')
    }
  }

  const order = existingOrder
    ? await webhookSanityClient
        .patch(existingOrder._id)
        .set(baseOrderPayload)
        .setIfMissing({orderNumber})
        .commit({autoGenerateArrayKeys: true})
    : await webhookSanityClient.create(baseOrderPayload, {autoGenerateArrayKeys: true})

  const orderCustomerId = (order as any)?.customerRef?._ref || customer?._id || null
  if (order?._id && orderCustomerId) {
    await linkOrderToCustomer(webhookSanityClient, order._id, orderCustomerId)
  }

  const needsInvoice = order?._id && !(order as any)?.invoiceRef?._ref
  let linkedInvoiceId: string | null = null
  if (needsInvoice) {
    try {
      const invoice = await strictCreateInvoice(order, customer, {
        cartProducts,
        amountDiscount,
        discountLabel: resolvedDiscountLabel,
        amountSubtotal,
        totalAmount,
      })
      linkedInvoiceId = invoice._id
      await linkOrderToInvoice(webhookSanityClient, order._id, invoice._id)
      if (orderCustomerId) {
        await linkInvoiceToCustomer(webhookSanityClient, invoice._id, orderCustomerId)
      }
    } catch (err) {
      console.warn('stripeWebhook: failed to create/link invoice for checkout order', err)
    }
  } else if (order?._id && !(order as any)?.invoiceRef?._ref) {
    try {
      linkedInvoiceId =
        (await webhookSanityClient.fetch<string | null>(
          `*[_type == "invoice" && orderNumber == $orderNumber][0]._id`,
          {orderNumber},
        )) || null
      if (linkedInvoiceId) {
        await linkOrderToInvoice(webhookSanityClient, order._id, linkedInvoiceId)
        if (orderCustomerId) {
          await linkInvoiceToCustomer(webhookSanityClient, linkedInvoiceId, orderCustomerId)
        }
      }
    } catch (err) {
      console.warn('stripeWebhook: failed to backfill invoice linkage for checkout order', err)
    }
  }

  const existingInvoiceRef =
    linkedInvoiceId || ((order as any)?.invoiceRef?._ref as string | undefined) || null
  if (existingInvoiceRef && orderCustomerId) {
    try {
      await linkInvoiceToCustomer(webhookSanityClient, existingInvoiceRef, orderCustomerId)
    } catch (err) {
      console.warn('stripeWebhook: failed to ensure invoice -> customer linkage', err)
    }
  }
  if (existingInvoiceRef && order?._id) {
    try {
      await linkOrderToInvoice(webhookSanityClient, order._id, existingInvoiceRef)
    } catch (err) {
      console.warn('stripeWebhook: failed to ensure order <-> invoice linkage', err)
    }
  }

  if (order?._id) {
    try {
      await updateCustomerProfileForOrder({
        sanity: webhookSanityClient,
        orderId: order._id,
        customerId: orderCustomerId || undefined,
        email: order.customerEmail,
        shippingAddress: (baseOrderPayload as any)?.shippingAddress,
        billingAddress,
        stripeCustomerId: customer?.stripeCustomerId || undefined,
        stripeSyncTimestamp: nowIso,
        customerName: order.customerName,
        metadata: sessionMeta,
        defaultRoles: ['customer'],
        emailOptIn: emailOptInValue,
        marketingOptIn: marketingOptInValue,
        textOptIn: textOptInValue,
        userId: userIdValue,
      })
    } catch (err) {
      console.warn('stripeWebhook: failed to sync customer profile after checkout', err)
    }
  }

  return order
}

const PRODUCT_METADATA_ID_KEYS = [
  'sanity_id',
  'sanityId',
  'sanity_document_id',
  'sanityDocId',
  'sanity_doc_id',
  'sanityProductId',
  'sanity_product_id',
  'sanityDocumentId',
  'document_id',
  'documentId',
  'product_document_id',
  'productDocumentId',
]

const PRODUCT_METADATA_SKU_KEYS = ['sku', 'SKU', 'product_sku', 'productSku', 'sanity_sku']
const PRODUCT_METADATA_SLUG_KEYS = ['sanity_slug', 'slug', 'product_slug', 'productSlug']

const INVOICE_METADATA_ID_KEYS = ['sanity_invoice_id', 'invoice_id', 'sanityInvoiceId', 'invoiceId']
const INVOICE_METADATA_NUMBER_KEYS = [
  'sanity_invoice_number',
  'invoice_number',
  'invoiceNumber',
  'sanityInvoiceNumber',
]

const QUOTE_METADATA_ID_KEYS = ['sanity_quote_id', 'quote_id', 'sanityQuoteId', 'quoteId']
const QUOTE_METADATA_NUMBER_KEYS = ['sanity_quote_number', 'quote_number', 'quoteNumber']

const CUSTOMER_METADATA_ID_KEYS = [
  'stripe_customer_id',
  'stripeCustomerId',
  'sanity_customer_id',
  'sanityCustomerId',
  'customer_id',
  'customerId',
]

const PAYMENT_LINK_METADATA_ID_KEYS = [
  'sanity_payment_link_id',
  'payment_link_id',
  'sanityPaymentLinkId',
  'paymentLinkId',
]
const PAYMENT_LINK_METADATA_QUOTE_KEYS = ['sanity_quote_id', 'quote_id', 'quoteId', 'sanityQuoteId']
const PAYMENT_LINK_METADATA_ORDER_KEYS = ['sanity_order_id', 'order_id', 'orderId', 'sanityOrderId']
const ORDER_METADATA_ID_KEYS = ['sanity_order_id', 'order_id', 'orderId', 'sanityOrderId']
const ORDER_METADATA_NUMBER_KEYS = [
  'sanity_order_number',
  'sanityOrderNumber',
  'order_number',
  'orderNumber',
  'orderNo',
  'website_order_number',
  'websiteOrderNumber',
]
const SESSION_METADATA_KEYS = [
  'stripe_session_id',
  'stripeSessionId',
  'sanity_session_id',
  'session_id',
  'sessionId',
  'checkout_session_id',
]
const WEBHOOK_DOCUMENT_PREFIX = 'stripeWebhook.'

const mergeMetadata = (
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> | undefined => {
  const merged: Record<string, unknown> = {}
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    for (const [key, value] of Object.entries(source)) {
      if (typeof key !== 'string') continue
      merged[key] = value
    }
  }
  return Object.keys(merged).length ? merged : undefined
}

function isStripeProduct(
  product: Stripe.Product | Stripe.DeletedProduct | string | null | undefined,
): product is Stripe.Product {
  return Boolean(
    product &&
      typeof product === 'object' &&
      !('deleted' in product && (product as Stripe.DeletedProduct).deleted),
  )
}

function normalizeSanityId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.startsWith('drafts.') ? trimmed.slice(7) : trimmed
}

const extractMetadataOrderNumber = (
  metadata: Record<string, unknown> | null | undefined,
): string | undefined => {
  if (!metadata) return undefined
  return firstString(ORDER_METADATA_NUMBER_KEYS.map((key) => metadata[key]))
}

function slugifyValue(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || `product-${Math.random().toString(36).slice(2, 10)}`
  )
}

async function ensureCampaignDocument(attribution: AttributionParams): Promise<string | null> {
  const campaignName = attribution?.campaign ? attribution.campaign.trim() : ''
  if (!campaignName) return null
  const campaignKey = slugifyValue(campaignName)
  try {
    const existing = await sanity.fetch<{_id: string} | null>(
      `*[_type == "shoppingCampaign" && campaignKey == $key][0]{_id}`,
      {key: campaignKey},
    )
    if (existing?._id) return existing._id
    const created = await sanity.create(
      {
        _type: 'shoppingCampaign',
        campaign: campaignName,
        campaignKey,
        utmSource: attribution.source,
        utmMedium: attribution.medium,
      },
      {autoGenerateArrayKeys: true},
    )
    return created?._id || null
  } catch (err) {
    console.warn('stripeWebhook: failed to ensure campaign document', err)
    return null
  }
}

async function recordCampaignMetrics(campaignId: string | null, orderId?: string, amount?: number) {
  if (!campaignId) return
  try {
    if (orderId) {
      const alreadyLinked = await sanity.fetch<number>(
        `count(*[_type == "shoppingCampaign" && _id == $campaignId && references($orderId)])`,
        {campaignId, orderId},
      )
      if (alreadyLinked > 0) return
    }

    let patch = sanity
      .patch(campaignId)
      .setIfMissing({
        orders: [],
        metrics: {orderCount: 0, revenueTotal: 0},
      } as any)
      .inc({'metrics.orderCount': 1})
      .set({'metrics.lastOrderAt': new Date().toISOString()})

    if (typeof amount === 'number' && Number.isFinite(amount)) {
      patch = patch.inc({'metrics.revenueTotal': amount})
    }
    if (orderId) {
      patch = patch.append('orders', [{_type: 'reference', _ref: orderId, _key: randomUUID()}])
    }
    await patch.commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to update campaign metrics', err)
  }
}

async function applyAttributionToOrder(
  orderId: string,
  attributionParams?: AttributionParams | null,
) {
  const doc = buildAttributionDocument(attributionParams || undefined)
  if (!doc) return
  let campaignId: string | null = null
  if (doc.campaign) {
    campaignId = await ensureCampaignDocument(doc)
    if (campaignId) {
      ;(doc as any).campaignRef = {_type: 'reference', _ref: campaignId}
    }
  }
  try {
    await upsertAttributionDocumentForOrder(orderId, doc)
  } catch (err) {
    console.warn('stripeWebhook: failed to apply attribution to order', err)
  }
}

async function upsertAttributionDocumentForOrder(
  orderId: string,
  doc: AttributionParams,
): Promise<void> {
  try {
    const orderRecord = await sanity.fetch<{
      _id: string
      totalAmount?: number
      amountSubtotal?: number
      amountTax?: number
      customerRef?: {_ref: string}
    } | null>(
      `*[_type == "order" && _id == $id][0]{_id,totalAmount,amountSubtotal,amountTax,customerRef}`,
      {
        id: orderId,
      },
    )
    if (!orderRecord?._id) return
    const totalAmount = toPositiveNumber(orderRecord.totalAmount)
    const subtotalAmount = toPositiveNumber(orderRecord.amountSubtotal)
    const taxAmount = toPositiveNumber(orderRecord.amountTax)
    const base = typeof totalAmount === 'number' ? totalAmount : subtotalAmount
    const orderValue =
      (typeof base === 'number' ? base + (typeof taxAmount === 'number' ? taxAmount : 0) : null) ??
      toPositiveNumber(doc.orderValue)
    const touchpointsNumber = toPositiveNumber(doc.touchpoints)
    const createdAt = doc.capturedAt || new Date().toISOString()
    const attrDoc: Record<string, any> & {_id: string; _type: 'attribution'} = {
      _id: `attribution.${orderId}`.replace(/[^a-z0-9._-]+/gi, '-'),
      _type: 'attribution',
      order: {_type: 'reference', _ref: orderId},
      customer: orderRecord.customerRef?._ref
        ? {_type: 'reference', _ref: orderRecord.customerRef._ref}
        : undefined,
      utmSource: doc.source,
      utmMedium: doc.medium,
      utmCampaign: doc.campaign,
      utmContent: doc.content,
      utmTerm: doc.term,
      referrer: doc.referrer,
      landingPage: doc.landingPage,
      device: doc.device,
      browser: doc.browser,
      os: doc.os,
      sessionId: doc.sessionId,
      firstTouch: doc.firstTouch || createdAt,
      lastTouch: doc.lastTouch || createdAt,
      touchpoints: typeof touchpointsNumber === 'number' ? touchpointsNumber : undefined,
      orderValue: typeof orderValue === 'number' ? orderValue : undefined,
      createdAt,
    }
    Object.keys(attrDoc).forEach((key) => {
      if (attrDoc[key] === undefined || attrDoc[key] === null) {
        delete attrDoc[key]
      }
    })
    await sanity.createOrReplace(attrDoc, {autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to upsert attribution document', err)
  }
}

function toPositiveNumber(value?: string | number | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function toNonNegativeNumber(value?: string | number | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return null
}

async function ensureUniqueProductSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug || 'product'
  let suffix = 1
  while (suffix <= 20) {
    const exists = await sanity.fetch<number>(
      'count(*[_type == "product" && slug.current == $slug])',
      {slug},
    )
    if (!Number(exists)) return slug
    suffix += 1
    slug = `${baseSlug}-${suffix}`.slice(0, 96)
  }
  return `${baseSlug}-${Date.now()}`.slice(0, 96)
}

function toMajorUnits(amount?: number | null): number | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined
  return amount / 100
}

function unixToIso(timestamp?: number | null): string | undefined {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0)
    return undefined
  return new Date(timestamp * 1000).toISOString()
}

async function findProductDocumentId(opts: {
  metadata?: Record<string, string>
  stripeProductId?: string
  sku?: string
  slug?: string
}): Promise<string | null> {
  const meta = opts.metadata || {}

  const idCandidates = PRODUCT_METADATA_ID_KEYS.map((key) => normalizeSanityId(meta[key])).filter(
    Boolean,
  ) as string[]

  if (idCandidates.length > 0) {
    const variants = idCandidates.flatMap((id) => idVariants(id))
    const docId = await sanity.fetch<string | null>(`*[_type == "product" && _id in $ids][0]._id`, {
      ids: variants,
    })
    if (docId) return docId
  }

  if (opts.stripeProductId) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "product" && stripeProductId == $pid][0]._id`,
      {pid: opts.stripeProductId},
    )
    if (docId) return docId
  }

  const skuCandidates = [opts.sku, ...PRODUCT_METADATA_SKU_KEYS.map((key) => meta[key])]
    .map((value) => (value || '').toString().trim())
    .filter(Boolean)
  if (skuCandidates.length > 0) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "product" && sku in $skus][0]._id`,
      {skus: skuCandidates},
    )
    if (docId) return docId
  }

  const slugCandidates = [opts.slug, ...PRODUCT_METADATA_SLUG_KEYS.map((key) => meta[key])]
    .map((value) => (value || '').toString().trim())
    .filter(Boolean)
  if (slugCandidates.length > 0) {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "product" && slug.current in $slugs][0]._id`,
      {slugs: slugCandidates},
    )
    if (docId) return docId
  }

  return null
}

async function ensureProductDocument(
  stripeProductId: string,
  metadata?: Record<string, string>,
): Promise<string | null> {
  let docId = await findProductDocumentId({stripeProductId, metadata})
  if (docId) return docId

  try {
    const product = await stripe.products.retrieve(stripeProductId)
    if (!isStripeProduct(product)) return null
    docId = await syncStripeProduct(product)
    return docId
  } catch (err) {
    console.warn('stripeWebhook: failed to retrieve Stripe product', err)
    return null
  }
}

function buildPriceSnapshot(price: Stripe.Price) {
  return {
    priceId: price.id,
    nickname: price.nickname || undefined,
    currency: price.currency ? price.currency.toUpperCase() : undefined,
    unitAmount: toMajorUnits(price.unit_amount),
    unitAmountRaw: typeof price.unit_amount === 'number' ? price.unit_amount : undefined,
    type: price.type,
    billingScheme: price.billing_scheme,
    recurringInterval: price.recurring?.interval || undefined,
    recurringIntervalCount: price.recurring?.interval_count ?? undefined,
    active: price.active,
    livemode: price.livemode,
    createdAt: unixToIso(price.created) || new Date().toISOString(),
  }
}

async function syncStripeProduct(product: Stripe.Product): Promise<string | null> {
  const metadata = (product.metadata || {}) as Record<string, string>
  const skuCandidates = [metadata.sku, metadata.SKU, metadata.product_sku, metadata.productSku]
    .map((value) => (value || '').toString().trim())
    .filter(Boolean)
  const slugMeta =
    metadata.sanity_slug || metadata.slug || metadata.product_slug || metadata.productSlug

  const existingId = await findProductDocumentId({
    metadata,
    stripeProductId: product.id,
    sku: skuCandidates[0],
    slug: slugMeta,
  })
  const updatedAt = unixToIso(product.updated) || new Date().toISOString()
  const defaultPriceId =
    typeof product.default_price === 'string' ? product.default_price : product.default_price?.id
  const sku = skuCandidates.find(Boolean)

  const shippingUpdates: Record<string, any> = {}
  const shippingWeight = toPositiveNumber(metadata.shipping_weight || metadata.shipping_weight_lbs)
  if (shippingWeight !== null) shippingUpdates.shippingWeight = shippingWeight
  const handling = toNonNegativeNumber(metadata.handling_time)
  if (handling !== null) shippingUpdates.handlingTime = handling
  const shippingDims = metadata.shipping_dimensions || metadata.shipping_box_dimensions
  if (shippingDims) shippingUpdates.boxDimensions = shippingDims
  if (metadata.shipping_class) shippingUpdates.shippingClass = metadata.shipping_class
  if ('ships_alone' in metadata) {
    shippingUpdates.shipsAlone = ['true', '1', 'yes'].includes(
      (metadata.ships_alone || '').toLowerCase(),
    )
  }

  const setOps: Record<string, any> = {
    stripeProductId: product.id,
    stripeActive: product.active,
    stripeUpdatedAt: updatedAt,
    ...shippingUpdates,
  }
  if (defaultPriceId) setOps.stripeDefaultPriceId = defaultPriceId

  if (existingId) {
    const existing = await sanity.fetch<{title?: string; sku?: string}>(
      `*[_id == $id][0]{title, sku}`,
      {id: existingId},
    )
    let patch = sanity.patch(existingId).set(setOps)
    if (sku && !existing?.sku) patch = patch.set({sku})
    if (product.name && !existing?.title) patch = patch.set({title: product.name})
    try {
      await patch.commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to patch product', err)
    }
    return existingId
  }

  const title = product.name || metadata.title || 'Stripe Product'
  const baseSlug = slugifyValue(slugMeta || title)
  const slug = await ensureUniqueProductSlug(baseSlug)

  const payload: Record<string, any> = {
    _type: 'product',
    title,
    slug: {_type: 'slug', current: slug},
    availability: 'in_stock',
    stripeProductId: product.id,
    stripeActive: product.active,
    stripeUpdatedAt: updatedAt,
    ...shippingUpdates,
  }
  if (defaultPriceId) payload.stripeDefaultPriceId = defaultPriceId
  if (sku) payload.sku = sku

  try {
    const created = await sanity.create(payload as any, {autoGenerateArrayKeys: true})
    return created?._id || null
  } catch (err) {
    console.warn('stripeWebhook: failed to create product doc from Stripe product', err)
    return null
  }
}

async function syncStripePrice(price: Stripe.Price): Promise<void> {
  const productId = typeof price.product === 'string' ? price.product : price.product?.id
  if (!productId) return

  const productObject = typeof price.product === 'string' ? null : price.product
  const combinedMeta: Record<string, string> = {
    ...(isStripeProduct(productObject)
      ? ((productObject.metadata || {}) as Record<string, string>)
      : {}),
    ...(price.metadata || {}),
  }

  const docId = await ensureProductDocument(productId, combinedMeta)
  if (!docId) return

  const existing = await sanity.fetch<{stripePrices?: any[]}>(`*[_id == $id][0]{stripePrices}`, {
    id: docId,
  })
  const currentPrices = Array.isArray(existing?.stripePrices) ? existing!.stripePrices : []
  const snapshot = buildPriceSnapshot(price)
  const filtered = currentPrices.filter(
    (entry: any) => entry?.priceId !== snapshot.priceId && entry?._key !== snapshot.priceId,
  )
  filtered.push({_type: 'stripePriceSnapshot', _key: snapshot.priceId, ...snapshot})

  const setOps: Record<string, any> = {
    stripePrices: filtered,
    stripeProductId: productId,
    stripeUpdatedAt: new Date().toISOString(),
  }

  if (
    typeof price.active === 'boolean' &&
    price.type === 'one_time' &&
    typeof price.unit_amount === 'number'
  ) {
    const major = toMajorUnits(price.unit_amount)
    if (typeof major === 'number') setOps.price = major
  }

  if (isStripeProduct(productObject) && productObject.default_price) {
    const defaultPriceId =
      typeof productObject.default_price === 'string'
        ? productObject.default_price
        : productObject.default_price?.id
    if (defaultPriceId) setOps.stripeDefaultPriceId = defaultPriceId
  }

  try {
    await sanity.patch(docId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to upsert Stripe price snapshot', err)
  }
}

async function removeStripePrice(priceId: string, productId?: string): Promise<void> {
  if (!priceId) return
  let docId: string | null = null
  if (productId) docId = await findProductDocumentId({stripeProductId: productId})
  if (!docId) {
    docId = await sanity.fetch<string | null>(
      `*[_type == "product" && stripePrices[].priceId == $pid][0]._id`,
      {pid: priceId},
    )
  }
  if (!docId) return

  const existing = await sanity.fetch<{stripePrices?: any[]; stripeDefaultPriceId?: string}>(
    `*[_id == $id][0]{stripePrices, stripeDefaultPriceId}`,
    {id: docId},
  )
  const currentPrices = Array.isArray(existing?.stripePrices) ? existing!.stripePrices : []
  const filtered = currentPrices.filter(
    (entry: any) => entry?.priceId !== priceId && entry?._key !== priceId,
  )

  const setOps: Record<string, any> = {
    stripePrices: filtered,
    stripeUpdatedAt: new Date().toISOString(),
  }

  if (existing?.stripeDefaultPriceId === priceId) {
    setOps.stripeDefaultPriceId = filtered[0]?.priceId || undefined
  }

  try {
    await sanity.patch(docId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to remove Stripe price snapshot', err)
  }
}

async function findCustomerDocIdByStripeCustomerId(
  stripeCustomerId?: string | null,
): Promise<string | null> {
  if (!stripeCustomerId) return null
  try {
    const docId = await sanity.fetch<string | null>(
      `*[_type == "customer" && stripeCustomerId == $id][0]._id`,
      {id: stripeCustomerId},
    )
    return docId || null
  } catch (err) {
    console.warn('stripeWebhook: failed to lookup customer by Stripe ID', err)
    return null
  }
}

async function resolveCustomerReference(
  stripeCustomerId?: string | null,
  email?: string | null,
): Promise<{_type: 'reference'; _ref: string} | undefined> {
  let docId = await findCustomerDocIdByStripeCustomerId(stripeCustomerId)

  if (!docId && stripeCustomerId && stripe) {
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId)
      if (customer && !('deleted' in customer && customer.deleted)) {
        await syncStripeCustomer(customer as Stripe.Customer)
        docId = await findCustomerDocIdByStripeCustomerId(stripeCustomerId)
      }
    } catch (err) {
      console.warn('stripeWebhook: unable to hydrate Stripe customer record', err)
    }
  }

  if (!docId && email) {
    const normalizedEmail = email.toString().trim().toLowerCase()
    if (normalizedEmail) {
      try {
        docId = await sanity.fetch<string | null>(
          `*[_type == "customer" && defined(email) && lower(email) == $email][0]._id`,
          {email: normalizedEmail},
        )
      } catch (err) {
        console.warn('stripeWebhook: failed to lookup customer by email', err)
      }
    }
  }

  return docId ? {_type: 'reference', _ref: docId} : undefined
}

function mapStripeQuoteStatus(status?: string | null): string {
  const normalized = (status || '').toLowerCase()
  switch (normalized) {
    case 'open':
      return 'Sent'
    case 'accepted':
      return 'Approved'
    case 'canceled':
    case 'cancelled':
      return 'Cancelled'
    case 'draft':
    default:
      return 'Draft'
  }
}

function mapQuoteConversionStatus(status?: string | null): string {
  const normalized = (status || '').toLowerCase()
  switch (normalized) {
    case 'accepted':
      return 'Converted'
    case 'canceled':
    case 'cancelled':
      return 'Closed'
    default:
      return 'Open'
  }
}

function buildQuoteBillTo(quote: Stripe.Quote): Record<string, string> | undefined {
  const details = (quote as any)?.customer_details
  if (!details) return undefined
  const billTo: Record<string, string> = {}
  if (details.name) billTo.name = details.name
  if (details.email) billTo.email = details.email
  if (details.phone) billTo.phone = details.phone
  const address = details.address || null
  if (address?.line1) billTo.address_line1 = address.line1
  if (address?.line2) billTo.address_line2 = address.line2
  if (address?.city) billTo.city_locality = address.city
  if (address?.state) billTo.state_province = address.state
  if (address?.postal_code) billTo.postal_code = address.postal_code
  if (address?.country) billTo.country_code = address.country
  return Object.keys(billTo).length > 0 ? billTo : undefined
}

function buildQuoteShipTo(quote: Stripe.Quote): Record<string, string> | undefined {
  const quoteAny = quote as any
  const shipping = quoteAny?.shipping_details || quoteAny?.shipping
  if (!shipping) return undefined
  const shipTo: Record<string, string> = {}
  if (shipping.name) shipTo.name = shipping.name
  if (shipping.email) shipTo.email = shipping.email
  if (shipping.phone) shipTo.phone = shipping.phone
  const address = shipping.address || null
  if (address?.line1) shipTo.address_line1 = address.line1
  if (address?.line2) shipTo.address_line2 = address.line2
  if (address?.city) shipTo.city_locality = address.city
  if (address?.state) shipTo.state_province = address.state
  if (address?.postal_code) shipTo.postal_code = address.postal_code
  if (address?.country) shipTo.country_code = address.country
  return Object.keys(shipTo).length > 0 ? shipTo : undefined
}

async function listQuoteLineItems(quote: Stripe.Quote): Promise<Stripe.LineItem[]> {
  const expanded = ((quote as any)?.line_items?.data || []) as Stripe.LineItem[]
  if (Array.isArray(expanded) && expanded.length > 0) {
    return expanded
  }
  if (!stripe) return []
  try {
    const response = await stripe.quotes.listLineItems(quote.id, {
      limit: 100,
      expand: ['data.price.product'],
    })
    return (response?.data || []) as Stripe.LineItem[]
  } catch (err) {
    console.warn('stripeWebhook: failed to list quote line items', err)
    return []
  }
}

async function buildQuoteLineItems(quote: Stripe.Quote): Promise<any[]> {
  const metadata = (quote.metadata || {}) as Record<string, string>
  const lineItems = await listQuoteLineItems(quote)
  if (!lineItems.length) return []

  const built: any[] = []
  for (const lineItem of lineItems) {
    const mapped = mapStripeLineItem(lineItem, {sessionMetadata: metadata})
    const fallbackQuantityRaw = Number(lineItem.quantity ?? 1)
    const fallbackQuantity = Number.isFinite(fallbackQuantityRaw) ? fallbackQuantityRaw : 1
    // Prefer mapped.quantity (may reflect derived values); otherwise use Stripe line item quantity.
    const quantity = mapped.quantity ?? fallbackQuantity
    const totalAmount =
      toMajorUnits((lineItem as any)?.amount_total) ??
      (mapped.price !== undefined && quantity ? mapped.price * quantity : undefined)
    const unitPrice =
      mapped.price !== undefined
        ? mapped.price
        : totalAmount !== undefined
          ? totalAmount / quantity
          : undefined

    const priceObj =
      lineItem.price && typeof lineItem.price === 'object' ? (lineItem.price as Stripe.Price) : null
    const productObj =
      priceObj && priceObj.product && typeof priceObj.product === 'object'
        ? (priceObj.product as Stripe.Product)
        : null
    const stripeProductId =
      mapped.stripeProductId ||
      (typeof lineItem.price?.product === 'string'
        ? (lineItem.price as any).product
        : productObj?.id)

    let productDocId: string | null = null
    if (stripeProductId) {
      const productMetadata = (productObj?.metadata || {}) as Record<string, string>
      productDocId = await ensureProductDocument(stripeProductId, productMetadata)
    } else if (mapped.productSlug) {
      try {
        productDocId = await sanity.fetch<string | null>(
          `*[_type == "product" && slug.current == $slug][0]._id`,
          {slug: mapped.productSlug},
        )
      } catch (err) {
        console.warn('stripeWebhook: failed to resolve product by slug for quote line item', err)
      }
    }

    const item: Record<string, any> = {
      _type: 'quoteLineItem',
      _key: randomUUID(),
      kind: productDocId ? 'product' : 'custom',
      quantity,
    }

    if (productDocId) {
      item.product = {_type: 'reference', _ref: productDocId}
    }

    const name = mapped.name || mapped.productName || lineItem.description || 'Line item'
    if (name) {
      item.customName = name
      item.description = lineItem.description || mapped.description || name
    }
    if (mapped.sku) item.sku = mapped.sku
    if (unitPrice !== undefined && Number.isFinite(unitPrice))
      item.unitPrice = Number(unitPrice.toFixed(2))
    if (totalAmount !== undefined && Number.isFinite(totalAmount))
      item.lineTotal = Number(totalAmount.toFixed(2))

    built.push(item)
  }

  return built
}

async function appendQuoteTimelineEvent(
  quoteId: string | null | undefined,
  action: string,
  occurredAt?: number | string | null,
): Promise<void> {
  if (!quoteId || !action) return
  try {
    await sanity
      .patch(quoteId)
      .setIfMissing({timeline: []})
      .append('timeline', [
        {
          _type: 'quoteTimelineEvent',
          _key: randomUUID(),
          action,
          timestamp: toIsoTimestamp(occurredAt),
        },
      ])
      .commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to append quote timeline event', err)
  }
}

async function findQuoteDocumentId(opts: {
  stripeQuoteId?: string | null
  metadata?: Record<string, string>
  quoteNumber?: string | null
}): Promise<string | null> {
  const meta = opts.metadata || {}
  const idCandidates = QUOTE_METADATA_ID_KEYS.map((key) => normalizeSanityId(meta[key])).filter(
    Boolean,
  ) as string[]

  if (idCandidates.length > 0) {
    try {
      const docId = await sanity.fetch<string | null>(`*[_type == "quote" && _id in $ids][0]._id`, {
        ids: idCandidates.flatMap((id) => idVariants(id)),
      })
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve quote by metadata id', err)
    }
  }

  if (opts.stripeQuoteId) {
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "quote" && stripeQuoteId == $id][0]._id`,
        {id: opts.stripeQuoteId},
      )
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve quote by Stripe ID', err)
    }
  }

  const numberCandidates = [
    sanitizeQuoteNumber(opts.quoteNumber),
    ...QUOTE_METADATA_NUMBER_KEYS.map((key) => sanitizeQuoteNumber(meta[key])),
  ].filter(Boolean) as string[]

  if (numberCandidates.length > 0) {
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "quote" && quoteNumber in $numbers][0]._id`,
        {numbers: numberCandidates},
      )
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve quote by number', err)
    }
  }

  return null
}

async function syncStripeQuote(
  quote: Stripe.Quote,
  opts: {eventType?: string; eventCreated?: number} = {},
): Promise<string | null> {
  const metadata = (quote.metadata || {}) as Record<string, string>
  const candidateQuoteNumber =
    sanitizeQuoteNumber(quote.number) ||
    QUOTE_METADATA_NUMBER_KEYS.map((key) => sanitizeQuoteNumber(metadata[key])).find(Boolean)

  let quoteId = await findQuoteDocumentId({
    stripeQuoteId: quote.id,
    metadata,
    quoteNumber: candidateQuoteNumber || null,
  })

  const billTo = buildQuoteBillTo(quote)
  const shipTo = buildQuoteShipTo(quote)
  const lineItems = await buildQuoteLineItems(quote)
  const subtotal = toMajorUnits((quote as any)?.amount_subtotal)
  const total = toMajorUnits((quote as any)?.amount_total)
  const taxAmount = toMajorUnits((quote as any)?.total_details?.amount_tax)
  const discountAmount = toMajorUnits((quote as any)?.total_details?.amount_discount)
  const discountType = discountAmount ? 'amount' : 'none'
  const stripeCustomerId =
    typeof quote.customer === 'string'
      ? quote.customer
      : (quote.customer as Stripe.Customer | undefined)?.id
  const customerEmail = ((quote as any)?.customer_details?.email || '') as string
  const quoteDate = isoDateFromUnix(quote.created)
  const expirationDate = isoDateFromUnix(quote.expires_at)
  const acceptedDate = isoDateFromUnix((quote as any)?.status_transitions?.accepted_at)
  const stripeQuotePdf = ((quote as any)?.pdf as string | undefined) || undefined
  const now = new Date().toISOString()

  if (!quoteId) {
    const quoteNumber = candidateQuoteNumber || (await generateRandomQuoteNumber())
    const payload: Record<string, any> = {
      _type: 'quote',
      quoteNumber,
      title: metadata.title || 'Stripe Quote',
      quoteDate: quoteDate || isoDateOnly(now),
      status: mapStripeQuoteStatus(quote.status),
      conversionStatus: mapQuoteConversionStatus(quote.status),
      createdAt: now,
      stripeQuoteId: quote.id,
      stripeQuoteStatus: quote.status || undefined,
      stripeQuoteNumber: quote.number || undefined,
      stripeCustomerId: stripeCustomerId || undefined,
      stripeLastSyncedAt: now,
    }
    if (billTo) payload.billTo = billTo
    if (shipTo) payload.shipTo = shipTo
    if (lineItems.length > 0) payload.lineItems = lineItems
    if (subtotal !== undefined) payload.subtotal = subtotal
    if (taxAmount !== undefined) payload.taxAmount = taxAmount
    if (total !== undefined) payload.total = total
    if (discountAmount !== undefined) {
      payload.discountType = discountType
      payload.discountValue = discountAmount
    }
    if (expirationDate) payload.expirationDate = expirationDate
    if (acceptedDate) payload.acceptedDate = acceptedDate
    if (stripeQuotePdf) payload.stripeQuotePdf = stripeQuotePdf

    const customerRef = await resolveCustomerReference(stripeCustomerId, customerEmail)
    if (customerRef) payload.customer = customerRef

    try {
      const created = await sanity.create(payload as any, {autoGenerateArrayKeys: true})
      quoteId = created?._id || null
    } catch (err) {
      console.warn('stripeWebhook: failed to create quote document', err)
      return null
    }
  }

  if (!quoteId) return null

  const setOps: Record<string, any> = {
    status: mapStripeQuoteStatus(quote.status),
    conversionStatus: mapQuoteConversionStatus(quote.status),
    stripeQuoteId: quote.id,
    stripeQuoteStatus: quote.status || undefined,
    stripeQuoteNumber: quote.number || undefined,
    stripeCustomerId: stripeCustomerId || undefined,
    stripeLastSyncedAt: now,
  }

  const existingQuote = await sanity.fetch<{quoteNumber?: string} | null>(
    `*[_type == "quote" && _id == $id][0]{quoteNumber}`,
    {id: quoteId},
  )
  if (!existingQuote?.quoteNumber && candidateQuoteNumber) {
    setOps.quoteNumber = candidateQuoteNumber
  }

  if (quoteDate) setOps.quoteDate = quoteDate
  if (expirationDate) setOps.expirationDate = expirationDate
  if (acceptedDate) setOps.acceptedDate = acceptedDate
  if (billTo) setOps.billTo = billTo
  if (shipTo) setOps.shipTo = shipTo
  if (lineItems.length > 0) setOps.lineItems = lineItems
  if (subtotal !== undefined) setOps.subtotal = subtotal
  if (taxAmount !== undefined) setOps.taxAmount = taxAmount
  if (total !== undefined) setOps.total = total
  if (discountAmount !== undefined) {
    setOps.discountType = discountType
    setOps.discountValue = discountAmount
  } else {
    setOps.discountType = 'none'
    setOps.discountValue = undefined
  }
  if ((quote as any)?.footer) setOps.customerMessage = (quote as any).footer
  if ((quote as any)?.header) setOps.paymentInstructions = (quote as any).header
  if (stripeQuotePdf) setOps.stripeQuotePdf = stripeQuotePdf

  const paymentLinkId =
    ((quote as any)?.payment_link as string | undefined) ||
    metadata.payment_link_id ||
    metadata.paymentLinkId
  if (paymentLinkId) setOps.stripePaymentLinkId = paymentLinkId

  const customerRef = await resolveCustomerReference(stripeCustomerId, customerEmail)
  if (customerRef) setOps.customer = customerRef

  try {
    await sanity.patch(quoteId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to update quote document', err)
  }

  await appendQuoteTimelineEvent(quoteId, opts.eventType || 'stripe.quote.sync', opts.eventCreated)

  return quoteId
}

async function fetchQuoteResource(resource: Stripe.Quote | string): Promise<Stripe.Quote | null> {
  if (!resource) return null
  const quoteId = typeof resource === 'string' ? resource : resource.id
  if (!quoteId) return typeof resource === 'object' ? resource : null
  if (!stripe) return typeof resource === 'object' ? resource : null
  try {
    const fresh = await stripe.quotes.retrieve(quoteId, {
      expand: ['line_items.data.price.product', 'customer'],
    })
    return fresh as Stripe.Quote
  } catch (err) {
    console.warn('stripeWebhook: failed to retrieve quote resource', err)
    return typeof resource === 'object' ? resource : null
  }
}

async function findPaymentLinkDocumentId(opts: {
  stripePaymentLinkId?: string | null
  metadata?: Record<string, string>
}): Promise<string | null> {
  const meta = opts.metadata || {}
  const idCandidates = PAYMENT_LINK_METADATA_ID_KEYS.map((key) =>
    normalizeSanityId(meta[key]),
  ).filter(Boolean) as string[]

  if (idCandidates.length > 0) {
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "paymentLink" && _id in $ids][0]._id`,
        {ids: idCandidates.flatMap((id) => idVariants(id))},
      )
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve payment link by metadata id', err)
    }
  }

  if (opts.stripePaymentLinkId) {
    try {
      const docId = await sanity.fetch<string | null>(
        `*[_type == "paymentLink" && stripePaymentLinkId == $id][0]._id`,
        {id: opts.stripePaymentLinkId},
      )
      if (docId) return docId
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve payment link by Stripe ID', err)
    }
  }

  return null
}

async function buildPaymentLinkLineItems(paymentLink: Stripe.PaymentLink): Promise<CartItem[]> {
  if (!stripe) return []
  try {
    const response = await stripe.paymentLinks.listLineItems(paymentLink.id, {
      limit: 100,
      expand: ['data.price.product'],
    })
    const metadata = (paymentLink.metadata || {}) as Record<string, string>
    const items = (response?.data || []).map((lineItem: Stripe.LineItem) => ({
      _type: 'orderCartItem',
      _key: randomUUID(),
      ...mapStripeLineItem(lineItem, {sessionMetadata: metadata}),
    })) as CartItem[]
    return await enrichCartItemsFromSanity(items, sanity)
  } catch (err) {
    console.warn('stripeWebhook: failed to list payment link line items', err)
    return []
  }
}

async function fetchPaymentLinkResource(
  resource: Stripe.PaymentLink | string,
): Promise<Stripe.PaymentLink | null> {
  if (!resource) return null
  const paymentLinkId = typeof resource === 'string' ? resource : resource.id
  if (!paymentLinkId) return typeof resource === 'object' ? resource : null
  if (!stripe) return typeof resource === 'object' ? resource : null
  try {
    const fresh = await stripe.paymentLinks.retrieve(paymentLinkId)
    return fresh as Stripe.PaymentLink
  } catch (err) {
    console.warn('stripeWebhook: failed to retrieve payment link resource', err)
    return typeof resource === 'object' ? resource : null
  }
}

async function syncStripePaymentLink(
  paymentLink: Stripe.PaymentLink,
  opts: {eventType?: string; eventCreated?: number} = {},
): Promise<string | null> {
  const metadata = (paymentLink.metadata || {}) as Record<string, string>
  let paymentLinkId = await findPaymentLinkDocumentId({
    stripePaymentLinkId: paymentLink.id,
    metadata,
  })

  const lineItems = await buildPaymentLinkLineItems(paymentLink)
  const metadataEntries = buildMetadataEntries(metadata)
  const status = paymentLink.active ? 'active' : 'inactive'
  const title = metadata.title || paymentLink.url || paymentLink.id
  const now = new Date().toISOString()

  let quoteDocId = await findQuoteDocumentId({
    metadata,
    stripeQuoteId: metadata.stripe_quote_id || metadata.quote_id || metadata.quoteId || null,
  })
  if (!quoteDocId) {
    const quoteCandidate = PAYMENT_LINK_METADATA_QUOTE_KEYS.map((key) =>
      normalizeSanityId(metadata[key]),
    ).find(Boolean)
    if (quoteCandidate) {
      try {
        quoteDocId = await sanity.fetch<string | null>(
          `*[_type == "quote" && _id in $ids][0]._id`,
          {ids: idVariants(quoteCandidate)},
        )
      } catch (err) {
        console.warn('stripeWebhook: failed to resolve quote reference for payment link', err)
      }
    }
  }
  let orderDocId: string | null = null
  const orderIdCandidate = PAYMENT_LINK_METADATA_ORDER_KEYS.map((key) =>
    normalizeSanityId(metadata[key]),
  ).find(Boolean)
  if (orderIdCandidate) {
    try {
      orderDocId = await sanity.fetch<string | null>(`*[_type == "order" && _id in $ids][0]._id`, {
        ids: idVariants(orderIdCandidate),
      })
    } catch (err) {
      console.warn('stripeWebhook: failed to resolve order for payment link', err)
    }
  }

  const customerEmail = (metadata.customer_email ||
    metadata.email ||
    metadata.billing_email ||
    '') as string
  const stripeCustomerId = metadata.stripe_customer_id || metadata.customer_id || undefined
  const customerRef = await resolveCustomerReference(stripeCustomerId, customerEmail)

  const baseSet: Record<string, any> = {
    title,
    stripePaymentLinkId: paymentLink.id,
    status,
    url: paymentLink.url || undefined,
    livemode: paymentLink.livemode ?? undefined,
    active: paymentLink.active,
    metadata: metadataEntries.length ? metadataEntries : undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    stripeLastSyncedAt: now,
    afterCompletion: safeJsonStringify(paymentLink.after_completion) || undefined,
  }

  if (customerRef) baseSet.customerRef = customerRef
  if (quoteDocId) baseSet.quoteRef = {_type: 'reference', _ref: quoteDocId}
  if (orderDocId) baseSet.orderRef = {_type: 'reference', _ref: orderDocId}

  if (!paymentLinkId) {
    const payload: Record<string, any> = {
      _type: 'paymentLink',
      ...baseSet,
    }
    try {
      const created = await sanity.create(payload as any, {autoGenerateArrayKeys: true})
      paymentLinkId = created?._id || null
    } catch (err) {
      console.warn('stripeWebhook: failed to create payment link document', err)
      return null
    }
  } else {
    try {
      await sanity.patch(paymentLinkId).set(baseSet).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update payment link document', err)
    }
  }

  if (paymentLinkId && quoteDocId) {
    try {
      await sanity
        .patch(quoteDocId)
        .set({
          stripePaymentLinkId: paymentLink.id,
          stripePaymentLinkUrl: paymentLink.url || undefined,
          paymentLinkRef: {_type: 'reference', _ref: paymentLinkId},
        })
        .commit({autoGenerateArrayKeys: true})
      await appendQuoteTimelineEvent(
        quoteDocId,
        opts.eventType || 'stripe.payment_link.sync',
        opts.eventCreated,
      )
    } catch (err) {
      console.warn('stripeWebhook: failed to link payment link to quote', err)
    }
  }

  return paymentLinkId
}

async function syncCustomerPaymentMethod(paymentMethod: Stripe.PaymentMethod): Promise<void> {
  const paymentMethodId = paymentMethod.id
  if (!paymentMethodId) return

  const stripeCustomerId =
    typeof paymentMethod.customer === 'string'
      ? paymentMethod.customer
      : (paymentMethod.customer as Stripe.Customer | undefined)?.id

  let targetDocIds: string[] = []
  const billingEmail = paymentMethod.billing_details?.email || null
  const now = new Date().toISOString()

  if (stripeCustomerId) {
    let docId = await findCustomerDocIdByStripeCustomerId(stripeCustomerId)
    if (!docId && stripe) {
      try {
        const customer = await stripe.customers.retrieve(stripeCustomerId)
        if (customer && !('deleted' in customer && customer.deleted)) {
          await syncStripeCustomer(customer as Stripe.Customer)
          docId = await findCustomerDocIdByStripeCustomerId(stripeCustomerId)
        }
      } catch (err) {
        console.warn('stripeWebhook: unable to reload customer for payment method', err)
      }
    }
    if (docId) targetDocIds.push(docId)
  }

  if (targetDocIds.length === 0 && billingEmail) {
    const normalizedEmail = billingEmail.toString().trim().toLowerCase()
    if (normalizedEmail) {
      try {
        const docId = await sanity.fetch<string | null>(
          `*[_type == "customer" && defined(email) && lower(email) == $email][0]._id`,
          {email: normalizedEmail},
        )
        if (docId) targetDocIds.push(docId)
      } catch (err) {
        console.warn('stripeWebhook: failed to find customer by billing email', err)
      }
    }
  }

  if (targetDocIds.length === 0) return

  const card = paymentMethod.card
  const wallet =
    card?.wallet && typeof card.wallet === 'object' ? Object.keys(card.wallet)[0] : undefined
  const createdAt = isoDateFromUnix(paymentMethod.created) || new Date().toISOString()

  for (const docId of targetDocIds) {
    let existing: {stripePaymentMethods?: any[]} | null = null
    try {
      existing = await sanity.fetch<{stripePaymentMethods?: any[]} | null>(
        `*[_type == "customer" && _id == $id][0]{stripePaymentMethods}`,
        {id: docId},
      )
    } catch (err) {
      console.warn('stripeWebhook: failed to load existing payment methods', err)
    }

    const current = Array.isArray(existing?.stripePaymentMethods)
      ? existing!.stripePaymentMethods
      : []
    const filtered = current.filter(
      (entry: any) => entry?.id !== paymentMethodId && entry?._key !== paymentMethodId,
    )
    filtered.unshift({
      _type: 'stripePaymentMethod',
      _key: paymentMethodId,
      id: paymentMethodId,
      type: paymentMethod.type || 'card',
      brand: card?.brand || 'Card on file',
      last4: card?.last4 || '',
      expMonth: card?.exp_month ?? undefined,
      expYear: card?.exp_year ?? undefined,
      funding: card?.funding || undefined,
      fingerprint: card?.fingerprint || undefined,
      wallet: wallet || undefined,
      customerId: stripeCustomerId || undefined,
      billingName: paymentMethod.billing_details?.name || undefined,
      billingEmail: billingEmail || undefined,
      billingZip: paymentMethod.billing_details?.address?.postal_code || undefined,
      createdAt,
      livemode: paymentMethod.livemode ?? undefined,
      isDefault: Boolean(
        (paymentMethod.metadata as any)?.is_default === 'true' ||
          (paymentMethod.metadata as any)?.default_payment_method === 'true',
      ),
    })

    try {
      await sanity
        .patch(docId)
        .set({
          stripePaymentMethods: filtered,
          stripeLastSyncedAt: now,
        })
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to upsert customer payment method', err)
    }
  }
}

async function removeCustomerPaymentMethod(paymentMethodId: string): Promise<void> {
  if (!paymentMethodId) return
  let customers: Array<{_id: string; stripePaymentMethods?: any[]}> = []
  try {
    customers =
      (await sanity.fetch(
        `*[_type == "customer" && stripePaymentMethods[].id == $id]{_id, stripePaymentMethods}`,
        {id: paymentMethodId},
      )) || []
  } catch (err) {
    console.warn('stripeWebhook: failed to lookup customers for payment method removal', err)
    return
  }

  for (const customer of customers) {
    const current = Array.isArray(customer.stripePaymentMethods)
      ? customer.stripePaymentMethods
      : []
    const filtered = current.filter(
      (entry: any) => entry?.id !== paymentMethodId && entry?._key !== paymentMethodId,
    )
    try {
      await sanity
        .patch(customer._id)
        .set({stripePaymentMethods: filtered})
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to remove payment method from customer', err)
    }
  }
}

function mapInvoiceStatus(stripeStatus?: string | null): string | undefined {
  switch (stripeStatus) {
    case 'draft':
    case 'open':
    case 'unpaid':
      return 'pending'
    case 'paid':
      return 'paid'
    case 'uncollectible':
    case 'void':
    case 'canceled':
      return 'cancelled'
    default:
      return undefined
  }
}

async function syncStripeInvoice(invoice: Stripe.Invoice): Promise<void> {
  const invoiceRecord = invoice as Stripe.Invoice & {
    amount_subtotal?: number
    amount_tax?: number
    customer_details?: {email?: string | null}
    payment_intent?: string | Stripe.PaymentIntent
  }

  const metadata = (invoice.metadata || {}) as Record<string, string>
  const metaId = INVOICE_METADATA_ID_KEYS.map((key) => normalizeSanityId(metadata[key])).find(
    Boolean,
  )

  let docId: string | null = null

  if (metaId) {
    docId = await sanity.fetch<string | null>(`*[_type == "invoice" && _id in $ids][0]._id`, {
      ids: idVariants(metaId),
    })
  }

  if (!docId && invoice.id) {
    docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && stripeInvoiceId == $id][0]._id`,
      {id: invoice.id},
    )
  }

  if (!docId && invoice.number) {
    docId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && invoiceNumber == $num][0]._id`,
      {num: invoice.number},
    )
  }

  if (!docId) return

  const existingInvoice = await sanity.fetch<{status?: string} | null>(
    `*[_type == "invoice" && _id == $id][0]{status}`,
    {id: docId},
  )
  const existingStatus = existingInvoice?.status

  const setOps: Record<string, any> = {
    stripeInvoiceId: invoice.id,
    stripeInvoiceStatus: invoice.status || undefined,
    stripeHostedInvoiceUrl: invoice.hosted_invoice_url || undefined,
    stripeInvoicePdf: invoice.invoice_pdf || undefined,
    stripeLastSyncedAt: new Date().toISOString(),
  }

  const subtotal = toMajorUnits(invoiceRecord.amount_subtotal || undefined)
  if (typeof subtotal === 'number') setOps.amountSubtotal = subtotal
  const tax = toMajorUnits(invoiceRecord.amount_tax || undefined)
  if (typeof tax === 'number') setOps.amountTax = tax
  const total = typeof invoice.total === 'number' ? toMajorUnits(invoice.total) : undefined
  if (typeof total === 'number') setOps.total = total
  if (invoice.currency) setOps.currency = invoice.currency.toUpperCase()

  const mappedStatus = mapInvoiceStatus(invoice.status)
  if (mappedStatus) {
    const isTerminalStatus = existingStatus === 'refunded' || existingStatus === 'cancelled'
    const isStatusChange = mappedStatus !== existingStatus
    if (!isTerminalStatus || !isStatusChange) {
      setOps.status = mappedStatus
    }
  }

  const email = invoice.customer_email || invoiceRecord.customer_details?.email || undefined
  if (email) setOps.customerEmail = email

  if (invoiceRecord.payment_intent) {
    setOps.paymentIntentId =
      typeof invoiceRecord.payment_intent === 'string'
        ? invoiceRecord.payment_intent
        : invoiceRecord.payment_intent.id
  }

  if (invoice.hosted_invoice_url) setOps.receiptUrl = invoice.hosted_invoice_url

  if (typeof invoice.due_date === 'number' && Number.isFinite(invoice.due_date)) {
    setOps.dueDate = new Date(invoice.due_date * 1000).toISOString().slice(0, 10)
  }

  if (typeof invoice.created === 'number' && Number.isFinite(invoice.created)) {
    setOps.invoiceDate = new Date(invoice.created * 1000).toISOString().slice(0, 10)
  }

  try {
    await sanity.patch(docId).set(setOps).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to sync invoice doc', err)
  }
}

async function syncStripeInvoiceById(
  invoice: string | Stripe.Invoice | null | undefined,
): Promise<void> {
  if (!invoice || !stripe) return
  const invoiceId =
    typeof invoice === 'string' ? invoice : typeof invoice?.id === 'string' ? invoice.id : undefined
  if (!invoiceId) return
  try {
    const freshInvoice = await stripe.invoices.retrieve(invoiceId)
    await syncStripeInvoice(freshInvoice)
  } catch (err) {
    console.warn('stripeWebhook: failed to sync invoice by id', err)
  }
}

function formatShippingAddress(shipping?: Stripe.Customer.Shipping | null): string | undefined {
  if (!shipping?.address) return undefined
  const lines: string[] = []
  if (shipping.name) lines.push(shipping.name)
  if (shipping.address.line1) lines.push(shipping.address.line1)
  if (shipping.address.line2) lines.push(shipping.address.line2)
  const cityLine = [shipping.address.city, shipping.address.state, shipping.address.postal_code]
    .filter(Boolean)
    .join(', ')
  if (cityLine) lines.push(cityLine)
  if (shipping.address.country) lines.push(shipping.address.country)
  return lines.filter(Boolean).join('\n') || undefined
}

function buildShippingAddress(shipping?: Stripe.Customer.Shipping | null) {
  if (!shipping?.address) return undefined
  const address = shipping.address
  const hasContent =
    address.line1 ||
    address.line2 ||
    address.city ||
    address.state ||
    address.postal_code ||
    address.country
  if (!hasContent) return undefined
  const street =
    [address.line1, address.line2].filter(Boolean).join(', ') || address.line1 || undefined
  return {
    _type: 'customerBillingAddress',
    name: shipping.name || undefined,
    street,
    city: address.city || undefined,
    state: address.state || undefined,
    postalCode: address.postal_code || undefined,
    country: address.country || undefined,
  }
}

function buildBillingAddress(address?: Stripe.Address | null, name?: string | null) {
  if (!address) return undefined
  const hasContent =
    address.line1 ||
    address.line2 ||
    address.city ||
    address.state ||
    address.postal_code ||
    address.country
  if (!hasContent) return undefined
  const street =
    [address.line1, address.line2].filter(Boolean).join(', ') || address.line1 || undefined
  return {
    _type: 'customerBillingAddress',
    name: name || undefined,
    street,
    city: address.city || undefined,
    state: address.state || undefined,
    postalCode: address.postal_code || undefined,
    country: address.country || undefined,
  }
}

async function syncStripeCustomer(customer: Stripe.Customer): Promise<void> {
  const emailRaw = (
    customer.email ||
    (customer.metadata as Record<string, string> | undefined)?.email ||
    ''
  )
    .toString()
    .trim()
  if (!emailRaw) return
  const email = emailRaw.toLowerCase()

  const existing = await sanity.fetch<{
    _id: string
    firstName?: string
    lastName?: string
    roles?: string[]
  }>(
    `*[_type == "customer" && defined(email) && lower(email) == $email][0]{_id, firstName, lastName, roles}`,
    {email},
  )

  const {firstName, lastName} = splitFullName(customer.name || customer.shipping?.name)
  const shippingText = formatShippingAddress(customer.shipping)
  const shippingAddress = buildShippingAddress(customer.shipping)
  const billingAddress = buildBillingAddress(
    customer.address,
    customer.name || customer.shipping?.name,
  )

  const setOps: Record<string, any> = {
    stripeCustomerId: customer.id,
    stripeLastSyncedAt: new Date().toISOString(),
  }

  if (shippingText) setOps.address = shippingText
  if (shippingAddress) setOps.shippingAddress = shippingAddress
  if (billingAddress) setOps.billingAddress = billingAddress
  if (customer.phone) setOps.phone = customer.phone
  if (firstName && !existing?.firstName) setOps.firstName = firstName
  if (lastName && !existing?.lastName) setOps.lastName = lastName
  const computedName = computeCustomerName({
    firstName: setOps.firstName ?? existing?.firstName ?? firstName,
    lastName: setOps.lastName ?? existing?.lastName ?? lastName,
    email,
  })
  if (computedName) setOps.name = computedName

  if (existing?._id) {
    if (!Array.isArray(existing.roles) || existing.roles.length === 0) setOps.roles = ['customer']
    try {
      await sanity.patch(existing._id).set(setOps).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update customer doc', err)
    }
  } else {
    const payload: Record<string, any> = {
      _type: 'customer',
      email,
      roles: ['customer'],
      name: computedName || email,
      stripeCustomerId: customer.id,
      stripeLastSyncedAt: new Date().toISOString(),
    }
    if (firstName) payload.firstName = firstName
    if (lastName) payload.lastName = lastName
    if (customer.phone) payload.phone = customer.phone
    if (shippingText) payload.address = shippingText
    if (shippingAddress) payload.shippingAddress = shippingAddress
    if (billingAddress) payload.billingAddress = billingAddress

    try {
      await sanity.create(payload as any, {autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to create customer doc from Stripe customer', err)
    }
  }
}

type PaymentFailureDiagnostics = {
  code?: string
  message?: string
}

async function resolvePaymentFailureDiagnostics(
  pi: Stripe.PaymentIntent,
): Promise<PaymentFailureDiagnostics> {
  const failure = pi.last_payment_error
  const additionalCodes = new Set<string>()

  const declineCode = (failure?.decline_code || '').trim() || undefined
  const docUrl = (failure?.doc_url || '').trim() || undefined

  let failureCode = (failure?.code || '').trim() || undefined
  let failureMessage = (failure?.message || pi.cancellation_reason)?.trim() || undefined

  if (declineCode) {
    if (!failureCode) failureCode = declineCode
    else if (failureCode !== declineCode) additionalCodes.add(declineCode)
  }

  const shouldLoadCharge =
    Boolean(stripe) && (typeof pi.latest_charge === 'string' || !failureCode || !failureMessage)

  if (shouldLoadCharge) {
    try {
      let charge: Stripe.Charge | null = null
      const latestChargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : null
      if (latestChargeId) {
        charge = await stripe.charges.retrieve(latestChargeId)
      } else {
        const chargeList = await stripe.charges.list({payment_intent: pi.id, limit: 1})
        charge = chargeList?.data?.[0] || null
      }

      if (charge) {
        const outcomeReason = (charge.outcome?.reason || '').trim()
        const chargeFailureCode = (charge.failure_code || '').trim()
        const networkStatus = (charge.outcome?.network_status || '').trim()
        const sellerMessage = (charge.outcome?.seller_message || '').trim()
        const chargeFailureMessage = (charge.failure_message || '').trim()

        if (outcomeReason) {
          if (failureCode && failureCode !== outcomeReason) {
            additionalCodes.add(failureCode)
          }
          failureCode = outcomeReason
        } else if (!failureCode && chargeFailureCode) {
          failureCode = chargeFailureCode
        } else if (failureCode && chargeFailureCode && failureCode !== chargeFailureCode) {
          additionalCodes.add(chargeFailureCode)
        }

        if (networkStatus && networkStatus !== failureCode) {
          additionalCodes.add(networkStatus)
        }

        if (!failureMessage && (sellerMessage || chargeFailureMessage)) {
          failureMessage = sellerMessage || chargeFailureMessage || undefined
        } else if (failureMessage) {
          const lowerMessage = failureMessage.toLowerCase()
          if (sellerMessage && !lowerMessage.includes(sellerMessage.toLowerCase())) {
            failureMessage = `${failureMessage} (${sellerMessage})`
          } else if (
            chargeFailureMessage &&
            !lowerMessage.includes(chargeFailureMessage.toLowerCase())
          ) {
            failureMessage = `${failureMessage} (${chargeFailureMessage})`
          }
        }
      }
    } catch (err) {
      console.warn('stripeWebhook: failed to load charge for payment failure details', err)
    }
  }

  const codes = Array.from(
    new Set(
      [failureCode, ...additionalCodes].filter(
        (code): code is string => typeof code === 'string' && Boolean(code.trim()),
      ),
    ),
  )

  if (codes.length === 0) {
    failureCode = undefined
  } else {
    failureCode = codes.join(' | ')
  }

  if (docUrl) {
    if (failureMessage) failureMessage = `${failureMessage} (${docUrl})`
    else failureMessage = docUrl
  }

  if (failureMessage) {
    const lowerMessage = failureMessage.toLowerCase()
    const codesNotMentioned = codes.filter((code) => !lowerMessage.includes(code.toLowerCase()))
    if (codesNotMentioned.length > 0) {
      failureMessage = `${failureMessage} (codes: ${codesNotMentioned.join(', ')})`
    }
  } else if (codes.length > 0) {
    failureMessage = `Payment failed (codes: ${codes.join(', ')})`
  }

  return {code: failureCode, message: failureMessage}
}

async function markPaymentIntentFailure(pi: Stripe.PaymentIntent): Promise<void> {
  const order = await sanity.fetch<{
    _id: string
    invoiceRef?: {_ref?: string}
  } | null>(
    `*[_type == "order" && (paymentIntentId == $pid || stripeSessionId == $pid)][0]{ _id, invoiceRef }`,
    {pid: pi.id},
  )

  const {code: failureCode, message: failureMessage} = await resolvePaymentFailureDiagnostics(pi)
  const rawPaymentStatus = (pi.status || '').trim().toLowerCase()
  const paymentStatus =
    rawPaymentStatus && !['succeeded', 'processing', 'requires_capture'].includes(rawPaymentStatus)
      ? 'failed'
      : rawPaymentStatus || 'failed'
  const derivedOrderStatus: 'paid' | 'cancelled' =
    rawPaymentStatus === 'succeeded' ? 'paid' : 'cancelled'
  const timestamp = new Date().toISOString()
  const summary = buildStripeSummary({
    paymentIntent: pi,
    failureCode,
    failureMessage,
    eventType: 'payment_intent.payment_failed',
    eventCreated: pi.created,
  })

  if (order?._id) {
    const setOps: Record<string, any> = {
      paymentStatus,
      status: derivedOrderStatus,
      stripeLastSyncedAt: timestamp,
      paymentFailureCode: failureCode,
      paymentFailureMessage: failureMessage,
      stripeSummary: serializeStripeSummaryData(summary),
    }
    try {
      await sanity.patch(order._id).set(setOps).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to mark payment failure on order', err)
    }
  }

  const invoiceCandidateIds = new Set<string>()
  const meta = (pi.metadata || {}) as Record<string, string>

  const invoiceMetaId = normalizeSanityId(meta['sanity_invoice_id'] || meta['invoice_id'])
  if (invoiceMetaId) {
    idVariants(invoiceMetaId).forEach((id) => invoiceCandidateIds.add(id))
  }

  if (order?.invoiceRef?._ref) {
    idVariants(order.invoiceRef._ref).forEach((id) => invoiceCandidateIds.add(id))
  }

  let invoiceId: string | null = null
  if (invoiceCandidateIds.size > 0) {
    invoiceId = await sanity.fetch<string | null>(`*[_type == "invoice" && _id in $ids][0]._id`, {
      ids: Array.from(invoiceCandidateIds),
    })
  }

  if (!invoiceId) {
    invoiceId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && paymentIntentId == $pid][0]._id`,
      {pid: pi.id},
    )
  }

  if (invoiceId) {
    try {
      await sanity
        .patch(invoiceId)
        .set({
          status: 'cancelled',
          stripeInvoiceStatus: 'payment_intent.payment_failed',
          stripeLastSyncedAt: timestamp,
          paymentFailureCode: failureCode,
          paymentFailureMessage: failureMessage,
        })
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update invoice after payment failure', err)
    }
  }
}

async function fetchChargeResource(
  resource: string | Stripe.Charge | null | undefined,
  opts: {expandPaymentIntent?: boolean} = {},
): Promise<Stripe.Charge | null> {
  if (!resource) return null
  if (typeof resource !== 'string') return resource
  if (!stripe) return null
  try {
    return await stripe.charges.retrieve(resource, {
      expand: opts.expandPaymentIntent ? ['payment_intent'] : undefined,
    })
  } catch (err) {
    console.warn('stripeWebhook: unable to load charge for diagnostics', err)
    return null
  }
}

async function fetchPaymentIntentResource(
  resource: string | Stripe.PaymentIntent | null | undefined,
  opts: {expandCharges?: boolean} = {},
): Promise<Stripe.PaymentIntent | null> {
  if (!resource) return null
  if (typeof resource !== 'string') return resource
  if (!stripe) return null
  try {
    const expandCharges = opts.expandCharges !== false
    const expand = expandCharges
      ? (['charges.data.payment_method_details', 'latest_charge'] as string[])
      : undefined
    return await stripe.paymentIntents.retrieve(resource, expand ? {expand} : undefined)
  } catch (err) {
    console.warn('stripeWebhook: unable to load payment intent for diagnostics', err)
    return null
  }
}

const TERMINAL_ORDER_STATUSES = new Set(['canceled', 'cancelled', 'refunded'])
const FULFILLMENT_COMPLETE_STATUSES = new Set(['fulfilled', 'delivered', 'shipped'])

const normalizeOrderStatusValue = (value?: string | null): string => {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().toLowerCase()
  if (normalized === 'cancelled') return 'canceled'
  return normalized
}

const isTerminalOrderStatus = (value?: string | null) =>
  TERMINAL_ORDER_STATUSES.has(normalizeOrderStatusValue(value))

const isFulfillmentCompleteStatus = (value?: string | null) =>
  FULFILLMENT_COMPLETE_STATUSES.has(normalizeOrderStatusValue(value))

type OrderPaymentStatusInput = {
  paymentStatus?: string
  orderStatus?: 'paid' | 'fulfilled' | 'shipped' | 'cancelled' | 'refunded' | 'closed' | 'expired'
  invoiceStatus?: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'cancelled'
  invoiceStripeStatus?: string
  paymentIntentId?: string
  chargeId?: string
  stripeSessionId?: string
  metadata?: Record<string, unknown> | null
  additionalOrderFields?: Record<string, any>
  additionalInvoiceFields?: Record<string, any>
  preserveExistingFailureDiagnostics?: boolean
  preserveExistingRefundedStatus?: boolean
  event?: EventRecordInput
}

const formatMajorAmount = (amount?: number, currency?: string): string | undefined => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined
  const formatted = amount.toFixed(2)
  const code = (currency || '').toString().trim().toUpperCase()
  return code ? `${formatted} ${code}` : formatted
}

type HandleChargeEventInput = {
  charge: Stripe.Charge | null
  paymentIntent?: Stripe.PaymentIntent | null
  paymentIntentId?: string
  event: Stripe.Event
  paymentStatus: string
  orderStatus?: OrderPaymentStatusInput['orderStatus']
  invoiceStatus?: OrderPaymentStatusInput['invoiceStatus']
  label: string
  messageParts?: Array<string | null | undefined>
  amountOverride?: number
  currencyOverride?: string
  metadataOverride?: Record<string, unknown> | null
  additionalOrderFields?: Record<string, any>
  additionalInvoiceFields?: Record<string, any>
  preserveExistingFailureDiagnostics?: boolean
  eventStatus?: string
  includeChargeContext?: boolean
}

const handleChargeEvent = async (input: HandleChargeEventInput) => {
  const {
    charge,
    paymentIntent,
    paymentIntentId,
    event,
    paymentStatus,
    orderStatus,
    invoiceStatus,
    label,
    messageParts = [],
    amountOverride,
    currencyOverride,
    metadataOverride,
    additionalOrderFields,
    additionalInvoiceFields,
    preserveExistingFailureDiagnostics,
    eventStatus,
    includeChargeContext = true,
  } = input

  const resolvedPaymentIntent =
    paymentIntent ||
    (charge?.payment_intent ? await fetchPaymentIntentResource(charge.payment_intent) : null)
  const resolvedPaymentIntentId =
    paymentIntentId ||
    (resolvedPaymentIntent?.id
      ? resolvedPaymentIntent.id
      : typeof charge?.payment_intent === 'string'
        ? charge.payment_intent
        : undefined)

  const amount =
    amountOverride !== undefined
      ? amountOverride
      : charge?.amount_captured && charge.captured
        ? toMajorUnits(charge.amount_captured)
        : toMajorUnits(charge?.amount || undefined)
  const currency =
    currencyOverride !== undefined
      ? currencyOverride
      : (charge?.currency || '').toString().trim().toUpperCase() || undefined

  const orderFields: Record<string, any> = {
    chargeId: charge?.id || undefined,
    cardBrand: charge?.payment_method_details?.card?.brand || undefined,
    cardLast4: charge?.payment_method_details?.card?.last4 || undefined,
    receiptUrl: charge?.receipt_url || undefined,
    stripeSummary: serializeStripeSummaryData(
      buildStripeSummary({
        paymentIntent: resolvedPaymentIntent || undefined,
        charge: charge || undefined,
        eventType: event.type,
        eventCreated: event.created,
      }),
    ),
  }
  if (additionalOrderFields && typeof additionalOrderFields === 'object') {
    Object.assign(orderFields, additionalOrderFields)
  }

  const resolvedCaptureMethod =
    resolvedPaymentIntent?.capture_method ||
    (charge?.captured ? 'manual' : undefined) ||
    undefined
  const shouldMarkCaptured =
    event.type === 'charge.captured' ||
    Boolean(charge?.captured && charge.amount_captured) ||
    (resolvedCaptureMethod === 'manual' && event.type === 'charge.succeeded')
  if (shouldMarkCaptured) {
    orderFields.paymentCaptured = true
    orderFields.paymentCaptureStrategy =
      orderFields.paymentCaptureStrategy ||
      (resolvedCaptureMethod === 'manual' ? 'manual' : 'auto')
    orderFields.paymentCapturedAt =
      unixToIso(charge?.created) || unixToIso(event.created) || new Date().toISOString()
    if (!orderFields['fulfillment.status']) {
      orderFields['fulfillment.status'] = 'ready_to_ship'
    }
  }

  const invoiceFields: Record<string, any> = {}
  if (additionalInvoiceFields && typeof additionalInvoiceFields === 'object') {
    Object.assign(invoiceFields, additionalInvoiceFields)
  }

  const parts = messageParts.filter((part): part is string => Boolean(part && String(part).trim()))
  if (includeChargeContext) {
    if (charge?.id) parts.push(`Charge ${charge.id}`)
    if (typeof amount === 'number') {
      const amountLabel = formatMajorAmount(amount, currency)
      if (amountLabel) parts.push(amountLabel)
    }
    if (charge?.status) parts.push(`Status ${charge.status}`)
  } else if (parts.length === 0 && charge?.id) {
    parts.push(`Charge ${charge.id}`)
  }

  const metadata = metadataOverride || (charge?.metadata as Record<string, unknown> | null) || null

  const combinedMetadata = mergeMetadata(
    (resolvedPaymentIntent?.metadata as Record<string, unknown> | null | undefined) || null,
    (charge?.metadata as Record<string, unknown> | null | undefined) || null,
  )

  await updateOrderPaymentStatus({
    paymentStatus,
    orderStatus,
    invoiceStatus,
    invoiceStripeStatus: event.type,
    paymentIntentId: resolvedPaymentIntentId,
    chargeId: charge?.id,
    metadata: combinedMetadata,
    additionalOrderFields: orderFields,
    additionalInvoiceFields: Object.keys(invoiceFields).length ? invoiceFields : undefined,
    preserveExistingFailureDiagnostics,
    event: {
      eventType: event.type,
      status: eventStatus || orderStatus || paymentStatus,
      label,
      message: parts.length ? parts.join(' • ') : undefined,
      amount,
      currency,
      stripeEventId: event.id,
      occurredAt: event.created,
      metadata: metadata || undefined,
    },
  })
}

type HandleDisputeEventInput = {
  dispute: Stripe.Dispute | null
  charge: Stripe.Charge | null
  paymentIntent?: Stripe.PaymentIntent | null
  event: Stripe.Event
  paymentStatus: string
  orderStatus?: OrderPaymentStatusInput['orderStatus']
  invoiceStatus?: OrderPaymentStatusInput['invoiceStatus']
  label: string
  messageParts?: Array<string | null | undefined>
  additionalOrderFields?: Record<string, any>
  additionalInvoiceFields?: Record<string, any>
  eventStatus?: string
}

const handleDisputeEvent = async (input: HandleDisputeEventInput) => {
  const {
    dispute,
    charge,
    paymentIntent,
    event,
    paymentStatus,
    orderStatus,
    invoiceStatus,
    label,
    messageParts = [],
    additionalOrderFields,
    additionalInvoiceFields,
    eventStatus,
  } = input

  const resolvedCharge =
    charge ||
    (dispute?.charge
      ? await fetchChargeResource(dispute.charge, {expandPaymentIntent: true})
      : null)
  const resolvedPaymentIntent =
    paymentIntent ||
    (resolvedCharge?.payment_intent
      ? await fetchPaymentIntentResource(resolvedCharge.payment_intent)
      : dispute?.payment_intent
        ? await fetchPaymentIntentResource(dispute.payment_intent as string | Stripe.PaymentIntent)
        : null)

  const disputeAmount = toMajorUnits(dispute?.amount || undefined)
  const disputeCurrency = (dispute?.currency || '').toString().trim().toUpperCase() || undefined

  const orderFields: Record<string, any> = {
    ...(additionalOrderFields || {}),
  }
  if (dispute?.id) orderFields.lastDisputeId = dispute.id
  if (dispute?.status) orderFields.lastDisputeStatus = dispute.status
  if (dispute?.reason) orderFields.lastDisputeReason = dispute.reason
  if (disputeAmount !== undefined) orderFields.lastDisputeAmount = disputeAmount
  if (disputeCurrency) orderFields.lastDisputeCurrency = disputeCurrency
  if (typeof dispute?.created === 'number') {
    const createdAt = unixToIso(dispute.created)
    if (createdAt) orderFields.lastDisputeCreatedAt = createdAt
  }
  const dueBy = dispute?.evidence_details?.due_by
  if (typeof dueBy === 'number') {
    const dueByIso = unixToIso(dueBy)
    if (dueByIso) orderFields.lastDisputeDueBy = dueByIso
  }

  const metadata =
    dispute?.metadata || (resolvedCharge?.metadata as Record<string, string> | null) || null

  const parts = messageParts.filter((part): part is string => Boolean(part && String(part).trim()))
  if (dispute?.status) parts.push(`Status ${dispute.status}`)
  if (dispute?.reason) parts.push(`Reason ${dispute.reason}`)
  const amountLabel = formatMajorAmount(disputeAmount, disputeCurrency)
  if (amountLabel) parts.push(`Amount ${amountLabel}`)
  if (typeof dueBy === 'number') {
    const dueByIso = unixToIso(dueBy)
    if (dueByIso) parts.push(`Evidence due ${dueByIso}`)
  }
  if (resolvedCharge?.id) parts.push(`Charge ${resolvedCharge.id}`)

  await handleChargeEvent({
    charge: resolvedCharge,
    paymentIntent: resolvedPaymentIntent || undefined,
    paymentIntentId: resolvedPaymentIntent?.id,
    event,
    paymentStatus,
    orderStatus,
    invoiceStatus,
    label,
    messageParts: parts,
    amountOverride: disputeAmount,
    currencyOverride: disputeCurrency,
    metadataOverride: metadata,
    additionalOrderFields: orderFields,
    additionalInvoiceFields,
    eventStatus,
    includeChargeContext: false,
  })
}

export async function handleRefundWebhookEvent(webhookEvent: Stripe.Event): Promise<void> {
  try {
    const raw = webhookEvent.data.object as Stripe.Charge | Stripe.Refund
    const rawObject = raw as unknown as {object?: string}
    const isRefundObject = rawObject?.object === 'refund'

    let refund: Stripe.Refund | null = isRefundObject ? (raw as Stripe.Refund) : null
    let charge: Stripe.Charge | null =
      !isRefundObject && rawObject?.object === 'charge' ? (raw as Stripe.Charge) : null

    if (!charge && refund?.charge) {
      charge = await fetchChargeResource(refund.charge, {expandPaymentIntent: true})
    }

    if (!refund && charge?.refunds?.data?.length) {
      const matchingRefund = charge.refunds.data.find(
        (entry) => entry.id === (isRefundObject ? (raw as Stripe.Refund).id : undefined),
      )
      refund = matchingRefund || charge.refunds.data[charge.refunds.data.length - 1] || null
    }

    const paymentIntent = await fetchPaymentIntentResource(
      (charge?.payment_intent as Stripe.PaymentIntent | string | null | undefined) ??
        (refund?.payment_intent as Stripe.PaymentIntent | string | null | undefined) ??
        null,
    )

    const chargeAmountCents = typeof charge?.amount === 'number' ? charge.amount : undefined
    const refundedCentsFromCharge =
      typeof charge?.amount_refunded === 'number' ? charge.amount_refunded : undefined
    const refundedCentsFromRefund = typeof refund?.amount === 'number' ? refund.amount : undefined

    const refundedAmount =
      refundedCentsFromCharge !== undefined
        ? refundedCentsFromCharge / 100
        : refundedCentsFromRefund !== undefined
          ? refundedCentsFromRefund / 100
          : undefined

    const isFullRefund =
      Boolean(charge?.refunded) ||
      (typeof chargeAmountCents === 'number' &&
        typeof refundedCentsFromCharge === 'number' &&
        chargeAmountCents > 0 &&
        refundedCentsFromCharge >= chargeAmountCents)

    const explicitRefundStatus = (refund?.status || '').toString().toLowerCase()
    const chargeIndicatesRefund =
      Boolean(charge?.refunded) ||
      (typeof refundedCentsFromCharge === 'number' && refundedCentsFromCharge > 0) ||
      (typeof refundedCentsFromRefund === 'number' && refundedCentsFromRefund > 0)
    const inferredRefundStatus = !explicitRefundStatus && chargeIndicatesRefund ? 'succeeded' : ''
    const refundStatus = explicitRefundStatus || inferredRefundStatus
    const refundSucceeded = refundStatus === 'succeeded'
    const preserveRefundedStatus = Boolean(
      explicitRefundStatus && explicitRefundStatus !== 'succeeded',
    )
    const paymentStatus = refundSucceeded
      ? isFullRefund
        ? 'refunded'
        : 'partially_refunded'
      : 'paid'
    const paymentIntentId =
      typeof paymentIntent?.id === 'string'
        ? paymentIntent.id
        : typeof charge?.payment_intent === 'string'
          ? charge.payment_intent
          : typeof refund?.payment_intent === 'string'
            ? refund.payment_intent
            : undefined

    const combinedMetadata = mergeMetadata(
      (paymentIntent?.metadata as Record<string, unknown> | null | undefined) || null,
      (charge?.metadata as Record<string, unknown> | null | undefined) || null,
      (refund?.metadata as Record<string, unknown> | null | undefined) || null,
    )

    await updateOrderPaymentStatus({
      paymentIntentId,
      chargeId: charge?.id || (typeof refund?.charge === 'string' ? refund.charge : undefined),
      paymentStatus,
      orderStatus: refundSucceeded && isFullRefund ? 'refunded' : undefined,
      invoiceStatus: refundSucceeded
        ? isFullRefund
          ? 'refunded'
          : 'partially_refunded'
        : undefined,
      invoiceStripeStatus: webhookEvent.type,
      additionalOrderFields: {
        ...(refundedAmount !== undefined ? {amountRefunded: refundedAmount} : {}),
        ...(refund?.id ? {lastRefundId: refund.id} : {}),
        ...(refundStatus ? {lastRefundStatus: refundStatus} : {}),
        ...(refund?.reason ? {lastRefundReason: refund.reason} : {}),
        ...(typeof refund?.created === 'number'
          ? {lastRefundedAt: new Date(refund.created * 1000).toISOString()}
          : {}),
        stripeSummary: serializeStripeSummaryData(
          buildStripeSummary({
            paymentIntent: paymentIntent || undefined,
            charge: charge || undefined,
            eventType: webhookEvent.type,
            eventCreated: webhookEvent.created,
          }),
        ),
      },
      preserveExistingRefundedStatus: preserveRefundedStatus,
      metadata: combinedMetadata,
      event: {
        eventType: webhookEvent.type,
        label: refund?.id ? `Refund ${refund.id}` : 'Charge refunded',
        message:
          refund?.status || refund?.amount
            ? [
                refund?.status ? `Refund ${refund.status}` : null,
                refundedAmount !== undefined
                  ? `Amount ${refundedAmount.toFixed(2)} ${(refund?.currency || charge?.currency || '').toUpperCase()}`
                  : null,
                charge?.id ? `Charge ${charge.id}` : null,
              ]
                .filter(Boolean)
                .join(' • ')
            : `Charge ${charge?.id || refund?.charge || ''} refunded`,
        amount: refundedAmount,
        currency: (refund?.currency || charge?.currency)?.toUpperCase() || undefined,
        stripeEventId: webhookEvent.id,
        occurredAt: webhookEvent.created,
        metadata: (refund?.metadata || charge?.metadata || {}) as Record<string, string>,
        status: refundStatus || paymentStatus || undefined,
      },
    })
  } catch (err) {
    console.warn('stripeWebhook: failed to handle refund webhook', err)
  }
}

async function updateOrderPaymentStatus(opts: OrderPaymentStatusInput): Promise<boolean> {
  const {
    paymentStatus,
    orderStatus,
    invoiceStatus,
    invoiceStripeStatus,
    paymentIntentId,
    chargeId,
    stripeSessionId,
    additionalInvoiceFields,
    additionalOrderFields,
    preserveExistingFailureDiagnostics,
    preserveExistingRefundedStatus,
    event,
    metadata,
  } = opts
  if (!paymentIntentId && !chargeId && !stripeSessionId) return false

  const params = {
    pi: paymentIntentId || '',
    charge: chargeId || '',
    session: stripeSessionId || '',
  }

  const fetchOrderById = async (id: string) => {
    const ids = idVariants(id)
    return sanity.fetch<{
      _id: string
      orderNumber?: string
      status?: string
      invoiceRef?: {_id: string}
      customerRef?: {_ref: string}
      customerEmail?: string
      paymentFailureCode?: string
      paymentFailureMessage?: string
      paymentStatus?: string
    } | null>(`*[_type == "order" && _id in $orderIds][0]{
      _id,
      orderNumber,
      customerRef,
      customerEmail,
      paymentFailureCode,
      paymentFailureMessage,
      paymentStatus,
      status,
      attribution,
      invoiceRef->{ _id }
    }`, {
      orderIds: ids,
    })
  }

  let order = await sanity.fetch<{
    _id: string
    orderNumber?: string
    status?: string
    invoiceRef?: {_id: string}
    customerRef?: {_ref: string}
    customerEmail?: string
    paymentFailureCode?: string
    paymentFailureMessage?: string
    paymentStatus?: string
  } | null>(
    `*[_type == "order" && (
      ($pi != '' && paymentIntentId == $pi) ||
      ($charge != '' && chargeId == $charge) ||
      ($session != '' && stripeSessionId == $session)
    )][0]{ _id, orderNumber, customerRef, customerEmail, paymentFailureCode, paymentFailureMessage, paymentStatus, status, attribution, invoiceRef->{ _id } }`,
    params,
  )

  if (!order?._id && metadata) {
    try {
      const fallbackOrderId = await findOrderDocumentIdForEvent({
        metadata: metadata as Record<string, any>,
        paymentIntentId,
        chargeId,
        sessionId: stripeSessionId,
      })
      if (fallbackOrderId) {
        order = await fetchOrderById(fallbackOrderId)
      }
    } catch (err) {
      console.warn('stripeWebhook: metadata order lookup failed', err)
    }
  }

  if (!order?._id) return false

  const existingPaymentStatus =
    typeof order?.paymentStatus === 'string' ? order.paymentStatus.trim().toLowerCase() : undefined
  const existingOrderStatus = normalizeOrderStatusValue(order?.status)
  const normalizedOrderStatus =
    typeof orderStatus === 'string' ? orderStatus.trim().toLowerCase() : undefined
  const previouslyPaid = existingPaymentStatus
    ? ['paid', 'fulfilled', 'shipped', 'delivered'].includes(existingPaymentStatus)
    : Boolean(
        existingOrderStatus &&
          (existingOrderStatus === 'paid' || isFulfillmentCompleteStatus(existingOrderStatus)),
      )
  const normalizedPaymentStatus =
    typeof paymentStatus === 'string' ? paymentStatus.toLowerCase() : undefined
  const nowPaid =
    normalizedPaymentStatus === 'paid' ||
    normalizedPaymentStatus === 'succeeded' ||
    normalizedOrderStatus === 'paid'
  const shouldTriggerOrderPlaced = nowPaid && !previouslyPaid
  const wasPreviouslyRefunded = existingPaymentStatus
    ? ['refunded', 'partially_refunded'].includes(existingPaymentStatus)
    : existingOrderStatus === 'refunded'
  const shouldPreserveRefundedStatus = Boolean(
    preserveExistingRefundedStatus && wasPreviouslyRefunded,
  )

  const orderPatch: Record<string, any> = {
    stripeLastSyncedAt: new Date().toISOString(),
  }

  if (!shouldPreserveRefundedStatus) {
    orderPatch.paymentStatus = paymentStatus
  }
  const shouldApplyOrderStatus = (() => {
    if (!orderStatus || !normalizedOrderStatus) return false
    if (isTerminalOrderStatus(existingOrderStatus)) {
      return normalizedOrderStatus === existingOrderStatus
    }
    if (
      normalizedOrderStatus === 'paid' &&
      isFulfillmentCompleteStatus(existingOrderStatus)
    ) {
      return false
    }
    return true
  })()
  if (shouldApplyOrderStatus) {
    orderPatch.status = orderStatus
  }
  if (additionalOrderFields && typeof additionalOrderFields === 'object') {
    const existingFailureDetails =
      preserveExistingFailureDiagnostics && order
        ? {
            paymentFailureCode:
              typeof order.paymentFailureCode === 'string' ? order.paymentFailureCode.trim() : '',
            paymentFailureMessage:
              typeof order.paymentFailureMessage === 'string'
                ? order.paymentFailureMessage.trim()
                : '',
          }
        : null

    for (const [field, value] of Object.entries(additionalOrderFields)) {
      if (
        existingFailureDetails &&
        (field === 'paymentFailureCode' || field === 'paymentFailureMessage')
      ) {
        const existingValue = existingFailureDetails[field]
        if (existingValue) {
          continue
        }
      }
      orderPatch[field] = value
    }
  }

  let campaignIdForMetrics: string | null = null
  if (event?.metadata) {
    const attrParams = extractAttributionFromMetadata(
      event.metadata as Record<string, any> | undefined,
      stripeSessionId ? {session_id: stripeSessionId} : undefined,
    )
    const attrDoc = buildAttributionDocument(attrParams)
    if (attrDoc) {
      if (attrDoc.campaign) {
        campaignIdForMetrics = await ensureCampaignDocument(attrDoc)
        if (campaignIdForMetrics) {
          ;(attrDoc as any).campaignRef = {_type: 'reference', _ref: campaignIdForMetrics}
        }
      }
      orderPatch.attribution = attrDoc
    }
  }

  try {
    await sanity.patch(order._id).set(orderPatch).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('stripeWebhook: failed to update order payment status', err)
  }
  if (shouldTriggerOrderPlaced) {
    try {
      await runOrderPlacedAutomations(order._id, {respectDelay: true})
    } catch (err) {
      console.warn('stripeWebhook: order automation trigger failed', err)
    }
  }
  const shouldRecordCampaignMetrics =
    Boolean(campaignIdForMetrics) &&
    (normalizedPaymentStatus === 'paid' ||
      normalizedPaymentStatus === 'succeeded' ||
      normalizedPaymentStatus === 'complete')
  if (campaignIdForMetrics && shouldRecordCampaignMetrics) {
    await recordCampaignMetrics(
      campaignIdForMetrics,
      order._id,
      typeof event?.amount === 'number' ? event.amount : undefined,
    )
  }

  const fetchInvoiceId = async (): Promise<string | null> => {
    if (order.invoiceRef?._id) return order.invoiceRef._id
    if (paymentIntentId) {
      const byPI = await sanity.fetch<string | null>(
        `*[_type == "invoice" && paymentIntentId == $pi][0]._id`,
        {pi: paymentIntentId},
      )
      if (byPI) return byPI
    }
    if (order._id) {
      const byOrderRef = await sanity.fetch<string | null>(
        `*[_type == "invoice" && (orderRef._ref == $orderId || orderRef->_ref == $orderId)][0]._id`,
        {orderId: order._id},
      )
      if (byOrderRef) return byOrderRef
    }
    return null
  }

  const invoiceId = await fetchInvoiceId()
  if (invoiceId) {
    const invoicePatch: Record<string, any> = {
      stripeLastSyncedAt: new Date().toISOString(),
    }
    if (invoiceStatus) invoicePatch.status = invoiceStatus
    if (invoiceStripeStatus) invoicePatch.stripeInvoiceStatus = invoiceStripeStatus
    if (additionalInvoiceFields && typeof additionalInvoiceFields === 'object') {
      Object.assign(invoicePatch, additionalInvoiceFields)
    }
    try {
      await sanity.patch(invoiceId).set(invoicePatch).commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('stripeWebhook: failed to update invoice after payment status change', err)
    }
  }

  try {
    await updateCustomerProfileForOrder({
      sanity,
      orderId: order?._id,
      customerId: order?.customerRef?._ref,
      email: order?.customerEmail,
    })
  } catch (err) {
    console.warn(
      'stripeWebhook: failed to refresh customer profile after payment status update',
      err,
    )
  }

  if (event) {
    const eventPayload: EventRecordInput = {
      ...event,
      status: event.status || orderStatus || paymentStatus,
    }
    await appendOrderEvent(order?._id, eventPayload)
  }

  return true
}

type CheckoutAsyncContext = {
  eventType?: string
  invoiceStripeStatus?: string
  stripeEventId?: string
  eventCreated?: number | null
  metadata?: Record<string, string>
  paymentIntent?: Stripe.PaymentIntent | null
  label?: string
  message?: string
}

const getCheckoutAsyncDefaults = (
  session: Stripe.Checkout.Session,
  context: CheckoutAsyncContext,
) => {
  const metadata =
    (context.metadata && typeof context.metadata === 'object'
      ? context.metadata
      : ((session.metadata || {}) as Record<string, string>)) || {}
  const baseEventType = context.eventType || context.invoiceStripeStatus || ''
  const eventType = baseEventType || 'checkout.session.async_payment_succeeded'
  const invoiceStripeStatus =
    context.invoiceStripeStatus || 'checkout.session.async_payment_succeeded'
  const amount =
    typeof session.amount_total === 'number' && Number.isFinite(session.amount_total)
      ? session.amount_total / 100
      : undefined
  const currency =
    (session.currency || context.paymentIntent?.currency || '').toString().toUpperCase() ||
    undefined
  return {metadata, eventType, invoiceStripeStatus, amount, currency}
}

export async function handleCheckoutAsyncPaymentSucceeded(
  session: Stripe.Checkout.Session,
  context: CheckoutAsyncContext = {},
): Promise<void> {
  const paymentIntent =
    context.paymentIntent ?? (await fetchPaymentIntentResource(session.payment_intent))
  const {metadata, eventType, invoiceStripeStatus, amount, currency} = getCheckoutAsyncDefaults(
    session,
    {
      ...context,
      invoiceStripeStatus:
        context.invoiceStripeStatus || 'checkout.session.async_payment_succeeded',
    },
  )

  const paymentIntentId =
    (typeof session.payment_intent === 'string' ? session.payment_intent : paymentIntent?.id) ||
    undefined

  const summary = buildStripeSummary({
    session,
    paymentIntent: paymentIntent || undefined,
    eventType: invoiceStripeStatus,
    eventCreated: context.eventCreated ?? null,
  })

  const additionalOrderFields: Record<string, any> = {
    checkoutDraft: false,
    paymentFailureCode: null,
    paymentFailureMessage: null,
    stripeSummary: serializeStripeSummaryData(summary),
  }

  const additionalInvoiceFields: Record<string, any> = {
    paymentFailureCode: null,
    paymentFailureMessage: null,
  }

  await updateOrderPaymentStatus({
    paymentStatus: 'paid',
    orderStatus: 'paid',
    invoiceStatus: 'paid',
    invoiceStripeStatus,
    paymentIntentId,
    stripeSessionId: session.id,
    metadata,
    additionalOrderFields,
    additionalInvoiceFields,
    event: {
      eventType,
      label: context.label || 'Async payment succeeded',
      message: context.message || `Checkout session ${session.id} async payment succeeded`,
      amount,
      currency:
        currency || (paymentIntent?.currency ? paymentIntent.currency.toUpperCase() : undefined),
      stripeEventId: context.stripeEventId,
      occurredAt: context.eventCreated ?? null,
      metadata,
    },
  })
}

export async function handleCheckoutAsyncPaymentFailed(
  session: Stripe.Checkout.Session,
  context: CheckoutAsyncContext = {},
): Promise<void> {
  const paymentIntent =
    context.paymentIntent ?? (await fetchPaymentIntentResource(session.payment_intent))
  const {metadata, eventType, invoiceStripeStatus, amount, currency} = getCheckoutAsyncDefaults(
    session,
    {
      ...context,
      invoiceStripeStatus: context.invoiceStripeStatus || 'checkout.session.async_payment_failed',
    },
  )

  let failureCode: string | undefined
  let failureMessage: string | undefined
  const paymentIntentStatus = (paymentIntent?.status || '').toString().toLowerCase()
  const sessionPaymentStatus = (session.payment_status || '').toString().toLowerCase()

  if (paymentIntent) {
    const diagnostics = await resolvePaymentFailureDiagnostics(paymentIntent)
    failureCode = diagnostics.code
    failureMessage = diagnostics.message
  }

  let paymentStatus = (() => {
    const raw = paymentIntentStatus || sessionPaymentStatus
    if (['succeeded', 'paid', 'complete', 'requires_capture'].includes(raw)) return 'paid'
    if (['canceled', 'cancelled'].includes(raw)) return 'cancelled'
    if (raw) return raw
    return 'failed'
  })()

  let orderStatus: 'paid' | 'cancelled' = paymentStatus === 'paid' ? 'paid' : 'cancelled'

  let invoiceStatus: 'paid' | 'cancelled' = paymentStatus === 'paid' ? 'paid' : 'cancelled'

  if (paymentStatus === 'paid' && failureCode) {
    // Even if intent eventually succeeded, preserve diagnostics for visibility.
    orderStatus = 'paid'
    invoiceStatus = 'paid'
  }

  const summary = buildStripeSummary({
    session,
    paymentIntent: paymentIntent || undefined,
    failureCode,
    failureMessage,
    eventType: invoiceStripeStatus,
    eventCreated: context.eventCreated ?? null,
  })

  const additionalOrderFields: Record<string, any> = {
    checkoutDraft: orderStatus === 'paid' ? false : true,
    stripeSummary: serializeStripeSummaryData(summary),
  }
  if (failureCode) additionalOrderFields.paymentFailureCode = failureCode
  if (failureMessage) additionalOrderFields.paymentFailureMessage = failureMessage

  const additionalInvoiceFields: Record<string, any> = {
  }
  if (failureCode) additionalInvoiceFields.paymentFailureCode = failureCode
  if (failureMessage) additionalInvoiceFields.paymentFailureMessage = failureMessage

  const paymentIntentId =
    (typeof session.payment_intent === 'string' ? session.payment_intent : paymentIntent?.id) ||
    undefined

  await updateOrderPaymentStatus({
    paymentStatus,
    orderStatus,
    invoiceStatus,
    invoiceStripeStatus,
    paymentIntentId,
    stripeSessionId: session.id,
    metadata,
    additionalOrderFields,
    additionalInvoiceFields,
    preserveExistingFailureDiagnostics: !(failureCode || failureMessage),
    event: {
      eventType,
      label: context.label || 'Async payment failed',
      message: context.message || `Checkout session ${session.id} async payment failed`,
      amount,
      currency:
        currency || (paymentIntent?.currency ? paymentIntent.currency.toUpperCase() : undefined),
      stripeEventId: context.stripeEventId,
      occurredAt: context.eventCreated ?? null,
      metadata,
    },
  })
}

async function handleCheckoutCreated(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = (session.metadata || {}) as Record<string, string>
  let cartItems: CartItem[] = []

  try {
    const result = await buildCartFromSessionLineItems(session.id, metadata)
    cartItems = result.items
  } catch (err) {
    console.warn('stripeWebhook: failed to load cart for created session', err)
    cartItems = cartItemsFromMetadata(metadata)
  }

  const createdAt = unixToIso(session.created) || new Date().toISOString()
  const expiresAt = unixToIso(session.expires_at) || undefined
  const amountSubtotal = toMajorUnits((session as any)?.amount_subtotal ?? undefined)
  const amountTax = toMajorUnits((session as any)?.total_details?.amount_tax ?? undefined)
  const shippingCost = toMajorUnits(
    (session as any)?.shipping_cost?.amount_total ??
      (session as any)?.total_details?.amount_shipping ??
      undefined,
  )
  const amountTotal = toMajorUnits(session.amount_total ?? undefined)
  const currencyLower = (session.currency || '').toString().toLowerCase() || undefined
  const currencyUpper = currencyLower ? currencyLower.toUpperCase() : undefined
  const attribution = extractAttributionFromMetadata(
    metadata,
    session?.id ? {session_id: session.id} : undefined,
  )
  const customer = await strictFindOrCreateCustomer(session)
  const docId = await upsertCheckoutSessionDocument(session, {
    cart: cartItems,
    metadata,
    createdAt,
    expiresAt,
    amountSubtotal,
    amountTax,
    amountShipping: shippingCost,
    amountTotal,
    currency: currencyUpper || currencyLower,
    customerName: session.customer_details?.name || session.customer_email || undefined,
    customerId: customer?._id || undefined,
    checkoutUrl: (session as any)?.url || undefined,
    attribution,
  })

  if (docId && customer?._id) {
    await linkCheckoutSessionToCustomer(webhookSanityClient, docId, customer._id)
  }
}

async function handleCheckoutExpired(
  session: Stripe.Checkout.Session,
  context: {stripeEventId?: string; eventCreated?: number | null} = {},
): Promise<void> {
  const timestamp = new Date().toISOString()
  const failureCode = 'checkout.session.expired'
  const metadata = (session.metadata || {}) as Record<string, string>
  let cartItems: CartItem[] = []
  try {
    const result = await buildCartFromSessionLineItems(session.id, metadata)
    cartItems = result.items
  } catch (err) {
    console.warn('stripeWebhook: failed to load cart for expired session', err)
    cartItems = cartItemsFromMetadata(metadata)
  }
  let contact = await resolveCheckoutCustomerContact(session)
  let expandedSession: Stripe.Checkout.Session | null = null
  if ((!contact.email || !contact.name || !contact.phone) && stripe) {
    try {
      expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['customer', 'customer_details', 'line_items', 'total_details'],
      })
      if (expandedSession) {
        contact = await resolveCheckoutCustomerContact(expandedSession)
      }
      // If we successfully fetched line items, prefer them for cart reconstruction
      if (!cartItems.length && expandedSession?.line_items) {
        try {
          const mapped = (expandedSession.line_items.data || []) as Stripe.LineItem[]
          const result = await buildCartFromSessionLineItems(session.id, metadata, {
            lineItems: mapped,
          })
          cartItems = result.items
        } catch (err) {
          console.warn('stripeWebhook: failed to load cart from expanded expired session', err)
        }
      }
    } catch (err) {
      console.warn('stripeWebhook: failed to expand checkout session on expiration', err)
    }
  }
  const simplifiedCart = simplifyCartForAbandonedCheckout(cartItems)
  const cartSummary =
    metadata['cart_summary'] ||
    metadata['cartSummary'] ||
    (simplifiedCart.length ? buildAbandonedCartSummary(simplifiedCart) : '') ||
    ''
  const email = contact.email || ''
  const customerPhone =
    contact.phone ||
    session.customer_details?.phone ||
    (session.metadata?.customer_phone as string | undefined) ||
    undefined
  const expiresAt =
    typeof session.expires_at === 'number'
      ? new Date(session.expires_at * 1000).toISOString()
      : null
  const expiredAt = expiresAt || timestamp
  const createdAt =
    typeof session.created === 'number' ? new Date(session.created * 1000).toISOString() : timestamp
  let failureMessage = 'Checkout session expired before payment was completed.'
  if (email) failureMessage = `${failureMessage} Customer: ${email}.`
  if (expiresAt) failureMessage = `${failureMessage} Expired at ${expiresAt}.`
  failureMessage = `${failureMessage} (session ${session.id})`
  const amountTotal = toMajorUnits(session.amount_total ?? undefined)
  const amountSubtotal = toMajorUnits((session as any)?.amount_subtotal ?? undefined)
  const amountTax = toMajorUnits((session as any)?.total_details?.amount_tax ?? undefined)
  const shippingRaw = Number((session as any)?.shipping_cost?.amount_total)
  const altShipping = Number((session as any)?.total_details?.amount_shipping)
  const shippingCost = Number.isFinite(shippingRaw)
    ? shippingRaw / 100
    : Number.isFinite(altShipping)
      ? altShipping / 100
      : undefined
  const currencyLower = (session.currency || '').toString().toLowerCase() || undefined
  const currencyUpper = currencyLower ? currencyLower.toUpperCase() : undefined
  const summary = buildStripeSummary({
    session: expandedSession || session,
    failureCode,
    failureMessage,
    eventType: 'checkout.session.expired',
    eventCreated: session.created || null,
  })
  const attribution = extractAttributionFromMetadata(
    metadata,
    session?.id ? {session_id: session.id} : undefined,
  )
  const checkoutRecoveryUrl =
    ((session as any)?.after_expiration as any)?.recovery?.url ||
    (typeof (session as any)?.url === 'string' ? (session as any).url : undefined) ||
    metadata['checkout_url'] ||
    metadata['checkoutUrl'] ||
    metadata['recovery_url'] ||
    metadata['recoveryUrl'] ||
    metadata['stripe_checkout_url']

  const addressSource =
    (session.customer_details?.address as Stripe.Address | undefined) ||
    ((session as any)?.shipping_details?.address as Stripe.Address | undefined)
  const shippingName =
    session.customer_details?.name || (session as any)?.shipping_details?.name || undefined
  const shippingAddress =
    addressSource && Object.keys(addressSource).length
      ? pruneUndefined({
          name: shippingName || undefined,
          line1: addressSource.line1,
          line2: addressSource.line2,
          city: addressSource.city,
          state: addressSource.state,
          postalCode: addressSource.postal_code,
          country: addressSource.country,
        })
      : undefined

  const customerName =
    (contact.name ||
      shippingName ||
      metaValue(metadata, 'customer_name', 'bill_to_name') ||
      session.customer_details?.name ||
      email ||
      '')
      .toString()
      .trim() || undefined

  const sessionMetadataDoc = pruneUndefined({
    browser: metaValue(metadata, 'browser', 'Browser'),
    device: metaValue(metadata, 'device', 'Device'),
    os: metaValue(metadata, 'os', 'OS'),
    landingPage: metaValue(metadata, 'landing_page', 'landingPage'),
    referrer: metaValue(metadata, 'referrer', 'referrer_url', 'referrerUrl'),
    shippingMode: metaValue(metadata, 'shipping_mode', 'shippingMode'),
  })

  try {
    const docId = await upsertAbandonedCheckoutDocument(sanity, {
      checkoutId: `ABANDONED-${Date.now()}`,
      stripeSessionId: session.id,
      status: 'expired',
      customerEmail: email || undefined,
      customerName,
      customerPhone: customerPhone || undefined,
      cart: simplifiedCart.length ? simplifiedCart : undefined,
      cartSummary: cartSummary || undefined,
      amountSubtotal,
      amountTotal,
      shippingCost,
      shippingAddress: shippingAddress && Object.keys(shippingAddress).length ? shippingAddress : undefined,
      sessionMetadata: Object.keys(sessionMetadataDoc).length
        ? sessionMetadataDoc
        : undefined,
      recoveryEmailSent: false,
      sessionCreatedAt: createdAt,
      sessionExpiredAt: expiredAt,
    })
    if (docId) {
      console.log('stripeWebhook: recorded abandoned checkout', docId)
    }
  } catch (err) {
    console.warn('stripeWebhook: failed to upsert abandoned checkout document', err)
  }

  const invoiceMetaId = normalizeSanityId(metadata['sanity_invoice_id'])
  if (invoiceMetaId) {
    const invoiceId = await sanity.fetch<string | null>(
      `*[_type == "invoice" && _id in $ids][0]._id`,
      {ids: idVariants(invoiceMetaId)},
    )
    if (invoiceId) {
      try {
        await sanity
          .patch(invoiceId)
          .set({
            status: 'expired',
            stripeInvoiceStatus: 'checkout.session.expired',
            stripeLastSyncedAt: timestamp,
            paymentFailureCode: failureCode,
            paymentFailureMessage: failureMessage,
          })
          .commit({autoGenerateArrayKeys: true})
      } catch (err) {
        console.warn('stripeWebhook: failed to update invoice after checkout expiration', err)
      }
    }
  }

  try {
    const expiredCustomer = await strictFindOrCreateCustomer(session)
    await upsertCheckoutSessionDocument(session, {
      cart: cartItems,
      metadata,
      createdAt,
      expiresAt,
      expiredAt,
      amountSubtotal,
      amountTax,
      amountShipping: shippingCost,
      amountTotal,
      currency: currencyUpper || currencyLower,
      customerName,
      customerId: expiredCustomer?._id || undefined,
      checkoutUrl: checkoutRecoveryUrl,
      attribution,
    })
  } catch (err) {
    console.warn('stripeWebhook: failed to upsert checkoutSession document', err)
  }

  await addToAbandonedCartAudience(email, customerName)
}

async function sendOrderConfirmationEmail(opts: {
  to: string
  orderNumber: string
  customerName?: string
  items: Array<{name?: string; sku?: string; quantity?: number; price?: number}>
  totalAmount?: number
  subtotal?: number
  taxAmount?: number
  shippingAmount?: number
  shippingAddress?: any
}) {
  if (!RESEND_API_KEY || !opts.to) return

  const {
    to,
    orderNumber,
    customerName,
    items,
    totalAmount,
    subtotal,
    taxAmount,
    shippingAmount,
    shippingAddress,
  } = opts

  const displayOrderNumber = sanitizeOrderNumber(orderNumber) || orderNumber
  const trimmedName = (customerName || '').toString().trim()
  const greetingLine = trimmedName
    ? `Hi ${trimmedName}, we’re getting your order ready now.`
    : 'We’re getting your order ready now.'
  const salutationPlain = trimmedName ? `Hi ${trimmedName}` : 'Hi there'

  const itemsHtml = items.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0;">
        <thead>
          <tr>
            <th align="left" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;">Item</th>
            <th align="center" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;width:70px;">Qty</th>
            <th align="right" style="font-size:13px;color:#52525b;padding:0 0 8px;border-bottom:1px solid #e4e4e7;width:90px;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
                  <div style="font-size:14px;color:#111827;font-weight:600;">${item?.name || item?.sku || 'Item'}</div>
                  ${item?.sku ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">SKU ${item.sku}</div>` : ''}
                </td>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:center;font-size:14px;color:#374151;">${Number(item?.quantity || 1)}</td>
                <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-size:14px;color:#374151;">${money(item?.price)}</td>
              </tr>
            `,
            )
            .join('')}
        </tbody>
      </table>`
    : ''

  const shippingHtml = renderAddressHtml(shippingAddress)
    ? `<div style="margin:24px 0 12px;">
        <h3 style="margin:0 0 6px;font-size:15px;color:#111827;">Shipping to</h3>
        <div style="font-size:14px;color:#374151;line-height:1.5;">${renderAddressHtml(shippingAddress)}</div>
      </div>`
    : ''

  const summaryRows = [
    {label: 'Subtotal', value: money(typeof subtotal === 'number' ? subtotal : undefined)},
    {
      label: 'Shipping',
      value: money(typeof shippingAmount === 'number' ? shippingAmount : undefined),
    },
    {label: 'Tax', value: money(typeof taxAmount === 'number' ? taxAmount : undefined)},
  ].filter((row) => row.value)

  const totalDisplay = money(totalAmount)
  const summaryHtml =
    summaryRows.length || totalDisplay
      ? `<div style="margin:12px 0 24px;padding:12px 16px;border:1px solid #e4e4e7;border-radius:12px;background:#f9fafb;max-width:340px;">
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tbody>
            ${summaryRows
              .map(
                (row) => `
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#52525b;">${row.label}</td>
                  <td style="padding:6px 0;font-size:13px;color:#374151;text-align:right;">${row.value}</td>
                </tr>
              `,
              )
              .join('')}
            ${
              totalDisplay
                ? `<tr>
                  <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#111827;border-top:1px solid #e4e4e7;">Total</td>
                  <td style="padding:8px 0 0;font-size:15px;font-weight:700;color:#111827;text-align:right;border-top:1px solid #e4e4e7;">${totalDisplay}</td>
                </tr>`
                : ''
            }
          </tbody>
        </table>
      </div>`
      : ''

  const html = `
    <div style="margin:0;padding:24px 12px;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;color:#ffffff;padding:24px 28px;">
            <h1 style="margin:0;font-size:22px;font-weight:700;">Thank you for your order${
              displayOrderNumber ? ` <span style="color:#f97316">#${displayOrderNumber}</span>` : ''
            }</h1>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">${greetingLine}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 24px;color:#111827;">
            <p style="margin:0 0 16px;font-size:15px;">Here’s a quick summary for your records. We’ll send tracking details as soon as your package ships.</p>
            ${itemsHtml}
            ${summaryHtml}
            ${shippingHtml}
            <div style="margin:28px 0 0;padding:16px 20px;border-radius:10px;background:#f9fafb;color:#4b5563;font-size:13px;border:1px solid #e4e4e7;">
              Questions? Reply to this email or call us at (812) 200-9012.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;border-top:1px solid #e4e4e7;background:#f4f4f5;font-size:12px;color:#6b7280;text-align:center;">
            F.A.S. Motorsports LLC • 6161 Riverside Dr • Punta Gorda, FL 33982
          </td>
        </tr>
      </table>
    </div>
  `

  const textItems =
    items
      .map(
        (item) =>
          `- ${Number(item?.quantity || 1)} × ${item?.name || item?.sku || 'Item'} ${money(item?.price)}`,
      )
      .join('\n') || '- (details unavailable)'

  const textLines: string[] = []
  textLines.push(`${salutationPlain},`)
  textLines.push('')
  textLines.push(`Thank you for your order${displayOrderNumber ? ` #${displayOrderNumber}` : ''}!`)
  textLines.push('')
  textLines.push('Items:')
  textLines.push(textItems)
  if (totalDisplay) {
    textLines.push('')
    textLines.push(`Order total: ${totalDisplay}`)
  }
  if (renderAddressText(shippingAddress)) {
    textLines.push('')
    textLines.push('Shipping to:')
    textLines.push(renderAddressText(shippingAddress))
  }
  textLines.push('')
  textLines.push('We will email you tracking details as soon as your package ships.')
  textLines.push('')
  textLines.push('Questions? Reply to this email or call (812) 200-9012.')
  textLines.push('')
  textLines.push('— F.A.S. Motorsports')

  const text = textLines.join('\n')

  const subject = displayOrderNumber
    ? `Order Confirmation #${displayOrderNumber} – F.A.S. Motorsports`
    : 'Order Confirmation – F.A.S. Motorsports'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'orders@fasmotorsports.com',
      to,
      subject,
      html,
      text,
    }),
  })
}

export const handler: Handler = async (event) => {
  const startTime = Date.now()
  let webhookEvent: Stripe.Event | null = null
  let webhookStatus: 'processed' | 'ignored' | 'error' = 'processed'
  let webhookSummary = ''

  const finalize = async (
    response: {statusCode: number; body: string},
    status: 'success' | 'error' | 'warning',
    result?: unknown,
    error?: unknown,
  ) => {
    await logFunctionExecution({
      functionName: 'stripeWebhook',
      status,
      duration: Date.now() - startTime,
      eventData: event,
      result,
      error,
      metadata: {
        stripeEventId: webhookEvent?.id,
        eventType: webhookEvent?.type,
        webhookStatus,
      },
    })
    return response
  }

  try {
    console.log('Function stripeWebhook invoked')
    console.log('Has RESEND_API_KEY:', Boolean(process.env.RESEND_API_KEY))
    console.log('Has SANITY_WRITE_TOKEN:', Boolean(process.env.SANITY_WRITE_TOKEN))

    if (!stripe)
      return await finalize(
        {statusCode: 500, body: 'Stripe not configured'},
        'error',
        {message: 'Stripe not configured'},
      )

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!endpointSecret)
      return await finalize(
        {statusCode: 500, body: 'Missing STRIPE_WEBHOOK_SECRET'},
        'error',
        {message: 'Missing STRIPE_WEBHOOK_SECRET'},
      )

    if (event.httpMethod === 'OPTIONS') return await finalize({statusCode: 200, body: ''}, 'success')
    if (event.httpMethod !== 'POST')
      return await finalize({statusCode: 405, body: 'Method Not Allowed'}, 'error')

    const skipSignature = process.env.STRIPE_WEBHOOK_NO_VERIFY === '1'
    const sig = (event.headers['stripe-signature'] || event.headers['Stripe-Signature']) as string
    if (!sig && !skipSignature)
      return await finalize(
        {statusCode: 400, body: 'Missing Stripe-Signature header'},
        'error',
        {message: 'Missing Stripe-Signature header'},
      )

    try {
      const raw = getRawBody(event)
      if (skipSignature) {
        webhookEvent = JSON.parse(raw.toString('utf8')) as Stripe.Event
      } else {
        webhookEvent = stripe.webhooks.constructEvent(raw, sig, endpointSecret)
      }
    } catch (err: any) {
      const label = skipSignature
        ? 'stripeWebhook payload parse failed'
        : 'stripeWebhook signature verification failed'
      console.error(`${label}:`, err?.message || err)
      return await finalize(
        {statusCode: 400, body: `Webhook Error: ${err?.message || 'invalid signature'}`},
        'error',
        undefined,
        err,
      )
    }

    if (!webhookEvent) {
      webhookSummary = 'Missing Stripe event'
      return await finalize(
        {statusCode: 400, body: 'Invalid webhook event payload'},
        'error',
        {message: 'Stripe event missing from payload'},
      )
    }

    webhookSummary = summarizeEventType(webhookEvent.type || '')

  try {
    type ExtendedStripeEventType = Stripe.Event.Type | string
    const eventType = webhookEvent.type as ExtendedStripeEventType

    switch (eventType) {
      case 'quote.created':
      case 'quote.finalized':
      case 'quote.updated':
      case 'quote.accepted':
      case 'quote.canceled':
      case 'quote.will_expire': {
        try {
          const quoteObject = webhookEvent.data.object as Stripe.Quote
          const quote = (await fetchQuoteResource(quoteObject)) || quoteObject
          await syncStripeQuote(quote, {
            eventType: webhookEvent.type,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to sync quote event', err)
        }
        break
      }

      case 'payment_link.created':
      case 'payment_link.updated': {
        try {
          const paymentLinkObject = webhookEvent.data.object as Stripe.PaymentLink
          const paymentLink =
            (await fetchPaymentLinkResource(paymentLinkObject)) || paymentLinkObject
          await syncStripePaymentLink(paymentLink, {
            eventType: webhookEvent.type,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to sync payment link event', err)
        }
        break
      }

      case 'payment_method.attached':
      case 'payment_method.updated':
      case 'payment_method.automatically_updated': {
        try {
          const paymentMethod = webhookEvent.data.object as Stripe.PaymentMethod
          await syncCustomerPaymentMethod(paymentMethod)
        } catch (err) {
          console.warn('stripeWebhook: failed to sync payment method', err)
        }
        break
      }

      case 'payment_method.detached': {
        try {
          const paymentMethod = webhookEvent.data.object as Stripe.PaymentMethod
          await removeCustomerPaymentMethod(paymentMethod.id)
        } catch (err) {
          console.warn('stripeWebhook: failed to remove payment method', err)
        }
        break
      }

      case 'product.created':
      case 'product.updated': {
        try {
          const product = webhookEvent.data.object as Stripe.Product
          await syncStripeProduct(product)
        } catch (err) {
          console.warn('stripeWebhook: failed to sync product event', err)
        }
        break
      }

      case 'product.deleted': {
        try {
          const product = webhookEvent.data.object as {id: string}
          const docId = await findProductDocumentId({stripeProductId: product.id})
          if (docId) {
            await sanity
              .patch(docId)
              .set({
                stripeActive: false,
                stripeUpdatedAt: new Date().toISOString(),
              })
              .commit({autoGenerateArrayKeys: true})
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to handle product.deleted', err)
        }
        break
      }

      case 'price.created':
      case 'price.updated': {
        try {
          const price = webhookEvent.data.object as Stripe.Price
          await syncStripePrice(price)
        } catch (err) {
          console.warn('stripeWebhook: failed to sync price event', err)
        }
        break
      }

      case 'price.deleted': {
        try {
          const deleted = webhookEvent.data.object as {id: string; product?: string | {id?: string}}
          const productId =
            typeof deleted.product === 'string' ? deleted.product : deleted.product?.id
          await removeStripePrice(deleted.id, productId)
        } catch (err) {
          console.warn('stripeWebhook: failed to handle price.deleted', err)
        }
        break
      }

      case 'customer.created':
      case 'customer.updated': {
        try {
          const customer = webhookEvent.data.object as Stripe.Customer
          if (!customer.deleted) {
            await syncStripeCustomer(customer)
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to sync customer', err)
        }
        break
      }

      case 'customer.deleted': {
        try {
          const deleted = webhookEvent.data.object as {id: string}
          const docId = await sanity.fetch<string | null>(
            `*[_type == "customer" && stripeCustomerId == $id][0]._id`,
            {id: deleted.id},
          )
          if (docId) {
            await sanity
              .patch(docId)
              .set({stripeLastSyncedAt: new Date().toISOString()})
              .commit({autoGenerateArrayKeys: true})
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to handle customer.deleted', err)
        }
        break
      }

      case 'customer.discount.created':
      case 'customer.discount.updated': {
        try {
          const discount = webhookEvent.data.object as Stripe.Discount
          const {coupon, promotion} = await hydrateDiscountResources(stripe, discount)
          await syncCustomerDiscountRecord({
            sanity,
            discount,
            stripe,
            coupon,
            promotion,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to sync customer discount', err)
        }
        break
      }

      case 'customer.discount.deleted': {
        try {
          const discount = webhookEvent.data.object as Stripe.Discount
          const stripeCustomerId =
            typeof discount.customer === 'string'
              ? discount.customer
              : (discount.customer as Stripe.Customer | null)?.id
          await removeCustomerDiscountRecord({
            sanity,
            stripeDiscountId: discount.id,
            stripeCustomerId,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to remove customer discount', err)
        }
        break
      }

      case 'shipping.label.created':
      case 'shipping.label.updated':
      case 'shipping.tracking.updated': {
        try {
          const payload = webhookEvent.data.object as Record<string, any>
          await handleShippingStatusSync(payload, {
            eventType: webhookEvent.type,
            stripeEventId: webhookEvent.id,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle shipping status event', err)
        }
        break
      }

      case 'invoice.created':
      case 'invoice.deleted':
      case 'invoice.finalization_failed':
      case 'invoice.finalized':
      case 'invoice.marked_uncollectible':
      case 'invoice.overdue':
      case 'invoice.overpaid':
      case 'invoice.paid':
      case 'invoice.payment_action_required':
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded':
      case 'invoice.sent':
      case 'invoice.upcoming':
      case 'invoice.voided':
      case 'invoice.updated':
      case 'invoice.will_be_due': {
        try {
          const invoice = webhookEvent.data.object as Stripe.Invoice
          await syncStripeInvoice(invoice)

          const invoiceStatus = (invoice.status || '').toString().toLowerCase()
          const invoiceIdentifier = (() => {
            const raw = (invoice.number ?? invoice.id ?? '') as string | null
            return raw ? raw.toString().trim() : ''
          })()
          const shouldRecordFailure =
            webhookEvent.type === 'invoice.payment_failed' || invoiceStatus === 'uncollectible'

          if (shouldRecordFailure) {
            const paymentIntent = await fetchPaymentIntentResource((invoice as any).payment_intent)
            if (paymentIntent) {
              await markPaymentIntentFailure(paymentIntent)
            }
          } else if (webhookEvent.type === 'invoice.payment_action_required') {
            const paymentIntent = await fetchPaymentIntentResource((invoice as any).payment_intent)
            const paymentIntentId =
              paymentIntent?.id ||
              (typeof (invoice as any)?.payment_intent === 'string'
                ? ((invoice as any).payment_intent as string)
                : undefined)
            if (paymentIntentId) {
              await updateOrderPaymentStatus({
                paymentIntentId,
                paymentStatus: 'requires_action',
                invoiceStripeStatus: webhookEvent.type,
                metadata: (invoice.metadata || {}) as Record<string, unknown>,
                preserveExistingFailureDiagnostics: true,
                event: {
                  eventType: webhookEvent.type,
                  label: 'Invoice requires payment action',
                  message: invoiceIdentifier
                    ? `Invoice ${invoiceIdentifier} requires customer action`
                    : 'Invoice requires customer action',
                  stripeEventId: webhookEvent.id,
                  occurredAt: webhookEvent.created,
                  metadata: (invoice.metadata || {}) as Record<string, unknown>,
                },
              })
            }
          } else if (
            webhookEvent.type === 'invoice.payment_succeeded' ||
            webhookEvent.type === 'invoice.paid'
          ) {
            const paymentIntent = await fetchPaymentIntentResource((invoice as any).payment_intent)
            const paymentIntentId =
              paymentIntent?.id ||
              (typeof (invoice as any)?.payment_intent === 'string'
                ? ((invoice as any).payment_intent as string)
                : undefined)
            if (paymentIntentId) {
              const latestCharge = paymentIntent?.latest_charge as
                | string
                | Stripe.Charge
                | null
                | undefined
              const chargeId =
                typeof latestCharge === 'string'
                  ? latestCharge
                  : typeof latestCharge?.id === 'string'
                    ? latestCharge.id
                    : undefined
              const summary = buildStripeSummary({
                paymentIntent: paymentIntent || undefined,
                eventType: webhookEvent.type,
                eventCreated: webhookEvent.created,
              })
              const additionalOrderFields = {
                stripeSummary: serializeStripeSummaryData(summary),
                paymentFailureCode: null,
                paymentFailureMessage: null,
              }
              const additionalInvoiceFields = {
                paymentFailureCode: null,
                paymentFailureMessage: null,
              }
              await updateOrderPaymentStatus({
                paymentIntentId,
                chargeId,
                paymentStatus: 'paid',
                orderStatus: 'paid',
                invoiceStatus: 'paid',
                invoiceStripeStatus: webhookEvent.type,
                metadata: (invoice.metadata || {}) as Record<string, unknown>,
                additionalOrderFields,
                additionalInvoiceFields,
                event: {
                  eventType: webhookEvent.type,
                  label: 'Invoice payment succeeded',
                  message: invoiceIdentifier
                    ? `Invoice ${invoiceIdentifier} payment succeeded`
                    : 'Invoice payment succeeded',
                  stripeEventId: webhookEvent.id,
                  occurredAt: webhookEvent.created,
                  metadata: (invoice.metadata || {}) as Record<string, unknown>,
                },
              })
            }
          }
        } catch (err) {
          console.warn('stripeWebhook: failed to sync invoice', err)
        }
        break
      }

      case 'invoiceitem.created':
      case 'invoiceitem.deleted':
      case 'invoiceitem.updated': {
        try {
          const invoiceItem = webhookEvent.data.object as Stripe.InvoiceItem
          await syncStripeInvoiceById(
            invoiceItem.invoice as string | Stripe.Invoice | null | undefined,
          )
        } catch (err) {
          console.warn('stripeWebhook: failed to sync invoice from invoiceitem event', err)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        try {
          const pi = webhookEvent.data.object as Stripe.PaymentIntent
          await markPaymentIntentFailure(pi)
        } catch (err) {
          console.warn('stripeWebhook: failed to mark payment failure', err)
        }
        break
      }

      case 'payment_intent.canceled': {
        try {
          const pi = webhookEvent.data.object as Stripe.PaymentIntent
          const diagnostics = await resolvePaymentFailureDiagnostics(pi)
          await updateOrderPaymentStatus({
            paymentIntentId: pi.id,
            stripeSessionId:
              typeof pi.metadata?.checkout_session_id === 'string'
                ? pi.metadata?.checkout_session_id
                : undefined,
            paymentStatus: pi.status || 'canceled',
            orderStatus: 'cancelled',
            invoiceStatus: 'cancelled',
            invoiceStripeStatus: 'payment_intent.canceled',
            metadata: (pi.metadata || {}) as Record<string, unknown>,
            additionalOrderFields: {
              paymentFailureCode: diagnostics.code,
              paymentFailureMessage: diagnostics.message,
            },
            additionalInvoiceFields: {
              paymentFailureCode: diagnostics.code,
              paymentFailureMessage: diagnostics.message,
            },
            preserveExistingFailureDiagnostics: true,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to mark payment cancellation', err)
        }
        break
      }

      case 'charge.captured':
      case 'charge.succeeded': {
        try {
          const charge = webhookEvent.data.object as Stripe.Charge
          const amountCaptured =
            webhookEvent.type === 'charge.captured'
              ? toMajorUnits(charge.amount_captured)
              : toMajorUnits(charge.amount || undefined)
          const amountLabel = formatMajorAmount(amountCaptured, charge.currency)
          await handleChargeEvent({
            charge,
            event: webhookEvent!,
            paymentStatus: 'paid',
            orderStatus: 'paid',
            invoiceStatus: 'paid',
            label: webhookEvent.type === 'charge.captured' ? 'Charge captured' : 'Charge succeeded',
            messageParts: [
              charge.id ? `Charge ${charge.id}` : null,
              amountCaptured !== undefined && amountLabel ? `Amount ${amountLabel}` : null,
              charge.status ? `Stripe status ${charge.status}` : null,
            ],
            amountOverride: amountCaptured,
            includeChargeContext: false,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge success event', err)
        }
        break
      }

      case 'charge.pending': {
        try {
          const charge = webhookEvent.data.object as Stripe.Charge
          const amountPending = toMajorUnits(charge.amount || undefined)
          const amountLabel = formatMajorAmount(amountPending, charge.currency)
          await handleChargeEvent({
            charge,
            event: webhookEvent!,
            paymentStatus: 'pending',
            invoiceStatus: 'pending',
            label: 'Charge pending',
            messageParts: [
              charge.id ? `Charge ${charge.id}` : null,
              amountPending !== undefined && amountLabel ? `Amount ${amountLabel}` : null,
              charge.status ? `Stripe status ${charge.status}` : null,
            ],
            amountOverride: amountPending,
            includeChargeContext: false,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge.pending', err)
        }
        break
      }

      case 'charge.failed': {
        try {
          const charge = webhookEvent.data.object as Stripe.Charge
          const amountFailed = toMajorUnits(charge.amount || undefined)
          const amountLabel = formatMajorAmount(amountFailed, charge.currency)
          await handleChargeEvent({
            charge,
            event: webhookEvent!,
            paymentStatus: 'failed',
            orderStatus: 'cancelled',
            invoiceStatus: 'cancelled',
            label: 'Charge failed',
            messageParts: [
              charge.id ? `Charge ${charge.id}` : null,
              amountFailed !== undefined && amountLabel ? `Amount ${amountLabel}` : null,
              charge.failure_code ? `Failure ${charge.failure_code}` : null,
              charge.failure_message ? charge.failure_message : null,
            ],
            amountOverride: amountFailed,
            additionalOrderFields: {
              paymentFailureCode: charge.failure_code || charge.outcome?.reason || undefined,
              paymentFailureMessage:
                charge.failure_message || charge.outcome?.seller_message || undefined,
            },
            additionalInvoiceFields: {
              paymentFailureCode: charge.failure_code || charge.outcome?.reason || undefined,
              paymentFailureMessage:
                charge.failure_message || charge.outcome?.seller_message || undefined,
            },
            preserveExistingFailureDiagnostics: false,
            includeChargeContext: false,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge.failed', err)
        }
        break
      }

      case 'charge.expired': {
        try {
          const charge = webhookEvent.data.object as Stripe.Charge
          const amount = toMajorUnits(charge.amount || undefined)
          const amountLabel = formatMajorAmount(amount, charge.currency)
          await handleChargeEvent({
            charge,
            event: webhookEvent!,
            paymentStatus: 'expired',
            orderStatus: 'expired',
            invoiceStatus: 'cancelled',
            label: 'Charge authorization expired',
            messageParts: [
              charge.id ? `Charge ${charge.id}` : null,
              amount !== undefined && amountLabel ? `Amount ${amountLabel}` : null,
            ],
            amountOverride: amount,
            includeChargeContext: false,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle charge.expired', err)
        }
        break
      }

      case 'charge.dispute.created': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent!,
            paymentStatus: 'disputed',
            label: 'Dispute opened',
            messageParts: [dispute.id ? `Dispute ${dispute.id}` : null],
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.created', err)
        }
        break
      }

      case 'charge.dispute.updated': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent!,
            paymentStatus: 'disputed',
            label: 'Dispute updated',
            messageParts: [dispute.id ? `Dispute ${dispute.id}` : null],
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.updated', err)
        }
        break
      }

      case 'charge.dispute.closed': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          const status = (dispute.status || '').toLowerCase()
          let paymentStatus: string = 'dispute_closed'
          let orderStatus: OrderPaymentStatusInput['orderStatus'] | undefined = undefined
          let invoiceStatus: OrderPaymentStatusInput['invoiceStatus'] | undefined = undefined
          if (status === 'won') {
            paymentStatus = 'dispute_won'
            orderStatus = 'paid'
            invoiceStatus = 'paid'
          } else if (status === 'lost') {
            paymentStatus = 'dispute_lost'
            orderStatus = 'cancelled'
            invoiceStatus = 'cancelled'
          } else if (status === 'warning_closed') {
            paymentStatus = 'dispute_warning_closed'
          }
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent!,
            paymentStatus,
            orderStatus,
            invoiceStatus,
            label: 'Dispute closed',
            messageParts: [dispute.id ? `Dispute ${dispute.id}` : null],
            eventStatus: paymentStatus,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.closed', err)
        }
        break
      }

      case 'charge.dispute.funds_withdrawn': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent!,
            paymentStatus: 'dispute_funds_withdrawn',
            label: 'Dispute funds withdrawn',
            messageParts: [
              dispute.id ? `Dispute ${dispute.id}` : null,
              'Stripe withdrew dispute funds',
            ],
            eventStatus: 'dispute_funds_withdrawn',
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.funds_withdrawn', err)
        }
        break
      }

      case 'charge.dispute.funds_reinstated': {
        try {
          const dispute = webhookEvent.data.object as Stripe.Dispute
          await handleDisputeEvent({
            dispute,
            charge: null,
            event: webhookEvent!,
            paymentStatus: 'dispute_funds_reinstated',
            orderStatus: 'paid',
            invoiceStatus: 'paid',
            label: 'Dispute funds reinstated',
            messageParts: [
              dispute.id ? `Dispute ${dispute.id}` : null,
              'Stripe reinstated dispute funds',
            ],
            eventStatus: 'dispute_funds_reinstated',
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle dispute.funds_reinstated', err)
        }
        break
      }

      case 'charge.refunded':
      case 'charge.refund.created':
      case 'charge.refund.updated': {
        await handleRefundWebhookEvent(webhookEvent!)
        break
      }

      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        await handleRefundWebhookEvent(webhookEvent!)
        break
      }

      case 'checkout.session.async_payment_succeeded': {
        try {
          const session = webhookEvent.data.object as Stripe.Checkout.Session
          await handleCheckoutAsyncPaymentSucceeded(session, {
            eventType: webhookEvent.type,
            invoiceStripeStatus: webhookEvent.type,
            stripeEventId: webhookEvent.id,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn(
            'stripeWebhook: failed to handle checkout.session.async_payment_succeeded',
            err,
          )
        }
        break
      }

      case 'checkout.session.async_payment_failed': {
        try {
          const session = webhookEvent.data.object as Stripe.Checkout.Session
          await handleCheckoutAsyncPaymentFailed(session, {
            eventType: webhookEvent.type,
            invoiceStripeStatus: webhookEvent.type,
            stripeEventId: webhookEvent.id,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle checkout.session.async_payment_failed', err)
        }
        break
      }

      case 'checkout.session.created': {
        const session = webhookEvent.data.object as Stripe.Checkout.Session
        try {
          await handleCheckoutCreated(session)
        } catch (err) {
          console.warn('stripeWebhook: failed to handle checkout.session.created', err)
        }
        break
      }

      case 'checkout.session.completed': {
        const session = webhookEvent.data.object as Stripe.Checkout.Session
        try {
          await createOrderFromCheckout(session)
        } catch (err) {
          console.error('stripeWebhook: strict checkout order creation failed', err)
        }
        break
      }

      case 'checkout.session.expired': {
        const session = webhookEvent.data.object as Stripe.Checkout.Session
        try {
          await handleCheckoutExpired(session, {
            stripeEventId: webhookEvent.id,
            eventCreated: webhookEvent.created,
          })
        } catch (err) {
          console.warn('stripeWebhook: failed to handle checkout.session.expired', err)
        }
        break
      }

      case 'payment_intent.succeeded': {
        const pi = webhookEvent.data.object as Stripe.PaymentIntent
        const meta = (pi.metadata || {}) as Record<string, string>
        const userIdMeta =
          (meta['auth0_user_id'] || meta['auth0_sub'] || meta['userId'] || meta['user_id'] || '')
            .toString()
            .trim() || undefined
        const metadataCustomerId =
          firstString(CUSTOMER_METADATA_ID_KEYS.map((key) => meta[key])) || undefined
        const metadataInvoiceId = normalizeSanityId(meta['sanity_invoice_id'])
        const checkoutSessionMeta =
          (
            meta['checkout_session_id'] ||
            meta['checkoutSessionId'] ||
            meta['stripe_checkout_session_id'] ||
            meta['session_id'] ||
            ''
          )
            .toString()
            .trim() || undefined

        // Create a minimal Order if none exists yet
        try {
          const totalAmount = (Number(pi.amount_received || pi.amount || 0) || 0) / 100
          const email =
            (pi as any)?.charges?.data?.[0]?.billing_details?.email ||
            (pi as any)?.receipt_email ||
            undefined
          const currency = ((pi as any)?.currency || '').toString().toLowerCase() || undefined
          const ch = (pi as any)?.charges?.data?.[0]
          const chargeId = ch?.id || undefined
          const receiptUrl = ch?.receipt_url || undefined
          const cardBrand = ch?.payment_method_details?.card?.brand || undefined
          const cardLast4 = ch?.payment_method_details?.card?.last4 || undefined
          const chargeBillingName = ch?.billing_details?.name || undefined
          const shippingAddr: any = (pi as any)?.shipping?.address || undefined
          const stripeCustomerIdValue =
            resolveStripeCustomerId(
              pi.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
            ) || metadataCustomerId
          const billingAddress =
            normalizeStripeContactAddress(
              ch?.billing_details?.address as Stripe.Address | undefined,
              {
                name: chargeBillingName || undefined,
                email,
                phone: ch?.billing_details?.phone || undefined,
              },
            ) || undefined
          const rawPaymentStatus = (pi.status || '').toLowerCase()
          let paymentStatus = rawPaymentStatus || 'pending'
          if (['succeeded', 'paid'].includes(rawPaymentStatus)) paymentStatus = 'paid'
          else if (['canceled', 'cancelled'].includes(rawPaymentStatus)) paymentStatus = 'cancelled'
          let derivedOrderStatus: 'paid' | 'cancelled' =
            paymentStatus === 'cancelled' ? 'cancelled' : 'paid'

          const metadataOrderNumberRaw = extractMetadataOrderNumber(meta) || ''
          const metadataInvoiceNumber =
            firstString(
              INVOICE_METADATA_NUMBER_KEYS.map((key) => meta[key as keyof typeof meta]),
            ) || ''
          let invoiceDocId = metadataInvoiceId || null
          if (!invoiceDocId) {
            const piAny = pi as any
            const stripeInvoiceId =
              typeof piAny.invoice === 'string'
                ? piAny.invoice
                : (piAny.invoice as Stripe.Invoice | undefined)?.id
            invoiceDocId =
              (await findInvoiceDocumentIdForEvent({
                metadata: meta,
                stripeInvoiceId,
                invoiceNumber: metadataInvoiceNumber || undefined,
                paymentIntentId: pi.id,
              })) || null
          }
          const shippingDetails = await resolveStripeShippingDetails({
            metadata: meta,
            paymentIntent: pi,
            fallbackAmount: undefined,
            stripe,
          })
          const orderNumber = await resolveOrderNumber({
            metadataOrderNumber: metadataOrderNumberRaw,
            invoiceNumber: metadataInvoiceNumber,
            fallbackId: pi.id,
          })
          const normalizedOrderNumber = normalizeOrderNumberForStorage(orderNumber) || orderNumber
          const customerName =
            (
              (pi as any)?.shipping?.name ||
              meta['bill_to_name'] ||
              chargeBillingName ||
              email ||
              ''
            )
              .toString()
              .trim() || 'Guest Customer'

          let cart: CartItem[] = []
          let cartProducts: CartProductSummary[] = []
          if (checkoutSessionMeta) {
            try {
              const cartResult = await buildCartFromSessionLineItems(checkoutSessionMeta, meta)
              cart = cartResult.items
              cartProducts = cartResult.products
            } catch (err) {
              console.warn('stripeWebhook: failed to load cart from checkout metadata', err)
            }
          }
          if (!cart.length) {
            cart = cartItemsFromMetadata(meta)
          }
          if (cart.length && !cartProducts.length) {
            try {
              const enriched = await enrichCartItemsFromSanity(cart, sanity, {
                onProducts: (list: CartProductSummary[]) => {
                  cartProducts = list
                },
              })
              cart = enriched
            } catch (err) {
              console.warn('stripeWebhook: failed to enrich payment intent cart', err)
            }
          }
          if (cart.length && !cartProducts.length) {
            try {
              cartProducts = await fetchProductsForCart(cart, sanity)
            } catch (err) {
              console.warn(
                'stripeWebhook: failed to fetch product summaries for payment intent',
                err,
              )
            }
          }
          cart = enforceCartRequirements(cart, cartProducts, {
            source: 'payment_intent',
            sessionId: checkoutSessionMeta || pi.id,
            orderId: normalizedOrderNumber,
          })
          cart = cart.map(cleanCartItemForStorage)

          if (!cart.length) {
            throw new Error(
              `stripeWebhook: cannot create payment_intent order without cart items (${normalizedOrderNumber || pi.id})`,
            )
          }

          let shippingMetrics = ensureShippingMetricsFromProducts(
            computeShippingMetrics(cart, cartProducts),
            cart,
            cartProducts,
          )
          const metaWeight = resolveShippingWeightLbs(undefined, meta)
          if (
            metaWeight !== undefined &&
            (!shippingMetrics.weight ||
              !shippingMetrics.weight.value ||
              shippingMetrics.weight.value <= 0)
          ) {
            shippingMetrics = {
              ...shippingMetrics,
              weight: {_type: 'shipmentWeight', value: metaWeight, unit: 'pound'},
            }
          }

          const amountShipping =
            typeof shippingDetails.amount === 'number'
              ? toCurrencyNumber(shippingDetails.amount)
              : undefined
          const amountTax =
            toCurrencyNumber(
              toMajorUnits(
                ((pi as any)?.amount_details as any)?.tax ??
                  (ch as any)?.amount_tax ??
                  undefined,
              ),
            ) ?? undefined
          const cartSubtotal = cart.reduce((sum, item) => {
            const value = Number((item as any)?.total ?? (item as any)?.lineTotal ?? 0)
            return Number.isFinite(value) ? sum + value : sum
          }, 0)
          const amountSubtotal =
            toCurrencyNumber(cartSubtotal) ??
            toCurrencyNumber(
              (Number.isFinite(totalAmount)
                ? (totalAmount as number) - (amountShipping || 0) - (amountTax || 0)
                : undefined) as number | undefined,
            ) ??
            (Number.isFinite(totalAmount) ? (totalAmount as number) : undefined)
          const amountDiscount =
            amountSubtotal !== undefined && Number.isFinite(totalAmount)
              ? toCurrencyNumber(
                  Math.max(
                    0,
                    (amountSubtotal || 0) -
                      ((totalAmount as number) - (amountShipping || 0) - (amountTax || 0)),
                  ),
                )
              : undefined

          const existingOrderId =
            (await findOrderDocumentIdForEvent({
              metadata: meta,
              paymentIntentId: pi.id,
              sessionId: checkoutSessionMeta || pi.id,
              invoiceDocId,
              invoiceNumber: metadataInvoiceNumber || null,
            })) || null
          const existingOrder = existingOrderId
            ? await sanity.fetch<{
                _id: string
                orderNumber?: string | null
                status?: string | null
                packingSlipUrl?: string | null
                stripeSessionId?: string | null
                trackingNumber?: string | null
                trackingUrl?: string | null
                shippingLabelUrl?: string | null
                fulfillment?: Record<string, any> | null
                fulfillmentWorkflow?: Record<string, any> | null
              }>(
                `*[_type == "order" && _id == $id][0]{_id, orderNumber, status, packingSlipUrl, stripeSessionId, trackingNumber, trackingUrl, shippingLabelUrl, fulfillment, fulfillmentWorkflow}`,
                {
                  id: existingOrderId,
                },
              )
            : null
          const existingId = existingOrder?._id || null
          if (!existingId) {
            console.log(
              'stripeWebhook: payment_intent.succeeded skipped (no checkout order found)',
              {
                paymentIntentId: pi.id,
                checkoutSessionId: checkoutSessionMeta,
              },
            )
            break
          }
          const normalizedEmail = typeof email === 'string' ? email.trim() : ''
          const shouldSendConfirmation =
            !existingId && Boolean(normalizedEmail) && Boolean(RESEND_API_KEY)
          const resolvedStripeSessionId =
            existingOrder?.stripeSessionId || checkoutSessionMeta || pi.id
          if (existingOrder && isTerminalOrderStatus(existingOrder.status)) {
            console.log(
              `stripeWebhook: payment_intent.succeeded ignored for terminal order ${
                existingOrder.orderNumber || existingOrder._id
              }`,
            )
            break
          }
          const baseDoc: any = {
            _type: 'order',
            stripeSource: 'payment_intent',
            stripeSessionId: resolvedStripeSessionId,
            orderNumber: normalizedOrderNumber,
            orderType: determineOrderType(meta),
            customerName,
            customerEmail: email || undefined,
            ...(Number.isFinite(totalAmount) ? {totalAmount} : {}),
            ...(amountSubtotal !== undefined ? {amountSubtotal} : {}),
            ...(amountTax !== undefined ? {amountTax} : {}),
            ...(amountShipping !== undefined ? {amountShipping} : {}),
            ...(amountDiscount !== undefined ? {amountDiscount} : {}),
            status: existingOrder?.status && isFulfillmentCompleteStatus(existingOrder.status)
              ? existingOrder.status
              : derivedOrderStatus,
            createdAt: new Date().toISOString(),
            paymentStatus,
            stripePaymentIntentStatus: pi.status || undefined,
            stripeLastSyncedAt: new Date().toISOString(),
            currency,
            paymentIntentId: pi.id,
            stripePaymentIntentId: pi.id,
            chargeId,
            ...(invoiceDocId ? {invoiceRef: {_type: 'reference', _ref: invoiceDocId}} : {}),
            stripeCustomerId: stripeCustomerIdValue || undefined,
            checkoutDraft: derivedOrderStatus !== 'paid' ? true : undefined,
            ...(userIdMeta ? {userId: userIdMeta} : {}),
            ...(shippingAddr
              ? {
                  shippingAddress: {
                    name: (pi as any)?.shipping?.name || chargeBillingName || undefined,
                    addressLine1: shippingAddr.line1 || undefined,
                    addressLine2: shippingAddr.line2 || undefined,
                    city: shippingAddr.city || undefined,
                    state: shippingAddr.state || undefined,
                    postalCode: shippingAddr.postal_code || undefined,
                    country: shippingAddr.country || undefined,
                    email: email || undefined,
                  },
                }
              : {}),
            ...(billingAddress ? {billingAddress} : {}),
            ...(cart.length ? {cart} : {}),
          }
          ensureRequiredPaymentDetails(
            baseDoc,
            {brand: cardBrand, last4: cardLast4, receiptUrl},
            `payment_intent ${pi.id}`,
          )
          applyShippingMetrics(baseDoc, shippingMetrics)
          applyPackageDimensions(baseDoc, shippingMetrics, metaWeight)
          applyShippingDetailsToDoc(
            baseDoc,
            shippingDetails,
            currency ? currency.toUpperCase() : undefined,
          )
          baseDoc.stripeSummary = serializeStripeSummaryData(
            buildStripeSummary({
              paymentIntent: pi,
              eventType: webhookEvent.type,
              eventCreated: webhookEvent.created,
            }),
          )
          const fulfillmentResult = deriveFulfillmentFromMetadata(
            meta,
            shippingDetails,
            new Date().toISOString(),
            (existingOrder as any)?.fulfillment,
          )
          if (fulfillmentResult) {
            const mergedFulfillment = existingOrder?.fulfillment
              ? {...existingOrder.fulfillment, ...fulfillmentResult.fulfillment}
              : fulfillmentResult.fulfillment
            baseDoc.fulfillment = mergedFulfillment

            const workflowProvided = fulfillmentResult.workflow
            const hasExistingWorkflow =
              existingOrder?.fulfillmentWorkflow &&
              (existingOrder.fulfillmentWorkflow as any)?.currentStage
            if (workflowProvided && !hasExistingWorkflow) {
              baseDoc.fulfillmentWorkflow = workflowProvided
            }

            if (
              fulfillmentResult.topLevelFields?.trackingNumber &&
              !existingOrder?.trackingNumber
            ) {
              baseDoc.trackingNumber = fulfillmentResult.topLevelFields.trackingNumber
            }
            if (fulfillmentResult.topLevelFields?.trackingUrl && !existingOrder?.trackingUrl) {
              baseDoc.trackingUrl = fulfillmentResult.topLevelFields.trackingUrl
            }
            if (
              fulfillmentResult.topLevelFields?.shippingLabelUrl &&
              !existingOrder?.shippingLabelUrl
            ) {
              baseDoc.shippingLabelUrl = fulfillmentResult.topLevelFields.shippingLabelUrl
            }
          }
          const intentSlug = createOrderSlug(normalizedOrderNumber, pi.id)
          if (intentSlug) baseDoc.slug = {_type: 'slug', current: intentSlug}

          if (!baseDoc.customerRef) {
            try {
              const resolvedRef = await resolveCustomerReference(stripeCustomerIdValue, email)
              if (resolvedRef) baseDoc.customerRef = resolvedRef
            } catch (err) {
              console.warn('stripeWebhook: unable to resolve customer reference for PI', err)
            }
          }

          const orderId = existingId
          await sanity.patch(existingId).set(baseDoc).commit({autoGenerateArrayKeys: true})

          if (orderId) {
            await appendOrderEvent(orderId, {
              eventType: webhookEvent.type,
              status: paymentStatus,
              label: 'Payment intent succeeded',
              message: `Payment intent ${pi.id} succeeded`,
              amount: totalAmount,
              currency: currency ? currency.toUpperCase() : undefined,
              stripeEventId: webhookEvent.id,
              occurredAt: webhookEvent.created,
              metadata: meta,
            })
            await markAbandonedCheckoutRecovered(sanity, resolvedStripeSessionId, orderId)
            try {
              if (!existingOrder?.packingSlipUrl) {
                const packingSlipUrl = await generatePackingSlipAsset({
                  sanity,
                  orderId,
                  invoiceId: invoiceDocId || undefined,
                })
                if (packingSlipUrl) {
                  await sanity
                    .patch(orderId)
                    .set({packingSlipUrl})
                    .commit({autoGenerateArrayKeys: true})
                }
              }
            } catch (err) {
              console.warn('stripeWebhook: packing slip auto upload failed', err)
            }
          }

          if (orderId && paymentStatus === 'paid' && cart.length) {
            await autoReserveInventoryForOrder(orderId, cart, normalizedOrderNumber)
          }

          let customerDocIdForPatch =
            ((baseDoc as any)?.customerRef?._ref as string | undefined) || null

          if (orderId) {
            try {
              const updatedCustomerId = await updateCustomerProfileForOrder({
                sanity,
                orderId,
                customerId: customerDocIdForPatch,
                email: normalizedEmail || email || undefined,
                shippingAddress: (baseDoc as any)?.shippingAddress,
                billingAddress,
                stripeCustomerId: stripeCustomerIdValue,
                stripeSyncTimestamp: new Date().toISOString(),
                customerName,
                metadata: meta,
              })
              if (updatedCustomerId) customerDocIdForPatch = updatedCustomerId
            } catch (err) {
              console.warn('stripeWebhook: failed to refresh customer profile for PI', err)
            }
            await ensureCustomerStripeDetails({
              customerId: customerDocIdForPatch,
              stripeCustomerId: stripeCustomerIdValue,
              billingAddress,
            })
          }

          if (orderId) {
            try {
              if (customerDocIdForPatch) {
                await linkOrderToCustomer(webhookSanityClient, orderId, customerDocIdForPatch)
              }

              if (!invoiceDocId) {
                try {
                  const invoice = await strictCreateInvoice(
                    {
                      ...baseDoc,
                      _id: orderId,
                      orderNumber: normalizedOrderNumber,
                      cart,
                      amountSubtotal,
                      amountTax,
                      amountShipping,
                      amountDiscount,
                      totalAmount: Number.isFinite(totalAmount) ? totalAmount : amountSubtotal,
                    },
                    customerDocIdForPatch ? {_id: customerDocIdForPatch} : null,
                    {
                      cartProducts,
                      amountSubtotal: amountSubtotal ?? undefined,
                      amountDiscount: amountDiscount ?? undefined,
                      totalAmount: Number.isFinite(totalAmount) ? totalAmount : amountSubtotal,
                    },
                  )
                  invoiceDocId = invoice._id
                } catch (err) {
                  console.warn('stripeWebhook: failed to create invoice for payment intent order', err)
                }
              }

              if (invoiceDocId) {
                await linkOrderToInvoice(webhookSanityClient, orderId, invoiceDocId)
                if (customerDocIdForPatch) {
                  await linkInvoiceToCustomer(
                    webhookSanityClient,
                    invoiceDocId,
                    customerDocIdForPatch,
                  )
                }
              }
            } catch (err) {
              console.warn('stripeWebhook: failed to ensure order references after payment intent', err)
            }
          }

          if (shouldSendConfirmation && orderId) {
            try {
              await sendOrderConfirmationEmail({
                to: normalizedEmail,
                orderNumber,
                customerName,
                items: cart,
                totalAmount,
                shippingAmount:
                  typeof shippingDetails.amount === 'number' ? shippingDetails.amount : undefined,
                shippingAddress: shippingAddr,
              })
              await sanity
                .patch(orderId)
                .set({confirmationEmailSent: true})
                .commit({autoGenerateArrayKeys: true})
            } catch (err) {
              console.warn('stripeWebhook: PI order confirmation email failed', err)
            }
          }
        } catch (e) {
          console.warn('stripeWebhook: PI fallback order creation failed', e)
        }
        break
      }
      default: {
        const type = webhookEvent.type || ''
        if (type.startsWith('source.')) {
          await recordStripeWebhookResourceEvent(webhookEvent, 'source')
        } else if (type.startsWith('person.')) {
          await recordStripeWebhookResourceEvent(webhookEvent, 'person')
        } else if (type.startsWith('issuing_dispute.')) {
          await recordStripeWebhookResourceEvent(webhookEvent, 'issuing_dispute')
        }
        break
      }
    }
  } catch (err: any) {
    webhookStatus = 'error'
    webhookSummary = err?.message
      ? `Error processing ${webhookEvent.type}: ${err.message}`
      : `Error processing ${webhookEvent.type}`
    console.error('stripeWebhook handler error:', err)
  }

  try {
    await recordStripeWebhookEvent({
      event: webhookEvent!,
      status: webhookStatus,
      summary: webhookSummary,
    })
  } catch (err) {
    console.warn('stripeWebhook: failed to log webhook event', err)
  }

  const response =
    webhookStatus === 'error'
      ? {statusCode: 200, body: JSON.stringify({received: true, hint: 'internal error logged'})}
      : {statusCode: 200, body: JSON.stringify({received: true, status: webhookStatus})}

  return await finalize(response, webhookStatus === 'error' ? 'error' : 'success', {
    webhookStatus,
    summary: webhookSummary,
  })
  } catch (error) {
    return await finalize(
      {statusCode: 500, body: 'Internal error'},
      'error',
      undefined,
      error,
    )
  }
}

// Netlify picks up the named export automatically; avoid duplicate exports.
export default handler
