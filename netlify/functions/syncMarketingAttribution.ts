import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'

type DateRange = {
  start: string
  end: string
}

type NormalizedMetric = {
  source: 'google_ads' | 'facebook' | 'email' | 'affiliate' | 'organic'
  externalId?: string
  campaign?: string
  adGroup?: string
  medium?: string
  term?: string
  content?: string
  landingPage?: string
  dateRange?: Partial<DateRange>
  metrics: {
    impressions?: number
    clicks?: number
    sessions?: number
    opens?: number
    clickThroughs?: number
    orders?: number
    newCustomers?: number
    returningCustomers?: number
    revenue?: number
    spend?: number
    commissions?: number
  }
  conversionType?: string
  conversionValue?: number
  syncDate?: string
}

type MarketingSecrets = {
  sanity?: {
    projectId?: string
    dataset?: string
    token?: string
  }
  google?: {
    developerToken?: string
    customerId?: string
    loginCustomerId?: string
    accessToken?: string
  }
  meta?: {
    accessToken?: string
    adAccountId?: string
  }
  email?: {
    provider?: 'sendgrid' | 'klaviyo'
    sendgrid?: {
      apiKey?: string
      category?: string
    }
    klaviyo?: {
      privateKey?: string
      metricId?: string
    }
  }
  affiliate?: {
    endpoint?: string
    token?: string
  }
  organic?: {
    endpoint?: string
    token?: string
  }
}

function loadSecrets(): MarketingSecrets {
  const blob = process.env.MARKETING_API_BLOB
  if (blob) {
    try {
      const decoded = Buffer.from(blob, 'base64').toString('utf8')
      const parsed = JSON.parse(decoded)
      if (parsed && typeof parsed === 'object') {
        return parsed as MarketingSecrets
      }
    } catch (err) {
      console.warn('[syncMarketingAttribution] Failed to parse MARKETING_API_BLOB', err)
    }
  }

  const inlineJson = process.env.MARKETING_API_JSON
  if (inlineJson) {
    try {
      const parsed = JSON.parse(inlineJson)
      if (parsed && typeof parsed === 'object') {
        return parsed as MarketingSecrets
      }
    } catch (err) {
      console.warn('[syncMarketingAttribution] Failed to parse MARKETING_API_JSON', err)
    }
  }

  // Legacy env fallbacks
  return {
    google: {
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
      loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      accessToken: process.env.GOOGLE_ADS_ACCESS_TOKEN,
    },
    meta: {
      accessToken: process.env.FACEBOOK_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN,
      adAccountId: process.env.FACEBOOK_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID,
    },
    email: {
      provider: process.env.SENDGRID_API_KEY
        ? 'sendgrid'
        : process.env.KLAVIYO_PRIVATE_KEY
          ? 'klaviyo'
          : undefined,
      sendgrid: {
        apiKey: process.env.SENDGRID_API_KEY,
        category: process.env.SENDGRID_CATEGORY,
      },
      klaviyo: {
        privateKey: process.env.KLAVIYO_PRIVATE_KEY,
        metricId: process.env.KLAVIYO_CAMPAIGN_METRIC_ID,
      },
    },
    affiliate: {
      endpoint: process.env.AFFILIATE_API_ENDPOINT,
      token: process.env.AFFILIATE_API_TOKEN,
    },
    organic: {
      endpoint:
        process.env.DIRECT_ANALYTICS_ENDPOINT || process.env.NETLIFY_ANALYTICS_SYNC_ENDPOINT,
      token: process.env.DIRECT_ANALYTICS_TOKEN,
    },
    sanity: {
      projectId: process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET,
      token: process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN,
    },
  }
}

const marketingSecrets = loadSecrets()

const SANITY_PROJECT_ID =
  marketingSecrets?.sanity?.projectId ||
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID
const SANITY_DATASET =
  marketingSecrets?.sanity?.dataset ||
  process.env.SANITY_STUDIO_DATASET ||
  process.env.SANITY_DATASET ||
  'production'
const SANITY_TOKEN =
  marketingSecrets?.sanity?.token || process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

if (!SANITY_PROJECT_ID || !SANITY_TOKEN) {
  console.warn(
    '[syncMarketingAttribution] Missing Sanity credentials. Set SANITY_STUDIO_PROJECT_ID and SANITY_API_TOKEN (or include them in MARKETING_API_BLOB).',
  )
}

const sanity = SANITY_PROJECT_ID
  ? createClient({
      projectId: SANITY_PROJECT_ID,
      dataset: SANITY_DATASET,
      token: SANITY_TOKEN,
      apiVersion: '2024-10-01',
      useCdn: false,
    })
  : null

const DEFAULT_LOOKBACK_DAYS = Number.parseInt(process.env.MARKETING_SYNC_LOOKBACK_DAYS || '1', 10)

export const handler: Handler = async (event) => {
  if (event.httpMethod && !['GET', 'POST'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!sanity) {
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Sanity client is not configured'}),
    }
  }

  const range = resolveDateRange(event.queryStringParameters)

  try {
    const [googleMetrics, facebookMetrics, emailMetrics, affiliateMetrics, organicMetrics] =
      await Promise.all([
        fetchGoogleAdsMetrics(range, marketingSecrets.google).catch((err) => {
          console.error('[syncMarketingAttribution] Google Ads fetch failed', err)
          return []
        }),
        fetchMetaAdsMetrics(range, marketingSecrets.meta).catch((err) => {
          console.error('[syncMarketingAttribution] Facebook Graph fetch failed', err)
          return []
        }),
        fetchEmailMetrics(range, marketingSecrets.email).catch((err) => {
          console.error('[syncMarketingAttribution] Email metrics fetch failed', err)
          return []
        }),
        fetchAffiliateMetrics(range, marketingSecrets.affiliate).catch((err) => {
          console.error('[syncMarketingAttribution] Affiliate metrics fetch failed', err)
          return []
        }),
        fetchOrganicMetrics(range, marketingSecrets.organic).catch((err) => {
          console.error('[syncMarketingAttribution] Organic metrics fetch failed', err)
          return []
        }),
      ])

    const records = [
      ...googleMetrics,
      ...facebookMetrics,
      ...emailMetrics,
      ...affiliateMetrics,
      ...organicMetrics,
    ].filter((record) => Boolean(record.metrics))

    if (!records.length) {
      return {
        statusCode: 200,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: 'No marketing metrics returned for requested range.'}),
      }
    }

    const tx = sanity.transaction()
    const now = new Date().toISOString()

    for (const record of records) {
      const id =
        record.externalId ||
        [record.source, record.campaign, record.dateRange?.start || range.start]
          .filter(Boolean)
          .join('-')

      tx.createOrReplace({
        _id: `attribution.${id}`.replace(/[^a-z0-9._-]+/gi, '-'),
        _type: 'attribution',
        source: record.source,
        externalId: record.externalId,
        syncDate: record.syncDate || now,
        dateRange: record.dateRange,
        campaign: record.campaign,
        adGroup: record.adGroup,
        medium: record.medium,
        term: record.term,
        content: record.content,
        landingPage: record.landingPage,
        metrics: record.metrics,
        conversionType: record.conversionType,
        conversionValue: record.conversionValue,
      })
    }

    const commit = await tx.commit()

    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        synced: records.length,
        range,
        transactionId: commit.transactionId,
      }),
    }
  } catch (err) {
    console.error('[syncMarketingAttribution] unexpected failure', err)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        error: 'Failed to sync marketing attribution metrics',
        detail: err instanceof Error ? err.message : String(err),
      }),
    }
  }
}

function resolveDateRange(
  params: Record<string, string | undefined> | null | undefined,
): DateRange {
  const today = new Date()
  const endParam = params?.end || params?.to
  const startParam = params?.start || params?.from
  const end = endParam ? new Date(endParam) : today
  const start = startParam
    ? new Date(startParam)
    : new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  return {start: isoDate(start), end: isoDate(end)}
}

function isoDate(date: Date): string {
  return new Date(date.getTime()).toISOString().split('T')[0]
}

function coerceNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function fetchGoogleAdsMetrics(
  range: DateRange,
  config: MarketingSecrets['google'],
): Promise<NormalizedMetric[]> {
  const developerToken = config?.developerToken
  const customerId = config?.customerId
  const loginCustomerId = config?.loginCustomerId
  const accessToken = config?.accessToken

  if (!developerToken || !customerId || !accessToken) {
    return []
  }

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.new_customer_lifetime_value,
      metrics.new_customers,
      metrics.all_conversions_value,
      metrics.cost_micros
    FROM campaign
    WHERE segments.date BETWEEN '${range.start}' AND '${range.end}'
  `

  const url = `https://googleads.googleapis.com/v14/customers/${customerId}/googleAds:searchStream`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'developer-token': developerToken,
  }
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({query}),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Google Ads API error: ${response.status} ${detail}`)
  }

  // Search stream returns NDJSON-like chunked arrays. Flatten to results.
  const chunks = await response.json()
  const rows: any[] = Array.isArray(chunks)
    ? chunks.flatMap((chunk) => chunk.results || [])
    : chunks.results || []

  return rows.map((row: any) => {
    const costMicros = coerceNumber(row?.metrics?.costMicros ?? row?.metrics?.cost_micros)
    return {
      source: 'google_ads' as const,
      externalId: row?.campaign?.id?.toString(),
      campaign: row?.campaign?.name,
      adGroup: row?.adGroup?.name || row?.ad_group?.name,
      medium: 'cpc',
      metrics: {
        impressions: coerceNumber(row?.metrics?.impressions),
        clicks: coerceNumber(row?.metrics?.clicks),
        orders: coerceNumber(row?.metrics?.conversions),
        revenue: coerceNumber(row?.metrics?.conversionsValue ?? row?.metrics?.conversions_value),
        newCustomers: coerceNumber(row?.metrics?.newCustomers ?? row?.metrics?.new_customers),
        spend: typeof costMicros === 'number' ? costMicros / 1_000_000 : undefined,
      },
      conversionType: 'purchase',
      conversionValue: coerceNumber(
        row?.metrics?.conversionsValue ?? row?.metrics?.conversions_value,
      ),
      dateRange: range,
    }
  })
}

async function fetchMetaAdsMetrics(
  range: DateRange,
  config: MarketingSecrets['meta'],
): Promise<NormalizedMetric[]> {
  const accessToken = config?.accessToken
  const accountId = config?.adAccountId

  if (!accessToken || !accountId) {
    return []
  }

  const timeRange = JSON.stringify({since: range.start, until: range.end})
  const fields = [
    'campaign_id',
    'campaign_name',
    'adset_id',
    'adset_name',
    'impressions',
    'clicks',
    'spend',
    'actions',
    'action_values',
  ].join(',')

  const params = new URLSearchParams({
    level: 'campaign',
    time_range: timeRange,
    fields,
    access_token: accessToken,
  })

  const url = `https://graph.facebook.com/v18.0/act_${accountId}/insights?${params.toString()}`
  const response = await fetch(url)

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Facebook Graph API error: ${response.status} ${detail}`)
  }

  const data = await response.json()
  const rows: any[] = Array.isArray(data?.data) ? data.data : []

  return rows.map((row) => {
    const purchases =
      row?.actions?.find((action: any) => action?.action_type === 'offsite_conversion.purchase')
        ?.value || row?.actions?.find((action: any) => action?.action_type === 'purchase')?.value
    const purchaseValue =
      row?.action_values?.find(
        (action: any) => action?.action_type === 'offsite_conversion.purchase',
      )?.value ||
      row?.action_values?.find((action: any) => action?.action_type === 'purchase')?.value

    return {
      source: 'facebook' as const,
      externalId: row?.campaign_id,
      campaign: row?.campaign_name,
      adGroup: row?.adset_name,
      medium: 'paid_social',
      metrics: {
        impressions: coerceNumber(row?.impressions),
        clicks: coerceNumber(row?.clicks),
        orders: coerceNumber(purchases),
        revenue: coerceNumber(purchaseValue),
        spend: coerceNumber(row?.spend),
      },
      conversionType: purchases ? 'purchase' : undefined,
      conversionValue: coerceNumber(purchaseValue),
      dateRange: range,
    }
  })
}

async function fetchEmailMetrics(
  range: DateRange,
  config: MarketingSecrets['email'],
): Promise<NormalizedMetric[]> {
  if (!config) return []

  if (config.provider === 'sendgrid' && config.sendgrid?.apiKey) {
    return fetchSendgridMetrics(range, config.sendgrid)
  }
  if (config.provider === 'klaviyo' && config.klaviyo?.privateKey && config.klaviyo.metricId) {
    return fetchKlaviyoMetrics(range, config.klaviyo)
  }
  return []
}

async function fetchSendgridMetrics(
  range: DateRange,
  config: NonNullable<MarketingSecrets['email']>['sendgrid'],
): Promise<NormalizedMetric[]> {
  const apiKey = config?.apiKey
  const category = config?.category || undefined
  if (!apiKey) return []

  const params = new URLSearchParams({
    start_date: range.start,
    end_date: range.end,
  })
  if (category) params.set('aggregated_by', 'day')

  const response = await fetch(`https://api.sendgrid.com/v3/stats?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`SendGrid metrics error: ${response.status} ${detail}`)
  }

  const data = await response.json()
  const rows: any[] = Array.isArray(data) ? data : []

  return rows.map((row) => {
    const metrics = row?.stats?.[0]?.metrics || {}
    return {
      source: 'email' as const,
      externalId: `${row.date}-${category || 'all'}`,
      campaign: category || 'All Email',
      medium: 'email',
      dateRange: {start: row.date, end: row.date},
      metrics: {
        opens: coerceNumber(metrics.opens),
        clickThroughs: coerceNumber(metrics.clicks),
        orders: coerceNumber(metrics.unique_clicks),
        sessions: coerceNumber(metrics.unique_opens),
      },
    }
  })
}

async function fetchKlaviyoMetrics(
  range: DateRange,
  config: NonNullable<MarketingSecrets['email']>['klaviyo'],
): Promise<NormalizedMetric[]> {
  const apiKey = config?.privateKey
  const metricId = config?.metricId
  if (!apiKey || !metricId) return []

  const params = new URLSearchParams({
    since: `${range.start}T00:00:00Z`,
    until: `${range.end}T23:59:59Z`,
  })

  const response = await fetch(
    `https://a.klaviyo.com/api/metrics/${encodeURIComponent(metricId)}/timeline?${params.toString()}`,
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Klaviyo metrics error: ${response.status} ${detail}`)
  }

  const data = await response.json()
  const rows: any[] = Array.isArray(data?.data) ? data.data : []

  return rows.map((row) => ({
    source: 'email' as const,
    externalId: row?.id,
    campaign: row?.attributes?.metric_name,
    medium: 'email',
    dateRange: {start: range.start, end: range.end},
    metrics: {
      opens: coerceNumber(
        row?.attributes?.statistic?.total_open ?? row?.attributes?.statistics?.opens,
      ),
      clickThroughs: coerceNumber(
        row?.attributes?.statistic?.total_click ?? row?.attributes?.statistics?.clicks,
      ),
    },
  }))
}

async function fetchAffiliateMetrics(
  range: DateRange,
  config: MarketingSecrets['affiliate'],
): Promise<NormalizedMetric[]> {
  const endpoint = config?.endpoint
  const token = config?.token

  if (!endpoint || !token) return []

  const params = new URLSearchParams({
    start_date: range.start,
    end_date: range.end,
  })

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Affiliate API error: ${response.status} ${detail}`)
  }

  const data = await response.json()
  const rows: any[] = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : []

  return rows.map((row) => ({
    source: 'affiliate' as const,
    externalId: row?.id?.toString(),
    campaign: row?.campaign || row?.name,
    medium: 'affiliate',
    metrics: {
      clicks: coerceNumber(row?.clicks),
      orders: coerceNumber(row?.conversions),
      revenue: coerceNumber(row?.revenue),
      commissions: coerceNumber(row?.commission),
      spend: coerceNumber(row?.payout),
    },
    dateRange: range,
  }))
}

async function fetchOrganicMetrics(
  range: DateRange,
  config: MarketingSecrets['organic'],
): Promise<NormalizedMetric[]> {
  const analyticsEndpoint = config?.endpoint
  if (!analyticsEndpoint) {
    return []
  }

  const params = new URLSearchParams({
    start: range.start,
    end: range.end,
  })

  const response = await fetch(`${analyticsEndpoint}?${params.toString()}`, {
    headers: {
      Authorization: config?.token ? `Bearer ${config.token}` : '',
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Organic analytics endpoint error: ${response.status} ${detail}`)
  }

  const data = await response.json()

  return [
    {
      source: 'organic',
      campaign: 'Direct / Organic',
      medium: 'organic',
      metrics: {
        sessions: coerceNumber(data?.totals?.sessions || data?.sessions),
        orders: coerceNumber(data?.totals?.orders || data?.orders),
        revenue: coerceNumber(data?.totals?.revenue || data?.revenue),
      },
      dateRange: range,
    },
  ]
}
