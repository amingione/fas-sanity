import { Handler } from '@netlify/functions'
import { Resend } from 'resend'
import { createClient } from '@sanity/client'

const resend = new Resend(process.env.RESEND_API_KEY)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false
})

const handler: Handler = async (event) => {
  let email = ''
  let invoiceId = ''
  try {
    const payload = JSON.parse(event.body || '{}')
    email = String(payload.email || '').trim()
    invoiceId = String(payload.invoiceId || '').trim()
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid JSON' })
    }
  }

  if (!email || !invoiceId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing email or invoiceId' })
    }
  }

  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid email format' })
    }
  }

  try {
    const invoice = await sanity.fetch(`*[_type == "invoice" && _id == $id][0]{
      quote->{customer->},
      quote,
      trackingUrl,
      labelUrl,
      total
    }`, { id: invoiceId })

    if (!invoice) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Invoice not found' })
      }
    }

    const customerName = invoice?.quote?.customer?.fullName || 'Customer'

    const html = `
      <div style="font-family: sans-serif; color: #333;">
        <h2 style="color: #000;">Your Invoice from FAS Motorsports</h2>
        <p>Hello ${customerName},</p>
        <p>Thank you for your order. Your invoice total is <strong>$${invoice.total.toFixed(2)}</strong>.</p>
        <p>You can track your shipment <a href="${invoice.trackingUrl}" target="_blank">here</a>.</p>
        <p>Or download your shipping label <a href="${invoice.labelUrl}" target="_blank">here</a>.</p>
        <p>Please reach out if you have any questions!</p>
        <br/>
        <p>— FAS Motorsports</p>
      </div>
    `

    await resend.emails.send({
      from: 'FAS Motorsports <billing@updates.fasmotorsports.com>',
      to: email,
      subject: 'Your Invoice & Tracking Info',
      html
    })

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Invoice email sent successfully!' })
    }
  } catch (err: any) {
    console.error('Failed to send invoice email:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Email send failed.', error: err.message })
    }
  }
}

export { handler }
