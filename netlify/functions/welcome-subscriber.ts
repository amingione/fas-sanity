import {Resend} from 'resend'
import type {Handler} from '@netlify/functions'

type SanityWebhookPayload = {
  items?: Array<{
    _id?: string
    _type?: string
    email?: string
    name?: string
  }>
}

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const resendFrom =
  process.env.RESEND_FROM || 'F.A.S. Motorsports <noreply@updates.fasmotorsports.com>'

export const handler: Handler = async (event) => {
  if (!resendClient) {
    console.error('welcome-subscriber: RESEND_API_KEY is not configured')
    return {statusCode: 500, body: 'Email service not configured'}
  }

  let payload: SanityWebhookPayload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch (err) {
    console.error('welcome-subscriber: invalid JSON payload', err)
    return {statusCode: 400, body: 'Invalid payload'}
  }

  const doc = Array.isArray(payload.items) ? payload.items[0] : null
  if (!doc) {
    return {statusCode: 400, body: 'No document received'}
  }

  if (doc._type !== 'marketingOptIn') {
    console.info('welcome-subscriber: skipping non-subscriber document', {
      id: doc._id,
      type: doc._type,
    })
    return {statusCode: 200, body: 'Not a subscriber document'}
  }

  const email = (doc.email || '').toString().trim()
  const name = (doc.name || '').toString().trim()

  if (!email) {
    console.warn('welcome-subscriber: subscriber missing email', {id: doc._id})
    return {statusCode: 400, body: 'Missing email'}
  }

  const html = `
        <h2>Welcome to F.A.S. Motorsports</h2>
        <p>Thanks for joining the F.A.S. family${name ? `, ${name}` : ''}!</p>

        <p>You’ll receive:</p>
        <ul>
          <li>Exclusive deals & early product drops</li>
          <li>Performance insights and tuning updates</li>
          <li>Build guides & horsepower planning tools</li>
          <li>VIP access to events and giveaways</li>
        </ul>

        <p>We're excited to have you here.</p>

        <a href="https://www.fasmotorsports.com/shop"
           style="display:inline-block;padding:10px 16px;
                  background:#e02020;color:white;border-radius:6px;
                  font-weight:bold;text-decoration:none;">
          Shop F.A.S. Motorsports
        </a>

        <br/><br/>
        <p>— F.A.S. Motorsports</p>
      `

  const text = [
    'Welcome to F.A.S. Motorsports',
    name ? `Hi ${name}, thanks for joining the F.A.S. family!` : 'Thanks for joining the F.A.S. family!',
    '',
    'You’ll receive:',
    '- Exclusive deals & early product drops',
    '- Performance insights and tuning updates',
    '- Build guides & horsepower planning tools',
    '- VIP access to events and giveaways',
    '',
    'Shop F.A.S. Motorsports: https://www.fasmotorsports.com/shop',
    '',
    '— F.A.S. Motorsports',
  ].join('\n')

  try {
    await resendClient.emails.send({
      from: resendFrom,
      to: email,
      subject: 'Welcome to F.A.S. Motorsports — Your Build Starts Here',
      html,
      text,
    })
  } catch (err) {
    console.error('welcome-subscriber: Resend send failed', err)
    return {statusCode: 500, body: 'Internal error'}
  }

  console.info('welcome-subscriber: welcome email sent', {id: doc._id, email})

  return {statusCode: 200, body: 'Welcome email sent'}
}
