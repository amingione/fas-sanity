import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {render} from '@react-email/render'
import {Resend} from 'resend'
import {logFunctionExecution} from '../../utils/functionLogger'
import type {CartItem as EmailCartItem} from '../emails/AbandonedCartEmail'
import {logMissingResendApiKey, resolveResendApiKey} from '../../shared/resendEnv'
import {getMissingResendFields} from '../lib/resendValidation'
import {buildAbandonedCartEmail} from '../lib/abandonedCartEmail'
import {markEmailLogFailed, markEmailLogSent, reserveEmailLog} from '../lib/emailIdempotency'

type CheckoutSessionDoc = {
  _id: string
  sessionId?: string
  customerEmail?: string
  customerName?: string
  cart?: any[]
  totalAmount?: number
  stripeCheckoutUrl?: string
  expiredAt?: string
  expiresAt?: string
  createdAt?: string
}

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID
const DATASET = process.env.SANITY_STUDIO_DATASET
const API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'
const TOKEN =
  process.env.SANITY_API_TOKEN ||
  ''

const sanity =
  PROJECT_ID && DATASET
    ? createClient({
        projectId: PROJECT_ID,
        dataset: DATASET,
        apiVersion: API_VERSION,
        token: TOKEN,
        useCdn: false,
      })
    : null

const resendApiKey = resolveResendApiKey() || ''
const resendClient = resendApiKey ? new Resend(resendApiKey) : null
const ABANDONED_AUDIENCE =
  process.env.RESEND_AUDIENCE_ABANDONED_CART ||
  process.env.RESEND_AUDIENCE_ABANDONED_CART_ID ||
  ''

const jsonHeaders = {'Content-Type': 'application/json'}

const isScheduled = (headers: Record<string, string | undefined>): boolean => {
  const h = (name: string) => headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]
  return Boolean(
    h('x-nf-scheduled') ||
      h('x-nf-schedule-id') ||
      h('x-nf-schedule-name') ||
      h('x-netlify-scheduler'),
  )
}

const mapCartItems = (cart?: any[]): EmailCartItem[] => {
  if (!Array.isArray(cart)) return []
  return cart.map((item) => {
    const quantity = Number(item?.quantity ?? 1) || 1
    const unitPrice = Number(item?.price ?? item?.unitPrice ?? item?.amount ?? 0)
    const total = Number(item?.total ?? item?.lineTotal ?? unitPrice * quantity)
    const name =
      item?.name || item?.productName || item?.title || item?.sku || item?.productSlug || 'Cart item'
    return {
      name,
      quantity,
      price: Number.isFinite(unitPrice) ? unitPrice : 0,
      total: Number.isFinite(total) ? total : unitPrice * quantity,
      image: item?.image || item?.productImage,
      productUrl: item?.productUrl,
    }
  })
}

const markAbandonedCheckoutEmailStatus = async (
  sessionId?: string | null,
  patch?: Record<string, any>,
) => {
  if (!sanity || !sessionId) return
  const trimmed = sessionId.trim()
  if (!trimmed) return
  try {
    const doc = await sanity.fetch<{_id: string} | null>(
      `*[_type == "abandonedCheckout" && stripeSessionId == $sid][0]{_id}`,
      {sid: trimmed},
    )
    if (!doc?._id) return
    await sanity.patch(doc._id).set(patch || {}).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('[sendAbandonedCartEmails] failed to update abandoned checkout status', err)
  }
}

const buildTrackingUrl = (checkoutUrl?: string): string | undefined => {
  if (!checkoutUrl) return undefined
  try {
    const url = new URL(checkoutUrl)
    url.searchParams.set('utm_source', 'email')
    url.searchParams.set('utm_medium', 'abandoned_cart')
    url.searchParams.set('utm_campaign', 'recovery')
    return url.toString()
  } catch (err) {
    console.warn('sendAbandonedCartEmails: invalid checkoutUrl', checkoutUrl, err)
    return checkoutUrl
  }
}

const handler: Handler = async (event) => {
  console.log('Function sendAbandonedCartEmails invoked')
  console.log('Has RESEND_API_KEY:', Boolean(process.env.RESEND_API_KEY))
  console.log('Has SANITY_API_TOKEN:', Boolean(process.env.SANITY_API_TOKEN))

  const startTime = Date.now()
  const metadata: Record<string, unknown> = {
    audienceId: ABANDONED_AUDIENCE || undefined,
  }

  const finalize = async (
    response: {statusCode: number; headers: Record<string, string>; body: string},
    status: 'success' | 'error' | 'warning',
    result?: unknown,
    error?: unknown,
  ) => {
    await logFunctionExecution({
      functionName: 'sendAbandonedCartEmails',
      status,
      duration: Date.now() - startTime,
      eventData: event,
      result,
      error,
      metadata,
    })
    return response
  }

  try {

  if (event.httpMethod && !['GET', 'POST'].includes(event.httpMethod)) {
    return await finalize(
      {statusCode: 405, headers: jsonHeaders, body: JSON.stringify({error: 'Method not allowed'})},
      'error',
      {reason: 'method not allowed'},
    )
  }

  if (!sanity) {
    return await finalize(
      {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({error: 'Sanity client not configured'}),
      },
      'error',
    )
  }

  if (!resendClient) {
    logMissingResendApiKey('sendAbandonedCartEmails')
    return await finalize(
      {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({error: 'RESEND_API_KEY missing'}),
      },
      'error',
    )
  }

  const triggeredBySchedule = isScheduled(event.headers || {})
  const secret = process.env.CRON_SECRET
  if (secret && !triggeredBySchedule) {
    const authHeader =
      event.headers?.authorization ||
      event.headers?.Authorization ||
      (event.headers || {})['AUTHORIZATION']
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return await finalize(
        {statusCode: 401, headers: jsonHeaders, body: JSON.stringify({error: 'Unauthorized'})},
        'error',
        {reason: 'unauthorized'},
      )
    }
  }

  const now = Date.now()
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()

  const query = `*[
    _type == "checkoutSession" && status == "expired" && recoveryEmailSent != true && recovered != true
    && defined(customerEmail) && defined(stripeCheckoutUrl)
    && dateTime(coalesce(expiredAt, expiresAt, createdAt)) > dateTime($twentyFourHoursAgo)
    && dateTime(coalesce(expiredAt, expiresAt, createdAt)) < dateTime($oneHourAgo)
  ] | order(coalesce(expiredAt, expiresAt, createdAt) desc) {
    _id,
    sessionId,
    customerEmail,
    customerName,
    cart,
    totalAmount,
    stripeCheckoutUrl,
    expiredAt,
    expiresAt,
    createdAt
  }`

  const expiredCheckouts = await sanity.fetch<CheckoutSessionDoc[]>(query, {
    twentyFourHoursAgo,
    oneHourAgo,
  })

  console.log(`[sendAbandonedCartEmails] found ${expiredCheckouts.length} sessions`)

  let sent = 0
  let failed = 0

  for (const checkout of expiredCheckouts) {
    const to = (checkout.customerEmail || '').trim()
    const checkoutUrl = buildTrackingUrl(checkout.stripeCheckoutUrl || undefined)
    if (!to || !checkoutUrl) {
      failed += 1
      continue
    }

    const [firstName, ...restName] = (checkout.customerName || '').trim().split(/\s+/).filter(Boolean)
    if (ABANDONED_AUDIENCE) {
      try {
        await resendClient.contacts.create({
          audienceId: ABANDONED_AUDIENCE,
          email: to,
          firstName: firstName || undefined,
          lastName: restName.join(' ') || undefined,
          unsubscribed: false,
        })
      } catch (contactErr: any) {
        const message = contactErr?.message || ''
        if (!message.toLowerCase().includes('already exists')) {
          console.warn('[sendAbandonedCartEmails] failed to upsert contact', contactErr)
        }
      }
    }

    let reservationLogId: string | undefined
    try {
      const emailPayload = buildAbandonedCartEmail({
        customerName: checkout.customerName || 'Valued Customer',
        cart: mapCartItems(checkout.cart),
        totalAmount: Number(checkout.totalAmount || 0),
        checkoutUrl,
      })
      const missing = getMissingResendFields({
        to,
        from: emailPayload.from,
        subject: emailPayload.subject,
      })
      if (missing.length) {
        throw new Error(`Missing email fields: ${missing.join(', ')}`)
      }
      const html = await render(emailPayload.react)

      const contextKey = `abandoned-cart:${checkout.sessionId || checkout._id}:${to.toLowerCase()}`
      const reservation = await reserveEmailLog({
        contextKey,
        to,
        subject: emailPayload.subject,
      })
      reservationLogId = reservation.logId
      let resendId: string | undefined
      if (reservation.shouldSend) {
        const {data, error} = await resendClient.emails.send({
          from: emailPayload.from,
          to,
          subject: emailPayload.subject,
          html,
          tags: [
            {name: 'type', value: 'abandoned_cart'},
            {name: 'session_id', value: checkout.sessionId || checkout._id},
          ],
        })

        if (error) throw error

        resendId = data?.id
        await markEmailLogSent(reservation.logId, resendId)
      }

      await sanity
        .patch(checkout._id)
        .set({
          recoveryEmailSent: true,
          recoveryEmailSentAt: new Date().toISOString(),
          ...(resendId ? {resendEmailId: resendId} : {}),
        })
        .unset(['emailError', 'emailErrorAt'])
        .commit({autoGenerateArrayKeys: true})
      await markAbandonedCheckoutEmailStatus(checkout.sessionId, {
        recoveryEmailSent: true,
        recoveryEmailSentAt: new Date().toISOString(),
      })

      sent += 1
      console.log(
        `[sendAbandonedCartEmails] ${reservation.shouldSend ? 'sent' : 'skipped'} to ${to}`,
      )
    } catch (err: any) {
      await markEmailLogFailed(reservationLogId, err)
      failed += 1
      const message = err?.message || 'Failed to send abandoned cart email'
      console.error(`[sendAbandonedCartEmails] ${message}`, err)
      try {
        await sanity
          .patch(checkout._id)
          .set({
            emailError: message,
            emailErrorAt: new Date().toISOString(),
          })
          .commit({autoGenerateArrayKeys: true})
      } catch (patchErr) {
        console.warn('[sendAbandonedCartEmails] failed to record error in Sanity', patchErr)
      }
    }
  }

    metadata.total = expiredCheckouts.length
    metadata.sent = sent
    metadata.failed = failed
    metadata.triggeredBySchedule = triggeredBySchedule

    return await finalize(
      {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({success: true, total: expiredCheckouts.length, sent, failed}),
      },
      failed > 0 ? 'warning' : 'success',
      {sent, failed, total: expiredCheckouts.length},
    )
  } catch (error) {
    return await finalize(
      {statusCode: 500, headers: jsonHeaders, body: JSON.stringify({error: 'Internal error'})},
      'error',
      undefined,
      error,
    )
  }
}

export {handler}
