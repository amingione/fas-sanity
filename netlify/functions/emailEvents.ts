import type {Handler} from '@netlify/functions'
import {
  handleWebhook,
  type EmailProvider,
} from '../../packages/sanity-config/src/utils/emailService'
import {createHash} from 'crypto'
import {sanityClient} from '../lib/sanityClient'

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
    const rawBody = event.body || ''
    const payload = rawBody ? JSON.parse(rawBody) : {}
    const hash = createHash('sha256').update(rawBody).digest('hex')
    const eventLogId = `functionLog.emailEvents.${provider}.${hash}`
    try {
      const existing = await sanityClient.fetch<{_id: string} | null>(
        '*[_id == $id][0]{_id}',
        {id: eventLogId},
      )
      if (existing?._id) {
        return {
          statusCode: 200,
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({success: true, duplicate: true}),
        }
      }
      await sanityClient.createIfNotExists({
        _id: eventLogId,
        _type: 'functionLog',
        functionName: 'emailEvents',
        status: 'processing',
        executionTime: new Date().toISOString(),
        eventData: rawBody || JSON.stringify(payload || {}),
      })
    } catch (logErr) {
      console.warn('emailEvents: failed to record idempotency log', logErr)
    }
    const updates = await handleWebhook({provider, payload})
    try {
      await sanityClient
        .patch(eventLogId)
        .set({status: 'success'})
        .commit({autoGenerateArrayKeys: true})
    } catch (logErr) {
      console.warn('emailEvents: failed to finalize idempotency log', logErr)
    }
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
