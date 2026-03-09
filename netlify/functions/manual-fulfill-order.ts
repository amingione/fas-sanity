import type {Handler} from '@netlify/functions'

function pickOrigin(origin?: string): string {
  const defaults = ['http://localhost:3333', 'http://localhost:8888']
  if (!origin) return defaults[0]
  if (defaults.includes(origin)) return origin
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return defaults[0]
}

function jsonResponse(
  statusCode: number,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) {
  return {
    statusCode,
    headers: {...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  }
}

export const handler: Handler = async (event) => {
  const originHeader = (event.headers?.origin || event.headers?.Origin || '') as string
  const corsHeaders = {
    'Access-Control-Allow-Origin': pickOrigin(originHeader),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: corsHeaders, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, corsHeaders, {success: false, message: 'Method Not Allowed'})
  }

  return jsonResponse(410, corsHeaders, {
    success: false,
    message: 'Deprecated endpoint. Manual fulfillment and inventory mutation are Medusa-authoritative.',
  })
}
