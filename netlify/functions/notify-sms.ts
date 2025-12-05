import twilio from 'twilio'
import type {Handler} from '@netlify/functions'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID as string,
  process.env.TWILIO_AUTH_TOKEN as string,
)

export const handler: Handler = async (event) => {
  try {
    if (!event.body) {
      return {statusCode: 400, body: 'Missing body'}
    }

    const webhook = JSON.parse(event.body)

    const docType: string = webhook._type
    const id: string = webhook._id

    // 1. SAFETY: ONLY notify on initial creation
    if (webhook._createdAt && webhook._updatedAt && webhook._createdAt !== webhook._updatedAt) {
      return {
        statusCode: 200,
        body: JSON.stringify({ok: true, skipped: 'update'}),
      }
    }

    // 2. Build Sanity Studio link
    const studioUrl = `${process.env.SANITY_STUDIO_BASE_URL}/desk/${docType};${id}`

    let messageText = ''

    // ============================
    // ORDER ALERT
    // ============================
    if (docType === 'order') {
      const customer =
        webhook.customerName ||
        webhook.customer?.fullName ||
        webhook.customer?.name ||
        'New Customer'

      const total = webhook.total || webhook.amount || webhook.orderTotal || 'N/A'

      messageText = `
FAS MOTORS: NEW ORDER
Customer: ${customer}
Total: $${total}
Order ID: ${id}
Open: ${studioUrl}
`.trim()
    }

    // ============================
    // CUSTOMER MESSAGE ALERT
    // ============================
    if (docType === 'customerMessage') {
      const customer =
        webhook.customer?.name || webhook.customerName || webhook.phoneNumber || 'Unknown Customer'

      const preview = webhook.body?.substring(0, 80) + (webhook.body?.length > 80 ? '...' : '')

      messageText = `
FAS MOTORS: NEW INBOUND MESSAGE
From: ${customer}
Preview: ${preview}
Message ID: ${id}
Open: ${studioUrl}
`.trim()
    }

    // ============================
    // QUOTE REQUEST ALERT
    // ============================
    if (docType === 'quoteRequest') {
      const customer = webhook.customer?.name || 'Unknown Customer'

      const quoteNum = webhook.quoteNumber || id
      const amount = webhook.total || webhook.subtotal || 'N/A'

      messageText = `
FAS MOTORS: NEW QUOTE REQUEST
Quote #: ${quoteNum}
Customer: ${customer}
Total: $${amount}
Open: ${studioUrl}
`.trim()
    }

    // ============================
    // VENDOR MESSAGE ALERT
    // ============================
    if (docType === 'vendorMessage') {
      const vendor = webhook.vendor?.companyName || webhook.vendor?.displayName || 'Unknown Vendor'

      const subject = webhook.subject || 'No Subject'

      const priority = webhook.priority || 'normal'
      const priorityEmoji = priority === 'urgent' ? '🔴' : priority === 'high' ? '🟡' : '🟢'

      const category = webhook.category || ''
      const categoryText = category ? `\nCategory: ${category}` : ''

      messageText = `
FAS MOTORS: NEW VENDOR MESSAGE ${priorityEmoji}
From: ${vendor}
Subject: ${subject}
Priority: ${priority.toUpperCase()}${categoryText}
Message ID: ${id}
Open: ${studioUrl}
`.trim()
    }

    if (!messageText) {
      return {
        statusCode: 200,
        body: JSON.stringify({ok: true, skipped: 'unsupported_type'}),
      }
    }

    // MULTIPLE RECIPIENTS
    const recipients = (process.env.ALERT_RECIPIENT_PHONES || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)

    if (!recipients.length) {
      console.warn('No ALERT_RECIPIENT_PHONES configured')
      return {
        statusCode: 200,
        body: JSON.stringify({ok: true, skipped: 'no_recipients'}),
      }
    }

    const results = []

    for (const phone of recipients) {
      const response = await client.messages.create({
        body: messageText,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      })

      results.push({to: phone, sid: response.sid})
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ok: true, sent: results}),
    }
  } catch (error) {
    console.error('Twilio SMS Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({error: 'SMS sending failed'}),
    }
  }
}
