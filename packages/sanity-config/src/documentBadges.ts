import type {DocumentBadgeComponent, DocumentBadgeDescription, DocumentBadgesResolver} from 'sanity'

type BadgeColor = NonNullable<DocumentBadgeDescription['color']>

const toTitleCase = (value: string) =>
  value
    .split(/\s+|_|-/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')

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

const productBadges: DocumentBadgeComponent[] = [
  productStatusBadge,
  productFeaturedBadge,
  productSaleBadge,
  productStripeBadge,
]

export const resolveDocumentBadges: DocumentBadgesResolver = (prevBadges, context) => {
  if (context.schemaType === 'product') {
    return [...prevBadges, ...productBadges]
  }
  return prevBadges
}

export default resolveDocumentBadges
