import Stripe from 'stripe'

type MetadataInput = Record<string, unknown> | undefined | null

type NormalizeResult = Record<string, string>

function normalizeMetadata(source: MetadataInput): NormalizeResult {
  const normalized: Record<string, string> = {}
  if (!source || typeof source !== 'object') return normalized
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = (rawKey || '').toString().trim()
    if (!key) continue
    if (rawValue === undefined || rawValue === null) continue
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim()
      if (!trimmed) continue
      normalized[key] = trimmed
      continue
    }
    if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      normalized[key] = String(rawValue)
      continue
    }
    try {
      const serialized = JSON.stringify(rawValue)
      if (serialized) normalized[key] = serialized
    } catch {
      // ignore serialization failures
    }
  }
  return normalized
}

function coerceNumber(value?: string): number | undefined {
  if (!value) return undefined
  const direct = Number(value)
  if (Number.isFinite(direct)) return direct
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const fallback = Number(cleaned)
  return Number.isFinite(fallback) ? fallback : undefined
}

function coerceInteger(value?: string): number | undefined {
  const parsed = coerceNumber(value)
  if (parsed === undefined || !Number.isFinite(parsed)) return undefined
  if (!Number.isFinite(Math.trunc(parsed))) return undefined
  return Math.trunc(parsed)
}

function normalizeCurrency(value?: string): string | undefined {
  const normalized = (value || '').trim()
  return normalized ? normalized.toUpperCase() : undefined
}

type DeliveryEstimate = Stripe.ShippingRate.DeliveryEstimate | null | undefined

function deriveDeliveryDays(estimate: DeliveryEstimate): number | undefined {
  if (!estimate) return undefined
  const value = estimate.maximum?.value ?? estimate.minimum?.value
  if (!Number.isFinite(value)) return undefined
  return Math.max(0, Math.trunc(Number(value)))
}

function deriveEstimatedDate(estimate: DeliveryEstimate): string | undefined {
  const days = deriveDeliveryDays(estimate)
  if (!Number.isFinite(days) || !days) return undefined
  const base = new Date()
  base.setDate(base.getDate() + days)
  return base.toISOString()
}

function splitDisplayName(displayName?: string | null): {carrier?: string; service?: string} {
  const name = (displayName || '').trim()
  if (!name) return {}
  const parts = name
    .split(/[\u2013\u2014-]/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    return {
      carrier: parts[0],
      service: parts.slice(1).join(' – '),
    }
  }
  return {service: name}
}

export type StripeShippingDetails = {
  amount?: number
  currency?: string
  carrier?: string
  carrierId?: string
  serviceCode?: string
  serviceName?: string
  deliveryDays?: number
  estimatedDeliveryDate?: string
  metadata: Record<string, string>
}

export type ResolveShippingDetailsInput = {
  metadata?: MetadataInput
  session?: Stripe.Checkout.Session | null
  paymentIntent?: Stripe.PaymentIntent | null
  fallbackAmount?: number
  stripe?: Stripe | null
}

export async function resolveStripeShippingDetails(
  input: ResolveShippingDetailsInput,
): Promise<StripeShippingDetails> {
  const {metadata, session, paymentIntent, fallbackAmount, stripe} = input
  const meta = normalizeMetadata(metadata)
  let shippingRateMetadata: NormalizeResult | null = null

  const metaAmount = coerceNumber(meta['shipping_amount'] || meta['shippingAmount'])
  const metaCurrency = normalizeCurrency(meta['shipping_currency'] || meta['shippingCurrency'])
  const metaCarrier = meta['shipping_carrier'] || meta['shippingCarrier']
  const metaCarrierId =
    meta['shipping_carrier_id'] ||
    meta['shippingCarrierId'] ||
    meta['shipping_carrier_code']
  const metaServiceName =
    meta['shipping_service_name'] ||
    meta['shipping_service'] ||
    meta['shippingServiceName'] ||
    meta['shippingService']
  const metaServiceCode = meta['shipping_service_code'] || meta['shippingServiceCode']
  const metaRateId = meta['shipping_rate_id'] || meta['shipengine_rate_id']
  const metaDeliveryDays = coerceInteger(
    meta['shipping_delivery_days'] || meta['shippingDeliveryDays'],
  )
  const metaEstimatedDeliveryDate =
    meta['shipping_estimated_delivery_date'] || meta['shippingEstimatedDeliveryDate']

  let amount = metaAmount
  let currency = metaCurrency
  let carrier = metaCarrier
  let carrierId = metaCarrierId
  let serviceName = metaServiceName
  let serviceCode = metaServiceCode
  let deliveryDays = metaDeliveryDays
  let estimatedDeliveryDate = metaEstimatedDeliveryDate

  const sessionAmountRaw = Number(
    (session as any)?.shipping_cost?.amount_total ??
      (session as any)?.total_details?.amount_shipping,
  )
  const sessionAmount = Number.isFinite(sessionAmountRaw) ? sessionAmountRaw / 100 : undefined
  const sessionCurrency = normalizeCurrency(
    (session as any)?.shipping_cost?.currency ||
      (session as any)?.currency ||
      (paymentIntent as any)?.currency,
  )
  const sessionCarrier =
    (session as any)?.shipping_details?.carrier ||
    (session as any)?.shipping_details?.name ||
    paymentIntent?.shipping?.carrier

  if (amount === undefined) amount = sessionAmount ?? fallbackAmount
  if (!currency) currency = sessionCurrency
  if (!carrier && sessionCarrier) carrier = sessionCarrier

  let shippingRate: Stripe.ShippingRate | null = null
  const shippingRateId = (() => {
    const costRate = (session as any)?.shipping_cost?.shipping_rate
    if (typeof costRate === 'string' && costRate) return costRate
    const topLevelRate = (session as any)?.shipping_rate
    if (typeof topLevelRate === 'string' && topLevelRate) return topLevelRate
    return undefined
  })()

  if (stripe && shippingRateId) {
    try {
      shippingRate = await stripe.shippingRates.retrieve(shippingRateId)
      shippingRateMetadata = normalizeMetadata((shippingRate as any)?.metadata)
    } catch (err) {
      console.warn('resolveStripeShippingDetails: failed to load shipping rate', err)
    }
  }

  if (shippingRate) {
    const rateMeta = shippingRateMetadata || {}
    carrierId = carrierId || shippingRate.id
    const fixedAmount = shippingRate.fixed_amount?.amount
    if (
      amount === undefined &&
      typeof fixedAmount === 'number' &&
      Number.isFinite(fixedAmount)
    ) {
      amount = fixedAmount / 100
    }
    const fixedCurrency = normalizeCurrency(shippingRate.fixed_amount?.currency)
    if (!currency && fixedCurrency) currency = fixedCurrency

    const {carrier: rateCarrier, service} = splitDisplayName(shippingRate.display_name)
    if (!carrier && rateCarrier) carrier = rateCarrier
    if (!serviceName && service) serviceName = service
    if (!serviceCode && shippingRate.id) serviceCode = shippingRate.id

    if (amount === undefined) {
      const metaAmount =
        coerceNumber(rateMeta['shipping_amount']) ||
        coerceNumber(rateMeta['shippingAmount']) ||
        coerceNumber(rateMeta['shipengine_amount'])
      if (metaAmount !== undefined) amount = metaAmount
    }
    if (!currency) {
      const metaCurrency =
        normalizeCurrency(rateMeta['shipping_currency']) ||
        normalizeCurrency(rateMeta['shippingCurrency']) ||
        normalizeCurrency(rateMeta['shipengine_currency'])
      if (metaCurrency) currency = metaCurrency
    }
    if (!carrier && (rateMeta['shipping_carrier'] || rateMeta['shipengine_carrier'])) {
      carrier = rateMeta['shipping_carrier'] || rateMeta['shipengine_carrier']
    }
    if (!carrierId) {
      carrierId =
        rateMeta['shipping_carrier_id'] ||
        rateMeta['shipping_carrier_code'] ||
        rateMeta['shipengine_carrier_id'] ||
        rateMeta['shipengine_carrier_code'] ||
        carrierId
    }
    if (!serviceName) {
      serviceName =
        rateMeta['shipping_service_name'] ||
        rateMeta['shipping_service'] ||
        rateMeta['shipengine_service'] ||
        serviceName
    }
    if (!serviceCode) {
      serviceCode =
        rateMeta['shipping_service_code'] ||
        rateMeta['shipengine_service_code'] ||
        serviceCode
    }
    if (deliveryDays === undefined) {
      const metaDeliveryDays =
        coerceInteger(rateMeta['shipping_delivery_days']) ||
        coerceInteger(rateMeta['shipengine_delivery_days'])
      if (metaDeliveryDays !== undefined) deliveryDays = metaDeliveryDays
    }
    if (!estimatedDeliveryDate) {
      const metaEstimatedDate =
        rateMeta['shipping_estimated_delivery_date'] ||
        rateMeta['shipengine_estimated_delivery_date']
      if (metaEstimatedDate) estimatedDeliveryDate = metaEstimatedDate
    }

    const estimate = shippingRate.delivery_estimate
    if (deliveryDays === undefined) {
      const derivedDays = deriveDeliveryDays(estimate)
      if (derivedDays !== undefined) deliveryDays = derivedDays
    }
    if (!estimatedDeliveryDate) {
      const derivedDate = deriveEstimatedDate(estimate)
      if (derivedDate) estimatedDeliveryDate = derivedDate
    }
  }

  if (!serviceName && serviceCode) {
    serviceName = serviceCode
  }
  if (!serviceCode && serviceName && shippingRateId) {
    serviceCode = shippingRateId
  }

  const metadataForDoc: Record<string, string> = {}
  if (amount !== undefined) metadataForDoc.shipping_amount = amount.toFixed(2)
  if (currency) metadataForDoc.shipping_currency = currency
  if (carrier) metadataForDoc.shipping_carrier = carrier
  if (carrierId) metadataForDoc.shipping_carrier_id = carrierId
  if (serviceName) metadataForDoc.shipping_service_name = serviceName
  if (serviceCode) metadataForDoc.shipping_service_code = serviceCode
  if (deliveryDays !== undefined) metadataForDoc.shipping_delivery_days = String(deliveryDays)
  if (estimatedDeliveryDate) metadataForDoc.shipping_estimated_delivery_date = estimatedDeliveryDate
  if (shippingRateId) metadataForDoc.shipping_rate_id = shippingRateId
  if (!metadataForDoc.shipping_rate_id && metaRateId) metadataForDoc.shipping_rate_id = metaRateId

  if (shippingRateMetadata) {
    const metaRateId =
      shippingRateMetadata['shipping_rate_id'] || shippingRateMetadata['shipengine_rate_id']
    if (metaRateId && !metadataForDoc.shipping_rate_id) metadataForDoc.shipping_rate_id = metaRateId
    for (const [key, value] of Object.entries(shippingRateMetadata)) {
      if (!value) continue
      if (metadataForDoc[key]) continue
      metadataForDoc[key] = value
    }
  }

  return {
    amount,
    currency,
    carrier,
    carrierId,
    serviceCode,
    serviceName,
    deliveryDays,
    estimatedDeliveryDate,
    metadata: metadataForDoc,
  }
}
