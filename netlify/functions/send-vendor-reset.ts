import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {logMissingResendApiKey, resolveResendApiKey} from '../../shared/resendEnv'
import {getMissingResendFields} from '../lib/resendValidation'
import {markEmailLogFailed, markEmailLogSent, reserveEmailLog} from '../lib/emailIdempotency'
import {getMessageId} from '../../shared/messageResponse.js'

/**
 * send-vendor-reset
 *
 * Sends a password-reset email to a vendor portal user.
 * Called by fas-cms-fresh after issueResetToken() stores the token hash in Sanity.
 *
 * POST body:
 *   vendorId   – Sanity vendor doc _id (used to hydrate companyName / contactName)
 *   email      – recipient email (required)
 *   resetLink  – full URL to /vendor-portal/reset-password?token=<jwt>
 *   companyName (optional, hydrated from Sanity if missing)
 *   contactName (optional, hydrated from Sanity if missing)
 */

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID
const DATASET = process.env.SANITY_STUDIO_DATASET
const API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'
const TOKEN = process.env.SANITY_API_TOKEN || ''

const resendApiKey = resolveResendApiKey() || ''
const resendFrom =
  process.env.RESEND_VENDOR_FROM ||
  process.env.RESEND_FROM ||
  'FAS Motorsports <support@updates.fasmotorsports.com>'
const resendClient = resendApiKey ? new Resend(resendApiKey) : null

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

type VendorDoc = {
  companyName?: string
  displayName?: string
  primaryContact?: {name?: string; email?: string}
  portalAccess?: {email?: string}
}

const VENDOR_QUERY = `*[_type == "vendor" && _id == $id][0]{
  companyName,
  displayName,
  primaryContact,
  portalAccess{ email }
}`

const fetchVendor = async (id: string): Promise<VendorDoc | null> => {
  if (!sanity || !id) return null
  try {
    return await sanity.fetch<VendorDoc | null>(VENDOR_QUERY, {id})
  } catch (err) {
    console.warn('[send-vendor-reset] failed to fetch vendor', err)
    return null
  }
}

const buildResetHtml = ({
  companyName,
  contactName,
  resetLink,
}: {
  companyName: string
  contactName?: string
  resetLink: string
}) => {
  const greeting = contactName ? `Hi ${contactName},` : 'Hello,'
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:16px 0;">
      <div style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e2e8f0;">
        <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:.08em;">FAS Motorsports Vendor Portal</p>
        <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">Reset your password</h1>
        <p style="margin:0 0 16px;color:#0f172a;">${greeting}</p>
        <p style="margin:0 0 16px;color:#334155;">
          We received a request to reset the password for the vendor portal account associated with
          <strong>${companyName}</strong>. Click the button below to choose a new password.
        </p>
        <p style="margin:24px 0;">
          <a href="${resetLink}"
            style="padding:12px 20px;background:#111827;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">
            Reset password
          </a>
        </p>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;">
          This link expires in <strong>1 hour</strong>. If you didn't request a password reset,
          you can safely ignore this email — your password won't change.
        </p>
        <p style="margin:0 0 8px;color:#64748b;font-size:14px;">
          If the button above doesn't work, paste this URL into your browser:
        </p>
        <p style="margin:0;color:#2563eb;font-size:13px;word-break:break-all;">
          <a href="${resetLink}" style="color:#2563eb;">${resetLink}</a>
        </p>
      </div>
    </div>
  `
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
    logMissingResendApiKey('send-vendor-reset')
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
  let email: string = String(payload.email || '').trim()
  const resetLink: string = String(payload.resetLink || '').trim()
  let companyName: string = String(payload.companyName || '').trim()
  let contactName: string = String(payload.contactName || '').trim()

  if (!resetLink) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'resetLink is required'}),
    }
  }

  // Hydrate missing fields from Sanity when vendorId is provided
  if ((!email || !companyName || !contactName) && vendorId) {
    const vendorDoc = await fetchVendor(vendorId)
    email =
      email ||
      vendorDoc?.portalAccess?.email ||
      vendorDoc?.primaryContact?.email ||
      ''
    companyName = companyName || vendorDoc?.companyName || vendorDoc?.displayName || ''
    contactName = contactName || vendorDoc?.primaryContact?.name || ''
  }

  if (!email) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: 'Vendor email is required'}),
    }
  }

  const subject = `Reset your FAS Motorsports vendor portal password`
  const html = buildResetHtml({
    companyName: companyName || 'your account',
    contactName: contactName || undefined,
    resetLink,
  })
  const text =
    `${contactName ? `Hi ${contactName},\n\n` : ''}` +
    `You requested a password reset for ${companyName || 'your'} FAS Motorsports vendor portal account.\n\n` +
    `Reset your password here (expires in 1 hour):\n${resetLink}\n\n` +
    `If you didn't request this, you can safely ignore this email.`

  let reservationLogId: string | undefined
  try {
    const missing = getMissingResendFields({to: email, from: resendFrom, subject})
    if (missing.length) {
      throw new Error(`Missing email fields: ${missing.join(', ')}`)
    }

    // Idempotency: key on vendorId + email to prevent duplicate sends for same request
    const contextKey = `vendor-reset:${vendorId || email}:${email.toLowerCase()}:${resetLink.slice(-16)}`
    const reservation = await reserveEmailLog({contextKey, to: email, subject})
    reservationLogId = reservation.logId

    let result: any = {error: undefined}
    if (reservation.shouldSend) {
      result = await resendClient.emails.send({
        from: resendFrom,
        to: email,
        subject,
        html,
        text,
      })
      const resendId = getMessageId(result)
      await markEmailLogSent(reservation.logId, resendId)
    }

    const errorMessage = (result as any)?.error?.message || (result as any)?.message
    if (errorMessage) {
      await markEmailLogFailed(reservation.logId, errorMessage)
      throw new Error(errorMessage)
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({success: true, to: email}),
    }
  } catch (error) {
    await markEmailLogFailed(reservationLogId, error)
    console.error('[send-vendor-reset] send failed', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({error: message}),
    }
  }
}

export {handler}
