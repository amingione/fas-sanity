import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {sendEmail} from '../../packages/sanity-config/src/utils/emailService'
import {toHTML} from '@portabletext/to-html'

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const resendAudienceId = process.env.RESEND_AUDIENCE_ID


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
    '*[_type == "customer" && emailMarketing.subscribed == true && emailMarketing.preferences.newsletter == true]',
}

function portableTextToHtml(blocks: any[]): string {
  return toHTML(blocks || [], {
    components: {
      types: {
        image: ({value}) => {
          const assetRef = value?.asset?._ref
          const imageUrl = assetRef
            ? `https://cdn.sanity.io/images/${process.env.SANITY_STUDIO_PROJECT_ID}/${process.env.SANITY_STUDIO_DATASET}/${assetRef}`
            : ''
          return `<img src="${imageUrl}" alt="${value?.alt || ''}" style="max-width: 100%; height: auto;" />`
        },
      },
      marks: {
        link: ({value, children}) => {
          return `<a href="${value?.href}" style="color: #0066cc;">${children}</a>`
        },
      },
    },
  })
}

function generateEmailHtml(campaign: any, unsubscribeUrl: string): string {
  const utmSlug = campaign.trackingSlug?.current || campaign.trackingSlug || ''
  const contentHtml = portableTextToHtml(campaign.content || [])
  const ctaButton =
    campaign.ctaButton?.text && campaign.ctaButton?.url
      ? `
      <table role="presentation" style="margin: 30px auto;">
        <tr>
          <td style="border-radius: 4px; background: #0066cc;">
            <a href="${appendCampaignUtm(
              campaign.ctaButton.url,
              utmSlug,
            )}" style="background: #0066cc; border: 15px solid #0066cc; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 4px; font-weight: bold; color: #ffffff;">
              ${campaign.ctaButton.text}
            </a>
          </td>
        </tr>
      </table>
    `
      : ''

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${campaign.subject}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; border-collapse: collapse; background: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 30px; text-align: center; background: #000000;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">FAS Motorsports</h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px; color: #333333; font-size: 16px; line-height: 1.6;">
                    ${contentHtml}
                    ${ctaButton}
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; text-align: center; background: #f8f8f8; color: #666666; font-size: 12px;">
                    <p style="margin: 0 0 10px 0;">© ${new Date().getFullYear()} FAS Motorsports. All rights reserved.</p>
                    <p style="margin: 0;">
                      <a href="${unsubscribeUrl}" style="color: #666666; text-decoration: underline;">Unsubscribe</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

const appendCampaignUtm = (url: string, slug?: string) => {
  if (!slug) return url
  const hasQuery = url.includes('?')
  const separator = hasQuery ? '&' : '?'
  const params = `utm_source=email&utm_medium=campaign&utm_campaign=${encodeURIComponent(slug)}`
  return `${url}${separator}${params}`
}

const htmlToText = (html: string) =>
  html
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

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

const syncResendContact = async (email: string, name?: string) => {
  if (!resend || !resendAudienceId) return
  const [firstName, ...rest] = (name || '').split(' ').filter(Boolean)
  try {
    await resend.contacts.create({
      email,
      firstName: firstName || undefined,
      lastName: rest.length ? rest.join(' ') : undefined,
      audienceId: resendAudienceId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.warn('sendEmailCampaign: Resend contact sync failed', message)
  }
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

    let customers: Array<{email: string; name?: string; _id: string}> = []

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

      customers = await sanity.fetch(`${query}{_id, email, name}`)
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
      const unsubscribeUrl = `${siteBase}/unsubscribe?email=${encodeURIComponent(to)}&id=${customer._id}`
      const html = generateEmailHtml(campaign, unsubscribeUrl)
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
        await syncResendContact(to, customer.name)
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
