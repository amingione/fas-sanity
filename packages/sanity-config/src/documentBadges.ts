import type {DocumentBadgeComponent, DocumentBadgeDescription, DocumentBadgesResolver} from 'sanity'
import {getMerchantFeedIssues, isServiceProduct} from './utils/merchantCenter'

type BadgeColor = NonNullable<DocumentBadgeDescription['color']>

/* -------------------------
  Shared Utilities
------------------------- */

const toTitleCase = (value: string) =>
  value
    .split(/\s+|_|-/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')

/* -------------------------
  PRODUCT BADGES (unchanged)
------------------------- */

const productStatusTone = (status: string): BadgeColor => {
  switch (status) {
    case 'active':
      return 'success'
    case 'draft':
    case 'paused':
      return 'warning'
    case 'archived':
      return 'danger'
    default:
      return 'primary'
  }
}

const productStatusBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'product') return null
  const source = props.draft || props.published || null
  const status = typeof source?.status === 'string' ? source.status.trim().toLowerCase() : ''
  if (!status) return null
  const label = toTitleCase(status)
  return {
    label,
    title: `Product status: ${label}`,
    color: productStatusTone(status),
  }
}

const productFeaturedBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'product') return null
  const source = props.draft || props.published || null
  if (!source?.featured) return null
  return {
    label: 'Featured',
    title: 'Featured product – highlighted in storefront merchandising',
    color: 'primary',
  }
}

const productSaleBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'product') return null
  const source = props.draft || props.published || null
  if (!source?.onSale) return null
  return {
    label: 'On Sale',
    title: 'Sale pricing is enabled for this product',
    color: 'warning',
  }
}

const productStripeBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'product') return null
  const source = props.draft || props.published || null
  const stripeActive = source?.stripeActive
  const hasStripeReference = Boolean(
    source?.stripeProductId || source?.stripeDefaultPriceId || source?.stripePriceId,
  )

  if (!hasStripeReference && stripeActive !== true) {
    return {
      label: 'Stripe Missing',
      title: 'No Stripe product linked yet',
      color: 'danger',
    }
  }

  if (stripeActive === true) {
    return {
      label: 'Stripe Synced',
      title: 'Stripe product is active and in sync',
      color: 'success',
    }
  }

  if (hasStripeReference) {
    return {
      label: 'Stripe Inactive',
      title: 'Stripe product exists but is currently inactive',
      color: 'warning',
    }
  }

  return null
}

const merchantCenterBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'product') return null
  const source = (props.draft || props.published || null) as any
  if (!source || isServiceProduct(source)) return null
  const missing = getMerchantFeedIssues(source)
  if (!missing.length) {
    return {
      label: 'Google Ready',
      title: 'Ready for Google Shopping feed',
      color: 'success',
    }
  }
  return {
    label: `Needs Fix (${missing.length})`,
    title: `Missing: ${missing.join(', ')}`,
    color: 'warning',
  }
}

const productWholesaleBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'product') return null
  const source = (props.draft || props.published || null) as any
  if (!source || source.productType === 'service') return null
  const enabled = source.availableForWholesale !== false
  const hasPricing = [
    'wholesalePriceStandard',
    'wholesalePricePreferred',
    'wholesalePricePlatinum',
  ].some((field) => typeof source?.[field] === 'number' && Number.isFinite(source[field]))
  if (!enabled) {
    return {
      label: 'Wholesale Off',
      title: 'Wholesale visibility disabled for this product',
      color: 'primary',
    }
  }
  if (hasPricing) {
    return {
      label: 'Wholesale Ready',
      title: 'Wholesale pricing configured',
      color: 'success',
    }
  }
  return {
    label: 'Wholesale Missing',
    title: 'Enable wholesale pricing for this product',
    color: 'warning',
  }
}

const productBadges: DocumentBadgeComponent[] = [
  productStatusBadge,
  productFeaturedBadge,
  productSaleBadge,
  productStripeBadge,
  merchantCenterBadge,
  productWholesaleBadge,
]

/* -------------------------
  SHIPMENT BADGES
------------------------- */

const shipmentStatusTone = (status: string): BadgeColor => {
  switch (status) {
    case 'delivered':
      return 'success'
    case 'in_transit':
    case 'out_for_delivery':
      return 'primary'
    case 'pre_transit':
      return 'warning'
    case 'cancelled':
    case 'canceled':
    case 'return_to_sender':
    case 'exception':
      return 'danger'
    default:
      return 'primary'
  }
}

const shipmentStatusBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null
  const source = props.draft || props.published || null
  const raw = source?.status
  if (!raw || typeof raw !== 'string') return null

  const status = raw.trim().toLowerCase()
  const label = toTitleCase(status.replace(/_/g, ' '))
  return {
    label,
    title: `Shipment status: ${label}`,
    color: shipmentStatusTone(status),
  }
}

/* ----- Carrier Badge ----- */

const carrierTone = (carrier: string): BadgeColor => {
  switch (carrier.toLowerCase()) {
    case 'ups':
      return 'primary'
    case 'fedex':
      return 'warning'
    case 'usps':
      return 'success'
    case 'dhl':
      return 'danger'
    case 'amazon':
      return 'primary'
    default:
      return 'primary'
  }
}

const shipmentCarrierBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null
  const source = props.draft || props.published || null
  const raw = source?.carrier
  if (!raw || typeof raw !== 'string') return null

  const label = toTitleCase(raw)
  return {
    label,
    title: `Carrier: ${label}`,
    color: carrierTone(raw),
  }
}

/* ----- Service Badge ----- */

const serviceTone = (service: string): BadgeColor => {
  const s = service.toLowerCase()
  if (s.includes('overnight')) return 'danger'
  if (s.includes('express')) return 'danger'
  if (s.includes('same day')) return 'danger'
  if (s.includes('2-day') || s.includes('2 day')) return 'warning'
  if (s.includes('economy')) return 'warning'
  if (s.includes('priority')) return 'success'
  if (s.includes('ground')) return 'primary'
  return 'primary'
}

const shipmentServiceBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null
  const source = props.draft || props.published || null
  const raw = source?.service
  if (!raw || typeof raw !== 'string') return null

  const label = toTitleCase(raw.replace(/_/g, ' '))
  return {
    label,
    title: `Service: ${label}`,
    color: serviceTone(raw),
  }
}

/* ----- Cost Badge ----- */

const costTone = (cost: number): BadgeColor => {
  if (cost <= 8) return 'success'
  if (cost <= 18) return 'primary'
  if (cost <= 40) return 'warning'
  return 'danger'
}

const shipmentCostBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null
  const source = props.draft || props.published || null
  const raw = source?.rate
  if (typeof raw !== 'number') return null

  return {
    label: `$${raw.toFixed(2)}`,
    title: `Label Cost: $${raw.toFixed(2)}`,
    color: costTone(raw),
  }
}

/* ----- Transit Badge ----- */

const transitTone = (days: number): BadgeColor => {
  if (days <= 1) return 'success'
  if (days <= 3) return 'primary'
  if (days <= 6) return 'warning'
  return 'danger'
}

const shipmentTransitBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null
  const source = props.draft || props.published || null
  const raw = source?.transitDays
  if (typeof raw !== 'number') return null

  return {
    label: `${raw}d`,
    title: `Transit Time: ${raw} days`,
    color: transitTone(raw),
  }
}

/* ----- Delay / Exception Badge ----- */

const shipmentDelayBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null

  const source = props.draft || props.published || null
  const status = typeof source?.status === 'string' ? source.status.toLowerCase() : ''
  const days = source?.transitDays

  if (status === 'exception') {
    return {
      label: 'Exception',
      title: 'Carrier reported an exception event',
      color: 'danger',
    }
  }

  if (typeof days === 'number' && days >= 7) {
    return {
      label: 'Delayed',
      title: `Transit unusually long (${days} days)`,
      color: 'danger',
    }
  }

  if (status === 'cancelled' || status === 'canceled') {
    return {
      label: 'Canceled',
      title: 'Shipment was canceled',
      color: 'danger',
    }
  }

  return null
}

/* ----- Refund Badge ----- */

const refundTone = (state: string): BadgeColor => {
  switch (state) {
    case 'requested':
      return 'warning'
    case 'approved':
    case 'refunded':
      return 'success'
    case 'failed':
      return 'danger'
    default:
      return 'primary'
  }
}

const shipmentRefundBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null
  const source = props.draft || props.published || null
  const raw = source?.refundStatus
  if (!raw || typeof raw !== 'string') return null

  const s = raw.toLowerCase()
  return {
    label: `Refund ${toTitleCase(s)}`,
    title: `Refund status: ${toTitleCase(s)}`,
    color: refundTone(s),
  }
}

/* ----- Insured Badge ----- */

const shipmentInsuredBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null
  const source = props.draft || props.published || null
  const amt = source?.insuredAmount
  if (typeof amt !== 'number' || amt <= 0) return null

  return {
    label: `Insured $${amt}`,
    title: `Shipment insured for $${amt}`,
    color: amt > 500 ? 'warning' : 'success',
  }
}

/* ----- Heavy Badge ----- */

const shipmentHeavyBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null

  const source = props.draft || props.published || null
  const w = source?.weightLbs
  if (typeof w !== 'number' || w <= 50) return null

  return {
    label: `${w} lb`,
    title: `Heavy shipment (${w} lb)`,
    color: w >= 150 ? 'danger' : 'warning',
  }
}

/* ----- International Badge ----- */

const shipmentInternationalBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'shipment') return null

  const source = props.draft || props.published || null
  const to = typeof source?.toCountry === 'string' ? source.toCountry.toUpperCase() : undefined
  const from =
    typeof source?.fromCountry === 'string' ? source.fromCountry.toUpperCase() : undefined

  if (!to) return null

  const intl = (from && to && from !== to) || to !== 'US'
  if (!intl) return null

  return {
    label: to,
    title: `International shipment to ${to}`,
    color: 'primary',
  }
}

/* -------------------------
  PICKUP BADGES
------------------------- */

const pickupStatusTone = (status: string): BadgeColor => {
  switch (status) {
    case 'completed':
      return 'success'
    case 'in_progress':
      return 'primary'
    case 'scheduled':
      return 'warning'
    case 'canceled':
    case 'cancelled':
      return 'danger'
    default:
      return 'primary'
  }
}

const pickupStatusBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'pickup') return null

  const source = props.draft || props.published || null
  const raw = source?.status
  if (!raw || typeof raw !== 'string') return null

  const s = raw.trim().toLowerCase()
  const label = toTitleCase(s.replace(/_/g, ' '))

  return {
    label,
    title: `Pickup status: ${label}`,
    color: pickupStatusTone(s),
  }
}

const pickupTimeBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'pickup') return null

  const source = props.draft || props.published || null
  const raw = source?.pickupWindowStart
  const start =
    typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date ? new Date(raw) : null
  if (!start) return null

  const now = new Date()

  if (start > now) {
    return {
      label: 'Upcoming',
      title: 'Future scheduled pickup',
      color: 'success',
    }
  }

  return {
    label: 'History',
    title: 'Past pickup',
    color: 'primary',
  }
}

/* -------------------------
  BADGE ARRAYS
------------------------- */

const shipmentBadges: DocumentBadgeComponent[] = [
  shipmentStatusBadge,
  shipmentCarrierBadge,
  shipmentServiceBadge,
  shipmentCostBadge,
  shipmentTransitBadge,
  shipmentDelayBadge,
  shipmentRefundBadge,
  shipmentInsuredBadge,
  shipmentHeavyBadge,
  shipmentInternationalBadge,
]

const pickupBadges: DocumentBadgeComponent[] = [pickupStatusBadge, pickupTimeBadge]

/* -------------------------
  BADGE ORDERING SYSTEM
------------------------- */

const BADGE_ORDER: Record<string, number> = {
  Delivered: 1,
  'In Transit': 2,
  'Out For Delivery': 3,
  'Pre Transit': 4,
  Exception: 5,
  Delayed: 6,
  Canceled: 7,

  Completed: 10,
  'In Progress': 11,
  Scheduled: 12,
  Upcoming: 13,
  History: 14,

  UPS: 20,
  Fedex: 21,
  USPS: 22,
  DHL: 23,
  Amazon: 24,

  Ground: 30,
  Priority: 31,
  Overnight: 32,
  Express: 33,
  Economy: 34,

  $: 40,

  '1d': 50,
  '2d': 51,
  '3d': 52,
  '4d': 53,
  '5d': 54,
  '6d': 55,
  '7d': 56,

  'Refund Requested': 60,
  'Refund Approved': 61,
  'Refund Refunded': 62,
  'Refund Failed': 63,

  Insured: 70,
  lb: 80,

  Country: 90,

  'Google Ready': 100,
  Featured: 101,
  'On Sale': 102,
  'Wholesale Ready': 103,
  'Wholesale Missing': 104,
  'Stripe Synced': 105,
  'Stripe Missing': 106,
}

const getBadgeRank = (label: string): number => {
  if (BADGE_ORDER[label]) return BADGE_ORDER[label]

  if (label.startsWith('$')) return BADGE_ORDER['$']
  if (label.endsWith('lb')) return BADGE_ORDER['lb']
  if (label.startsWith('Insured')) return BADGE_ORDER['Insured']
  if (/^[A-Z]{2,3}$/.test(label)) return BADGE_ORDER['Country']
  if (/^\d+d$/.test(label)) return BADGE_ORDER['1d']

  return 999
}

/* -------------------------
  FINAL RESOLVER
------------------------- */

export const resolveDocumentBadges: DocumentBadgesResolver = (prevBadges, context) => {
  // Compose badge components; leave sorting to the components themselves when rendered
  const badgeComponents: DocumentBadgeComponent[] = [
    ...prevBadges,
    ...(context.schemaType === 'product' ? productBadges : []),
    ...(context.schemaType === 'shipment' ? shipmentBadges : []),
    ...(context.schemaType === 'pickup' ? pickupBadges : []),
  ]

  return badgeComponents
}

export default resolveDocumentBadges
