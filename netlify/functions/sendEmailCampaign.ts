import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {sendEmail} from '../../packages/sanity-config/src/utils/emailService'
import {syncContact} from '../lib/resend/contacts'
import {renderCampaignHtml, htmlToText} from '../lib/email/renderCampaign'

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const SEGMENT_QUERIES: Record<string, string> = {
  all_subscribers:
    '*[_type == "customer" && emailMarketing.subscribed == true && !defined(emailMarketing.unsubscribedAt)]',
  recent_customers:
    '*[_type == "customer" && emailMarketing.subscribed == true && count(*[_type == "order" && customerRef._ref == ^._id && createdAt > now() - 60*60*24*30]) > 0]',
  vip_customers:
    '*[_type == "customer" && emailMarketing.subscribed == true && count(*[_type == "order" && customerRef._ref == ^._id]) >= 5]',
  first_time_customers:
    '*[_type == "customer" && emailMarketing.subscribed == true && count(*[_type == "order" && customerRef._ref == ^._id]) == 1]',
  inactive_customers:
    '*[_type == "customer" && emailMarketing.subscribed == true && count(*[_type == "order" && customerRef._ref == ^._id && createdAt > now() - 60*60*24*90]) == 0]',
  newsletter_only:
    '*[_type == "customer" && emailMarketing.subscribed == true && coalesce(emailMarketing.preferences.tips, emailMarketing.preferences.promotions, emailMarketing.preferences.newProducts) == true]',
}

const createEmailLogEntry = async ({
  to,
  subject,
  campaignId,
  contextKey,
}: {
  to: string
  subject: string
  campaignId: string
  contextKey: string
}) => {
  const doc = await sanity.create(
    {
      _type: 'emailLog',
      to,
      subject,
      status: 'queued',
      campaign: {_type: 'reference', _ref: campaignId},
      contextKey,
    },
    {autoGenerateArrayKeys: true},
  )
  return doc._id
}

const updateEmailLogStatus = async (logId: string, patch: Record<string, any>) => {
  await sanity.patch(logId).set(patch).commit({autoGenerateArrayKeys: true})
}

const splitName = (name?: string) => {
  const parts = (name || '').split(' ').filter(Boolean)
  const [firstName, ...rest] = parts
  return {firstName: firstName || undefined, lastName: rest.length ? rest.join(' ') : undefined}
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  try {
    const {campaignId, isTest = false} = JSON.parse(event.body || '{}')

    if (!campaignId) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'campaignId required'}),
      }
    }

    const campaign = await sanity.fetch(
      `*[_type == "emailCampaign" && _id == $id][0]{
        _id,
        title,
        subject,
        previewText,
        fromName,
        fromEmail,
        replyTo,
        content,
        trackingSlug,
        ctaButton,
        segment,
        customQuery,
        testEmail,
        status
      }`,
      {id: campaignId},
    )

    if (!campaign) {
      return {
        statusCode: 404,
        body: JSON.stringify({error: 'Campaign not found'}),
      }
    }

    if (campaign.status === 'sent') {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'Campaign already sent'}),
      }
    }

    let customers: Array<{
      email: string
      name?: string
      firstName?: string
      lastName?: string
      _id: string
    }> = []

    if (isTest && campaign.testEmail) {
      customers = [{email: campaign.testEmail, name: 'Test User', _id: 'test'}]
    } else {
      const query =
        campaign.segment === 'custom' ? campaign.customQuery : SEGMENT_QUERIES[campaign.segment]

      if (!query) {
        return {
          statusCode: 400,
          body: JSON.stringify({error: 'Invalid segment'}),
        }
      }

      customers = await sanity.fetch(`${query}{_id, email, name, firstName, lastName}`)
    }

    if (customers.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: 'No recipients found'}),
      }
    }

    const siteBase = process.env.PUBLIC_SITE_URL || 'https://fasmotorsports.com'
    let sent = 0
    let failed = 0

    for (const customer of customers) {
      const to = (customer.email || '').trim()
      if (!to) continue
      const fullName =
        customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(' ')
      const {firstName, lastName} = splitName(fullName)
      const unsubscribeUrl = `${siteBase}/unsubscribe?email=${encodeURIComponent(to)}&id=${customer._id}`
      const html = renderCampaignHtml(
        {
          subject: campaign.subject,
          content: campaign.content,
          ctaButton: campaign.ctaButton,
          trackingSlug: campaign.trackingSlug?.current || campaign.trackingSlug,
        },
        {unsubscribeUrl},
      )
      const text = htmlToText(html)

      if (isTest) {
        try {
          await sendEmail({
            to,
            subject: campaign.subject,
            html,
            text,
            from: `${campaign.fromName} <${campaign.fromEmail}>`,
            replyTo: campaign.replyTo || campaign.fromEmail,
          })
          sent += 1
        } catch (err) {
          console.error('sendEmailCampaign: test send failed', err)
          failed += 1
        }
        continue
      }

      const contextKey = `campaign:${campaignId}:${to.toLowerCase()}`
      const existingLog = await sanity.fetch<number>(
        `count(*[_type == "emailLog" && contextKey == $key])`,
        {key: contextKey},
      )
      if (existingLog > 0) continue

      const logId = await createEmailLogEntry({
        to,
        subject: campaign.subject,
        campaignId,
        contextKey,
      })

      try {
        await syncContact({
          email: to,
          firstName,
          lastName,
          unsubscribed: false,
        })
        const result = await sendEmail({
          to,
          subject: campaign.subject,
          html,
          text,
          from: `${campaign.fromName} <${campaign.fromEmail}>`,
          replyTo: campaign.replyTo || campaign.fromEmail,
          emailLogId: logId,
        })
        await updateEmailLogStatus(logId, {
          status: 'sent',
          sentAt: new Date().toISOString(),
          emailServiceId: result.id,
        })
        sent += 1
      } catch (err: any) {
        failed += 1
        await updateEmailLogStatus(logId, {
          status: 'failed',
          error: err?.message || 'Email send failed',
        })
      }
    }

    if (!isTest) {
      const timestamp = new Date().toISOString()
      await sanity
        .patch(campaignId)
        .set({
          status: 'sent',
          sentDate: timestamp,
          sentAt: timestamp,
          recipientCount: customers.length,
          sentCount: sent,
          deliveredCount: 0,
          openedCount: 0,
          clickedCount: 0,
          unsubscribedCount: 0,
          openRate: 0,
          clickRate: 0,
          unsubscribeRate: 0,
          'stats.recipientCount': customers.length,
          'stats.sent': sent,
          'stats.failed': failed,
        })
        .commit()
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        sent,
        failed,
        total: customers.length,
        isTest,
      }),
    }
  } catch (err: any) {
    console.error('Send campaign error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to send campaign',
        message: err?.message,
      }),
    }
  }
}
