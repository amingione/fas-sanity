import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {resolveResendApiKey} from '../../shared/resendEnv'
import {getMissingResendFields} from '../lib/resendValidation'
import {markEmailLogFailed, markEmailLogSent, reserveEmailLog} from '../lib/emailIdempotency'
import {getMessageId} from '../../shared/messageResponse.js'

const sanityClient = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  token: process.env.SANITY_API_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const resend = new Resend(resolveResendApiKey()!)

/**
 * @deprecated This function is deprecated as of 2026-01-06 (vendor-portal-reform).
 *
 * Canonical vendor application handler is:
 * fas-cms-fresh/src/pages/api/vendor-application.ts
 *
 * This function remains for backward compatibility but should not be used for new integrations.
 */

export const handler: Handler = async (event) => {
  console.warn(
    'DEPRECATED: vendor-application.ts is deprecated. Use fas-cms-fresh/src/pages/api/vendor-application.ts instead.',
  )
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
    const data = JSON.parse(event.body || '{}')

    // Validate required fields
    const required = [
      'companyName',
      'businessType',
      'contactName',
      'contactEmail',
      'contactPhone',
      'street',
      'city',
      'state',
      'zip',
      'yearsInBusiness',
      'taxId',
      'estimatedMonthlyVolume',
    ]
    for (const field of required) {
      if (!data[field]) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({error: `${field} is required`}),
        }
      }
    }

    // Generate application number
    const applicationNumber = `APP-${Date.now().toString().slice(-6)}`

    // Create vendor application in Sanity
    const application = await sanityClient.create({
      _type: 'vendorApplication',
      applicationNumber,
      status: 'pending',
      submittedAt: new Date().toISOString(),

      // Company info
      companyName: data.companyName,
      businessType: data.businessType,
      website: data.website || null,
      yearsInBusiness: data.yearsInBusiness,
      taxId: data.taxId,

      // Contact
      primaryContact: {
        name: data.contactName,
        title: data.contactTitle,
        email: data.contactEmail.toLowerCase(),
        phone: data.contactPhone,
      },

      // Address
      businessAddress: {
        street: data.street,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: 'US',
      },

      // Business details
      estimatedMonthlyVolume: data.estimatedMonthlyVolume,
      productsInterested: data.productsInterested || null,
      currentSuppliers: data.currentSuppliers || null,
      taxExempt: data.taxExempt || false,
      additionalInfo: data.additionalInfo || null,
      referralSource: data.referralSource || null,
    })

    // Send confirmation email to applicant
    let confirmationLogId: string | undefined
    try {
      const from = process.env.RESEND_FROM || 'FAS Motorsports <info@fasmotorsports.com>'
      const subject = 'Vendor Application Received - FAS Motorsports'
      const missing = getMissingResendFields({to: data.contactEmail, from, subject})
      if (missing.length) {
        throw new Error(`Missing email fields: ${missing.join(', ')}`)
      }
      const to = data.contactEmail
      const contextKey = `vendor-application:confirmation:${applicationNumber}:${to.toLowerCase()}`
      const reservation = await reserveEmailLog({contextKey, to, subject})
      confirmationLogId = reservation.logId
      if (reservation.shouldSend) {
        const response = await resend.emails.send({
          from,
          to,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1>Application Received!</h1>
              <p>Hi ${data.contactName},</p>
              <p>Thanks for applying to become a FAS Motorsports vendor partner.</p>
              
              <div style="background: #f5f5f5; padding: 1.5rem; border-radius: 8px; margin: 2rem 0;">
                <p style="margin: 0;"><strong>Application Number:</strong> ${applicationNumber}</p>
                <p style="margin: 0.5rem 0 0 0;"><strong>Company:</strong> ${data.companyName}</p>
              </div>
              
              <h2>What's Next?</h2>
              <ol>
                <li>Our team will review your application (1-2 business days)</li>
                <li>We'll contact you to discuss pricing tiers and terms</li>
                <li>Once approved, you'll receive your vendor account credentials</li>
                <li>Start ordering at wholesale prices!</li>
              </ol>
              
              <p>If you have any questions, reply to this email or call us at <strong>(XXX) XXX-XXXX</strong>.</p>
              
              <p>Thanks,<br>The FAS Motorsports Team</p>
            </div>
          `,
        })
        const resendId = getMessageId(response)
        await markEmailLogSent(reservation.logId, resendId)
      }
    } catch (emailError) {
      await markEmailLogFailed(confirmationLogId, emailError)
      console.error('Confirmation email error:', emailError)
      // Don't fail if email fails
    }

    // Send notification to FAS team
    let notificationLogId: string | undefined
    try {
      const from =
        process.env.RESEND_FROM || 'FAS Motorsports <noreply@updates.fasmotorsports.com>'
      const subject = `New Vendor Application: ${data.companyName}`
      const missing = getMissingResendFields({to: 'sales@fasmotorsports.com', from, subject})
      if (missing.length) {
        throw new Error(`Missing email fields: ${missing.join(', ')}`)
      }
      const to = 'sales@fasmotorsports.com'
      const contextKey = `vendor-application:notify:${applicationNumber}:${to}`
      const reservation = await reserveEmailLog({contextKey, to, subject})
      notificationLogId = reservation.logId
      if (reservation.shouldSend) {
        const response = await resend.emails.send({
          from,
          to,
          subject,
          html: `
            <div style="font-family: Arial, sans-serif;">
              <h1>New Vendor Application</h1>
              <p><strong>Application Number:</strong> ${applicationNumber}</p>
              
              <h2>Company Information</h2>
              <ul>
                <li><strong>Company:</strong> ${data.companyName}</li>
                <li><strong>Type:</strong> ${data.businessType}</li>
                <li><strong>Website:</strong> ${data.website || 'N/A'}</li>
                <li><strong>Years in Business:</strong> ${data.yearsInBusiness}</li>
                <li><strong>Tax ID:</strong> ${data.taxId}</li>
                <li><strong>Tax Exempt:</strong> ${data.taxExempt ? 'Yes' : 'No'}</li>
              </ul>
              
              <h2>Contact</h2>
              <ul>
                <li><strong>Name:</strong> ${data.contactName}</li>
                <li><strong>Title:</strong> ${data.contactTitle}</li>
                <li><strong>Email:</strong> ${data.contactEmail}</li>
                <li><strong>Phone:</strong> ${data.contactPhone}</li>
              </ul>
              
              <h2>Business Details</h2>
              <ul>
                <li><strong>Estimated Monthly Volume:</strong> ${data.estimatedMonthlyVolume}</li>
                <li><strong>Products Interested:</strong> ${data.productsInterested || 'N/A'}</li>
                <li><strong>Current Suppliers:</strong> ${data.currentSuppliers || 'N/A'}</li>
                <li><strong>How They Heard:</strong> ${data.referralSource || 'N/A'}</li>
              </ul>
              
              ${
                data.additionalInfo
                  ? `
                <h2>Additional Info</h2>
                <p>${data.additionalInfo}</p>
              `
                  : ''
              }
              
              <hr style="margin: 2rem 0;">
              <p><a href="https://fasmotorsports.com/studio/desk/wholesale;vendorApplications;pending" style="background: #000; color: white; padding: 1rem 2rem; text-decoration: none; border-radius: 4px; display: inline-block;">Review in Studio →</a></p>
            </div>
          `,
        })
        const resendId = getMessageId(response)
        await markEmailLogSent(reservation.logId, resendId)
      }
    } catch (notificationError) {
      await markEmailLogFailed(notificationLogId, notificationError)
      console.error('Notification email error:', notificationError)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Application submitted successfully',
        applicationNumber,
        applicationId: application._id,
      }),
    }
  } catch (error) {
    console.error('Vendor application error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to submit application',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}
