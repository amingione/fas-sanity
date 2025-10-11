import type { SanityClient } from '@sanity/client'

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
    ...(init.headers || {}),
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
    const error = new Error(
      `ShipStation request failed (${response.status} ${response.statusText}) ${typeof data === 'string' ? data.slice(0, 200) : ''}`
    )
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
    carrierCode: order.selectedService?.carrierId || order.shippingCarrier || undefined,
    serviceCode: order.selectedService?.serviceCode || undefined,
    billTo: shipTo,
    shipTo,
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
  }

  return shipStationOrderId || undefined
}
