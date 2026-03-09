import type {Handler} from '@netlify/functions'

const DEFAULT_ORIGINS = ['http://localhost:3333', 'http://localhost:8888']

const pickOrigin = (origin?: string) => {
  if (!origin) return DEFAULT_ORIGINS[0] || '*'
  if (DEFAULT_ORIGINS.includes(origin)) return origin
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return DEFAULT_ORIGINS[0] || origin
}

const buildCors = (origin?: string) => ({
  'Access-Control-Allow-Origin': pickOrigin(origin),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
})

export const handler: Handler = async (event) => {
  const cors = buildCors(event.headers?.origin || event.headers?.Origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: cors, body: ''}
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
    body: JSON.stringify({error: 'Deprecated endpoint. Refund execution is Medusa-authoritative.'}),
  }
}
