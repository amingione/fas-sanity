import type {PortableTextBlock} from '@portabletext/types'
import type {SanityClient} from '@sanity/client'
import blocksToText from './blocksToText'
import {getMerchantCoreWarnings, getMerchantFeedIssues, type MerchantCenterProduct} from './merchantCenter'

const CANONICAL_BASE = 'https://www.fasmotorsports.com/products'

const truncate = (value: string, maxLength: number) => {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1)}…`
}

const portableToString = (value?: PortableTextBlock[] | string | null) => {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return blocksToText(value) || ''
}

const deriveFocusKeyword = (title?: string | null) => {
  if (!title) return ''
  const words = title
    .replace(/[^a-z0-9\s-]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words.slice(0, 4).join(' ')
}

const buildAnalyticsDefaults = () => ({
  views: {
    total: 0,
    last7Days: 0,
    last30Days: 0,
    last90Days: 0,
    uniqueVisitors: 0,
  },
  sales: {
    totalOrders: 0,
    totalQuantitySold: 0,
    totalRevenue: 0,
    averageOrderValue: undefined,
    last7DaysSales: 0,
    last30DaysSales: 0,
    last90DaysSales: 0,
    bestSellingRank: undefined,
    firstSaleDate: undefined,
    lastSaleDate: undefined,
  },
  conversion: {
    addToCartCount: 0,
    addToCartRate: undefined,
    purchaseConversionRate: undefined,
    cartAbandonmentRate: undefined,
    wishlistCount: 0,
  },
  engagement: {
    averageTimeOnPage: undefined,
    bounceRate: undefined,
    shareCount: 0,
    emailClicks: 0,
  },
  ads: {
    impressions: undefined,
    clicks: undefined,
    conversions: undefined,
    adSpend: undefined,
    revenue: undefined,
    roas: undefined,
    ctr: undefined,
    lastUpdated: undefined,
  },
  returns: {
    returnCount: 0,
    returnRate: undefined,
    refundAmount: 0,
    topReturnReasons: undefined,
  },
  profitability: {
    grossProfit: undefined,
    grossMargin: undefined,
    averageProfitPerUnit: undefined,
  },
  trends: {
    velocityScore: undefined,
    trendDirection: undefined,
    seasonalityScore: undefined,
    peakSalesMonth: undefined,
  },
  lastUpdated: new Date().toISOString(),
})

const buildMerchantStatus = (product: MerchantCenterProduct) => {
  const issues = getMerchantFeedIssues(product)
  const warnings = getMerchantCoreWarnings(product)

  const mappedIssues = [
    ...issues.map((issue) => ({
      code: issue.toLowerCase().replace(/\s+/g, '_'),
      description: `${issue} is required for Google Shopping`,
      severity: 'error',
    })),
    ...warnings
      .filter((warning) => !issues.includes(warning))
      .map((warning) => ({
        code: warning.toLowerCase().replace(/\s+/g, '_'),
        description: `${warning} recommended for best performance`,
        severity: 'warning',
      })),
  ]

  return {
    isApproved: issues.length === 0,
    needsGtin: !product.gtin,
    needsMpn: !product.mpn,
    needsCategory: !product.googleProductCategory,
    issues: mappedIssues,
    lastSynced: new Date().toISOString(),
  }
}

const buildCanonicalUrl = (slug?: string | null) => {
  if (!slug) return ''
  const normalized = slug.replace(/^\/+|\/+$/g, '')
  if (!normalized) return ''
  return `${CANONICAL_BASE}/${normalized}`
}

type ProductForMeta = {
  _id: string
  _rev?: string
  title?: string
  slug?: {current?: string}
  shortDescription?: PortableTextBlock[] | string
  description?: PortableTextBlock[] | string
  images?: Array<{asset?: {\_ref?: string}; alt?: unknown}>
  metaTitle?: string
  metaDescription?: string
  focusKeyword?: string
  canonicalUrl?: string
  socialImage?: {asset?: {\_ref?: string}}
  analytics?: Record<string, unknown>
  merchantCenterStatus?: Record<string, unknown>
  gtin?: string
  mpn?: string
  googleProductCategory?: string
  productType?: string
  availability?: string
}

export const ensureProductMetaAndStatus = async (
  productId: string,
  client: SanityClient,
  options?: {log?: (...args: unknown[]) => void},
) => {
  const log = options?.log || ((...args: unknown[]) => console.log('[product-meta]', ...args))

  const product = await client.fetch<ProductForMeta>(
    `*[_id == $productId][0]{
      _id,
      _rev,
      title,
      slug,
      shortDescription,
      description,
      images,
      metaTitle,
      metaDescription,
      focusKeyword,
      canonicalUrl,
      socialImage,
      analytics,
      merchantCenterStatus,
      gtin,
      mpn,
      googleProductCategory,
      productType,
      availability
    }`,
    {productId},
  )

  if (!product?._id) {
    log('No product found; skipping meta generation')
    return null
  }

  const updates: Record<string, unknown> = {}

  if (!product.metaTitle && product.title) {
    updates.metaTitle = truncate(product.title, 60)
  }

  if (!product.metaDescription) {
    const description =
      portableToString(product.shortDescription) || portableToString(product.description)
    if (description) {
      updates.metaDescription = truncate(description, 160)
    }
  }

  if (!product.focusKeyword) {
    const keyword = deriveFocusKeyword(product.title)
    if (keyword) updates.focusKeyword = keyword
  }

  if (!product.canonicalUrl) {
    const canonical = buildCanonicalUrl(product.slug?.current)
    if (canonical) updates.canonicalUrl = canonical
  }

  if (!product.socialImage && Array.isArray(product.images) && product.images[0]?.asset) {
    updates.socialImage = product.images[0]
  }

  if (!product.analytics) {
    updates.analytics = buildAnalyticsDefaults()
  }

  const merchantStatus = buildMerchantStatus({
    _id: product._id,
    title: product.title,
    slug: product.slug?.current,
    description: product.description as PortableTextBlock[] | undefined,
    shortDescription: product.shortDescription as PortableTextBlock[] | undefined,
    price: undefined,
    salePrice: undefined,
    availability: product.availability,
    googleProductCategory: product.googleProductCategory,
    mpn: product.mpn,
    gtin: product.gtin,
    productType: product.productType,
    imageUrl: undefined,
    canonicalUrl: product.canonicalUrl,
  })
  updates.merchantCenterStatus = merchantStatus

  if (Object.keys(updates).length === 0) {
    log(`No meta updates required for ${product._id}`)
    return null
  }

  const patch = client.patch(product._id).set(updates)
  if (product._rev) {
    patch.ifRevisionId(product._rev)
  }

  await patch.commit({autoGenerateArrayKeys: true})
  log(`Updated meta fields for ${product._id}`)
  return updates
}
