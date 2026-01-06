// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {
  formatOrderNumberForDisplay,
  isValidEmail,
  normalizeEmail,
  resolveCustomerName,
  titleCase,
} from '../lib/orderFormatting'
import {canonicalizeTrackingNumber, validateTrackingNumber} from '../../shared/tracking'
import {consumeInventoryForItems} from '../../shared/inventory'
import {logFunctionExecution} from '../../utils/functionLogger'
import {resolveResendApiKey} from '../../shared/resendEnv'
import {getMissingResendFields} from '../lib/resendValidation'
import {markEmailLogFailed, markEmailLogSent, reserveEmailLog} from '../lib/emailIdempotency'

const configuredOrigins = [
  process.env.CORS_ALLOW,
  process.env.SANITY_STUDIO_NETLIFY_BASE,
  process.env.PUBLIC_SITE_URL,
  process.env.SITE_BASE_URL,
]
  .filter(Boolean)
  .flatMap((value) => value!.split(','))
  .map((origin) => origin.trim())
  .filter(Boolean)

const DEFAULT_ORIGINS = Array.from(
  new Set([...configuredOrigins, 'http://localhost:3333', 'http://localhost:8888']),
)

function pickOrigin(origin?: string): string {
  if (!origin) return DEFAULT_ORIGINS[0] || '*'
  if (DEFAULT_ORIGINS.includes(origin)) return origin
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return DEFAULT_ORIGINS[0] || origin
}

function jsonResponse(
  statusCode: number,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) {
  return {
    statusCode,
    headers: {...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  }
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-10-01',
  token: process.env.SANITY_API_TOKEN!,
  useCdn: false,
})

const resendApiKey = resolveResendApiKey()
const resend = resendApiKey ? new Resend(resendApiKey) : null
const resendFrom = process.env.RESEND_FROM || 'FAS Motorsports <noreply@updates.fasmotorsports.com>'

const netlifyContext = (process.env.CONTEXT || '').toLowerCase()
const nodeEnv = (process.env.NODE_ENV || '').toLowerCase()
const simulationEnabled =
  process.env.ALLOW_MANUAL_FULFILLMENT_SIMULATION === '1' &&
  (process.env.NETLIFY_DEV === 'true' ||
    ['development', 'test', 'preview'].includes(nodeEnv) ||
    (netlifyContext && netlifyContext !== 'production')) &&
  nodeEnv !== 'production'

function normalizeInput(value?: string | null): string {
  return (value ?? '').toString().trim()
}

type LogLevel = 'info' | 'warn' | 'error'

function serializeForLog(payload: Record<string, unknown>) {
  return JSON.stringify(payload, (key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      }
    }
    return value
  })
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const payload = {
    event: 'manual-fulfill-order',
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  }
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
  try {
    ;(console as any)[method](serializeForLog(payload))
  } catch {
    ;(console as any)[method](payload)
  }
}

export const handler: Handler = async (event) => {
  const originHeader = (event.headers?.origin || event.headers?.Origin || '') as string
  const corsHeaders = {
    'Access-Control-Allow-Origin': pickOrigin(originHeader),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
  }

  const startTime = Date.now()
  const metadata: Record<string, unknown> = {}

  const finalize = async (
    response: {statusCode: number; headers?: Record<string, string>; body: string},
    status: 'success' | 'error' | 'warning',
    result?: unknown,
    error?: unknown,
  ) => {
    await logFunctionExecution({
      functionName: 'manual-fulfill-order',
      status,
      duration: Date.now() - startTime,
      eventData: event,
      result,
      error,
      metadata,
    })
    return response
  }

  if (event.httpMethod === 'OPTIONS') {
    return await finalize({statusCode: 200, headers: corsHeaders, body: ''}, 'success')
  }

  if (event.httpMethod !== 'POST') {
    return await finalize(
      jsonResponse(405, corsHeaders, {success: false, message: 'Method Not Allowed'}),
      'error',
      {reason: 'method not allowed'},
    )
  }

  let payload: any
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return await finalize(
      jsonResponse(400, corsHeaders, {success: false, message: 'Invalid JSON payload'}),
      'error',
      {reason: 'invalid json'},
    )
  }

  const baseId = normalizeInput(payload?.orderId).replace(/^drafts\./, '')
  metadata.orderId = baseId
  const trackingValidation = validateTrackingNumber(payload?.trackingNumber)
  const trackingNumber = trackingValidation.canonical
  const carrierLabel = trackingValidation.carrierLabel
  const trackingUrl = trackingValidation.trackingUrl
  const forceResend = Boolean(payload?.forceResend)
  const simulate = Boolean(payload?.simulate) && simulationEnabled
  const simulateExistingTracking = Boolean(payload?.simulateExistingTracking) && simulate

  if (Boolean(payload?.simulate) && !simulationEnabled) {
    log('warn', 'manual fulfillment simulation blocked in production environment', {
      orderId: baseId,
    })
  }

  if (!baseId) {
    log('warn', 'missing orderId in request payload', {payload})
    return await finalize(
      jsonResponse(400, corsHeaders, {success: false, message: 'Missing orderId'}),
      'error',
      {reason: 'missing orderId'},
    )
  }
  if (!trackingValidation.isValid) {
    log('warn', 'invalid tracking number provided', {
      orderId: baseId,
      trackingNumber: trackingValidation.canonical || trackingValidation.normalized,
      reason: trackingValidation.reason,
    })
    return await finalize(
      jsonResponse(400, corsHeaders, {
        success: false,
        message: trackingValidation.reason || 'Invalid tracking number',
      }),
      'error',
      {reason: 'invalid tracking', carrier: trackingValidation.carrier},
    )
  }

  const draftId = `drafts.${baseId}`

  let order: any = null
  if (simulate) {
    const simulatedTracking = simulateExistingTracking ? trackingNumber : ''
    order = {
      _id: baseId,
      orderNumber: 'SIM-1001',
      status: simulateExistingTracking ? 'fulfilled' : 'processing',
      customerName: 'Simulated Customer',
      customerEmail: 'customer@example.com',
      stripeSessionId: 'cs_test_simulated',
      trackingNumber: simulatedTracking,
      manualTrackingNumber: simulatedTracking,
      trackingUrl: trackingUrl,
      fulfilledAt: simulateExistingTracking ? new Date().toISOString() : null,
      shippingAddress: {
        name: 'Simulated Customer',
        email: 'customer@example.com',
        addressLine1: '123 Test St',
        city: 'Testville',
        state: 'CA',
        postalCode: '99999',
        country: 'US',
      },
      shippingLog: simulateExistingTracking
        ? [
            {
              status: 'fulfilled_manual',
              trackingNumber,
            },
          ]
        : [],
    }
  } else {
    try {
      order = await sanity.fetch(
        `*[_type == "order" && _id in [$baseId, $draftId]] | order(_updatedAt desc)[0]{
        _id,
        orderNumber,
        status,
        customerName,
        customerEmail,
        stripeSessionId,
        trackingNumber,
        manualTrackingNumber,
        fulfilledAt,
        shippingAddress,
        shippingLog[]{status, trackingNumber},
        cart[]{quantity, name, productRef{_ref}}
      }`,
        {baseId, draftId},
      )
    } catch (err) {
      log('error', 'sanity fetch failed', {orderId: baseId, error: err})
      return await finalize(
        jsonResponse(500, corsHeaders, {success: false, message: 'Unable to load order'}),
        'error',
        {reason: 'fetch failed'},
        err,
      )
    }
  }

  if (!order) {
    log('warn', 'requested order was not found', {orderId: baseId})
    return await finalize(
      jsonResponse(404, corsHeaders, {success: false, message: 'Order not found'}),
      'error',
      {reason: 'order not found'},
    )
  }

  const existingTracking = canonicalizeTrackingNumber(order.trackingNumber)
  const alreadyLogged = Array.isArray(order.shippingLog)
    ? order.shippingLog.some(
        (entry: any) =>
          canonicalizeTrackingNumber(entry?.trackingNumber) === trackingNumber &&
          (entry?.status || '').toString() === 'fulfilled_manual',
      )
    : false

  const nowIso = new Date().toISOString()
  const setPayload: Record<string, unknown> = {
    trackingNumber,
    manualTrackingNumber: trackingNumber,
    status: 'fulfilled',
    fulfilledAt: nowIso,
  }

  if (trackingUrl) {
    setPayload.trackingUrl = trackingUrl
  }

  const logEntry = {
    _type: 'shippingLogEntry',
    status: 'fulfilled_manual',
    message:
      existingTracking === trackingNumber
        ? 'Manual tracking email resent'
        : 'Manual tracking number saved',
    trackingNumber,
    ...(trackingUrl ? {trackingUrl} : {}),
    createdAt: nowIso,
  }

  if (!simulate) {
    const patchTargets = [baseId, draftId]
    for (const targetId of patchTargets) {
      if (!targetId) continue
      try {
        let patch = sanity.patch(targetId).set(setPayload)
        if (!alreadyLogged) {
          patch = patch.setIfMissing({shippingLog: []}).append('shippingLog', [logEntry])
        }
        await patch.commit({autoGenerateArrayKeys: true})
      } catch (err: any) {
        const statusCode = err?.statusCode || err?.response?.statusCode
        if (statusCode === 404) {
          continue
        }
        log('error', 'sanity patch failed', {targetId, orderId: baseId, error: err})
        return await finalize(
          jsonResponse(500, corsHeaders, {success: false, message: 'Failed to update order'}),
          'error',
          {reason: 'patch failed', targetId},
          err,
        )
      }
    }
    try {
      if (order.cart?.length) {
        await consumeInventoryForItems({
          client: sanity,
          items: order.cart
            .filter((item: any) => item?.productRef?._ref)
            .map((item: any) => ({
              productRef: item.productRef,
              quantity: item.quantity,
              name: item.name,
            })),
          type: 'sold',
          referenceDocId: baseId,
          referenceLabel: order.orderNumber,
          createdBy: 'manual-fulfill-order',
        })
      }
    } catch (error) {
      log('error', 'inventory deduction failed', {orderId: baseId, error})
    }
  } else {
    log('info', 'simulation: skipping sanity patch', {orderId: baseId})
  }

  const displayOrderNumber =
    formatOrderNumberForDisplay({
      orderNumber: order.orderNumber,
      stripeSessionId: order.stripeSessionId,
      fallbackId: baseId,
    }) ||
    order.orderNumber ||
    baseId

  const statusLabel = titleCase('fulfilled')

  const customerName = resolveCustomerName(order)
  const greetingLine = customerName ? `Hi ${customerName},` : 'Hi there,'

  const trackingButtonHtml = trackingUrl
    ? `<p style="margin:16px 0 0;"><a href="${trackingUrl}" style="display:inline-block;padding:12px 18px;background:#dc2626;color:#ffffff;font-weight:600;text-decoration:none;border-radius:6px;" target="_blank" rel="noopener">Track your package</a></p>`
    : ''

  const htmlBody = `
    <div style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0f172a;color:#ffffff;padding:24px 28px;">
            <h1 style="margin:0;font-size:22px;font-weight:700;">Order <span style="color:#f97316;">#${displayOrderNumber}</span> is on the way</h1>
            <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">We just shipped your order.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;color:#111827;">
            <p style="margin:0 0 16px;font-size:15px;">${greetingLine} your order has been fulfilled and is now with the carrier.</p>
            <div style="margin:0 0 18px;padding:16px 20px;border:1px solid #e4e4e7;border-radius:12px;background:#f9fafb;">
              <p style="margin:0;font-size:13px;color:#52525b;">Order status</p>
              <p style="margin:6px 0 12px;font-size:18px;font-weight:600;color:#111827;">${statusLabel}</p>
              <p style="margin:0;font-size:13px;color:#52525b;">Tracking number</p>
              <p style="margin:6px 0 0;font-size:18px;font-weight:600;color:#111827;">${trackingNumber}</p>
              ${trackingButtonHtml}
            </div>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Need anything? Reply to this email or call us at (812) 200-9012.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;border-top:1px solid #e4e4e7;background:#f4f4f5;font-size:12px;color:#6b7280;text-align:center;">
            F.A.S. Motorsports LLC • 6161 Riverside Dr • Punta Gorda, FL 33982
          </td>
        </tr>
      </table>
    </div>
  `

  const textBody = [
    `${greetingLine}`,
    '',
    `Order #${displayOrderNumber} is now ${statusLabel}.`,
    `Tracking number: ${trackingNumber}`,
    trackingUrl ? `Track here: ${trackingUrl}` : '',
    '',
    'Need anything? Reply to this email or call us at (812) 200-9012.',
  ].join('\n')

  const emailCandidates = [order.customerEmail, order.shippingAddress?.email]
    .map((candidate) => normalizeEmail(candidate))
    .filter((candidate) => candidate.length > 0)
  const emailTo = emailCandidates.find((candidate) => isValidEmail(candidate))
  const invalidEmails = emailCandidates.filter((candidate) => !isValidEmail(candidate))
  let emailSent = false
  let emailMessage = ''
  let emailSkipped = false
  let resendResponseId: string | null = null
  let emailDeliveryState: 'queued' | 'skipped' | 'failed' = 'skipped'

  const manualTrackingMatchesExisting =
    canonicalizeTrackingNumber(order.manualTrackingNumber) === trackingNumber
  const shouldSendEmail =
    forceResend ||
    (!alreadyLogged && !manualTrackingMatchesExisting) ||
    existingTracking !== trackingNumber

  if (!shouldSendEmail) {
    emailSkipped = true
    emailMessage = 'Tracking number already notified; email skipped.'
    emailDeliveryState = 'skipped'
  } else if (simulate) {
    emailSent = Boolean(emailTo)
    emailSkipped = !emailSent
    emailMessage = emailSent
      ? `Simulation: shipping update would be sent to ${emailTo}.`
      : 'Simulation: customer email missing or invalid; no message would be sent.'
    emailDeliveryState = emailSent ? 'queued' : 'skipped'
  } else if (resend && emailTo) {
    let reservationLogId: string | undefined
    try {
      const emailTimestamp = new Date().toISOString()
      const subject = `Your order ${displayOrderNumber} has shipped`
      const missing = getMissingResendFields({
        to: emailTo,
        from: resendFrom,
        subject,
      })
      if (missing.length) {
        log('warn', 'missing Resend fields', {orderId: baseId, missing})
        throw new Error(`Missing email fields: ${missing.join(', ')}`)
      }
      const contextKey = `manual-fulfill:${baseId}:${trackingNumber}:${forceResend ? 'force' : 'normal'}`
      const reservation = await reserveEmailLog({
        contextKey,
        to: emailTo,
        subject,
        orderId: baseId,
      })
      reservationLogId = reservation.logId
      if (reservation.shouldSend) {
        const sendResult: any = await resend.emails.send({
          from: resendFrom,
          to: emailTo,
          subject,
          html: htmlBody,
          text: textBody,
        })
        emailSent = true
        emailMessage = `Shipping update sent to ${emailTo}.`
        emailDeliveryState = 'queued'
        resendResponseId = sendResult?.data?.id || sendResult?.id || null
        await markEmailLogSent(reservation.logId, resendResponseId)
      } else {
        emailSent = false
        emailMessage = `Shipping update already sent to ${emailTo}.`
        emailDeliveryState = 'skipped'
      }
      log('info', 'resend email queued', {
        orderId: baseId,
        trackingNumber,
        carrier: trackingValidation.carrier,
        trackingUrl,
        timestamp: emailTimestamp,
        recipient: emailTo,
        deliveryState: emailDeliveryState,
        resendId: resendResponseId,
      })
    } catch (err: any) {
      const errorTimestamp = new Date().toISOString()
      await markEmailLogFailed(reservationLogId, err)
      log('error', 'resend email send failed', {
        orderId: baseId,
        trackingNumber,
        error: err,
        recipient: emailTo,
        deliveryState: 'failed',
        timestamp: errorTimestamp,
      })
      emailMessage = err?.message ? `Email failed: ${err.message}` : 'Email failed to send.'
      emailDeliveryState = 'failed'
    }
  } else if (!emailTo && invalidEmails.length) {
    log('warn', 'invalid customer email candidates', {
      orderId: baseId,
      invalidEmails,
    })
    emailMessage = `Customer email looks invalid (${invalidEmails.join(', ')}); no update was sent.`
    emailDeliveryState = 'failed'
  } else if (!emailTo) {
    log('warn', 'missing customer email', {orderId: baseId})
    emailMessage = 'Customer email is missing; no message was sent.'
    emailDeliveryState = 'failed'
  } else {
    log('warn', 'Resend API key missing; email skipped', {orderId: baseId})
    emailMessage = 'Resend API key missing; email was not sent.'
    emailDeliveryState = 'failed'
  }

  log('info', 'manual fulfillment completed', {
    orderId: baseId,
    trackingNumber,
    carrier: trackingValidation.carrier,
    carrierLabel,
    trackingUrl,
    emailDelivery: {
      sent: emailSent,
      skipped: emailSkipped,
      message: emailMessage,
      to: emailTo || null,
      state: emailDeliveryState,
      resendId: resendResponseId,
    },
    forceResend,
    simulate,
  })
  metadata.orderNumber = displayOrderNumber
  metadata.trackingNumber = trackingNumber

  return await finalize(
    jsonResponse(200, corsHeaders, {
      success: true,
      orderId: baseId,
      orderStatus: 'fulfilled',
      trackingNumber,
      trackingCarrier: trackingValidation.carrier,
      trackingCarrierLabel: carrierLabel,
      trackingUrl,
      emailSent,
      emailMessage,
      emailSkipped,
      simulate,
      message: `Order ${displayOrderNumber} fulfilled manually.`,
    }),
    emailDeliveryState === 'failed' ? 'warning' : 'success',
    {
      orderId: baseId,
      trackingNumber,
      emailSent,
      emailSkipped,
      simulate,
    },
  )
}
