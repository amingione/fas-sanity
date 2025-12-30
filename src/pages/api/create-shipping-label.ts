import type {APIRoute} from 'astro'
import {Shipment} from '@easypost/api'
import {createClient} from '@sanity/client'
import {getEasyPostClient, resolveDimensions, resolveWeight} from '../../../netlify/lib/easypostClient'
import {getEasyPostFromAddress} from '../../../netlify/lib/ship-from'

type ShippingAddress = {
  name?: string | null
  phone?: string | null
  email?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}

type PackageDimensions = {
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
}

type NormalizedAddress = {
  name?: string
  phone?: string
  email?: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

type CreateLabelRequest = {
  orderId: string
  orderNumber?: string
  shippingAddress?: ShippingAddress | null
  packageDimensions?: PackageDimensions | null
  easypostRateId?: string | null
  carrier?: string | null
  service?: string | null
  purchasedBy?: string | null
}

type OrderForLabel = {
  _id: string
  orderNumber?: string | null
  customerName?: string | null
  labelPurchased?: boolean | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  shippingLabelUrl?: string | null
  shippingAddress?: ShippingAddress | null
  packageDimensions?: PackageDimensions | null
  fulfillment?: {
    status?: string | null
    packageDimensions?: PackageDimensions | null
  } | null
  weight?: {value?: number; unit?: string} | null
  carrier?: string | null
  service?: string | null
  easypostRateId?: string | null
  deliveryDays?: number | null
  estimatedDeliveryDate?: string | null
}

type SenderAddressDoc = {
  nickname?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
const token =
  process.env.SANITY_WRITE_TOKEN ||
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_ACCESS_TOKEN
const apiVersion = process.env.SANITY_API_VERSION || '2024-04-10'

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
  orderNumber,
  customerName,
  labelPurchased,
  trackingNumber,
  trackingUrl,
  shippingLabelUrl,
  shippingAddress,
  packageDimensions,
  fulfillment{status, packageDimensions},
  weight,
  carrier,
  service,
  easypostRateId,
  deliveryDays,
  estimatedDeliveryDate
}`

const DEFAULT_PACKAGE = {weight: 2, length: 10, width: 8, height: 4}

export const POST: APIRoute = async ({request}) => {
  let body: CreateLabelRequest
  try {
    body = (await request.json()) as CreateLabelRequest
  } catch {
    return jsonResponse({error: 'Invalid JSON payload'}, 400)
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
          error: 'Label already purchased',
          trackingNumber: order.trackingNumber || undefined,
        },
        400,
      )
    }

    const destination = normalizeAddress(body.shippingAddress || order.shippingAddress)
    if (!destination) {
      return jsonResponse({error: 'Missing shipping address'}, 400)
    }

    const packageInput =
      body.packageDimensions ||
      order.packageDimensions ||
      order.fulfillment?.packageDimensions ||
      null
    const dimensions = resolveDimensions(packageInput as any, DEFAULT_PACKAGE)
    const weightSource =
      packageInput?.weight ??
      order.packageDimensions?.weight ??
      order.fulfillment?.packageDimensions?.weight ??
      order.weight ??
      undefined
    const resolvedWeight = resolveWeight(
      weightSource as any,
      {value: DEFAULT_PACKAGE.weight, unit: 'pound'},
    )
    const parcel = {
      length: dimensions.length,
      width: dimensions.width,
      height: dimensions.height,
      weight: Math.max(Number(resolvedWeight.ounces.toFixed(2)), 1),
    }

    const fromAddress = await resolveSenderAddress()
    const shipment = await getEasyPostClient().Shipment.create({
      to_address: mapToEasyPostAddress(destination),
      from_address: fromAddress,
      options: {
        label_format: 'PDF',
        label_size: '4x6',
      },
      parcel,
    })

    const ratePreference = body.easypostRateId || order.easypostRateId || null
    const chosenRate = selectRate(shipment, ratePreference)
    if (!chosenRate) {
      throw new Error('No shipping rates available for this shipment')
    }
    const purchasedShipment = await Shipment.buy(shipment.id, chosenRate)
    const tracker = purchasedShipment.tracker || null
    const postageLabel = purchasedShipment.postage_label || null
    const labelUrl =
      postageLabel?.label_url ||
      postageLabel?.label_pdf_url ||
      postageLabel?.label_zpl_url ||
      undefined
    const trackingCode =
      purchasedShipment.tracking_code || tracker?.tracking_code || shipment.tracking_code || null
    const trackingUrl =
      tracker?.public_url ||
      (trackingCode ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingCode}` : null)
    const selectedRate = purchasedShipment.selected_rate || chosenRate
    const rateCostRaw =
      typeof selectedRate?.rate === 'number'
        ? selectedRate.rate
        : typeof selectedRate?.rate === 'string'
          ? Number.parseFloat(selectedRate.rate)
          : undefined
    const normalizedCost =
      typeof rateCostRaw === 'number' && Number.isFinite(rateCostRaw)
        ? Number(rateCostRaw.toFixed(2))
        : undefined
    const nowIso = new Date().toISOString()

    await sanity
      .patch(cleanOrderId)
      .set({
        labelPurchased: true,
        labelPurchasedAt: nowIso,
        labelPurchasedBy: (body.purchasedBy || '').trim() || 'Unknown',
        trackingNumber: trackingCode || undefined,
        trackingUrl: trackingUrl || undefined,
        shippingLabelUrl: labelUrl || undefined,
        labelCreatedAt: nowIso,
        labelCost: normalizedCost,
        easyPostShipmentId: purchasedShipment.id || shipment.id,
        easyPostTrackerId: tracker?.id,
        easypostRateId: selectedRate?.id || ratePreference || undefined,
        carrier: selectedRate?.carrier || body.carrier || order.carrier,
        service: selectedRate?.service || body.service || order.service,
        deliveryDays:
          typeof selectedRate?.delivery_days === 'number'
            ? selectedRate.delivery_days
            : order.deliveryDays,
        estimatedDeliveryDate: selectedRate?.delivery_date || order.estimatedDeliveryDate || undefined,
        'fulfillment.status': 'processing',
      })
      .commit({autoGenerateArrayKeys: true})

    return jsonResponse({
      success: true,
      trackingNumber: trackingCode,
      trackingUrl,
      labelUrl,
      carrier: selectedRate?.carrier,
      service: selectedRate?.service,
      cost: normalizedCost,
      deliveryDays: selectedRate?.delivery_days,
    })
  } catch (error: any) {
    console.error('create-shipping-label error:', error)
    return jsonResponse(
      {error: error?.message || 'Failed to create shipping label'},
      typeof error?.statusCode === 'number' ? error.statusCode : 500,
    )
  }
}

function normalizeAddress(address?: ShippingAddress | null): NormalizedAddress | null {
  if (!address) return null
  const line1 = address.addressLine1?.trim()
  const city = address.city?.trim()
  const state = address.state?.trim()
  const postalCode = address.postalCode?.trim()
  if (!line1 || !city || !state || !postalCode) {
    return null
  }
  return {
    name: address.name?.trim() || undefined,
    phone: address.phone?.trim() || undefined,
    email: address.email?.trim() || undefined,
    addressLine1: line1,
    addressLine2: address.addressLine2?.trim() || undefined,
    city,
    state,
    postalCode,
    country: (address.country || 'US').trim(),
  }
}

function mapToEasyPostAddress(address: NormalizedAddress) {
  return {
    name: address.name,
    street1: address.addressLine1,
    street2: address.addressLine2,
    city: address.city,
    state: address.state,
    zip: address.postalCode,
    country: address.country || 'US',
    phone: address.phone,
    email: address.email,
  }
}

async function resolveSenderAddress() {
  const sender = await sanity.fetch<SenderAddressDoc | null>(
    `*[_type == "senderAddress" && isDefaultSender == true][0]{nickname, street1, street2, city, state, postalCode, country, phone, email}`,
  )
  if (!sender || !sender.street1 || !sender.city || !sender.state || !sender.postalCode) {
    return getEasyPostFromAddress()
  }
  return {
    company: sender.nickname || sender.street1,
    name: sender.nickname || sender.street1,
    street1: sender.street1,
    street2: sender.street2 || undefined,
    city: sender.city,
    state: sender.state,
    zip: sender.postalCode,
    country: sender.country || 'US',
    phone: sender.phone || undefined,
    email: sender.email || undefined,
  }
}

function selectRate(shipment: any, preferredId?: string | null) {
  if (preferredId && Array.isArray(shipment?.rates)) {
    const match = shipment.rates.find((rate: any) => rate?.id === preferredId)
    if (match) return match
  }
  if (typeof shipment?.lowestRate === 'function') {
    try {
      const lowest = shipment.lowestRate()
      if (lowest) return lowest
    } catch (err) {
      console.warn('EasyPost lowestRate failed', err)
    }
  }
  if (Array.isArray(shipment?.rates) && shipment.rates.length > 0) {
    return shipment.rates[0]
  }
  return null
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}
