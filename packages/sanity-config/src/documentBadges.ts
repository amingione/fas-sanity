import type {DocumentBadgeComponent, DocumentBadgeDescription, DocumentBadgesResolver} from 'sanity'

type BadgeColor = NonNullable<DocumentBadgeDescription['color']>
type ContentLifecycleStatus = 'draft' | 'review' | 'published'

const normalizeContentStatus = (value: unknown): ContentLifecycleStatus | null => {
  if (typeof value !== 'string') return null
  const normalized = value.toLowerCase().trim()
  if (normalized === 'draft' || normalized === 'review' || normalized === 'published') {
    return normalized
  }

  const legacyMap: Record<string, ContentLifecycleStatus> = {
    active: 'published',
    archived: 'draft',
    inactive: 'draft',
    live: 'published',
    preview: 'review',
  }

  return legacyMap[normalized] || null
}

const getPathValue = (source: unknown, path: string): unknown => {
  if (!source || typeof source !== 'object') return undefined
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, source)
}

const hasContentValue = (value: unknown) => {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined
}

type ContentCompletenessRule = {
  label: string
  requiredPaths: string[]
}

const CONTENT_COMPLETENESS_RULES: Record<string, ContentCompletenessRule> = {
  home: {label: 'Home', requiredPaths: ['hero', 'modules', 'seo.title']},
  settings: {label: 'Settings', requiredPaths: ['menu', 'footer', 'seo.title']},
  page: {label: 'Page', requiredPaths: ['title', 'slug.current', 'body']},
  post: {label: 'Blog Post', requiredPaths: ['title', 'slug.current', 'content']},
  product: {
    label: 'Product',
    requiredPaths: ['title', 'slug.current', 'shortDescription', 'images', 'medusaProductId'],
  },
  collection: {label: 'Collection', requiredPaths: ['title', 'slug.current']},
  downloadResource: {label: 'Download', requiredPaths: ['title', 'documentType', 'description']},
}

const contentCompletenessBadge: DocumentBadgeComponent = (props) => {
  const rule = CONTENT_COMPLETENESS_RULES[props.type]
  if (!rule) return null

  const source = props.draft || props.published || null
  if (!source) return null

  const completed = rule.requiredPaths.filter((path) => hasContentValue(getPathValue(source, path)))
  const missing = rule.requiredPaths.filter((path) => !hasContentValue(getPathValue(source, path)))

  if (!missing.length) {
    return {label: 'Content Ready', title: `${rule.label} content is complete`, color: 'success'}
  }

  const color: BadgeColor = completed.length >= 2 ? 'warning' : 'danger'
  return {
    label: `Content ${completed.length}/${rule.requiredPaths.length}`,
    title: `Missing: ${missing.join(', ')}`,
    color,
  }
}

const contentStatusBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'product' && props.type !== 'productVariant') return null
  const source = props.draft || props.published || null
  const status = normalizeContentStatus(source?.contentStatus) || normalizeContentStatus(source?.status)
  if (!status) return null

  const toneMap: Record<string, BadgeColor> = {
    draft: 'warning',
    review: 'primary',
    published: 'success',
  }

  return {
    label: `Status: ${status}`,
    title: `Content status is ${status}`,
    color: toneMap[status] || 'primary',
  }
}

const featuredBadge: DocumentBadgeComponent = (props) => {
  if (props.type !== 'product') return null
  const source = props.draft || props.published || null
  if (!source?.featured) return null
  return {
    label: 'Featured',
    title: 'Featured merchandising flag enabled',
    color: 'primary',
  }
}

const productBadges: DocumentBadgeComponent[] = [contentStatusBadge, featuredBadge]

const resolveDocumentBadges: DocumentBadgesResolver = (prev, context) => {
  const badges = [...prev, contentCompletenessBadge]

  if (context.schemaType === 'product' || context.schemaType === 'productVariant') {
    badges.push(...productBadges)
  }

  return badges
}

export default resolveDocumentBadges
