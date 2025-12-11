// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {createEasyPostLabel} from './easypostCreateLabel'
import {consumeInventoryForItems} from '../../shared/inventory'
import {sanityClient} from '../lib/sanityClient'

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

const sanity = sanityClient

type FulfillRequest = {
  orderId?: string
  useExistingTracking?: boolean
  markOnly?: boolean
  weight?: {value?: number; unit?: string}
  dimensions?: {length?: number; width?: number; height?: number; unit?: string}
}

type OrderSummary = {
  _id: string
  status?: string
  orderNumber?: string
  trackingNumber?: string
  trackingUrl?: string
  shippingLabelUrl?: string
  cart?: Array<{quantity?: number; name?: string; productRef?: {_ref?: string}}>
}

export const handler: Handler = async (event) => {
  const originHeader = (event.headers?.origin || event.headers?.Origin || '') as string
  const corsHeaders = {
    'Access-Control-Allow-Origin': pickOrigin(originHeader),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: corsHeaders, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, corsHeaders, {success: false, message: 'Method Not Allowed'})
  }

  let payload: FulfillRequest = {}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, corsHeaders, {success: false, message: 'Invalid JSON'})
  }

  const orderId = (payload.orderId || '').trim()
  if (!orderId) {
    return jsonResponse(400, corsHeaders, {success: false, message: 'Missing orderId'})
  }

  const order = await sanity.fetch<OrderSummary | null>(
    `*[_type == "order" && _id == $id][0]{
      _id,
      status,
      orderNumber,
      trackingNumber,
      trackingUrl,
      shippingLabelUrl,
      cart[]{quantity, name, productRef{_ref}}
    }`,
    {id: orderId},
  )
  if (!order) {
    return jsonResponse(404, corsHeaders, {success: false, message: 'Order not found'})
  }

  let labelResult: any = null

  try {
    if (payload.markOnly === true) {
      // Mark order as fulfilled without creating a label
      const fulfillmentTimestamp = new Date().toISOString()
      await sanity
        .patch(orderId)
        .set({
          status: 'fulfilled',
          fulfilledAt: fulfillmentTimestamp,
        })
        .commit({autoGenerateArrayKeys: true})

      return jsonResponse(200, corsHeaders, {
        success: true,
        provider: 'manual',
        fulfilledAt: fulfillmentTimestamp,
        message: 'Order marked as fulfilled',
      })
    } else if (payload.useExistingTracking && order.trackingNumber) {
      labelResult = {
        provider: 'existing',
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        labelUrl: order.shippingLabelUrl,
      }
    } else {
      labelResult = await createEasyPostLabel({
        orderId,
        weightOverride: payload.weight,
        dimensionsOverride: payload.dimensions,
      })
    }
  } catch (err: any) {
    return jsonResponse(500, corsHeaders, {
      success: false,
      message: err?.message || 'EasyPost label generation failed',
    })
  }

  const fulfillmentTimestamp = new Date().toISOString()
  await sanity
    .patch(orderId)
    .set({
      status: 'fulfilled',
      fulfilledAt: fulfillmentTimestamp,
    })
    .commit({autoGenerateArrayKeys: true})

  try {
    if (order.cart?.length) {
      await consumeInventoryForItems({
        client: sanity,
        items: order.cart
          .filter((item) => item?.productRef?._ref)
          .map((item) => ({
            productRef: item!.productRef,
            quantity: item?.quantity,
            name: item?.name,
          })),
        type: 'sold',
        referenceDocId: orderId,
        referenceLabel: order.orderNumber,
        createdBy: 'fulfill-order',
      })
    }
  } catch (err) {
    console.warn('fulfill-order: inventory deduction failed', err)
  }

  return jsonResponse(200, corsHeaders, {
    success: true,
    provider: labelResult?.provider || 'easypost',
    labelUrl: labelResult?.labelUrl,
    trackingNumber: labelResult?.trackingNumber,
    trackingUrl: labelResult?.trackingUrl,
    fulfilledAt: fulfillmentTimestamp,
  })
}
