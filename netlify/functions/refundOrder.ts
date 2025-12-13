import type {Handler} from '@netlify/functions'
import Stripe from 'stripe'
import {Resend} from 'resend'
import {sanityClient} from '../lib/sanityClient'
import {easypostRequest} from '../lib/easypostClient'

type OrderDoc = {
  _id: string
  orderNumber?: string | null
  status?: string | null
  paymentIntentId?: string | null
  stripePaymentIntentId?: string | null
  customerEmail?: string | null
  easyPostShipmentId?: string | null
  easypostShipmentId?: string | null
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || ''
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20' as Stripe.StripeConfig['apiVersion'],
    })
  : null

const resendApiKey = process.env.RESEND_API_KEY || ''
const resendFrom =
  process.env.RESEND_FROM || 'F.A.S. Motorsports <noreply@updates.fasmotorsports.com>'
const resendClient = resendApiKey ? new Resend(resendApiKey) : null

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:3333,http://localhost:8888')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const pickOrigin = (origin?: string) => {
  if (!origin) return DEFAULT_ORIGINS[0] || '*'
  if (DEFAULT_ORIGINS.includes(origin)) return origin
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return DEFAULT_ORIGINS[0] || origin
}

const buildCors = (origin?: string) => ({
  'Access-Control-Allow-Origin': pickOrigin(origin),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
})

const buildRefundEmail = (order: OrderDoc) => {
  return `
    <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
      <h2 style="margin:0 0 12px;">Refund processed for ${order.orderNumber || 'your order'}</h2>
      <p style="margin:0 0 12px;">We've issued a refund and cancelled any outstanding shipments.</p>
      <p style="margin:0 0 12px;">Please allow 5-10 business days for your bank to post the funds.</p>
      <p style="margin:20px 0 0;color:#4b5563;">Need help? Reply to this email.</p>
    </div>
  `
}

async function refundShipment(shipmentId?: string | null) {
  if (!shipmentId) return
  try {
    await easypostRequest('POST', `/shipments/${shipmentId}/refund`)
  } catch (error) {
    console.warn('refundOrder: EasyPost refund failed', error)
  }
}

export const handler: Handler = async (event) => {
  const cors = buildCors(event.headers?.origin || event.headers?.Origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: cors, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  let payload: {orderId?: string}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON'}),
    }
  }

  const orderId = (payload.orderId || '').trim()
  if (!orderId) {
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'orderId is required'}),
    }
  }

  try {
    const order = await sanityClient.fetch<OrderDoc | null>(
      `*[_type == "order" && _id == $id][0]{
        _id,
        orderNumber,
        status,
        paymentIntentId,
        stripePaymentIntentId,
        customerEmail,
        easyPostShipmentId,
        easypostShipmentId
      }`,
      {id: orderId},
    )

    if (!order) {
      return {
        statusCode: 404,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Order not found'}),
      }
    }

    const paymentIntentId = order.paymentIntentId || order.stripePaymentIntentId
    if (!paymentIntentId) {
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Order is missing payment intent'}),
      }
    }

    if ((order.status || '').toLowerCase() === 'refunded') {
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Order already refunded'}),
      }
    }

    if (!stripe) {
      throw new Error('Stripe is not configured')
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
    })
    await refundShipment(order.easyPostShipmentId || order.easypostShipmentId)

    await sanityClient
      .patch(order._id)
      .set({
        status: 'refunded',
        paymentStatus: 'refunded',
        amountRefunded:
          typeof refund.amount === 'number' ? Number((refund.amount / 100).toFixed(2)) : undefined,
        lastRefundId: refund.id,
        lastRefundReason: refund.reason || 'requested_by_customer',
        lastRefundStatus: refund.status || 'succeeded',
        lastRefundedAt:
          typeof refund.created === 'number'
            ? new Date(refund.created * 1000).toISOString()
            : new Date().toISOString(),
        stripeLastSyncedAt: new Date().toISOString(),
      })
      .commit({autoGenerateArrayKeys: true})

    if (resendClient && order.customerEmail) {
      try {
        await resendClient.emails.send({
          from: resendFrom,
          to: order.customerEmail,
          subject: `Refund processed for ${order.orderNumber || 'your order'}`,
          html: buildRefundEmail(order),
        })
      } catch (emailError) {
        console.warn('refundOrder: failed to send refund email', emailError)
      }
    }

    return {
      statusCode: 200,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({ok: true, orderId: order._id}),
    }
  } catch (error: any) {
    console.error('refundOrder failed', error)
    return {
      statusCode: 500,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: error?.message || 'Unable to refund order'}),
    }
  }
}

export default handler
