import type {Handler} from '@netlify/functions'
import {getEasyPostClient} from '../lib/easypostClient'
import {sanityClient} from '../lib/sanityClient'

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:3333,http://localhost:8888')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const normalizeOrigin = (origin?: string) => {
  if (!origin) return DEFAULT_ORIGINS[0] || '*'
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0] || origin
}

const buildCors = (origin?: string) => ({
  'Access-Control-Allow-Origin': normalizeOrigin(origin),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
})

type OrderDoc = {
  _id: string
  orderNumber?: string | null
  shippingLabelUrl?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  easyPostShipmentId?: string | null
  easypostShipmentId?: string | null
  shippingLabelRefunded?: boolean | null
  shippingLabelRefundedAt?: string | null
  shippingLabelRefundAmount?: number | null
  labelCost?: number | null
  shippingStatus?: {
    status?: string | null
    cost?: number | null
    currency?: string | null
  } | null
}

const sanity = sanityClient

const normalizeSanityId = (value?: string | null) =>
  typeof value === 'string' ? value.replace(/^drafts\./, '').trim() : ''

const buildOrderIdCandidates = (normalizedId: string): string[] => {
  if (!normalizedId) return []
  const set = new Set<string>()
  set.add(normalizedId)
  set.add(`drafts.${normalizedId}`)
  return Array.from(set)
}

const parseMoney = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(2))
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return Number(parsed.toFixed(2))
    }
  }
  return undefined
}

const resolveRefundAmount = (refundResult: any, order: OrderDoc): number | undefined => {
  const fromShipment = parseMoney(refundResult?.selected_rate?.rate)
  const fromStatus = parseMoney(order.shippingStatus?.cost)
  const fromLabel = parseMoney(order.labelCost)
  return fromShipment ?? fromStatus ?? fromLabel ?? undefined
}

const formatEasyPostError = (err: any): string => {
  const bodyMessage = err?.body?.error?.message
  const topMessage = err?.message
  if (bodyMessage && typeof bodyMessage === 'string') return bodyMessage
  if (topMessage && typeof topMessage === 'string') return topMessage
  return 'EasyPost refund request failed'
}

export const handler: Handler = async (event) => {
  const cors = buildCors(event.headers?.origin || event.headers?.Origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: cors, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  let payload: {orderId?: string; shipmentId?: string | null}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON payload'}),
    }
  }

  const normalizedOrderId = normalizeSanityId(payload.orderId)
  if (!normalizedOrderId) {
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'orderId is required'}),
    }
  }

  try {
    const order = await sanity.fetch<OrderDoc | null>(
      `*[_type == "order" && _id in $ids][0]{
        _id,
        orderNumber,
        shippingLabelUrl,
        trackingNumber,
        trackingUrl,
        easyPostShipmentId,
        easypostShipmentId,
        shippingLabelRefunded,
        shippingLabelRefundedAt,
        shippingLabelRefundAmount,
        labelCost,
        shippingStatus
      }`,
      {ids: buildOrderIdCandidates(normalizedOrderId)},
    )

    if (!order?._id) {
      return {
        statusCode: 404,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Order not found'}),
      }
    }

    if (!order.shippingLabelUrl) {
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Order does not have a shipping label'}),
      }
    }

    if (order.shippingLabelRefunded || order.shippingLabelRefundedAt) {
      return {
        statusCode: 200,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          ok: true,
          alreadyRefunded: true,
          refundAmount: order.shippingLabelRefundAmount,
          refundAt: order.shippingLabelRefundedAt,
        }),
      }
    }

    const shipmentId =
      (typeof payload.shipmentId === 'string' && payload.shipmentId.trim()) ||
      order.easyPostShipmentId ||
      order.easypostShipmentId ||
      ''

    if (!shipmentId) {
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'EasyPost shipment ID is required to request a refund'}),
      }
    }

    let refundResult: any
    try {
      const easypost = getEasyPostClient()
      refundResult = await easypost.Shipment.refund(shipmentId)
    } catch (err) {
      console.error('refund-shipping-label: EasyPost refund failed', err)
      return {
        statusCode: 400,
        headers: {...cors, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: formatEasyPostError(err)}),
      }
    }

    const refundStatus =
      refundResult?.refund_status ||
      refundResult?.status ||
      refundResult?.state ||
      'submitted'
    const refundAmount = resolveRefundAmount(refundResult, order)
    const now = new Date().toISOString()

    const logAmountSegment =
      typeof refundAmount === 'number' ? ` (${refundAmount.toFixed(2)})` : ''

    const logEntry = {
      _type: 'shippingLogEntry',
      status: `label_refund_${refundStatus}`,
      message: `Shipping label refund ${refundStatus}${logAmountSegment}`,
      labelUrl: order.shippingLabelUrl || undefined,
      trackingUrl: order.trackingUrl || undefined,
      trackingNumber: order.trackingNumber || undefined,
      createdAt: now,
    }

    const setPayload: Record<string, any> = {
      shippingLabelRefunded: true,
      shippingLabelRefundedAt: now,
    }

    if (refundAmount !== undefined) {
      setPayload.shippingLabelRefundAmount = refundAmount
    }

    setPayload['shippingStatus.status'] = `label_refund_${refundStatus}`
    setPayload['shippingStatus.lastEventAt'] = now

    await sanity
      .patch(order._id)
      .setIfMissing({shippingStatus: {}, shippingLog: []})
      .set(setPayload)
      .append('shippingLog', [logEntry])
      .commit({autoGenerateArrayKeys: true})

    return {
      statusCode: 200,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        ok: true,
        refundStatus,
        refundAmount,
        refundAt: now,
      }),
    }
  } catch (err: any) {
    console.error('refund-shipping-label failed', err)
    return {
      statusCode: 500,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Unable to refund shipping label'}),
    }
  }
}

export default handler
