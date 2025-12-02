import type {Handler} from '@netlify/functions'
import {resolveStripeSecretKey, STRIPE_SECRET_ENV_KEYS} from '../lib/stripeEnv'
import syncStripeCatalog from './syncStripeCatalog'

function normalizeOrigin(value?: string | null): string {
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

function makeCORS(origin?: string) {
  const normalizedOrigin = normalizeOrigin(origin)
  let allowed = DEFAULT_ORIGINS[0]
  if (normalizedOrigin) {
    if (/^http:\/\/localhost:\d+$/i.test(normalizedOrigin)) allowed = normalizedOrigin
    else if (DEFAULT_ORIGINS.includes(normalizedOrigin)) allowed = normalizedOrigin
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export const handler: Handler = async (event, context) => {
  const origin = event.headers?.origin || event.headers?.Origin || event.headers?.referer
  const CORS = makeCORS(typeof origin === 'string' ? origin : undefined)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: {...CORS}}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }
  }

  const expected = (process.env.BACKFILL_SECRET || '').trim()
  const presented = (
    (event.headers?.authorization || '').replace(/^Bearer\s+/i, '') ||
    event.queryStringParameters?.token ||
    ''
  ).trim()
  if (expected && presented !== expected) {
    return {
      statusCode: 401,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Unauthorized'}),
    }
  }

  let payload: any = {}
  if (event.body) {
    try {
      payload = JSON.parse(event.body)
    } catch {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Invalid JSON payload'}),
      }
    }
  }

  const mode = (payload.mode || event.queryStringParameters?.mode || 'missing').toString()
  const normalizedMode = mode === 'all' ? 'all' : 'missing'

  const limitRaw = payload.limit ?? event.queryStringParameters?.limit
  let limit: number | undefined
  if (typeof limitRaw === 'number') limit = limitRaw
  else if (typeof limitRaw === 'string' && limitRaw.trim()) {
    const parsed = Number(limitRaw)
    if (Number.isFinite(parsed)) limit = parsed
  }
  if (Number.isFinite(limit)) {
    limit = Math.max(1, Math.min(100, Math.floor(limit!)))
  } else {
    limit = undefined
  }

  const idsRaw =
    payload.productIds ||
    payload.ids ||
    (typeof event.queryStringParameters?.ids === 'string'
      ? event.queryStringParameters?.ids
      : undefined)
  const productIds =
    Array.isArray(idsRaw) && idsRaw.every((id) => typeof id === 'string')
      ? idsRaw
      : typeof idsRaw === 'string'
        ? idsRaw
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
        : undefined

  const secret = (process.env.STRIPE_SYNC_SECRET || '').trim()
  const stripeSecret = resolveStripeSecretKey()
  if (!stripeSecret) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        error: `Missing Stripe secret key (set one of: ${STRIPE_SECRET_ENV_KEYS.join(', ')}).`,
      }),
    }
  }

  const proxyEvent = {
    ...event,
    headers: {
      ...(event.headers || {}),
      authorization: secret ? `Bearer ${secret}` : event.headers?.authorization,
    },
    multiValueHeaders: {
      ...(event.multiValueHeaders || {}),
      authorization: secret ? [`Bearer ${secret}`] : event.multiValueHeaders?.authorization,
    },
    httpMethod: 'POST',
    body: JSON.stringify({
      mode: normalizedMode,
      ...(limit ? {limit} : {}),
      ...(productIds && productIds.length ? {productIds} : {}),
    }),
  }

  const response = await syncStripeCatalog(proxyEvent, context)
  if (!response) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Sync failed: handler returned no response payload'}),
    }
  }

  const headers = {
    ...CORS,
    ...(response.headers || {}),
    'Access-Control-Allow-Origin': CORS['Access-Control-Allow-Origin'],
  }

  return {
    ...response,
    headers,
  }
}

export default handler
