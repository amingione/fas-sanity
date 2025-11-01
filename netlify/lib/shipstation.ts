import type { SanityClient } from '@sanity/client'
import { getShipStationFromAddress } from './ship-from'

const SHIPSTATION_API_BASE = process.env.SHIPSTATION_API_BASE || 'https://ssapi.shipstation.com'
const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY || ''
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET || ''

type SanityOrderForShipStation = {
  _id: string
  orderNumber?: string
  createdAt?: string
  customerEmail?: string
  customerName?: string
  shippingAddress?: {
    name?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    phone?: string
    email?: string
  }
  cart?: Array<{
    _key?: string
    sku?: string
    name?: string
    price?: number
    quantity?: number
  }>
  totalAmount?: number
  amountSubtotal?: number
  amountTax?: number
  amountShipping?: number
  selectedService?: {
    carrierId?: string
    carrier?: string
    service?: string
    serviceCode?: string
    amount?: number
    currency?: string
  }
  shippingCarrier?: string
  weight?: { value?: number; unit?: string }
  dimensions?: { length?: number; width?: number; height?: number }
  stripeSessionId?: string
  shipStationOrderId?: string
  shipStationLabelId?: string
  shippingLabelUrl?: string
  trackingNumber?: string
  trackingUrl?: string
}

function requireShipStationCredentials() {
  if (!SHIPSTATION_API_KEY || !SHIPSTATION_API_SECRET) {
    throw new Error('Missing ShipStation credentials (set SHIPSTATION_API_KEY and SHIPSTATION_API_SECRET)')
  }
}

async function shipStationRequest<T = any>(path: string, init: RequestInit): Promise<T> {
  requireShipStationCredentials()
  const auth = Buffer.from(`${SHIPSTATION_API_KEY}:${SHIPSTATION_API_SECRET}`).toString('base64')
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
  }

  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = String(value)
      })
    } else if (typeof init.headers === 'object') {
      Object.entries(init.headers).forEach(([key, value]) => {
        headers[key] = String(value)
      })
    }
  }
  const response = await fetch(`${SHIPSTATION_API_BASE}${path}`, {
    ...init,
    headers,
  })

  const text = await response.text()
  let data: any = undefined
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    data = text
  }

  if (!response.ok) {
    const serialized = typeof data === 'string' ? data : data ? JSON.stringify(data) : ''
    const snippet = serialized.slice(0, 200)
    const error = new Error(
      `ShipStation request failed (${response.status} ${response.statusText}) ${snippet}`
    )
    ;(error as any).status = response.status
    ;(error as any).data = data
    throw error
  }

  return data as T
}

function toShipStationAddress(order: SanityOrderForShipStation['shippingAddress']) {
  if (!order) return undefined
  return {
    name: order.name || order.email || 'Customer',
    street1: order.addressLine1 || '',
    street2: order.addressLine2 || '',
    city: order.city || '',
    state: order.state || '',
    postalCode: order.postalCode || '',
    country: order.country || 'US',
    phone: order.phone || '',
    email: order.email || '',
  }
}

function normalizeWeight(weight?: { value?: number; unit?: string }) {
  if (!weight || typeof weight.value !== 'number' || weight.value <= 0) return undefined
  const unit = (weight.unit || 'pound').toLowerCase()
  switch (unit) {
    case 'pound':
    case 'lb':
    case 'lbs':
      return { value: weight.value, units: 'pounds' as const }
    case 'ounce':
    case 'oz':
      return { value: weight.value, units: 'ounces' as const }
    case 'gram':
    case 'g':
      return { value: weight.value, units: 'grams' as const }
    case 'kilogram':
    case 'kg':
      return { value: weight.value, units: 'kilograms' as const }
    default:
      return { value: weight.value, units: 'pounds' as const }
  }
}

export async function fetchOrderForShipStation(sanity: SanityClient, orderId: string): Promise<SanityOrderForShipStation | null> {
  return sanity.fetch(
    `*[_type == "order" && _id == $id][0]{
      _id,
      orderNumber,
      createdAt,
      customerEmail,
      customerName,
      shippingAddress,
      cart[]{
        _key,
        sku,
        name,
        price,
        quantity
      },
      totalAmount,
      amountSubtotal,
      amountTax,
      amountShipping,
      selectedService,
      shippingCarrier,
      weight,
      dimensions,
      stripeSessionId,
      shipStationOrderId
    }`,
    { id: orderId }
  )
}

export async function syncOrderToShipStation(sanity: SanityClient, orderId: string): Promise<string | undefined> {
  const order = await fetchOrderForShipStation(sanity, orderId)
  if (!order) throw new Error(`Order ${orderId} not found`)

  if (order.shipStationOrderId) {
    return order.shipStationOrderId
  }

  const shipTo = toShipStationAddress(order.shippingAddress)
  if (!shipTo || !shipTo.street1) {
    throw new Error('Order missing shipping address; cannot sync to ShipStation')
  }
  const shipFrom = getShipStationFromAddress()

  const items = Array.isArray(order.cart) && order.cart.length > 0
    ? order.cart.map((item, idx) => ({
        lineItemKey: item._key || `${order._id}-line-${idx}`,
        sku: item.sku || undefined,
        name: item.name || item.sku || 'Line Item',
        quantity: Number(item.quantity || 1),
        unitPrice: Number.isFinite(item.price) ? Number(item.price) : undefined,
      }))
    : [
        {
          lineItemKey: `${order._id}-line-0`,
          sku: undefined,
          name: 'Order Item',
          quantity: 1,
          unitPrice: Number.isFinite(order.totalAmount || order.amountSubtotal || 0)
            ? Number(order.totalAmount || order.amountSubtotal || 0)
            : undefined,
        },
      ]

  const payload: Record<string, any> = {
    orderNumber: order.orderNumber || order._id,
    orderKey: order.stripeSessionId || order._id,
    orderDate: order.createdAt || new Date().toISOString(),
    paymentDate: order.createdAt || new Date().toISOString(),
    orderStatus: 'awaiting_shipment',
    customerEmail: order.customerEmail || undefined,
    customerUsername: order.customerEmail || undefined,
    customerNotes: '',
    internalNotes: '',
    amountPaid: Number.isFinite(order.totalAmount || 0) ? Number(order.totalAmount || 0) : undefined,
    taxAmount: Number.isFinite(order.amountTax || 0) ? Number(order.amountTax || 0) : undefined,
    shippingAmount: Number.isFinite(order.amountShipping || 0) ? Number(order.amountShipping || 0) : undefined,
    requestedShippingService: order.selectedService?.service || order.selectedService?.serviceCode || undefined,
    carrierCode: normalizeCarrierCode(order),
    serviceCode: normalizeServiceCode(order),
    billTo: shipTo,
    shipTo,
    shipFrom,
    items,
    weight: normalizeWeight(order.weight),
    dimensions: order.dimensions
      ? {
          units: 'inches',
          length: Number(order.dimensions.length || 0),
          width: Number(order.dimensions.width || 0),
          height: Number(order.dimensions.height || 0),
        }
      : undefined,
    advancedOptions: {
      customField1: order._id,
      customField2: order.stripeSessionId || undefined,
    },
  }

  const response = await shipStationRequest<{ orderId?: number; orderKey?: string }>('/orders/createorder', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const shipStationOrderId = response?.orderId ? String(response.orderId) : response?.orderKey

  if (shipStationOrderId) {
    try {
      await sanity.patch(order._id).set({ shipStationOrderId }).commit({ autoGenerateArrayKeys: true })
    } catch (err) {
      console.warn('Failed to patch order with ShipStation order id', err)
    }
    order.shipStationOrderId = shipStationOrderId
  }

  try {
    await maybeCreateLabelForOrder(sanity, order)
  } catch (err) {
    console.warn('Failed to auto-create ShipStation label', err)
  }

  return shipStationOrderId || undefined
}

type ShipStationWebhookPayload = {
  userId?: string
  event?: string
  resource_url?: string
  resource_type?: string
  resource_action?: string
  resource_id?: number | string
  occurred_at?: string
}

function toRelativePath(url: string): string {
  const parsed = new URL(url)
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

export async function fetchShipStationResource<T = any>(url: string): Promise<T> {
  const path = toRelativePath(url)
  return shipStationRequest<T>(path, { method: 'GET' })
}

export async function resolveOrderIdFromShipment(shipment: any): Promise<{ orderId: string | null; orderNumber?: string }> {
  const customId = shipment?.advancedOptions?.customField1
  if (typeof customId === 'string' && customId.trim()) {
    return { orderId: customId.trim(), orderNumber: shipment?.orderNumber }
  }

  const orderNumber = shipment?.orderNumber || shipment?.orderKey
  if (!orderNumber) return { orderId: null, orderNumber: undefined }

  return { orderId: null, orderNumber }
}

export async function findOrderIdByOrderNumber(sanity: SanityClient, orderNumber?: string | null) {
  if (!orderNumber) return null
  return sanity.fetch<string | null>(`*[_type == "order" && orderNumber == $orderNumber][0]._id`, { orderNumber })
}

export type ShipStationWebhookEvent = ShipStationWebhookPayload

function normalizeCarrierCode(order: SanityOrderForShipStation): string | undefined {
  const fromId = order.selectedService?.carrierId
  if (fromId && !/^se-/i.test(fromId) && !/^shr_/i.test(fromId)) return fromId
  const name = (order.selectedService?.carrier || order.shippingCarrier || '').toString().trim().toLowerCase()
  if (!name) return undefined
  const mappings: Array<[RegExp, string]> = [
    [/ups/, 'ups'],
    [/fedex/, 'fedex'],
    [/usps|postal|stamps/, 'stamps_com'],
    [/dhl/, 'dhl_express'],
  ]
  for (const [pattern, code] of mappings) {
    if (pattern.test(name)) return code
  }
  return undefined
}

function normalizeServiceCode(order: SanityOrderForShipStation): string | undefined {
  const code = order.selectedService?.serviceCode
  if (code && !/^shr_/i.test(code)) return code.toString().trim()
  const service = order.selectedService?.service
  if (!service) return undefined
  const normalized = service.toString().trim()
  if (!normalized) return undefined
  if (normalized.toLowerCase().includes('ups')) return 'ups_ground'
  if (normalized.toLowerCase().includes('fedex') && normalized.toLowerCase().includes('2day')) return 'fedex_2day'
  if (normalized.toLowerCase().includes('fedex') && normalized.toLowerCase().includes('ground')) return 'fedex_ground'
  return undefined
}

async function maybeCreateLabelForOrder(sanity: SanityClient, order: SanityOrderForShipStation) {
  if (order.shipStationLabelId || order.shippingLabelUrl || order.trackingNumber) return
  if (!order.shipStationOrderId) return

  const carrierCode = normalizeCarrierCode(order)
  const serviceCode = normalizeServiceCode(order)
  if (!carrierCode || !serviceCode) {
    console.warn('maybeCreateLabelForOrder: missing carrier/service', {
      orderNumber: order.orderNumber,
      carrierCode,
      serviceCode,
    })
    return
  }
  if (!carrierCode || !serviceCode) return

  const weight = normalizeWeight(order.weight)
  const dims = order.dimensions
    ? {
        units: 'inches',
        length: Number(order.dimensions.length || 0),
        width: Number(order.dimensions.width || 0),
        height: Number(order.dimensions.height || 0),
      }
    : undefined

  const payload: Record<string, any> = {
    carrierCode,
    serviceCode,
    shipDate: new Date().toISOString().slice(0, 10),
    confirmation: 'none',
    labelFormat: 'PDF',
  }

  const numericId = Number(order.shipStationOrderId)
  if (Number.isFinite(numericId)) payload.orderId = numericId
  else payload.orderKey = order.shipStationOrderId

  if (weight) payload.weight = weight
  if (dims) payload.dimensions = dims

  const label = await shipStationRequest<any>('/orders/createlabel', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const labelUrl =
    label?.labelData?.fileUrl ||
    label?.labelDownload?.href ||
    label?.labelDownload?.pdf ||
    label?.label_url ||
    undefined
  const trackingNumber =
    label?.trackingNumber || label?.tracking_number || label?.shipment?.trackingNumber || undefined
  const trackingUrl = label?.trackingUrl || label?.tracking_url || undefined

  try {
    const patch = sanity
      .patch(order._id)
      .set({
        shipStationLabelId: label?.labelId ? String(label.labelId) : label?.label_id ? String(label.label_id) : undefined,
        shippingLabelUrl: labelUrl || undefined,
        trackingNumber: trackingNumber || undefined,
        trackingUrl: trackingUrl || undefined,
      })
      .setIfMissing({ shippingLog: [] })
      .append('shippingLog', [
        {
          _type: 'shippingLogEntry',
          status: 'label_created',
          message: `Label purchased via ShipStation API (${carrierCode || 'carrier'} – ${serviceCode || 'service'})`,
          createdAt: new Date().toISOString(),
          trackingNumber: trackingNumber || undefined,
          trackingUrl: trackingUrl || undefined,
          labelUrl: labelUrl || undefined,
        },
      ])

    await patch.commit({ autoGenerateArrayKeys: true })
  } catch (err) {
    console.warn('Failed to patch order after ShipStation label creation', err)
  }
}
