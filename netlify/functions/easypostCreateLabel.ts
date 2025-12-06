// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {getEasyPostFromAddress} from '../lib/ship-from'
import {
  getEasyPostClient,
  resolveDimensions,
  resolveWeight,
  type DimensionsInput,
  type WeightInput,
} from '../lib/easypostClient'

const DEFAULT_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3333'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': DEFAULT_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

function formatEasyPostError(err: any): {statusCode: number; message: string} {
  const ep = err?.body?.error
  const baseMessage =
    (ep && (ep.message || ep.code)) || err?.message || 'EasyPost label generation failed'

  if (ep && Array.isArray(ep.errors) && ep.errors.length) {
    const details = ep.errors
      .map((e: any) => {
        const field = e?.field || e?.field_name
        const msg = e?.message || e?.reason
        return field && msg ? `${field}: ${msg}` : field || msg
      })
      .filter(Boolean)
      .join('; ')
    const message = details ? `${baseMessage} (${details})` : baseMessage
    return {statusCode: 400, message}
  }

  if (
    typeof baseMessage === 'string' &&
    (/missing required/i.test(baseMessage) || /incomplete shipping address/i.test(baseMessage))
  ) {
    return {statusCode: 400, message: baseMessage}
  }

  return {statusCode: 500, message: baseMessage}
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: process.env.SANITY_API_VERSION || '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

type OrderDoc = {
  _id: string
  shippingAddress?: {
    name?: string
    phone?: string
    email?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  weight?: {value?: number; unit?: string}
  dimensions?: {length?: number; width?: number; height?: number}
  customerEmail?: string
  customerName?: string
  orderNumber?: string
}

type EasyPostAddress = {
  name?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
  email?: string
}

function toEasyPostAddress(order: OrderDoc): EasyPostAddress {
  const addr = order?.shippingAddress || {}
  const fallbackName = (addr?.name || order.customerName || '').toString().trim() || 'Customer'
  return {
    name: fallbackName,
    street1: addr?.addressLine1 || '',
    street2: addr?.addressLine2 || undefined,
    city: addr?.city || '',
    state: addr?.state || '',
    zip: addr?.postalCode || '',
    country: (addr?.country || 'US') as string,
    phone: addr?.phone || undefined,
    email: addr?.email || order.customerEmail || undefined,
  }
}

function assertAddress(address: EasyPostAddress) {
  const missing: string[] = []
  if (!address.name) missing.push('name')
  if (!address.street1) missing.push('addressLine1')
  if (!address.city) missing.push('city')
  if (!address.state) missing.push('state')
  if (!address.zip) missing.push('postalCode')
  if (!address.country) missing.push('country')
  if (missing.length) {
    throw new Error(`Incomplete shipping address: missing ${missing.join(', ')}`)
  }
}

type WizardRate = {
  id?: string
  carrier?: string
  service?: string
  rate?: string
  delivery_days?: number | null
}

type WizardAddress = {
  street1?: string
  street2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

type WizardParcel = {
  weight?: number
  length?: number
  width?: number
  height?: number
}

async function createWizardLabel(payload: {
  address?: WizardAddress
  parcel?: WizardParcel
  selectedRate?: WizardRate
}) {
  const address = payload.address || {}
  const parcel = payload.parcel || {}
  const selectedRate = payload.selectedRate

  const missingAddress = ['street1', 'city', 'state', 'postalCode', 'country'].filter(
    (key) => !(address as any)?.[key],
  )
  if (missingAddress.length) {
    throw new Error(`Missing address fields: ${missingAddress.join(', ')}`)
  }
  if (!selectedRate?.id) {
    throw new Error('Missing selected rate id')
  }

  const epClient = getEasyPostClient()
  const fromDefaults = getEasyPostFromAddress()
  const weightValue = typeof parcel.weight === 'number' && parcel.weight > 0 ? parcel.weight : 1

  const shipment = await epClient.Shipment.create({
    to_address: {
      street1: address.street1,
      street2: address.street2 || undefined,
      city: address.city,
      state: address.state,
      zip: address.postalCode,
      country: address.country,
    },
    from_address: {
      street1: process.env.SENDER_STREET1 || fromDefaults.street1,
      street2: process.env.SENDER_STREET2 || fromDefaults.street2,
      city: process.env.SENDER_CITY || fromDefaults.city,
      state: process.env.SENDER_STATE || fromDefaults.state,
      zip: process.env.SENDER_ZIP || fromDefaults.zip,
      country: process.env.SENDER_COUNTRY || fromDefaults.country || 'US',
    },
    options: {
      label_format: 'PDF',
      label_size: '4x6',
    },
    parcel: {
      weight: weightValue,
      length: parcel.length,
      width: parcel.width,
      height: parcel.height,
    },
  } as any)

  await (epClient as any).Shipment.buy(shipment.id, selectedRate.id)
  const updatedShipment: any = await epClient.Shipment.retrieve(shipment.id)

  const postageLabel = updatedShipment.postage_label || shipment.postage_label || null
  const labelUrl = postageLabel?.label_url || postageLabel?.label_pdf_url || undefined
  const trackingCode = updatedShipment.tracking_code || undefined
  const rateAmount = Number.parseFloat(selectedRate.rate ?? '')
  const numericRate = Number.isFinite(rateAmount) ? Number(rateAmount.toFixed(2)) : undefined
  const transitDays =
    typeof selectedRate.delivery_days === 'number' ? selectedRate.delivery_days : undefined

  await sanity.create({
    _type: 'shipment',
    easypostId: updatedShipment?.id || shipment.id,
    createdAt: new Date().toISOString(),
    status: updatedShipment?.status,
    trackingCode,
    carrier: selectedRate.carrier,
    service: selectedRate.service,
    rate: numericRate,
    transitDays,
    recipient: `${address.street1}, ${address.city}`,
    labelUrl,
    details: JSON.stringify(updatedShipment || shipment),
  })

  return {
    success: true,
    labelUrl,
    trackingCode,
  }
}

export type CreateEasyPostLabelOptions = {
  orderId?: string
  invoiceId?: string
  shipTo?: EasyPostAddress
  shipFrom?: EasyPostAddress
  weightOverride?: WeightInput
  dimensionsOverride?: DimensionsInput
  packageDetails?: {weight?: WeightInput; dimensions?: DimensionsInput}
  reference?: string
}

export type EasyPostLabelResult = {
  provider: 'easypost'
  shipmentId: string
  trackerId?: string
  labelUrl?: string
  trackingNumber?: string
  trackingUrl?: string
  rate?: number
  currency?: string
  status?: string
  carrier?: string
  labelCreatedAt?: string
  labelCost?: number
}

async function fetchOrder(orderId: string): Promise<OrderDoc | null> {
  return sanity.fetch<OrderDoc>(
    `*[_type == "order" && _id == $id][0]{
      _id,
      shippingAddress,
      weight,
      dimensions,
      customerEmail,
      customerName,
      orderNumber
    }`,
    {id: orderId},
  )
}

export async function createEasyPostLabel(
  options: CreateEasyPostLabelOptions,
): Promise<EasyPostLabelResult> {
  const {
    orderId,
    invoiceId,
    shipTo,
    shipFrom,
    weightOverride,
    dimensionsOverride,
    packageDetails,
    reference,
  } = options
  if (!orderId && !shipTo) {
    throw new Error('Missing orderId or shipTo address')
  }

  const order = orderId ? await fetchOrder(orderId) : null
  if (orderId && (!order || !order.shippingAddress)) {
    throw new Error('Order not found or missing shipping address')
  }

  const defaultFrom = getEasyPostFromAddress()
  const toAddress = shipTo || (order ? toEasyPostAddress(order) : null)
  if (!toAddress) {
    throw new Error('Missing shipping address')
  }
  assertAddress(toAddress)

  const fromAddress = shipFrom || defaultFrom

  const weightInput = packageDetails?.weight ?? weightOverride ?? order?.weight
  const dimensionsInput = packageDetails?.dimensions ?? dimensionsOverride ?? order?.dimensions

  const {ounces, pounds} = resolveWeight(weightInput, order?.weight)
  const dimensions = resolveDimensions(dimensionsInput, order?.dimensions)

  const client = getEasyPostClient()

  const shipment = await client.Shipment.create({
    to_address: toAddress,
    from_address: fromAddress,
    reference: reference || orderId || invoiceId,
    options: {
      label_format: 'PDF',
      label_size: '4x6',
      invoice_number: order?.orderNumber || orderId || invoiceId,
      print_custom_1: order
        ? `Order ${order.orderNumber || orderId?.slice(-6)}`
        : invoiceId
          ? `Invoice ${invoiceId.slice(-6)}`
          : undefined,
    },
    parcel: {
      length: dimensions.length,
      width: dimensions.width,
      height: dimensions.height,
      weight: Math.max(1, Number(ounces.toFixed(2))),
    },
  } as any)

  const rates = Array.isArray(shipment?.rates) ? shipment.rates : []
  if (!rates.length) {
    throw new Error('No EasyPost rates available for shipment')
  }
  const lowestRate = rates
    .map((rate: any) => ({
      raw: rate,
      amount: Number.parseFloat(rate?.rate || '0') || Number.MAX_VALUE,
    }))
    .sort((a, b) => a.amount - b.amount)[0]?.raw

  if (!lowestRate || !lowestRate.id) {
    throw new Error('Failed to determine lowest EasyPost rate')
  }

  await (client as any).Shipment.buy(shipment.id, lowestRate.id)
  const updatedShipment: any = await client.Shipment.retrieve(shipment.id)

  const tracker = updatedShipment.tracker || null
  const selectedRate = updatedShipment.selected_rate || lowestRate

  const postageLabel = updatedShipment.postage_label || shipment.postage_label || null

  const labelUrl = postageLabel?.label_url || postageLabel?.label_pdf_url || undefined
  const trackingCode = updatedShipment.tracking_code || tracker?.tracking_code || undefined
  const trackingUrl = tracker?.public_url || undefined

  const latestDetail =
    Array.isArray(tracker?.tracking_details) && tracker.tracking_details.length
      ? tracker.tracking_details[tracker.tracking_details.length - 1]
      : null
  const lastEventAt =
    latestDetail?.datetime || tracker?.updated_at || tracker?.created_at || new Date().toISOString()

  const rateAmount = Number.parseFloat(selectedRate?.rate || '')
  const amount = Number.isFinite(rateAmount) ? Number(rateAmount.toFixed(2)) : undefined

  const resolvedCarrier =
    selectedRate?.carrier ||
    tracker?.carrier ||
    updatedShipment?.selected_rate?.carrier ||
    shipment?.selected_rate?.carrier ||
    undefined

  const shippingStatus: Record<string, any> = {
    carrier: resolvedCarrier,
    service: selectedRate?.service || undefined,
    labelUrl,
    trackingCode,
    trackingUrl,
    status: tracker?.status || 'label_created',
    cost: amount,
    currency: selectedRate?.currency || undefined,
    lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : new Date().toISOString(),
  }

  if (orderId) {
    const rateId =
      (selectedRate as any)?.id ||
      (updatedShipment?.selected_rate as any)?.id ||
      (shipment?.selected_rate as any)?.id

    const logEntry = {
      _type: 'shippingLogEntry',
      status: 'label_created',
      message: `Label generated via EasyPost (${shippingStatus.carrier || 'carrier'} – ${shippingStatus.service || 'service'})`,
      labelUrl,
      trackingNumber: trackingCode,
      trackingUrl,
      weight: Number.isFinite(pounds) ? Number(pounds.toFixed(2)) : undefined,
      createdAt: new Date().toISOString(),
    }

    const selectedService = Object.fromEntries(
      Object.entries({
        carrierId: selectedRate?.carrier_account_id || undefined,
        carrier: shippingStatus.carrier,
        service: selectedRate?.service || undefined,
        serviceCode: selectedRate?.service || undefined,
        amount,
        currency: selectedRate?.currency || undefined,
        deliveryDays:
          typeof selectedRate?.delivery_days === 'number' ? selectedRate.delivery_days : undefined,
        estimatedDeliveryDate: tracker?.est_delivery_date
          ? new Date(tracker.est_delivery_date).toISOString()
          : undefined,
      }).filter(([, value]) => value !== undefined),
    )

    const patchSet = Object.fromEntries(
      Object.entries({
        shippingLabelUrl: labelUrl,
        trackingNumber: trackingCode,
        trackingUrl,
        shippingCarrier: shippingStatus.carrier,
        shippingStatus,
        easyPostShipmentId: shipment.id,
        easyPostTrackerId: tracker?.id,
        selectedService: Object.keys(selectedService).length ? selectedService : undefined,
        labelCreatedAt: shippingStatus.lastEventAt,
        labelCost: amount,
        labelPurchasedFrom: resolvedCarrier || 'EasyPost',
        'fulfillment.status': 'label_created',
        'fulfillment.carrier': resolvedCarrier,
        'fulfillment.trackingNumber': trackingCode,
        'fulfillment.trackingUrl': trackingUrl,
        'fulfillment.shippedAt': shippingStatus.lastEventAt,
        ...(rateId ? {'fulfillment.easypostRateId': rateId} : {}),
        ...(shippingStatus.service ? {'fulfillment.service': shippingStatus.service} : {}),
      }).filter(([, value]) => value !== undefined),
    )

    await sanity
      .patch(orderId)
      .set(patchSet)
      .setIfMissing({shippingLog: []})
      .append('shippingLog', [logEntry])
      .commit({autoGenerateArrayKeys: true})
  } else if (invoiceId) {
    try {
      await sanity
        .patch(invoiceId)
        .set({
          status: 'Shipped',
          trackingNumber: trackingCode,
          trackingUrl,
          shippingLabelUrl: labelUrl,
          shippingCarrier: shippingStatus.carrier,
        })
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('Failed to patch invoice after EasyPost label creation', err)
    }
  }

  // Create a shippingLabel document for desk/bulk printing if we have a label URL.
  if (labelUrl) {
    try {
      const labelDocId = `shippingLabel-${shipment.id}`
      await sanity.createOrReplace(
        {
          _id: labelDocId,
          _type: 'shippingLabel',
          name: order?.orderNumber || orderId || invoiceId || labelDocId,
          orderRef: orderId ? {_type: 'reference', _ref: orderId} : undefined,
          orderNumber: order?.orderNumber || undefined,
          trackingNumber: trackingCode,
          trackingUrl,
          carrier: resolvedCarrier,
          labelUrl,
          labelCost: amount,
          labelCreatedAt: shippingStatus.lastEventAt,
          provider: 'easypost',
          shipmentId: shipment.id,
          trackerId: tracker?.id,
        },
        {autoGenerateArrayKeys: true},
      )
    } catch (err) {
      console.warn('Failed to create shippingLabel document', err)
    }
  }

  return {
    provider: 'easypost',
    shipmentId: shipment.id,
    trackerId: tracker?.id,
    labelUrl,
    trackingNumber: trackingCode,
    trackingUrl,
    rate: amount,
    currency: selectedRate?.currency || undefined,
    status: shippingStatus.status,
    carrier: resolvedCarrier,
    labelCreatedAt: shippingStatus.lastEventAt,
    labelCost: amount,
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: CORS_HEADERS, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }
  }

  let payload: Record<string, any> = {}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON payload'}),
    }
  }

  if (payload.address && payload.parcel && payload.selectedRate) {
    try {
      const result = await createWizardLabel({
        address: payload.address,
        parcel: payload.parcel,
        selectedRate: payload.selectedRate,
      })
      return {
        statusCode: 200,
        headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
        body: JSON.stringify(result),
      }
    } catch (err: any) {
      const message = err?.message || 'EasyPost label generation failed'
      console.error('easypostCreateLabel wizard error', err)
      return {
        statusCode: 400,
        headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
        body: JSON.stringify({message}),
      }
    }
  }

  const orderId = (payload.orderId || payload.order_id || '').toString().trim()
  const invoiceId = (payload.invoiceId || payload.invoice_id || '').toString().trim()
  const shipTo = payload.ship_to
    ? {
        name: payload.ship_to?.name || 'Recipient',
        street1: payload.ship_to?.street1 || payload.ship_to?.address_line1,
        street2: payload.ship_to?.street2 || payload.ship_to?.address_line2,
        city: payload.ship_to?.city || payload.ship_to?.city_locality,
        state: payload.ship_to?.state || payload.ship_to?.state_province,
        zip: payload.ship_to?.zip || payload.ship_to?.postal_code,
        country: payload.ship_to?.country || payload.ship_to?.country_code,
        phone: payload.ship_to?.phone,
        email: payload.ship_to?.email,
      }
    : undefined
  const shipFrom = payload.ship_from
    ? {
        name: payload.ship_from?.name,
        street1: payload.ship_from?.street1 || payload.ship_from?.address_line1,
        street2: payload.ship_from?.street2 || payload.ship_from?.address_line2,
        city: payload.ship_from?.city || payload.ship_from?.city_locality,
        state: payload.ship_from?.state || payload.ship_from?.state_province,
        zip: payload.ship_from?.zip || payload.ship_from?.postal_code,
        country: payload.ship_from?.country || payload.ship_from?.country_code,
        phone: payload.ship_from?.phone,
        email: payload.ship_from?.email,
      }
    : undefined

  if (!orderId && !invoiceId && !shipTo) {
    return {
      statusCode: 400,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing orderId or shipping details'}),
    }
  }

  try {
    const result = await createEasyPostLabel({
      orderId,
      invoiceId,
      shipTo:
        shipTo?.street1 && shipTo.city && shipTo.state && shipTo.zip && shipTo.country
          ? shipTo
          : undefined,
      shipFrom:
        shipFrom?.street1 && shipFrom.city && shipFrom.state && shipFrom.zip && shipFrom.country
          ? shipFrom
          : undefined,
      weightOverride: payload.weight,
      dimensionsOverride: payload.dimensions,
      packageDetails: payload.package_details,
      reference: payload.reference,
    })

    return {
      statusCode: 200,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify(result),
    }
  } catch (err: any) {
    const {statusCode, message} = formatEasyPostError(err)
    const detail = (err?.body as any)?.error || err?.message || err
    console.error('easypostCreateLabel error', detail)
    return {
      statusCode,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: message || 'EasyPost label generation failed'}),
    }
  }
}
