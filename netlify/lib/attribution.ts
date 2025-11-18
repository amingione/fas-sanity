export type AttributionParams = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  landingPage?: string
  referrer?: string
  capturedAt?: string
}

const normalize = (value?: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  return text || undefined
}

const FIELD_MAP: Record<keyof AttributionParams, string[]> = {
  source: ['utm_source', 'utmSource', 'source'],
  medium: ['utm_medium', 'utmMedium', 'medium'],
  campaign: ['utm_campaign', 'utmCampaign', 'campaign'],
  content: ['utm_content', 'utmContent', 'content'],
  term: ['utm_term', 'utmTerm', 'term', 'keyword'],
  landingPage: ['landing_page', 'landingPage', 'utm_landing_page'],
  referrer: ['utm_referrer', 'referrer'],
  capturedAt: ['utm_captured_at', 'capturedAt'],
}

const extractFromObject = (input: Record<string, any> | null | undefined): AttributionParams => {
  if (!input || typeof input !== 'object') return {}
  const params: AttributionParams = {}
  for (const [key, aliases] of Object.entries(FIELD_MAP) as [keyof AttributionParams, string[]][]) {
    for (const alias of aliases) {
      if (params[key]) break
      const value = normalize((input as Record<string, any>)[alias])
      if (value) params[key] = value
    }
  }
  return params
}

export const mergeAttributionParams = (...sets: AttributionParams[]): AttributionParams => {
  const merged: AttributionParams = {}
  for (const set of sets) {
    if (!set) continue
    for (const [key, value] of Object.entries(set) as [keyof AttributionParams, string | undefined][]) {
      if (!value) continue
      if (!merged[key]) merged[key] = value
    }
  }
  return merged
}

export const extractAttributionFromPayload = (
  payload?: Record<string, any> | null,
): AttributionParams => {
  if (!payload) return {}
  const directFields = extractFromObject(payload)
  const nested =
    typeof payload.utm === 'object' && payload.utm
      ? extractFromObject(payload.utm as Record<string, any>)
      : {}
  return mergeAttributionParams(directFields, nested)
}

export const extractAttributionFromQuery = (
  query?: Record<string, string | string[] | undefined> | null,
): AttributionParams => {
  if (!query) return {}
  const normalized: Record<string, any> = {}
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) normalized[key] = value[0]
    else normalized[key] = value
  }
  return extractFromObject(normalized)
}

export const appendAttributionMetadata = (
  metadata: Record<string, string>,
  params: AttributionParams,
) => {
  if (!metadata || !params) return
  if (params.source) metadata.utm_source = params.source
  if (params.medium) metadata.utm_medium = params.medium
  if (params.campaign) metadata.utm_campaign = params.campaign
  if (params.content) metadata.utm_content = params.content
  if (params.term) metadata.utm_term = params.term
  if (params.landingPage) metadata.landing_page = params.landingPage
  if (params.referrer) metadata.utm_referrer = params.referrer
  if (params.capturedAt) metadata.utm_captured_at = params.capturedAt
}

export const buildAttributionDocument = (
  params?: AttributionParams,
): AttributionParams | null => {
  if (!params) return null
  const doc: AttributionParams = {}
  (Object.keys(FIELD_MAP) as (keyof AttributionParams)[]).forEach((key) => {
    const value = normalize(params[key])
    if (value) doc[key] = value
  })
  if (Object.keys(doc).length === 0) return null
  if (!doc.capturedAt) doc.capturedAt = new Date().toISOString()
  return doc
}

export const hasAttributionData = (params?: AttributionParams | null): boolean => {
  if (!params) return false
  return Object.values(params).some((value) => Boolean(normalize(value)))
}

export const extractAttributionFromMetadata = (
  ...sources: Array<Record<string, any> | null | undefined>
): AttributionParams => {
  const extracted = sources.map((source) => extractFromObject(source || null))
  return mergeAttributionParams(...extracted)
}
