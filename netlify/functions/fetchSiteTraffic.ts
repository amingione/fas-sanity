import type {Handler, HandlerEvent} from '@netlify/functions'

type TrafficPoint = {
  date: string
  visitors: number
  pageviews: number
  sessions: number
}

type TrafficResponse = {
  range: {start: string; end: string}
  totals: {visitors: number; pageviews: number; sessions: number}
  daily: TrafficPoint[]
}

const NETLIFY_API_BASE = 'https://api.netlify.com/api/v1'

export const handler: Handler = async (event: HandlerEvent) => {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
        body: JSON.stringify({error: 'Method not allowed'}),
      }
    }

    const token =
      process.env.NETLIFY_ANALYTICS_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN ||
      process.env.NETLIFY_ACCESS_TOKEN
    const siteId =
      process.env.NETLIFY_ANALYTICS_SITE_ID || process.env.NETLIFY_SITE_ID || process.env.SITE_ID

    if (!token || !siteId) {
      return {
        statusCode: 500,
        headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
        body: JSON.stringify({error: 'Analytics credentials not configured'}),
      }
    }

    const params = new URLSearchParams()
    const {start, end} = coerceRange(event.queryStringParameters || {})
    params.set('start_at', start.toISOString())
    params.set('end_at', end.toISOString())

    const analyticsUrl = `${NETLIFY_API_BASE}/sites/${encodeURIComponent(siteId)}/analytics`
    const response = await fetch(`${analyticsUrl}?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'FAS-Sanity-Dashboard/1.0 (+https://fasmotorsports.com)',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      return {
        statusCode: response.status,
        headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
        body: JSON.stringify({error: 'Analytics request failed', detail: text}),
      }
    }

    const data = await response.json()
    const normalized = normalizeAnalytics(data, start, end)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300, stale-while-revalidate=600',
      },
      body: JSON.stringify(normalized),
    }
  } catch (err) {
    console.error('fetchSiteTraffic error', err)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
      body: JSON.stringify({
        error: 'Unexpected error',
        detail: err instanceof Error ? err.message : String(err),
      }),
    }
  }
}

function coerceRange(params: Record<string, string | null | undefined>) {
  const now = new Date()
  const defaultDays = 30
  const startParam = params.start ?? params.start_at ?? params.from ?? ''
  const endParam = params.end ?? params.end_at ?? params.to ?? ''

  const end = endParam ? (safeParseDate(endParam) ?? now) : now
  const start = startParam
    ? (safeParseDate(startParam) ?? subtractDays(end, defaultDays))
    : subtractDays(end, defaultDays)

  return {start, end}
}

function safeParseDate(value: string): Date | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed) : null
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000)
}

function normalizeAnalytics(data: any, start: Date, end: Date): TrafficResponse {
  const totals = {
    visitors: Number(data?.totals?.uniques) || 0,
    pageviews: Number(data?.totals?.pageviews) || 0,
    sessions: Number(data?.totals?.visits) || 0,
  }

  const daily = Array.isArray(data?.pages)
    ? data.pages
        .filter((point: any) => point && point.date)
        .map((point: any) => ({
          date: String(point.date),
          visitors: Number(point.uniques) || 0,
          pageviews: Number(point.pageviews) || 0,
          sessions: Number(point.visits) || 0,
        }))
    : []

  return {
    range: {start: start.toISOString(), end: end.toISOString()},
    totals,
    daily,
  }
}
