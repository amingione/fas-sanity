import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'

const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_DATASET || 'production',
  token: process.env.SANITY_WRITE_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const resend = new Resend(process.env.RESEND_API_KEY!)

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  try {
    const {email, name, source} = JSON.parse(event.body || '{}')

    if (!email || !email.includes('@')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({error: 'Valid email is required'}),
      }
    }

    const emailLower = email.toLowerCase().trim()

    // Check if customer exists
    const existingCustomer = await sanityClient.fetch(
      `*[_type == "customer" && email == $email][0]`,
      {email: emailLower},
    )

    let customerId: string

    if (existingCustomer) {
      // Update existing customer
      await sanityClient
        .patch(existingCustomer._id)
        .set({
          emailOptIn: true,
          marketingOptIn: true,
          'emailMarketing.subscribed': true,
          'emailMarketing.subscribedAt': new Date().toISOString(),
          'emailMarketing.source': source || 'popup_modal',
          'emailMarketing.status': 'subscribed',
        })
        .commit()

      customerId = existingCustomer._id
    } else {
      // Create new customer
      const newCustomer = await sanityClient.create({
        _type: 'customer',
        email: emailLower,
        name: name || '',
        firstName: name?.split(' ')[0] || '',
        lastName: name?.split(' ').slice(1).join(' ') || '',
        roles: ['customer'],
        customerType: 'retail',
        emailOptIn: true,
        marketingOptIn: true,
        emailMarketing: {
          subscribed: true,
          subscribedAt: new Date().toISOString(),
          source: source || 'popup_modal',
          status: 'subscribed',
        },
      })

      customerId = newCustomer._id
    }

    // Add to Resend audience
    try {
      await resend.contacts.create({
        email: emailLower,
        firstName: name?.split(' ')[0] || '',
        lastName: name?.split(' ').slice(1).join(' ') || '',
        audienceId: process.env.RESEND_AUDIENCE_ID!,
      })
    } catch (resendError) {
      console.error('Resend error:', resendError)
      // Don't fail if Resend fails - Sanity is source of truth
    }

    // Send welcome email
    try {
      await resend.emails.send({
        from: 'FAS Motorsports <info@fasmotorsports.com>',
        to: emailLower,
        subject: 'Welcome to FAS Motorsports!',
        html: `
          <h1>Thanks for subscribing!</h1>
          <p>Hi ${name || 'there'},</p>
          <p>You're now subscribed to FAS Motorsports updates.</p>
          <p>You'll be the first to know about:</p>
          <ul>
            <li>New product launches</li>
            <li>Exclusive deals and promotions</li>
            <li>Performance tips and tricks</li>
            <li>Event announcements</li>
          </ul>
          <p>Thanks for being part of the FAS family!</p>
          <p><small>You can unsubscribe anytime by clicking the link in our emails.</small></p>
        `,
      })
    } catch (emailError) {
      console.error('Welcome email error:', emailError)
      // Don't fail if email fails
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Successfully subscribed',
        customerId,
      }),
    }
  } catch (error) {
    console.error('Subscription error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process subscription',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}
