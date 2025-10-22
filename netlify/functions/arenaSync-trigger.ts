import type { Handler } from '@netlify/functions'

type TriggerBody = {
  channelSlugs?: string[]
  options?: Record<string, unknown>
  test?: boolean
}

type ParsedRequest = {
  token: string | null
  body: TriggerBody
}

const parseAllowedOrigins = (): string[] =>
  (process.env.CORS_ALLOW || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const resolveCorsOrigin = (requestOrigin?: string | null): string | null => {
  if (!requestOrigin) return '*'
  const allowed = parseAllowedOrigins()
  if (allowed.length === 0) return '*'
  if (allowed.includes('*')) return '*'
  return allowed.includes(requestOrigin) ? requestOrigin : null
}

function buildResponse(statusCode: number, body: Record<string, unknown>, corsOrigin: string | null) {
  if (corsOrigin === null) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'CORS origin not allowed' }, null, 2),
    }
  }

  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      ...(corsOrigin !== '*' ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body, null, 2),
  }
}

function parseAuthToken(headerValue?: string | string[] | undefined): string | null {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (!raw) return null
  const parts = raw.split(/\s+/)
  if (parts.length === 2 && /^bearer$/i.test(parts[0])) return parts[1]
  if (parts.length === 1) return parts[0]
  return null
}

const parseRequest = (event: Parameters<Handler>[0]): ParsedRequest => {
  let body: TriggerBody = {}
  if (event.body) {
    try {
      body = JSON.parse(event.body || '{}')
    } catch (err) {
      throw new Error(`Invalid JSON body: ${(err as Error).message}`)
    }
  }

  let tokenFromQuery: string | null = null
  if (typeof event.rawUrl === 'string') {
    try {
      const url = new URL(event.rawUrl)
      tokenFromQuery = url.searchParams.get('token')
    } catch {
      tokenFromQuery = null
    }
  }

  const token =
    parseAuthToken(event.headers.authorization || event.headers.Authorization) ||
    tokenFromQuery ||
    null

  return { token, body }
}

const buildBackgroundTargetUrl = (event: Parameters<Handler>[0], token: string | null): string => {
  const protocol = (event.headers['x-forwarded-proto'] as string) || 'https'
  const host = event.headers.host || process.env.URL || ''
  const baseUrl = `${protocol}://${host}`
  const backgroundPath =
    process.env.ARENA_BACKGROUND_FUNCTION_PATH || '/.netlify/functions/arenaSync-background'
  const search = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${baseUrl}${backgroundPath}${search}`
}

export const handler: Handler = async (event) => {
  const requestOrigin =
    (event.headers?.origin as string) || (event.headers?.Origin as string) || null
  const corsOrigin = resolveCorsOrigin(requestOrigin)

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin ?? '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        ...(corsOrigin && corsOrigin !== '*'
          ? { 'Access-Control-Allow-Credentials': 'true' }
          : {}),
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return buildResponse(405, { error: 'Method Not Allowed' }, corsOrigin)
  }

  const { token, body } = (() => {
    try {
      return parseRequest(event)
    } catch (err: any) {
      throw buildResponse(400, { error: err.message || 'Invalid request body' }, corsOrigin)
    }
  })()

  const requiredSecret = process.env.ARENA_SYNC_SECRET
  if (requiredSecret) {
    if (!token || token !== requiredSecret) {
      return buildResponse(401, { error: 'Unauthorized' }, corsOrigin)
    }
  }

  if (body?.test) {
    return buildResponse(200, { ok: true, message: 'Trigger acknowledged' }, corsOrigin)
  }

  try {
    const targetUrl = buildBackgroundTargetUrl(event, token)
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })

    if (!response.ok && response.status !== 202) {
      const message = await response.text().catch(() => response.statusText || 'Unknown error')
      return buildResponse(
        response.status,
        { error: `Background sync rejected: ${message}` },
        corsOrigin
      )
    }

    return buildResponse(
      200,
      {
        ok: true,
        message: 'Sync queued',
        status: response.status,
      },
      corsOrigin
    )
  } catch (err: any) {
    return buildResponse(
      500,
      {
        error: err?.message || 'Failed to trigger background sync',
      },
      corsOrigin
    )
  }
}
