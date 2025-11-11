// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {runOrderShippingBackfill} from '../lib/backfills/orderShipping'

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

export const handler: Handler = async (event) => {
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

  const dryRun =
    typeof payload.dryRun === 'boolean'
      ? payload.dryRun
      : event.queryStringParameters?.dryRun === 'true'
  const limitRaw = payload.limit ?? event.queryStringParameters?.limit
  const limit =
    typeof limitRaw === 'number'
      ? limitRaw
      : typeof limitRaw === 'string'
        ? Number(limitRaw)
        : undefined

  try {
    const result = await runOrderShippingBackfill({
      dryRun,
      limit: Number.isFinite(limit) && limit ? Number(limit) : undefined,
      orderId:
        typeof payload.orderId === 'string'
          ? payload.orderId
          : event.queryStringParameters?.orderId,
      sessionId:
        typeof payload.sessionId === 'string'
          ? payload.sessionId
          : event.queryStringParameters?.sessionId,
    })

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({ok: true, ...result}),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: (err as any)?.message || 'Backfill failed'}),
    }
  }
}

export default handler
