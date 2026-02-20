import type {Handler} from '@netlify/functions'

const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')

function makeCORS(origin?: string) {
  const normalized = origin && DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': normalized,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: CORS, body: ''}
  }

  return {
    statusCode: 410,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      error:
        'Deprecated: Vendor Stripe sync is disabled. Stripe objects are created only when invoices convert to vendor orders.',
    }),
  }
}
