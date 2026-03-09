import type {Handler} from '@netlify/functions'

export const handler: Handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-approve-secret',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: corsHeaders}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: corsHeaders, body: JSON.stringify({error: 'Method not allowed'})}
  }

  return {
    statusCode: 410,
    headers: corsHeaders,
    body: JSON.stringify({
      error: 'Deprecated endpoint. Wholesale approval/invoice workflow is Medusa-authoritative.',
    }),
  }
}
