import type {Handler} from '@netlify/functions'

const DEFAULT_ORIGINS = ['http://localhost:3333', 'http://localhost:8888']

const normalizeOrigin = (origin?: string) => {
  if (!origin) return DEFAULT_ORIGINS[0]
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
}

const makeCors = (origin?: string) => ({
  'Access-Control-Allow-Origin': normalizeOrigin(origin),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
})

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string | undefined
  const cors = makeCors(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  return {
    statusCode: 410,
    headers: {...cors, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      error: 'Deprecated endpoint. Order cancellation/refund execution is Medusa-authoritative.',
    }),
  }
}
