import type {Handler} from '@netlify/functions'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  return {
    statusCode: 410,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      error: 'Deprecated endpoint. PaymentIntent creation for vendor invoices is Medusa-authoritative.',
    }),
  }
}
