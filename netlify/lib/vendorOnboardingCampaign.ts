import crypto from 'crypto'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {resolveResendApiKey} from '../../shared/resendEnv'
import {getMessageId} from '../../shared/messageResponse.js'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN || ''
const apiVersion = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'
const resendApiKey = resolveResendApiKey() || ''
const SITE_URL =
  process.env.SANITY_STUDIO_VENDOR_PORTAL_URL ||
  process.env.VENDOR_PORTAL_URL ||
  process.env.PUBLIC_VENDOR_PORTAL_URL ||
  process.env.SITE_URL ||
  process.env.SITE_BASE_URL ||
  process.env.PUBLIC_SITE_URL ||
  process.env.SANITY_STUDIO_SITE_URL ||
  ''
const FROM_EMAIL = process.env.RESEND_FROM || 'FAS Motorsports <noreply@updates.fasmotorsports.com>'

const resolveVendorPortalBase = (...candidates: string[]) => {
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim()
    if (!normalized) continue
    try {
      const parsed = new URL(normalized)
      if (parsed.hostname.toLowerCase() === 'fassanity.fasmotorsports.com') continue
      return parsed.origin
    } catch {
      // ignore invalid candidates
    }
  }
  return ''
}

const sanityClient =
  projectId && dataset && token
    ? createClient({projectId, dataset, apiVersion, token, useCdn: false})
    : null

const resendClient = resendApiKey ? new Resend(resendApiKey) : null

const replaceVariables = (html: string, variables: Record<string, string | undefined>) => {
  return Object.entries(variables).reduce((acc, [key, value]) => {
    if (!value) return acc
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
    return acc.replace(regex, value)
  }, html)
}

export const sendCampaignEmail = async (params: {
  vendorId: string
  campaignId: string
  emailNumber: number
  setupLink?: string
}) => {
  if (!sanityClient) throw new Error('Sanity client not configured')
  if (!resendClient) throw new Error('Resend API key missing')

  const {vendorId, campaignId, emailNumber, setupLink} = params

  const existingLog = await sanityClient.fetch<number>(
    `count(*[_type == "vendorEmailLog" && vendor._ref == $vendorId && campaign._ref == $campaignId && emailNumber == $emailNumber])`,
    {vendorId, campaignId, emailNumber},
  )
  if (existingLog > 0) {
    return {skipped: true}
  }

  const campaign = await sanityClient.fetch(
    `*[_type == "emailCampaign" && _id == $campaignId][0]{emails}`,
    {campaignId},
  )
  const email = (campaign?.emails || []).find((entry: any) => entry?.emailNumber === emailNumber)
  if (!email) throw new Error(`Email ${emailNumber} not found for campaign ${campaignId}`)

  const vendor = await sanityClient.fetch(
    `*[_type == "vendor" && _id == $vendorId][0]{companyName, portalAccess}`,
    {vendorId},
  )
  if (!vendor?.portalAccess?.email) throw new Error('Vendor email not found')

  const portalBase = resolveVendorPortalBase(SITE_URL)
  const resolvedSetupLink =
    setupLink ||
    (portalBase && vendor.portalAccess?.setupToken
      ? `${portalBase.replace(/\/$/, '')}/vendor-portal/setup?token=${vendor.portalAccess.setupToken}`
      : undefined)

  const htmlContent = replaceVariables(email.htmlContent || '', {
    companyName: vendor.companyName || 'Partner',
    setupLink: resolvedSetupLink,
  })

  const result = await resendClient.emails.send({
    from: FROM_EMAIL,
    to: vendor.portalAccess.email,
    subject: email.subject || 'Welcome to FAS Motorsports',
    html: htmlContent,
  })

  await sanityClient.create({
    _type: 'vendorEmailLog',
    vendor: {_type: 'reference', _ref: vendorId},
    campaign: {_type: 'reference', _ref: campaignId},
    emailNumber,
    subject: email.subject,
    sentAt: new Date().toISOString(),
    status: 'sent',
    resendId: getMessageId(result),
  })

  return result
}

export const triggerOnboardingCampaign = async (vendorId: string, setupToken: string) => {
  if (!sanityClient) throw new Error('Sanity client not configured')
  const campaign = await sanityClient.fetch(
    `*[_type == "emailCampaign" && campaignType == "vendor_onboarding" && active == true][0]{_id}`,
  )
  if (!campaign?._id) {
    throw new Error('Vendor onboarding campaign not found')
  }

  const campaignPortalBase = resolveVendorPortalBase(SITE_URL)
  const setupLink = campaignPortalBase
    ? `${campaignPortalBase.replace(/\/$/, '')}/vendor-portal/setup?token=${setupToken}`
    : undefined

  await sendCampaignEmail({
    vendorId,
    campaignId: campaign._id,
    emailNumber: 1,
    setupLink,
  })

  return {campaignId: campaign._id}
}

export const runOnboardingCron = async () => {
  if (!sanityClient) throw new Error('Sanity client not configured')
  const campaigns =
    (await sanityClient.fetch(
      `*[_type == "emailCampaign" && active == true && campaignType == "vendor_onboarding"]{
        _id,
        emails[]{
          emailNumber,
          delayDays,
          active
        }
      }`,
    )) || []

  let sentCount = 0
  for (const campaign of campaigns) {
    for (const email of campaign.emails || []) {
      if (!email?.active) continue
      if (email.emailNumber === 1) continue
      const targetDate = new Date(
        Date.now() - (email.delayDays || 0) * 24 * 60 * 60 * 1000,
      ).toISOString()

      const vendors =
        (await sanityClient.fetch(
          `*[_type == "vendor"
            && portalAccess.enabled == true
            && defined(portalAccess.invitedAt)
            && !defined(portalAccess.setupCompletedAt)
            && portalAccess.invitedAt < $targetDate
            && !(_id in *[_type == "vendorEmailLog" && campaign._ref == $campaignId && emailNumber == $emailNumber].vendor._ref)
          ]{_id, portalAccess}`,
          {targetDate, campaignId: campaign._id, emailNumber: email.emailNumber},
        )) || []

      const nowIso = new Date().toISOString()
      const portalBase = resolveVendorPortalBase(SITE_URL)

      for (const vendor of vendors) {
        try {
          let setupLink: string | undefined
          const existingToken = vendor.portalAccess?.setupToken as string | undefined
          const tokenExpiry = vendor.portalAccess?.setupTokenExpiry as string | undefined
          const tokenExpired = !tokenExpiry || tokenExpiry <= nowIso

          if (portalBase) {
            if (tokenExpired) {
              // Regenerate expired token so the follow-up email contains a live link
              const freshToken = crypto.randomBytes(32).toString('hex')
              const freshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
              await sanityClient
                .patch(vendor._id)
                .set({
                  'portalAccess.setupToken': freshToken,
                  'portalAccess.setupTokenExpiry': freshExpiry,
                })
                .commit()
              setupLink = `${portalBase.replace(/\/$/, '')}/vendor-portal/setup?token=${freshToken}`
            } else if (existingToken) {
              setupLink = `${portalBase.replace(/\/$/, '')}/vendor-portal/setup?token=${existingToken}`
            }
          }

          await sendCampaignEmail({
            vendorId: vendor._id,
            campaignId: campaign._id,
            emailNumber: email.emailNumber,
            setupLink,
          })
          sentCount += 1
        } catch (err) {
          console.warn('[runOnboardingCron] failed for vendor', vendor?._id, err)
        }
      }
    }
  }

  return {sentCount}
}
