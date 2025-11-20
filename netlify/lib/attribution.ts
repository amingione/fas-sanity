export type AttributionParams = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  landingPage?: string
  referrer?: string
  capturedAt?: string
  device?: string
  browser?: string
  os?: string
  sessionId?: string
  firstTouch?: string
  lastTouch?: string
  touchpoints?: string
  orderValue?: string
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
  device: ['device', 'device_type', 'utm_device'],
  browser: ['browser', 'browser_name', 'user_browser'],
  os: ['os', 'operating_system', 'user_os'],
  sessionId: ['session_id', 'sessionId', 'stripe_session_id', 'checkout_session_id'],
  firstTouch: ['first_touch', 'firstTouch'],
  lastTouch: ['last_touch', 'lastTouch'],
  touchpoints: ['touchpoints', 'visit_count', 'visits'],
  orderValue: ['order_value', 'value'],
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

export const extractAttributionFromPayload = (payload?: Record<string, any> | null): AttributionParams => {
  if (!payload) return {}
  const directFields = extractFromObject(payload)
  const nested =
    typeof payload.utm === 'object' && payload.utm
      ? extractFromObject(payload.utm as Record<string, any>)
      : {}
  return mergeAttributionParams(directFields, nested)
}

export const extractAttributionFromQuery = (query?: Record<string, string | string[] | undefined> | null): AttributionParams => {
  if (!query) return {}
  const normalized: Record<string, any> = {}
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) normalized[key] = value[0]
    else normalized[key] = value
  }
  return extractFromObject(normalized)
}

export const appendAttributionMetadata = (metadata: Record<string, string>, params: AttributionParams): void => {
  if (!metadata || !params) return
  if (params.source) metadata.utm_source = params.source
  if (params.medium) metadata.utm_medium = params.medium
  if (params.campaign) metadata.utm_campaign = params.campaign
  if (params.content) metadata.utm_content = params.content
  if (params.term) metadata.utm_term = params.term
  if (params.landingPage) metadata.landing_page = params.landingPage
  if (params.referrer) metadata.utm_referrer = params.referrer
  if (params.capturedAt) metadata.utm_captured_at = params.capturedAt
  if (params.device) metadata.device_type = params.device
  if (params.browser) metadata.browser_name = params.browser
  if (params.os) metadata.operating_system = params.os
  if (params.sessionId) metadata.checkout_session_id = params.sessionId
  if (params.touchpoints) metadata.touchpoints = params.touchpoints
}

export const buildAttributionDocument = (params?: AttributionParams): AttributionParams | null => {
  if (!params) return null
  const doc: AttributionParams = {}
  const fields = Object.keys(FIELD_MAP) as (keyof AttributionParams)[]
  fields.forEach((key) => {
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

export const extractAttributionFromMetadata = (...sources: Array<Record<string, any> | null | undefined>): AttributionParams => {
  const extracted = sources.map((source) => extractFromObject(source || null))
  return mergeAttributionParams(...extracted)
}

export const parseDeviceInfo = (
  userAgent?: string | null,
): Pick<AttributionParams, 'device' | 'browser' | 'os'> => {
  if (!userAgent) return {}
  const ua = userAgent.toLowerCase()
  const info: Pick<AttributionParams, 'device' | 'browser' | 'os'> = {}

  if (/ipad|tablet/.test(ua)) info.device = 'tablet'
  else if (/mobile|iphone|android/.test(ua)) info.device = 'mobile'
  else info.device = 'desktop'

  if (/chrome/.test(ua) && !/edge|edg\//.test(ua)) info.browser = 'chrome'
  else if (/safari/.test(ua) && !/chrome/.test(ua)) info.browser = 'safari'
  else if (/firefox/.test(ua)) info.browser = 'firefox'
  else if (/edg\//.test(ua)) info.browser = 'edge'
  else info.browser = 'other'

  if (/windows/.test(ua)) info.os = 'windows'
  else if (/mac os x/.test(ua) && !/iphone/.test(ua)) info.os = 'macos'
  else if (/iphone|ipad|ios/.test(ua)) info.os = 'ios'
  else if (/android/.test(ua)) info.os = 'android'
  else if (/linux/.test(ua)) info.os = 'linux'
  else info.os = 'other'

  return info
}
