import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {syncContact} from '../lib/resend/contacts'
import {computeCustomerName, splitFullName} from '../../shared/customerName'
import {resolveResendApiKey} from '../../shared/resendEnv'

const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_DATASET || 'production',
  token: process.env.SANITY_WRITE_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const resend = new Resend(resolveResendApiKey()!)

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
    const {email, name} = JSON.parse(event.body || '{}')
    const nameParts = splitFullName(name)

    if (!email || !email.includes('@')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({error: 'Valid email is required'}),
      }
    }

    const emailLower = email.toLowerCase().trim()
    const computedName = computeCustomerName({
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: emailLower,
      fallbackName: name,
    })
    const firstName = nameParts.firstName || ''
    const lastName = nameParts.lastName || ''

    // === NEW: SAVE TO SANITY ===
    // Check if customer exists
    const existingCustomer = await sanityClient.fetch(
      `*[_type == "customer" && email == $email][0]`,
      {email: emailLower},
    )

    let customerId: string

    if (existingCustomer) {
      // Update existing customer
      const patch: Record<string, any> = {
        emailOptIn: true,
        marketingOptIn: true,
        'emailMarketing.subscribed': true,
        'emailMarketing.subscribedAt': new Date().toISOString(),
        'emailMarketing.source': 'popup_modal',
        'emailMarketing.status': 'subscribed',
      }
      if (computedName && existingCustomer?.name !== computedName) patch.name = computedName
      if (nameParts.firstName && !existingCustomer?.firstName) patch.firstName = nameParts.firstName
      if (nameParts.lastName && !existingCustomer?.lastName) patch.lastName = nameParts.lastName

      await sanityClient
        .patch(existingCustomer._id)
        .set(patch)
        .commit()

      customerId = existingCustomer._id
      console.log('Updated existing customer:', customerId)
    } else {
      // Create new customer
      const newCustomer = await sanityClient.create({
        _type: 'customer',
        email: emailLower,
        name: computedName || emailLower,
        firstName: nameParts.firstName || undefined,
        lastName: nameParts.lastName || undefined,
        roles: ['customer'],
        customerType: 'retail',
        emailOptIn: true,
        marketingOptIn: true,
        emailMarketing: {
          subscribed: true,
          subscribedAt: new Date().toISOString(),
          source: 'popup_modal',
          status: 'subscribed',
        },
      })

      customerId = newCustomer._id
      console.log('Created new customer:', customerId)
    }

    // === EXISTING: ADD TO RESEND (keep your existing code) ===
    try {
      const syncResults = await syncContact({
        email: emailLower,
        firstName,
        lastName,
        unsubscribed: false,
      })
      if (!syncResults.general.success) {
        console.warn('welcome-subscriber: General audience sync failed', syncResults.general.error)
      }
      if (!syncResults.subscribers.success) {
        console.warn(
          'welcome-subscriber: Subscribers audience sync failed',
          syncResults.subscribers.error,
        )
      }
    } catch (resendError) {
      console.error('Resend audience error:', resendError)
      // Don't fail if already exists
    }

    // === EXISTING: SEND WELCOME EMAIL (keep your existing code) ===
    await resend.emails.send({
      from: 'FAS Motorsports <info@fasmotorsports.com>',
      to: emailLower,
      subject: 'Welcome to FAS Motorsports!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #000;">Thanks for subscribing!</h1>
          <p>Hi ${name || 'there'},</p>
          <p>You're now subscribed to FAS Motorsports updates.</p>
          <p><strong>You'll be the first to know about:</strong></p>
          <ul>
            <li>🚀 New product launches</li>
            <li>💰 Exclusive deals and promotions</li>
            <li>🏁 Performance tips and tricks</li>
            <li>📅 Event announcements</li>
          </ul>
          <p>Thanks for being part of the FAS family!</p>
          <hr style="margin: 2rem 0; border: none; border-top: 1px solid #ddd;">
          <p style="font-size: 12px; color: #666;">
            You can unsubscribe anytime by clicking the link in our emails.
          </p>
        </div>
      `,
    })

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
