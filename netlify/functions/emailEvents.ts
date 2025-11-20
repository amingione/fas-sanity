import type {Handler} from '@netlify/functions'
import {
  handleWebhook,
  type EmailProvider,
} from '../../packages/sanity-config/src/utils/emailService'

export const handler: Handler = async (event) => {
  const provider = (event.queryStringParameters?.provider || '').toLowerCase() as EmailProvider
  if (!provider) {
    return {
      statusCode: 400,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'provider query parameter required'}),
    }
  }

  try {
    const payload = event.body ? JSON.parse(event.body) : {}
    const updates = await handleWebhook({provider, payload})
    return {
      statusCode: 200,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({success: true, updates}),
    }
  } catch (err: any) {
    console.error('emailEvents webhook failed', err)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Failed to process email events'}),
    }
  }
}
