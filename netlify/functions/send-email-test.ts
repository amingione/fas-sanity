import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {logMissingResendApiKey, resolveResendApiKey} from '../../shared/resendEnv'
import {renderCampaignHtml, htmlToText} from '../lib/email/renderCampaign'
import {getMissingResendFields} from '../lib/resendValidation'

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID,
  dataset: process.env.SANITY_STUDIO_DATASET,
  apiVersion: '2024-01-01',
  token:
    process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const resendApiKey = resolveResendApiKey()
const resend = resendApiKey ? new Resend(resendApiKey) : null

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  if (!resend) {
    logMissingResendApiKey('send-email-test')
    return {statusCode: 400, body: JSON.stringify({error: 'RESEND_API_KEY missing'})}
  }

  try {
    const {campaignId} = JSON.parse(event.body || '{}')
    if (!campaignId) {
      return {statusCode: 400, body: JSON.stringify({error: 'campaignId is required'})}
    }

    const campaign = await sanity.fetch<{
      _id: string
      subject: string
      previewText?: string
      fromName?: string
      fromEmail?: string
      replyTo?: string
      testEmail?: string
      content?: any[]
      ctaButton?: {text?: string; url?: string; color?: string}
      trackingSlug?: {current?: string} | string
    }>(
      `*[_type == "emailCampaign" && _id == $id][0]{
        _id,
        subject,
        previewText,
        fromName,
        fromEmail,
        replyTo,
        testEmail,
        content,
        ctaButton,
        trackingSlug
      }`,
      {id: campaignId},
    )

    if (!campaign) {
      return {statusCode: 404, body: JSON.stringify({error: 'Campaign not found'})}
    }

    if (!campaign.testEmail) {
      return {statusCode: 400, body: JSON.stringify({error: 'testEmail is not set'})}
    }

    if (!campaign.content || campaign.content.length === 0) {
      return {statusCode: 400, body: JSON.stringify({error: 'Campaign content is empty'})}
    }

    const fromEmail = campaign.fromEmail || 'orders@fasmotorsports.com'
    const fromName = campaign.fromName || 'FAS Motorsports'
    const from = `${fromName} <${fromEmail}>`
    const to = campaign.testEmail.trim()

    const html = renderCampaignHtml(
      {
        subject: campaign.subject,
        content: campaign.content,
        ctaButton: campaign.ctaButton,
        trackingSlug: (campaign.trackingSlug as any)?.current || (campaign.trackingSlug as string),
      },
      {
        unsubscribeUrl: `${process.env.PUBLIC_SITE_URL || 'https://fasmotorsports.com'}/unsubscribe`,
      },
    )
    const text = htmlToText(html)
    const missing = getMissingResendFields({to, from, subject: campaign.subject})
    if (missing.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: `Missing email fields: ${missing.join(', ')}`}),
      }
    }

    const result = await resend.emails.send({
      from,
      to,
      subject: campaign.subject,
      html,
      text,
      replyTo: campaign.replyTo || undefined,
      headers: campaign.previewText ? {'X-Entity-Ref-ID': campaign.previewText} : undefined,
    })

    if (result.error) {
      throw new Error(result.error.message)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({success: true, message: `Test email sent to ${to}`}),
    }
  } catch (err: any) {
    console.error('send-email-test failed', err)
    return {
      statusCode: 500,
      body: JSON.stringify({error: err?.message || 'Failed to send test email'}),
    }
  }
}

export {handler}
