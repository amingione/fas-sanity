import type {Handler} from '@netlify/functions'
import {runExpiredCheckoutBackfill} from '../lib/backfills/expiredCheckouts'

const normalizeOrigin = (value?: string | null): string => {
  if (!value) return ''
  return value.trim().replace(/\/+$/, '')
}

const DEFAULT_ORIGINS = (() => {
  const entries = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)
  return entries.length > 0 ? entries : ['http://localhost:3333']
})()

const makeCORS = (origin?: string) => {
  const normalized = normalizeOrigin(origin)
  let allowed = DEFAULT_ORIGINS[0]
  if (normalized) {
    if (/^http:\/\/localhost:\d+$/i.test(normalized)) allowed = normalized
    else if (DEFAULT_ORIGINS.includes(normalized)) allowed = normalized
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const parseLimit = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  return Math.floor(numeric)
}

const resolveSecret = (): string => {
  const overrides = [
    process.env.SANITY_STUDIO_BACKFILL_SECRET,
    process.env.BACKFILL_SECRET,
  ]
  for (const value of overrides) {
    if (value && value.trim()) return value.trim()
  }
  return ''
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: CORS, body: ''}
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }
  }

  const expectedSecret = resolveSecret()
  const presented =
    ((event.headers?.authorization || '').replace(/^Bearer\s+/i, '') ||
      event.queryStringParameters?.token ||
      '')?.trim() || ''
  if (expectedSecret && presented !== expectedSecret) {
    return {
      statusCode: 401,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Unauthorized'}),
    }
  }

  let dryRun = (event.queryStringParameters?.dryRun || '').toLowerCase() === 'true'
  let limit = parseLimit(event.queryStringParameters?.limit)
  let since = event.queryStringParameters?.since || ''
  let sessionId = event.queryStringParameters?.session || ''

  if (event.httpMethod === 'POST' && event.body) {
    try {
      const body = JSON.parse(event.body)
      if (typeof body.dryRun === 'boolean') dryRun = body.dryRun
      const bodyLimit = parseLimit(body.limit)
      if (bodyLimit !== undefined) limit = bodyLimit
      if (typeof body.since === 'string' && body.since.trim()) {
        since = body.since.trim()
      } else if (typeof body.since === 'number' && Number.isFinite(body.since)) {
        since = String(body.since)
      }
      if (typeof body.sessionId === 'string' && body.sessionId.trim()) {
        sessionId = body.sessionId.trim()
      }
    } catch {
      // ignore malformed payloads
    }
  }

  try {
    const result = await runExpiredCheckoutBackfill({
      dryRun,
      limit,
      since: since || undefined,
      sessionId: sessionId || undefined,
      logger: (message) => console.log(message),
    })

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify(result),
    }
  } catch (err: any) {
    console.error('backfillExpiredCheckouts failed:', err)
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Internal error'}),
    }
  }
}
