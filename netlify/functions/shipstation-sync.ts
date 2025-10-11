import type { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import { syncOrderToShipStation } from '../lib/shipstation'

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:3333,http://localhost:8888').split(',')
function makeCORS(origin?: string) {
  const o = origin && (DEFAULT_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/i.test(origin)) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  try {
    const body = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {}
    const orderId = (body.orderId || event.queryStringParameters?.orderId || '').toString().trim()

    if (!orderId) {
      return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing orderId' }) }
    }

    const shipStationOrderId = await syncOrderToShipStation(sanity, orderId)

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, orderId, shipStationOrderId }),
    }
  } catch (err: any) {
    console.error('shipstation-sync error', err)
    const details = err?.data
      ? typeof err.data === 'string'
        ? err.data
        : JSON.stringify(err.data)
      : undefined
    return {
      statusCode: typeof err?.status === 'number' ? err.status : 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'ShipStation sync failed', details }),
    }
  }
}
