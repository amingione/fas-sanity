import type {Handler} from '@netlify/functions'
import {createHash} from 'crypto'
import {Resend} from 'resend'
import {logMissingResendApiKey, resolveResendApiKey} from '../../shared/resendEnv'
import {getMissingResendFields} from '../lib/resendValidation'
import {markEmailLogFailed, markEmailLogSent, reserveEmailLog} from '../lib/emailIdempotency'
import {getMessageId} from '../../shared/messageResponse.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const resendApiKey = resolveResendApiKey()
const fromAddress =
  process.env.RESEND_FROM || 'F.A.S. Motorsports <noreply@updates.fasmotorsports.com>'
const resend = resendApiKey ? new Resend(resendApiKey) : null

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: corsHeaders}
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }
  if (!resend) {
    logMissingResendApiKey('sendCustomerEmail')
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Missing RESEND_API_KEY'}),
    }
  }

  try {
    const payload = event.body ? JSON.parse(event.body) : {}
    const to = typeof payload.to === 'string' ? payload.to.trim() : ''
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : ''
    const message = typeof payload.message === 'string' ? payload.message : ''
    const template = typeof payload.template === 'string' ? payload.template : 'custom'
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : []

    if (!to) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Recipient is required'})}
    }
    if (!subject) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Subject is required'})}
    }
    if (!message) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Message body is required'})}
    }

    const html = message
      .split('\n')
      .map((line: string) => line.trim() || '<br />')
      .join('<br />')

    const missing = getMissingResendFields({to, from: fromAddress, subject})
    if (missing.length) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({error: `Missing email fields: ${missing.join(', ')}`}),
      }
    }

    const payloadHash = createHash('sha256')
      .update(`${subject}|${message}|${JSON.stringify(attachments)}`)
      .digest('hex')
    const contextKey = `sendCustomerEmail:${to.toLowerCase()}:${payloadHash}`
    const reservation = await reserveEmailLog({contextKey, to, subject})
    if (reservation.shouldSend) {
      try {
        const response = await resend.emails.send({
          from: fromAddress,
          to,
          subject,
          html: `<p>${html}</p><p style="font-size:12px;color:#94a3b8;">Template: ${template}</p>`,
          attachments: attachments
            .map((attachment: any) => {
              const filename = typeof attachment.filename === 'string' ? attachment.filename : ''
              const content = typeof attachment.content === 'string' ? attachment.content : ''
              if (!filename || !content) return null
              return {
                filename,
                content,
              }
            })
            .filter(Boolean) as Array<{filename: string; content: string}>,
        })
        const resendId = getMessageId(response)
        await markEmailLogSent(reservation.logId, resendId)
      } catch (err) {
        await markEmailLogFailed(reservation.logId, err)
        throw err
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({success: true}),
    }
  } catch (error) {
    console.error('sendCustomerEmail failed', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({error: message}),
    }
  }
}

export {handler}
