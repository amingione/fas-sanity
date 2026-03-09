import type {Handler} from '@netlify/functions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: corsHeaders}

  const method = (event.httpMethod || 'GET').toUpperCase()
  if (method === 'GET') {
    return {
      statusCode: 410,
      headers: corsHeaders,
      body: JSON.stringify({
        error:
          'Deprecated endpoint. Wholesale order history is now served from Medusa-backed APIs.',
      }),
    }
  }

  if (method !== 'POST') {
    return {statusCode: 405, headers: corsHeaders, body: JSON.stringify({error: 'Method not allowed'})}
  }

  return {
    statusCode: 410,
    headers: corsHeaders,
    body: JSON.stringify({
      error: 'Deprecated endpoint. Wholesale order creation is Medusa-authoritative and must execute in Medusa.',
    }),
  }
}

export default handler
