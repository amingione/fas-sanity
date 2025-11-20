import type {Handler} from '@netlify/functions'
import {Resend} from 'resend'
import {buildVendorEmail, type VendorEmailTemplateInput} from '../lib/emailTemplates/vendorEmails'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const resendApiKey = process.env.RESEND_API_KEY
const resend = resendApiKey ? new Resend(resendApiKey) : null

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: corsHeaders}
  }

  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, headers: corsHeaders, body: JSON.stringify({error: 'Method not allowed'})}
  }

  if (!resend) {
    return {statusCode: 500, headers: corsHeaders, body: JSON.stringify({error: 'Missing RESEND_API_KEY'})}
  }

  try {
    const payload = event.body ? JSON.parse(event.body) : {}
    const to = typeof payload.to === 'string' ? payload.to.trim() : ''
    const template = payload.template
    const data = payload.data || {}

    if (!to) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Recipient email required'})}
    }
    if (!template) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Template is required'})}
    }

    if (!['welcome', 'rejection', 'quote', 'order'].includes(template)) {
      return {statusCode: 400, headers: corsHeaders, body: JSON.stringify({error: 'Invalid template'})}
    }

    const emailConfig = buildVendorEmail({template, data} as VendorEmailTemplateInput)

    await resend.emails.send({
      from: 'FAS Motorsports <support@updates.fasmotorsports.com>',
      to,
      subject: emailConfig.subject,
      html: emailConfig.html,
    })

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({success: true}),
    }
  } catch (error) {
    console.error('sendVendorEmail failed', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {statusCode: 500, headers: corsHeaders, body: JSON.stringify({error: message})}
  }
}

export {handler}
