import type {APIRoute} from 'astro'
import {randomUUID} from 'node:crypto'
import {createClient} from '@sanity/client'
import {buildTrackingEmailHtml, buildTrackingEmailText} from '../../../shared/email/trackingEmail'
import type {TrackingEmailOrder} from '../../../shared/email/trackingEmail'
import {isValidEmail, normalizeEmail} from '../../../netlify/lib/orderFormatting'
import {sendEmail} from '../../../packages/sanity-config/src/utils/emailService'

type SendShippingConfirmationRequest = {
  orderId?: string
  orderNumber?: string
  customerEmail?: string
  trackingNumber?: string
  trackingUrl?: string
}

type OrderForShippingEmail = TrackingEmailOrder & {
  _id: string
  customerName?: string | null
  customerEmail?: string | null
  shippingAddress?: {email?: string | null} | null
  trackingNumber?: string | null
  trackingUrl?: string | null
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token =
  process.env.SANITY_API_TOKEN
const apiVersion = process.env.SANITY_STUDIO_API_VERSION || '2024-04-10'

if (!projectId || !dataset || !token) {
  throw new Error('Missing Sanity credentials for /api/send-shipping-confirmation')
}

const sanity = createClient({
  projectId,
  dataset,
  token,
  apiVersion,
  useCdn: false,
})

const ORDER_FOR_EMAIL_QUERY = `
  coalesce(
    *[_type == "order" && _id == $draftId][0],
    *[_type == "order" && _id == $publishedId][0]
  ){
    _id,
    orderNumber,
    customerName,
    customerEmail,
    trackingNumber,
    trackingUrl,
    shippingAddress{email},
    cart[]{name, quantity}
  }
`

export const POST: APIRoute = async ({request}) => {
  let payload: SendShippingConfirmationRequest
  try {
    payload = (await request.json()) as SendShippingConfirmationRequest
  } catch {
    return jsonResponse({error: 'Invalid JSON payload'}, 400)
  }

  const rawOrderId = (payload.orderId || '').trim()
  const cleanOrderId = rawOrderId.replace(/^drafts\./, '')
  if (!cleanOrderId) {
    return jsonResponse({error: 'orderId is required'}, 400)
  }

  try {
    const order = await sanity.fetch<OrderForShippingEmail | null>(ORDER_FOR_EMAIL_QUERY, {
      publishedId: cleanOrderId,
      draftId: `drafts.${cleanOrderId}`,
    })
    if (!order?._id) {
      return jsonResponse({error: 'Order not found'}, 404)
    }

    const trackingNumber =
      (payload.trackingNumber || order.trackingNumber || '').toString().trim()
    if (!trackingNumber) {
      return jsonResponse({error: 'Tracking number is required'}, 400)
    }
    const trackingUrl =
      (payload.trackingUrl || order.trackingUrl || '').toString().trim() || null

    const recipient = resolveRecipient(payload.customerEmail, order)
    if (!recipient) {
      return jsonResponse({error: 'Customer email is missing or invalid'}, 400)
    }

    const subject = order.orderNumber
      ? `Your order ${order.orderNumber} has shipped`
      : 'Your order has shipped'
    const emailOptions = {trackingCode: trackingNumber, trackingUrl}
    const html = buildTrackingEmailHtml(order, emailOptions)
    const text = buildTrackingEmailText(order, emailOptions)
    const emailLogId = await createEmailLog(cleanOrderId, recipient, subject)

    try {
      const result = await sendEmail({
        to: recipient,
        subject,
        html,
        text,
        emailLogId: emailLogId || undefined,
      })
      if (emailLogId) {
        await updateEmailLog(emailLogId, {
          status: 'sent',
          sentAt: new Date().toISOString(),
          emailServiceId: result.id,
        })
      }
      await appendShippingLog(cleanOrderId, {
        status: 'notified',
        message: `Shipping confirmation emailed to ${recipient}`,
        trackingNumber,
        trackingUrl: trackingUrl || undefined,
      })
      return jsonResponse({success: true})
    } catch (err: any) {
      if (emailLogId) {
        await updateEmailLog(emailLogId, {
          status: 'failed',
          error: err?.message || 'Unable to send email',
        })
      }
      console.error('send-shipping-confirmation: email send failed', err)
      return jsonResponse({error: err?.message || 'Unable to send email'}, 500)
    }
  } catch (error: any) {
    console.error('send-shipping-confirmation error', error)
    return jsonResponse(
      {error: error?.message || 'Failed to send shipping confirmation'},
      typeof error?.statusCode === 'number' ? error.statusCode : 500,
    )
  }
}

const resolveRecipient = (overrideEmail: string | undefined, order: OrderForShippingEmail) => {
  const candidates = [
    overrideEmail,
    order.customerEmail,
    order.shippingAddress?.email,
  ].map((value) => normalizeEmail(value))
  for (const candidate of candidates) {
    if (isValidEmail(candidate)) return candidate
  }
  return null
}

const createEmailLog = async (orderId: string, to: string, subject: string) => {
  try {
    const doc = await sanity.create(
      {
        _type: 'emailLog',
        to,
        subject,
        status: 'queued',
        order: {_type: 'reference', _ref: orderId},
        contextKey: `order:${orderId}:shipping_confirmation`,
      },
      {autoGenerateArrayKeys: true},
    )
    return doc?._id || null
  } catch (err) {
    console.warn('send-shipping-confirmation: failed to create email log', err)
    return null
  }
}

const updateEmailLog = async (emailLogId: string, patch: Record<string, unknown>) => {
  try {
    await sanity.patch(emailLogId).set(patch).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('send-shipping-confirmation: failed to update email log', err)
  }
}

const appendShippingLog = async (
  orderId: string,
  entry: {
    status: string
    message: string
    trackingNumber?: string
    trackingUrl?: string
  },
) => {
  try {
    await sanity
      .patch(orderId)
      .setIfMissing({shippingLog: []})
      .append('shippingLog', [
        {
          _type: 'shippingLogEntry',
          _key: randomUUID(),
          status: entry.status,
          message: entry.message,
          trackingNumber: entry.trackingNumber,
          trackingUrl: entry.trackingUrl,
          createdAt: new Date().toISOString(),
        },
      ])
      .commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('send-shipping-confirmation: failed to append shipping log', err)
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}
