import {createClient, type SanityClient} from '@sanity/client'
import type {VendorPricingTier} from '../../shared/vendorPricing'
import {resolveVendorUnitPrice} from '../../shared/vendorPricing'

type PortalVendor = {
  _id: string
  companyName?: string | null
  customerRef?: {_ref?: string} | null
  pricingTier?: VendorPricingTier | null
  customDiscountPercentage?: number | null
  paymentTerms?: string | null
  portalAccess?: {enabled?: boolean | null; email?: string | null} | null
  primaryContact?: {email?: string | null} | null
  status?: string | null
  creditLimit?: number | null
  currentBalance?: number | null
}

export type WholesaleProduct = {
  _id: string
  title?: string
  slug?: {current?: string}
  sku?: string
  price?: number
  wholesalePriceStandard?: number | null
  wholesalePricePreferred?: number | null
  wholesalePricePlatinum?: number | null
  pricingTiers?: Array<{label?: string | null; price?: number | null}>
  availableForWholesale?: boolean | null
  manufacturingCost?: number | null
  images?: any[]
  description?: any
  shortDescription?: any
  specifications?: any
  category?: Array<{title?: string; slug?: {current?: string}}>
  mainImage?: any
  inStock?: boolean
  availability?: string
}

export type WholesaleCartItemInput = {
  productId: string
  quantity?: number
}

export type PricedWholesaleCartItem = {
  productId: string
  name?: string
  sku?: string
  quantity: number
  unitPrice: number
  lineTotal: number
  standardPrice?: number | null
  preferredPrice?: number | null
  effectiveTier: VendorPricingTier
  inStock: boolean
}

export type WholesaleTotals = {
  subtotal: number
  tax: number
  shipping: number
  total: number
}

const API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'
const ORDER_NUMBER_PREFIX = 'FAS'

const sanity =
  process.env.SANITY_STUDIO_PROJECT_ID && process.env.SANITY_STUDIO_DATASET
    ? createClient({
        projectId:
          process.env.SANITY_STUDIO_PROJECT_ID ||
          '',
        dataset:
          process.env.SANITY_STUDIO_DATASET ||
          '',
        apiVersion: API_VERSION,
        token:
          process.env.SANITY_API_TOKEN ||
          '',
        useCdn: false,
      })
    : null

const roundCurrency = (value: number): number => Math.round(value * 100) / 100

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toBoolean = (value: unknown): boolean => value === true

export const WHOLESALE_PRODUCTS_QUERY = `
*[_type == "product" && availableForWholesale == true && status == "active"] | order(title asc) {
  _id,
  title,
  slug,
  sku,
  price,
  wholesalePriceStandard,
  wholesalePricePreferred,
  manufacturingCost,
  "mainImage": images[0],
  shortDescription,
  category[]->{title, slug},
  availability,
  "inStock": availability == "in_stock"
}
`

export const WHOLESALE_PRODUCTS_BY_CATEGORY_QUERY = `
*[_type == "product" 
  && availableForWholesale == true 
  && status == "active"
  && $categoryId in category[]._ref
] | order(title asc) {
  _id,
  title,
  slug,
  sku,
  price,
  wholesalePriceStandard,
  wholesalePricePreferred,
  "mainImage": images[0],
  shortDescription,
  availability,
  "inStock": availability == "in_stock"
}
`

export const WHOLESALE_PRODUCT_BY_SLUG_QUERY = `
*[_type == "product" && slug.current == $slug][0]{
  _id,
  title,
  slug,
  sku,
  price,
  wholesalePriceStandard,
  wholesalePricePreferred,
  wholesalePricePlatinum,
  pricingTiers,
  availableForWholesale,
  manufacturingCost,
  images,
  description,
  shortDescription,
  specifications,
  category[]->{title, slug},
  availability,
  "inStock": availability == "in_stock",
  "margin": {
    "standard": price - wholesalePriceStandard,
    "preferred": price - wholesalePricePreferred
  }
}
`

const WHOLESALE_PRODUCTS_BY_ID_QUERY = `
*[_type == "product" && _id in $ids && availableForWholesale == true && status == "active"]{
  _id,
  title,
  sku,
  price,
  wholesalePriceStandard,
  wholesalePricePreferred,
  wholesalePricePlatinum,
  pricingTiers,
  availability
}
`

export const WHOLESALE_ORDER_HISTORY_QUERY = `
*[_type == "order" 
  && orderType == "wholesale" 
  && customerRef._ref == $vendorId
] | order(dateTime(coalesce(createdAt, _createdAt)) desc) {
  _id,
  orderNumber,
  status,
  createdAt,
  totalAmount,
  cart[]{
    name,
    sku,
    quantity,
    price,
    total
  }
}
`

function decodeAuthHeader(authHeader?: string | null): {email?: string; sub?: string} | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\\s+(.+)$/i)
  if (!match) return null
  const token = match[1]
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payloadJson = Buffer.from(parts[1], 'base64').toString()
    const payload = JSON.parse(payloadJson)
    return {sub: payload?.sub, email: payload?.email}
  } catch {
    return null
  }
}

export const ensureSanityClient = (): SanityClient => {
  if (sanity) return sanity
  throw new Error('Sanity client is not configured')
}

export const resolveVendor = async (options: {
  vendorId?: string | null
  vendorEmail?: string | null
  authorization?: string | null
}): Promise<PortalVendor | null> => {
  const client = ensureSanityClient()
  const auth = decodeAuthHeader(options.authorization || undefined)
  const normalizedEmail =
    (options.vendorEmail || auth?.email || '')
      .toString()
      .trim()
      .toLowerCase() || null
  const vendorId = (options.vendorId || auth?.sub || '').replace(/^drafts\\./, '')

  const emailPattern = normalizedEmail ? `(?i)^${escapeRegExp(normalizedEmail)}$` : null

  const vendor = await client.fetch<PortalVendor | null>(
    `*[_type == "vendor" && (
      (_id == $vendorId && $vendorId != "") ||
      ($emailPattern != null && (
        portalAccess.email match $emailPattern ||
        primaryContact.email match $emailPattern ||
        email match $emailPattern ||
        count(portalUsers[ email match $emailPattern ]) > 0
      ))
    )][0]{
      _id,
      companyName,
      customerRef,
      pricingTier,
      customDiscountPercentage,
      paymentTerms,
      portalAccess,
      primaryContact,
      status,
      creditLimit,
      currentBalance
    }`,
    {vendorId, emailPattern},
  )

  if (!vendor) return null
  if (!toBoolean(vendor.portalAccess?.enabled)) return null
  return vendor
}

export const resolveEffectiveTier = (
  vendor: PortalVendor | null,
  explicitTier?: VendorPricingTier | null,
): {tier: VendorPricingTier; customDiscount?: number | null} => {
  const baseTier = (explicitTier || vendor?.pricingTier || 'standard') as VendorPricingTier
  const customDiscount =
    baseTier === 'custom' ? vendor?.customDiscountPercentage ?? null : vendor?.customDiscountPercentage
  return {tier: baseTier, customDiscount}
}

export const mapWholesaleProductPricing = (
  product: WholesaleProduct,
  tier: VendorPricingTier,
  customDiscount?: number | null,
) => {
  const effectivePrice = resolveVendorUnitPrice(product, tier, customDiscount)
  return {
    ...product,
    wholesalePricing: {
      standard: typeof product.wholesalePriceStandard === 'number' ? product.wholesalePriceStandard : null,
      preferred:
        typeof product.wholesalePricePreferred === 'number' ? product.wholesalePricePreferred : null,
      effectiveTier: tier,
      effectivePrice,
    },
  }
}

const normalizeQuantity = (value?: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.floor(value))
  return 1
}

export const priceWholesaleCart = async (
  items: WholesaleCartItemInput[],
  options: {tier: VendorPricingTier; customDiscount?: number | null},
): Promise<PricedWholesaleCartItem[]> => {
  if (!items || !items.length) return []
  const ids = Array.from(
    new Set(
      items
        .map((item) => item.productId)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    ),
  )
  if (!ids.length) throw new Error('Cart is missing productIds')

  const client = ensureSanityClient()
  const products = await client.fetch<WholesaleProduct[]>(WHOLESALE_PRODUCTS_BY_ID_QUERY, {ids})
  const productMap = new Map(products.map((p) => [p._id, p]))

  const pricedItems: PricedWholesaleCartItem[] = items.map((item) => {
    const product = productMap.get(item.productId)
    if (!product) {
      throw new Error(`Product ${item.productId} is not available for wholesale`)
    }
    const quantity = normalizeQuantity(item.quantity)
    const unitPrice = resolveVendorUnitPrice(product, options.tier, options.customDiscount)
    const lineTotal = roundCurrency(unitPrice * quantity)
    return {
      productId: product._id,
      name: product.title,
      sku: product.sku,
      quantity,
      unitPrice,
      lineTotal,
      standardPrice:
        typeof product.wholesalePriceStandard === 'number' ? product.wholesalePriceStandard : null,
      preferredPrice:
        typeof product.wholesalePricePreferred === 'number' ? product.wholesalePricePreferred : null,
      effectiveTier: options.tier,
      inStock: product.availability === 'in_stock',
    }
  })

  return pricedItems
}

export const calculateTotals = (cart: PricedWholesaleCartItem[], opts?: {shipping?: number; taxRate?: number}): WholesaleTotals => {
  const subtotal = roundCurrency(
    cart.reduce((sum, item) => sum + (Number.isFinite(item.lineTotal) ? item.lineTotal : 0), 0),
  )
  const shipping =
    typeof opts?.shipping === 'number' && Number.isFinite(opts.shipping) && opts.shipping > 0
      ? roundCurrency(opts.shipping)
      : 0
  const safeTaxRate =
    typeof opts?.taxRate === 'number' && Number.isFinite(opts.taxRate) && opts.taxRate > 0
      ? opts.taxRate
      : 0
  const tax = roundCurrency(subtotal * safeTaxRate)
  const total = roundCurrency(subtotal + tax + shipping)
  return {subtotal, tax, shipping, total}
}

export const generateWholesaleOrderNumber = async (client: SanityClient): Promise<string> => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `${ORDER_NUMBER_PREFIX}-${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0')}`
    try {
      const existing = await client.fetch<number>(
        'count(*[_type == "order" && orderNumber == $num]) + count(*[_type == "invoice" && (orderNumber == $num || invoiceNumber == $num)])',
        {num: candidate},
      )
      if (!Number(existing)) return candidate
    } catch {
      return candidate
    }
  }
  return `${ORDER_NUMBER_PREFIX}-${String(Math.floor(Date.now() % 1_000_000)).padStart(6, '0')}`
}
