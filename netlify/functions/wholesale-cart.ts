import type {Handler} from '@netlify/functions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode: 204, headers: corsHeaders}
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: corsHeaders, body: JSON.stringify({error: 'Method not allowed'})}
  }

  return {
    statusCode: 410,
    headers: corsHeaders,
    body: JSON.stringify({
      error:
        'Deprecated endpoint. Wholesale cart pricing/totals are Medusa-authoritative and no longer computed in Sanity.',
    }),
  }
}

export default handler
