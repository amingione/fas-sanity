import {createHash} from 'crypto'
import {markEmailLogFailed, markEmailLogSent, reserveEmailLog} from '../lib/emailIdempotency'

export async function handler(event) {
  let reservationLogId
  try {
    let payload = {}
    try {
      payload = event.body ? JSON.parse(event.body) : {}
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'Invalid JSON payload'}),
      }
    }

    const {email, name, message} = payload || {}
    if (!email || !name || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'Missing required fields: email, name, message'}),
      }
    }
    const RESEND_API_KEY = process.env.RESEND_API_KEY

    if (!RESEND_API_KEY) {
      console.error('[sendEmail] RESEND_API_KEY is missing or empty', {
        hasEnvVar: Boolean(process.env.RESEND_API_KEY),
        availableResendVars: Object.keys(process.env).filter((key) => key.includes('RESEND')),
        timestamp: new Date().toISOString(),
      })
      throw new Error('Missing RESEND_API_KEY in environment variables.')
    }

    const from =
      process.env.RESEND_FROM || 'FAS Garage <noreply@updates.fasmotorsports.com>'
    const subject = '🚗 New Garage Submission'
    const payloadHash = createHash('sha256')
      .update(`${name}|${email}|${message}`)
      .digest('hex')
    const contextKey = `garage-submission:${email.toLowerCase()}:${payloadHash}`
    const reservation = await reserveEmailLog({contextKey, to: email, subject})
    reservationLogId = reservation.logId

    let response
    if (reservation.shouldSend) {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email], // <- use the form-submitted email safely here
          subject,
          html: `
            <h2>New Submission from ${name}</h2>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Message:</strong> ${message}</p>
          `,
        }),
      })
    }

    let data = null
    if (reservation.shouldSend) {
      if (!response.ok) {
        const errorBody = await response.text()
        await markEmailLogFailed(reservation.logId, errorBody)
        throw new Error(`Resend API error: ${errorBody}`)
      }

      data = await response.json()
      const resendId = data?.data?.id || data?.id || null
      await markEmailLogSent(reservation.logId, resendId)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({success: true, data, skipped: !reservation.shouldSend}),
    }
  } catch (error) {
    await markEmailLogFailed(reservationLogId, error)
    console.error(error)
    return {
      statusCode: 500,
      body: JSON.stringify({error: error.message}),
    }
  }
}
