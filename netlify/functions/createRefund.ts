import type {Handler} from '@netlify/functions'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
}

export const handler: Handler = async (event) => {
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
