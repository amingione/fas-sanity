import {toHTML} from '@portabletext/to-html'

type CampaignContent = {
  subject: string
  content: any[]
  ctaButton?: {text?: string; url?: string; color?: string}
  trackingSlug?: string
}

type RenderOptions = {
  unsubscribeUrl?: string
}

const CTA_COLORS: Record<string, string> = {
  primary: '#0066cc',
  secondary: '#4b5563',
  success: '#16a34a',
  danger: '#dc2626',
}

const STYLE_TAG_REGEX = new RegExp('<style[\\s\\S]*?>[\\s\\S]*?</style>', 'gi')

const appendCampaignUtm = (url: string, slug?: string) => {
  if (!slug) return url
  const hasQuery = url.includes('?')
  const separator = hasQuery ? '&' : '?'
  const params = `utm_source=email&utm_medium=campaign&utm_campaign=${encodeURIComponent(slug)}`
  return `${url}${separator}${params}`
}

export const portableTextToHtml = (blocks: any[]): string => {
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

export const renderCampaignHtml = (
  campaign: CampaignContent,
  options: RenderOptions = {},
): string => {
  const contentHtml = portableTextToHtml(campaign.content || [])

  const ctaColor = CTA_COLORS[campaign.ctaButton?.color || 'primary'] || CTA_COLORS.primary
  const ctaButton =
    campaign.ctaButton?.text && campaign.ctaButton?.url
      ? `
      <table role="presentation" style="margin: 30px auto;">
        <tr>
          <td style="border-radius: 4px; background: ${ctaColor};">
            <a href="${appendCampaignUtm(
              campaign.ctaButton.url,
              campaign.trackingSlug,
            )}" style="background: ${ctaColor}; border: 15px solid ${ctaColor}; font-family: sans-serif; font-size: 16px; line-height: 1.1; text-align: center; text-decoration: none; display: block; border-radius: 4px; font-weight: bold; color: #ffffff;">
              ${campaign.ctaButton.text}
            </a>
          </td>
        </tr>
      </table>
    `
      : ''

  const unsubscribeBlock = options.unsubscribeUrl
    ? `<p style="margin: 0;">
        <a href="${options.unsubscribeUrl}" style="color: #666666; text-decoration: underline;">Unsubscribe</a>
      </p>`
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
                <tr>
                  <td style="padding: 40px 30px; text-align: center; background: #000000;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px;">FAS Motorsports</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px; color: #333333; font-size: 16px; line-height: 1.6;">
                    ${contentHtml}
                    ${ctaButton}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px; text-align: center; background: #f8f8f8; color: #666666; font-size: 12px;">
                    <p style="margin: 0 0 10px 0;">© ${new Date().getFullYear()} FAS Motorsports. All rights reserved.</p>
                    ${unsubscribeBlock}
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

export const htmlToText = (html: string) =>
  html
    .replace(STYLE_TAG_REGEX, '')
    .replace(/<script[\\s\\S]*?>[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\s{2,}/g, ' ')
    .trim()
