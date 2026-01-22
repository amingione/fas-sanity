import type {Handler} from '@netlify/functions'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * @deprecated This function is deprecated as of 2026-01-06 (vendor-portal-reform).
 *
 * Canonical vendor application handler is:
 * fas-cms-fresh/src/pages/api/vendor-application.ts
 */
export const handler: Handler = async (event) => {
  console.warn(
    'DEPRECATED: vendor-application.ts is deprecated. Use fas-cms-fresh/src/pages/api/vendor-application.ts instead.',
  )

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: corsHeaders, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  return {
    statusCode: 410,
    headers: corsHeaders,
    body: JSON.stringify({
      error: 'Vendor application endpoint deprecated.',
      canonical: 'fas-cms-fresh/src/pages/api/vendor-application.ts',
    }),
  }
}
