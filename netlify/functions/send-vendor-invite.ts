import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const DATASET = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const API_VERSION = process.env.SANITY_API_VERSION || '2024-10-01'
const TOKEN =
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_ACCESS_TOKEN ||
  ''

const resendApiKey = process.env.RESEND_API_KEY || ''
const resendFrom =
  process.env.RESEND_FROM ||
  process.env.EMAIL_FROM ||
  'FAS Motorsports <support@updates.fasmotorsports.com>'
const resendClient = resendApiKey ? new Resend(resendApiKey) : null

const DEFAULT_TEMPLATE_ID =
  process.env.VENDOR_INVITE_TEMPLATE_ID || '72dd79eb-5279-4c86-a375-cd3e3b42ef57'
const DEFAULT_PORTAL_URL =
  process.env.VENDOR_PORTAL_URL ||
  process.env.PUBLIC_VENDOR_PORTAL_URL ||
  process.env.PUBLIC_SITE_URL ||
  ''

const sanity =
  PROJECT_ID && DATASET && TOKEN
    ? createClient({
        projectId: PROJECT_ID,
        dataset: DATASET,
        apiVersion: API_VERSION,
        token: TOKEN,
        useCdn: false,
      })
    : null

type VendorTemplate = {
  _id: string
  subject?: string
  htmlBody?: string
  textBody?: string
  fromName?: string
  fromEmail?: string
  replyTo?: string
}

type VendorDoc = {
  companyName?: string
  displayName?: string
  vendorNumber?: string
  primaryContact?: {name?: string; email?: string}
  portalAccess?: {email?: string; invitedAt?: string}
  portalUsers?: Array<{email?: string; name?: string}>
}

const TEMPLATE_QUERY = `*[_type == "emailTemplate" && _id == $id][0]{
  _id,
  subject,
  htmlBody,
  textBody,
  fromName,
  fromEmail,
  replyTo
}`

const VENDOR_QUERY = `*[_type == "vendor" && _id == $id][0]{
  companyName,
  displayName,
  vendorNumber,
  primaryContact,
  portalAccess,
  portalUsers[]{email, name}
}`

const renderTemplate = (body: string, variables: Record<string, string>): string => {
  if (!body) return ''
  return body.replace(/{{\s*([\w.]+)\s*}}/g, (_, key) => variables[key] || '')
}

const buildFallbackHtml = ({
  companyName,
  contactName,
  portalUrl,
}: {
  companyName: string
  contactName?: string
  portalUrl?: string
}) => {
  const greeting = contactName ? `Hi ${contactName},` : 'Hello,'
  const portalCta = portalUrl
    ? `<p style="margin:24px 0;"><a href="${portalUrl}" style="padding:12px 20px;background:#111827;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;">Open vendor portal</a></p>`
    : ''

  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px 0;">
      <div style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
        <p style="margin:0 0 16px;color:#0f172a;">${greeting}</p>
        <p style="margin:0 0 16px;color:#334155;">You're invited to set up portal access for <strong>${companyName}</strong> with FAS Motorsports. Use the link below to complete your account and start managing wholesale orders.</p>
        ${portalCta}
        <p style="margin:0;color:#64748b;">If you weren't expecting this, you can safely ignore the message.</p>
      </div>
    </div>
  `
}

const fetchTemplate = async (id: string): Promise<VendorTemplate | null> => {
  if (!sanity || !id) return null
  try {
    return await sanity.fetch<VendorTemplate | null>(TEMPLATE_QUERY, {id})
  } catch (err) {
    console.warn('[send-vendor-invite] failed to fetch template', err)
    return null
  }
}

const fetchVendor = async (id: string): Promise<VendorDoc | null> => {
  if (!sanity || !id) return null
  try {
    return await sanity.fetch<VendorDoc | null>(VENDOR_QUERY, {id})
  } catch (err) {
    console.warn('[send-vendor-invite] failed to fetch vendor', err)
    return null
  }
}

const markInvited = async (id: string, email: string, invitedAt: string) => {
  if (!sanity || !id) return
  try {
    await sanity
      .patch(id)
      .setIfMissing({portalAccess: {}})
      .set({
        'portalAccess.email': email,
        'portalAccess.invitedAt': invitedAt,
      })
      .commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('[send-vendor-invite] failed to update vendor invite metadata', err)
  }
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: JSON_HEADERS}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!resendClient) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'RESEND_API_KEY missing'}),
    }
  }

  let payload: Record<string, any> = {}
  try {
    payload = event.body ? JSON.parse(event.body) : {}
  } catch {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Invalid JSON'}),
    }
  }

  const vendorId = (payload.vendorId || '').replace(/^drafts\./, '')
  let email: string = (payload.email || '').trim()
  let companyName: string = (payload.companyName || '').trim()
  let contactName: string = (payload.contactName || '').trim()
  let vendorNumber: string = (payload.vendorNumber || '').trim()
  const portalUrl: string =
    (payload.portalUrl || '').trim() ||
    (payload.vendorPortalUrl || '').trim() ||
    DEFAULT_PORTAL_URL ||
    ''
  const templateId: string = (payload.templateId || '').trim() || DEFAULT_TEMPLATE_ID

  const shouldHydrateVendor = (!email || !companyName || !contactName || !vendorNumber) && vendorId

  let vendorDoc: VendorDoc | null = null
  if (shouldHydrateVendor) {
    vendorDoc = await fetchVendor(vendorId)
    email =
      email ||
      vendorDoc?.portalAccess?.email ||
      vendorDoc?.primaryContact?.email ||
      vendorDoc?.portalUsers?.find((user) => user?.email)?.email ||
      ''
    companyName = companyName || vendorDoc?.companyName || vendorDoc?.displayName || ''
    contactName = contactName || vendorDoc?.primaryContact?.name || ''
    vendorNumber = vendorNumber || vendorDoc?.vendorNumber || ''
  }

  if (!email) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Vendor email is required'}),
    }
  }

  const template = await fetchTemplate(templateId)

  const variables = {
    companyName: companyName || 'your team',
    contactName: contactName || '',
    vendorPortalUrl: portalUrl || '',
    vendorNumber: vendorNumber || '',
    inviteEmail: email,
  }

  const subject =
    (template?.subject && renderTemplate(template.subject, variables)) ||
    `Vendor portal invite${companyName ? ` for ${companyName}` : ''}`
  const html =
    (template?.htmlBody && renderTemplate(template.htmlBody, variables)) ||
    buildFallbackHtml({companyName: variables.companyName, contactName, portalUrl})
  const text =
    (template?.textBody && renderTemplate(template.textBody, variables)) ||
    `${variables.companyName} has been invited to the FAS Motorsports vendor portal.${
      portalUrl ? ` Portal: ${portalUrl}` : ''
    }`

  const fromAddress =
    template?.fromEmail && template.fromName
      ? `${template.fromName} <${template.fromEmail}>`
      : template?.fromEmail
        ? template.fromEmail
        : resendFrom

  const invitedAt = new Date().toISOString()

  try {
    const result = await resendClient.emails.send({
      from: fromAddress,
      to: email,
      subject,
      html,
      text,
      reply_to: template?.replyTo,
    })

    const errorMessage = (result as any)?.error?.message || (result as any)?.message
    if (errorMessage) {
      throw new Error(errorMessage)
    }

    if (vendorId) {
      await markInvited(vendorId, email, invitedAt)
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({success: true, invitedAt, to: email, vendorId: vendorId || undefined}),
    }
  } catch (error) {
    console.error('[send-vendor-invite] send failed', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: message}),
    }
  }
}

export {handler}
