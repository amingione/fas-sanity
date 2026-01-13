import type {APIRoute} from 'astro'
import {createClient} from '@sanity/client'
import {createEasyPostLabel} from '../../../netlify/functions/easypostCreateLabel'

type CreateLabelRequest = {
  orderId: string
  easypostRateId?: string | null
  source?: string | null
}

type OrderForLabel = {
  _id: string
  labelPurchased?: boolean | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  shippingLabelUrl?: string | null
  carrier?: string | null
  service?: string | null
  labelCost?: number | null
  easyPostShipmentId?: string | null
  labelTransactionId?: string | null
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN
const apiVersion = process.env.SANITY_STUDIO_API_VERSION || '2024-04-10'

if (!projectId || !dataset || !token) {
  throw new Error('Missing Sanity credentials for /api/create-shipping-label')
}

const sanity = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
})

const ORDER_FOR_LABEL_QUERY = `*[_type == "order" && _id == $id][0]{
  _id,
  labelPurchased,
  trackingNumber,
  trackingUrl,
  shippingLabelUrl,
  carrier,
  service,
  labelCost,
  easyPostShipmentId,
  labelTransactionId
}`

export const POST: APIRoute = async ({request}) => {
  let body: CreateLabelRequest
  try {
    body = (await request.json()) as CreateLabelRequest
  } catch {
    return jsonResponse({error: 'Invalid JSON payload'}, 400)
  }

  const source = (body.source || '').toString().trim()
  if (source !== 'sanity-manual') {
    console.warn('Blocked non-manual label purchase request on /api/create-shipping-label', {
      source,
    })
    return jsonResponse({error: 'LABEL_PURCHASE_REQUIRES_MANUAL_SANITY_ACTION'}, 403)
  }

  const cleanOrderId = (body.orderId || '').replace(/^drafts\./, '')
  if (!cleanOrderId) {
    return jsonResponse({error: 'orderId is required'}, 400)
  }

  try {
    const order = await sanity.fetch<OrderForLabel | null>(ORDER_FOR_LABEL_QUERY, {
      id: cleanOrderId,
    })
    if (!order) {
      return jsonResponse({error: 'Order not found'}, 404)
    }
    if (order.labelPurchased) {
      return jsonResponse(
        {
          success: true,
          trackingNumber: order.trackingNumber || undefined,
          trackingUrl: order.trackingUrl || undefined,
          labelUrl: order.shippingLabelUrl || undefined,
          carrier: order.carrier || undefined,
          service: order.service || undefined,
          cost: order.labelCost || undefined,
          easyPostShipmentId: order.easyPostShipmentId || undefined,
          labelTransactionId: order.labelTransactionId || undefined,
          message: 'Label already purchased',
        },
        200,
      )
    }

    const result = await createEasyPostLabel({
      orderId: cleanOrderId,
      rateId: body.easypostRateId || undefined,
      source: 'sanity-manual',
    })

    return jsonResponse({
      success: true,
      trackingNumber: result.trackingNumber,
      trackingUrl: result.trackingUrl,
      labelUrl: result.labelUrl,
      carrier: result.carrier,
      service: result.service,
      cost: result.cost,
      easyPostShipmentId: result.shipmentId,
    })
  } catch (error: any) {
    console.error('create-shipping-label error:', error)
    return jsonResponse(
      {error: error?.message || 'Failed to create shipping label'},
      typeof error?.statusCode === 'number' ? error.statusCode : 500,
    )
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}
