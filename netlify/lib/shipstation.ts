import type { SanityClient } from '@sanity/client'
import { getShipStationFromAddress } from './ship-from'

const SHIPSTATION_API_BASE = process.env.SHIPSTATION_API_BASE || 'https://ssapi.shipstation.com'
const SHIPSTATION_API_KEY = process.env.SHIPSTATION_API_KEY || ''
const SHIPSTATION_API_SECRET = process.env.SHIPSTATION_API_SECRET || ''

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
  'washington dc': 'DC',
}

function toFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : undefined
}

function normalizeString(value?: string | null) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizeCountry(country?: string | null) {
  return (normalizeString(country) || 'US').toUpperCase()
}

function normalizeState(state?: string | null, country?: string | null) {
  const normalizedCountry = normalizeCountry(country)
  const trimmed = normalizeString(state)
  if (!trimmed) return undefined
  if (trimmed.length === 2) return trimmed.toUpperCase()
  if (normalizedCountry === 'US') {
    const fromMap = US_STATE_ABBREVIATIONS[trimmed.toLowerCase()]
    if (fromMap) return fromMap
  }
  return trimmed
}

function normalizePostalCode(value?: string | number | null) {
  if (value === null || value === undefined) return undefined
  const stringValue = typeof value === 'string' ? value : String(value)
  const trimmed = stringValue.trim()
  return trimmed ? trimmed : undefined
}

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
  const country = normalizeCountry(order.country)
  return {
    name: normalizeString(order.name) || normalizeString(order.email) || 'Customer',
    street1: normalizeString(order.addressLine1) || '',
    street2: normalizeString(order.addressLine2),
    city: normalizeString(order.city) || '',
    state: normalizeState(order.state, country) || '',
    postalCode: normalizePostalCode(order.postalCode) || '',
    country,
    phone: normalizeString(order.phone),
    email: normalizeString(order.email),
  }
}

function assertValidShipTo(
  orderId: string,
  shipTo: ReturnType<typeof toShipStationAddress>
): asserts shipTo is NonNullable<ReturnType<typeof toShipStationAddress>> {
  if (!shipTo) throw new Error('Order missing shipping address; cannot sync to ShipStation')
  const missing = ['street1', 'city', 'state', 'postalCode', 'country'].filter((field) => {
    const value = shipTo[field as keyof typeof shipTo]
    return typeof value !== 'string' || !value.trim()
  })
  if (missing.length > 0) {
    throw new Error(`Order ${orderId} has incomplete shipping address (missing ${missing.join(', ')})`)
  }
}

function normalizeWeight(weight?: { value?: number; unit?: string }) {
  if (!weight) return undefined
  const parsedValue = toFiniteNumber(weight.value)
  if (!parsedValue || parsedValue <= 0) return undefined
  const unit = (weight.unit || 'pound').toLowerCase()
  switch (unit) {
    case 'pound':
    case 'lb':
    case 'lbs':
      return { value: parsedValue, units: 'pounds' as const }
    case 'ounce':
    case 'oz':
      return { value: parsedValue, units: 'ounces' as const }
    case 'gram':
    case 'g':
      return { value: parsedValue, units: 'grams' as const }
    case 'kilogram':
    case 'kg':
      return { value: parsedValue, units: 'kilograms' as const }
    default:
      return { value: parsedValue, units: 'pounds' as const }
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
  assertValidShipTo(order._id, shipTo)
  const shipFrom = getShipStationFromAddress()

  const items = Array.isArray(order.cart) && order.cart.length > 0
    ? order.cart.map((item, idx) => {
        const quantity = toFiniteNumber(item.quantity)
        return {
          lineItemKey: item._key || `${order._id}-line-${idx}`,
          sku: item.sku || undefined,
          name: item.name || item.sku || 'Line Item',
          quantity: quantity && quantity > 0 ? Math.round(quantity) : 1,
          unitPrice: toFiniteNumber(item.price) ?? 0,
        }
      })
    : [
        {
          lineItemKey: `${order._id}-line-0`,
          sku: undefined,
          name: 'Order Item',
          quantity: 1,
          unitPrice: toFiniteNumber(order.totalAmount ?? order.amountSubtotal) ?? 0,
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
    amountPaid: toFiniteNumber(order.totalAmount),
    taxAmount: toFiniteNumber(order.amountTax),
    shippingAmount: toFiniteNumber(order.amountShipping),
    requestedShippingService: order.selectedService?.service || order.selectedService?.serviceCode || undefined,
    carrierCode: normalizeCarrierCode(order),
    serviceCode: normalizeServiceCode(order),
    billTo: shipTo,
    shipTo,
    shipFrom,
    items,
    weight: normalizeWeight(order.weight),
    dimensions: (() => {
      const length = toFiniteNumber(order.dimensions?.length)
      const width = toFiniteNumber(order.dimensions?.width)
      const height = toFiniteNumber(order.dimensions?.height)
      if (!length || !width || !height) return undefined
      if (length <= 0 || width <= 0 || height <= 0) return undefined
      return {
        units: 'inches',
        length,
        width,
        height,
      }
    })(),
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
  const dims = (() => {
    const length = toFiniteNumber(order.dimensions?.length)
    const width = toFiniteNumber(order.dimensions?.width)
    const height = toFiniteNumber(order.dimensions?.height)
    if (!length || !width || !height) return undefined
    if (length <= 0 || width <= 0 || height <= 0) return undefined
    return {
      units: 'inches',
      length,
      width,
      height,
    }
  })()

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
