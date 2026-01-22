import {randomUUID} from 'crypto'
import type {StripeShippingDetails} from './stripeShipping'

const pickFirst = (values: Array<unknown>): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

const pruneUndefined = <T extends Record<string, any>>(input: T): T => {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) result[key] = value
  }
  return result as T
}

const pickFromMeta = (meta: Record<string, string>, keys: string[]): string | undefined =>
  pickFirst(keys.map((key) => meta[key]))

const parseNumber = (value?: string): number | undefined => {
  if (!value) return undefined
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

const FULFILLMENT_TRACKING_KEYS = [
  'tracking_number',
  'trackingNumber',
  'shipping_tracking_number',
  'shippingTrackingNumber',
  'easypost_tracking_number',
  'tracker',
  'tracker_id',
  'tracking',
]

const FULFILLMENT_TRACKING_URL_KEYS = [
  'tracking_url',
  'trackingUrl',
  'shipping_tracking_url',
  'shippingTrackingUrl',
]

const FULFILLMENT_LABEL_URL_KEYS = [
  'label_url',
  'labelUrl',
  'shipping_label_url',
  'shippingLabelUrl',
  'easypost_label_url',
]

const FULFILLMENT_SHIPMENT_ID_KEYS = [
  'easypost_shipment_id',
  'shipment_id',
  'shipping_shipment_id',
]

const FULFILLMENT_TRACKER_ID_KEYS = [
  'easypost_tracker_id',
  'shipping_tracker_id',
  'tracker_id',
]

const FULFILLMENT_RATE_ID_KEYS = [
  'easypost_rate_id',
  'shipping_rate_id',
  'shipping_rateid',
  'rate_id',
]

const FULFILLMENT_ACTUAL_COST_KEYS = [
  'actual_shipping_cost',
  'shipping_cost_actual',
  'shipping_actual_cost',
  'shipping_actual',
  'shipping_cost',
  'label_cost',
  'shipping_label_cost',
]

const FULFILLMENT_PURCHASED_AT_KEYS = [
  'label_purchased_at',
  'label_created_at',
  'shipping_label_created_at',
]

export function applyShippingDetailsToDoc(
  target: Record<string, any>,
  shippingDetails: StripeShippingDetails,
  currencyUpper?: string,
) {
  const shippingAmountForDoc = shippingDetails.amount
  if (shippingAmountForDoc !== undefined) {
    target.amountShipping = shippingAmountForDoc
  }
  if (shippingDetails.carrier) target.carrier = shippingDetails.carrier
  if (shippingDetails.serviceName || shippingDetails.serviceCode) {
    target.service = shippingDetails.serviceName || shippingDetails.serviceCode
  }
  if (shippingDetails.deliveryDays !== undefined) {
    target.deliveryDays = shippingDetails.deliveryDays
  }
  if (shippingDetails.estimatedDeliveryDate) {
    target.estimatedDeliveryDate = shippingDetails.estimatedDeliveryDate
  }
  const shippingMeta = shippingDetails.metadata || {}
  const stripeShippingRateId =
    shippingDetails.shippingRateId ||
    pickFromMeta(shippingMeta, [
      'shipping_rate_id',
      'shipping_rateid',
      'stripe_shipping_rate_id',
      'stripeShippingRateId',
    ])
  if (stripeShippingRateId) {
    target.stripeShippingRateId = stripeShippingRateId
  }

  const easyPostRateId =
    pickFromMeta(shippingMeta, ['easypost_rate_id', 'easypostRateId']) ||
    shippingDetails.metadata?.['easypost_rate_id'] ||
    undefined
  if (easyPostRateId) {
    target.easypostRateId = easyPostRateId
  }

  const shippingQuoteId = pickFromMeta(shippingMeta, [
    'shipping_quote_id',
    'shippingQuoteId',
  ])
  if (shippingQuoteId) {
    target.shippingQuoteId = shippingQuoteId
  }

  const shippingQuoteKey = pickFromMeta(shippingMeta, [
    'shipping_quote_key',
    'shippingQuoteKey',
  ])
  if (shippingQuoteKey) {
    target.shippingQuoteKey = shippingQuoteKey
  }

  const shippingQuoteRequestId = pickFromMeta(shippingMeta, [
    'shipping_quote_request_id',
    'shippingQuoteRequestId',
  ])
  if (shippingQuoteRequestId) {
    target.shippingQuoteRequestId = shippingQuoteRequestId
  }
}

export const deriveFulfillmentFromMetadata = (
  meta: Record<string, string>,
  shippingDetails: StripeShippingDetails,
  timestampIso: string,
  existingFulfillment?: Record<string, any> | null,
) => {
  const trackingNumber = pickFromMeta(meta, FULFILLMENT_TRACKING_KEYS)
  const trackingUrl = pickFromMeta(meta, FULFILLMENT_TRACKING_URL_KEYS)
  const labelUrl = pickFromMeta(meta, FULFILLMENT_LABEL_URL_KEYS)
  const shipmentId =
    pickFromMeta(meta, FULFILLMENT_SHIPMENT_ID_KEYS) ||
    shippingDetails.metadata?.['shipping_shipment_id']
  const trackerId = pickFromMeta(meta, FULFILLMENT_TRACKER_ID_KEYS)
  const rateIdRaw =
    pickFromMeta(meta, FULFILLMENT_RATE_ID_KEYS) ||
    shippingDetails.metadata?.['shipping_rate_id'] ||
    shippingDetails.metadata?.['shipping_rateid']
  const rateId = typeof rateIdRaw === 'string' ? rateIdRaw.trim() : undefined
  const stripeShippingRateId =
    shippingDetails.shippingRateId || (rateId && rateId.startsWith('shr_') ? rateId : undefined)
  const easyPostRateId =
    pickFromMeta(meta, ['easypost_rate_id', 'easypostRateId']) ||
    shippingDetails.metadata?.['easypost_rate_id'] ||
    undefined
  const actualCostRaw = pickFromMeta(meta, FULFILLMENT_ACTUAL_COST_KEYS)
  const actualShippingCost = parseNumber(actualCostRaw)
  const labelPurchasedAtRaw = pickFromMeta(meta, FULFILLMENT_PURCHASED_AT_KEYS)
  const labelPurchasedAt = labelPurchasedAtRaw
    ? new Date(labelPurchasedAtRaw).toISOString()
    : undefined
  const carrier =
    pickFromMeta(meta, ['fulfillment_carrier', 'carrier', 'shipping_carrier', 'shippingCarrier']) ||
    shippingDetails.carrier
  const service =
    pickFromMeta(meta, ['fulfillment_service', 'service', 'shipping_service', 'shippingService']) ||
    shippingDetails.serviceName ||
    shippingDetails.serviceCode

  const fulfillment: Record<string, any> = pruneUndefined({
    status: trackingNumber || labelUrl ? 'label_created' : undefined,
    labelFormat: labelUrl ? 'PDF' : undefined,
  })

  const topLevelFields = pruneUndefined({
    trackingNumber,
    trackingUrl,
    shippingLabelUrl: labelUrl,
    carrier,
    service,
    labelCreatedAt: labelPurchasedAt,
    easyPostShipmentId: shipmentId,
    easyPostTrackerId: trackerId,
    easypostRateId: easyPostRateId,
    stripeShippingRateId: stripeShippingRateId,
    labelCost: actualShippingCost,
    deliveryDays:
      shippingDetails.deliveryDays !== undefined ? shippingDetails.deliveryDays : undefined,
    estimatedDeliveryDate: shippingDetails.estimatedDeliveryDate,
  })

  if (!Object.keys(fulfillment).length && !Object.keys(topLevelFields).length) return null

  let workflow: Record<string, any> | undefined
  const hasExistingWorkflowStage =
    existingFulfillment && typeof existingFulfillment === 'object'
      ? Boolean((existingFulfillment as any)?.status)
      : false
  if (!hasExistingWorkflowStage && (trackingNumber || labelUrl)) {
    workflow = {
      currentStage: 'label_created',
      stages: [
        {
          _key: randomUUID(),
          stage: 'label_created',
          timestamp: timestampIso,
          completedBy: 'system',
        },
      ],
    }
  }

  if (
    actualShippingCost !== undefined &&
    shippingDetails.amount !== undefined &&
    Math.abs(actualShippingCost - shippingDetails.amount) > 0.01
  ) {
    fulfillment.fulfillmentNotes = `Actual label cost ${actualShippingCost.toFixed(
      2,
    )} vs quoted ${shippingDetails.amount.toFixed(2)}`
  }

  return {fulfillment, workflow, topLevelFields}
}
