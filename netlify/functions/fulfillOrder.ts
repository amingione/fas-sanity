import type {Handler} from '@netlify/functions'
import {randomUUID} from 'crypto'
import {Resend} from 'resend'
import {sanityClient} from '../lib/sanityClient'
import {
  getEasyPostClient,
  resolveDimensions,
  resolveWeight,
} from '../lib/easypostClient'
import {getEasyPostFromAddress} from '../lib/ship-from'

type OrderCartItem = {
  name?: string | null
  quantity?: number | null
}

type OrderDoc = {
  _id: string
  orderNumber?: string | null
  status?: string | null
  customerEmail?: string | null
  shippingAddress?: {
    name?: string | null
    phone?: string | null
    email?: string | null
    addressLine1?: string | null
    addressLine2?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
    country?: string | null
  } | null
  cart?: OrderCartItem[] | null
  packageDimensions?: Record<string, unknown> | null
  dimensions?: Record<string, unknown> | null
  weight?: Record<string, unknown> | number | string | null
}

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

const buildCorsHeaders = (origin?: string) => ({
  'Access-Control-Allow-Origin': pickOrigin(origin),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
})

const resendApiKey = process.env.RESEND_API_KEY || ''
const resendFrom =
  process.env.RESEND_FROM || 'F.A.S. Motorsports <noreply@updates.fasmotorsports.com>'
const resendClient = resendApiKey ? new Resend(resendApiKey) : null

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(amount)

function buildParcel(order: OrderDoc) {
  const dimensions = resolveDimensions(order.packageDimensions ?? order.dimensions, {
    length: 10,
    width: 8,
    height: 4,
  })
  const weight = resolveWeight(order.weight, {value: 1, unit: 'pound'})
  return {
    length: dimensions.length,
    width: dimensions.width,
    height: dimensions.height,
    weight: Number(weight.ounces.toFixed(2)),
  }
}

function normalizeAddress(address?: OrderDoc['shippingAddress']) {
  if (!address) return null
  const {name, phone, email, addressLine1, addressLine2, city, state, postalCode, country} = address
  if (!addressLine1 || !city || !state || !postalCode) return null
  return {
    name: name || undefined,
    street1: addressLine1,
    street2: addressLine2 || undefined,
    city,
    state,
    zip: postalCode,
    country: country || 'US',
    phone: phone || undefined,
    email: email || undefined,
  }
}

const buildTrackingEmail = (order: OrderDoc, trackingUrl?: string | null, trackingCode?: string) => {
  const items =
    order.cart
      ?.filter(Boolean)
      .map((item) => {
        const qty = typeof item?.quantity === 'number' && item.quantity > 1 ? `×${item.quantity}` : ''
        return `<li>${item?.name || 'Item'} ${qty}</li>`
      })
      .join('') || ''

  const listMarkup = items ? `<ul style="padding-left:20px;margin:12px 0;color:#111827;">${items}</ul>` : ''
  const trackingButton = trackingUrl
    ? `<p style="margin:20px 0;"><a href="${trackingUrl}" style="display:inline-block;padding:12px 20px;background:#dc2626;color:#fff;font-weight:600;text-decoration:none;border-radius:6px;" target="_blank" rel="noopener">Track your shipment</a></p>`
    : ''

  return `
    <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
      <h2 style="margin:0 0 12px;">Your order ${order.orderNumber || ''} is on the way 🚚</h2>
      <p style="margin:0 0 12px;">We've created a shipment for your order and will keep you posted as it moves.</p>
      ${trackingCode ? `<p style="margin:0 0 8px;font-weight:600;">Tracking #: ${trackingCode}</p>` : ''}
      ${trackingButton}
      ${listMarkup}
      <p style="margin:20px 0 0;color:#4b5563;">Thanks for shopping with F.A.S. Motorsports!</p>
    </div>
  `
}

export const handler: Handler = async (event) => {
  const cors = buildCorsHeaders(event.headers?.origin || event.headers?.Origin)

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
      `*[_type == "order" && _id == $orderId][0]{
        _id,
        orderNumber,
        status,
        customerEmail,
        shippingAddress,
        cart[]{name, quantity},
        packageDimensions,
        dimensions,
        weight
      }`,
      {orderId},
    )

    if (!order) {
      return {
        statusCode: 404,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Order not found'}),
      }
    }

    if (order.status && order.status !== 'paid') {
      return {
        statusCode: 409,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Only paid orders can be fulfilled'}),
      }
    }

    const toAddress = normalizeAddress(order.shippingAddress)
    if (!toAddress) {
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Shipping address is incomplete'}),
      }
    }

    const shipmentPayload = {
      to_address: toAddress,
      from_address: getEasyPostFromAddress(),
      parcel: buildParcel(order),
    }

    const easypost = getEasyPostClient()
    const shipment = await easypost.Shipment.create(shipmentPayload)
    const lowestRate = shipment.lowestRate()
    if (!lowestRate) {
      throw new Error('EasyPost did not return any purchasable rates.')
    }

    const purchased = await shipment.buy(lowestRate)
    const trackingCode =
      purchased.tracking_code || purchased.tracker?.tracking_code || shipment.tracking_code
    const trackingUrl = purchased.tracker?.public_url || null
    const labelUrl = purchased.postage_label?.label_url || null
    const timestamp = new Date().toISOString()
    const parsedRate =
      typeof lowestRate.rate === 'string'
        ? Number.parseFloat(lowestRate.rate)
        : typeof lowestRate.rate === 'number'
          ? lowestRate.rate
          : NaN
    const normalizedRate = Number.isFinite(parsedRate) ? Number(parsedRate.toFixed(2)) : undefined
    const normalizedCurrency =
      typeof lowestRate.currency === 'string' && lowestRate.currency.trim()
        ? lowestRate.currency.trim().toUpperCase()
        : 'USD'
    const shippingStatus = Object.fromEntries(
      Object.entries({
        status: 'label_created',
        carrier: lowestRate.carrier || undefined,
        service: lowestRate.service || undefined,
        trackingCode: trackingCode || undefined,
        trackingUrl: trackingUrl || undefined,
        labelUrl: labelUrl || undefined,
        cost: normalizedRate,
        currency: normalizedCurrency,
        lastEventAt: timestamp,
      }).filter(([, value]) => value !== undefined),
    )
    const logMessageParts = [
      'Label generated via EasyPost',
      lowestRate.carrier && lowestRate.service
        ? `(${lowestRate.carrier} – ${lowestRate.service})`
        : lowestRate.carrier
          ? `(${lowestRate.carrier})`
          : null,
    ].filter(Boolean)
    const shippingLogEntry = {
      _type: 'shippingLogEntry',
      _key: randomUUID(),
      status: 'label_created',
      message: logMessageParts.join(' '),
      labelUrl: labelUrl || undefined,
      trackingUrl: trackingUrl || undefined,
      trackingNumber: trackingCode || undefined,
      weight:
        typeof shipmentPayload.parcel?.weight === 'number'
          ? Number(shipmentPayload.parcel.weight)
          : undefined,
      createdAt: timestamp,
    }

    await sanityClient
      .patch(order._id)
      .set({
        status: 'fulfilled',
        shippedAt: timestamp,
        trackingNumber: trackingCode || null,
        trackingUrl: trackingUrl || null,
        shippingLabelUrl: labelUrl || null,
        easyPostShipmentId: purchased.id,
        easyPostTrackerId: purchased.tracker?.id || null,
        shippingStatus,
      })
      .set({
        'fulfillment.status': 'fulfilled',
        'fulfillment.trackingNumber': trackingCode || null,
        'fulfillment.trackingUrl': trackingUrl || null,
        'fulfillment.shippedAt': timestamp,
      })
      .setIfMissing({shippingLog: []})
      .append('shippingLog', [shippingLogEntry])
      .commit({autoGenerateArrayKeys: true})

    if (resendClient && order.customerEmail) {
      try {
        await resendClient.emails.send({
          from: resendFrom,
          to: order.customerEmail,
          subject: `Your order ${order.orderNumber || ''} has shipped`,
          html: buildTrackingEmail(order, trackingUrl, trackingCode || undefined),
        })
      } catch (emailError) {
        console.warn('fulfillOrder: failed to send tracking email', emailError)
      }
    }

    return {
      statusCode: 200,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        ok: true,
        orderId: order._id,
        trackingNumber: trackingCode || null,
        trackingUrl,
        labelUrl,
        rate: lowestRate ? `${lowestRate.carrier} ${lowestRate.service} ${formatCurrency(Number(lowestRate.rate))}` : null,
      }),
    }
  } catch (error: any) {
    console.error('fulfillOrder failed', error)
    return {
      statusCode: 500,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: error?.message || 'Unable to fulfill order'}),
    }
  }
}

export default handler
