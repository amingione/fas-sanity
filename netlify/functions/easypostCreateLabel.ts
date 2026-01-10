// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {getEasyPostFromAddress} from '../lib/ship-from'
import {
  easypostRequest,
  getEasyPostClient,
  resolveDimensions,
  resolveWeight,
  type DimensionsInput,
  type WeightInput,
} from '../lib/easypostClient'
import {
  getEasyPostAddressMissingFields,
  getEasyPostParcelMissingFields,
} from '../lib/easypostValidation'
import {sanityClient} from '../lib/sanityClient'

const DEFAULT_ORIGIN = (process.env.CORS_ALLOW || 'http://localhost:3333').split(',')[0].trim()
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

function calculatePackageDetails(cart: any[] = []) {
  let totalWeight = 0
  let maxLength = 12
  let maxWidth = 12
  let maxHeight = 8

  const clamp = (value: number, fallback: number) =>
    Number.isFinite(value) && value > 0 ? value : fallback

  for (const item of cart) {
    const qty = Math.max(1, Number(item?.quantity || 1))
    const weightSource = item?.shippingWeight ?? item?.weight ?? 0
    const normalizedWeight =
      weightSource && typeof weightSource === 'object'
        ? Number(
            (weightSource as any)?.value ??
              (weightSource as any)?.amount ??
              (weightSource as any)?.weight ??
              0,
          )
        : Number(weightSource)

    if (Number.isFinite(normalizedWeight) && normalizedWeight > 0) {
      totalWeight += normalizedWeight * qty
    }

    const dimsSource = item?.shippingDimensions || item?.dimensions
    if (typeof dimsSource === 'string') {
      const match = dimsSource.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i)
      if (match) {
        const [, L, W, H] = match
        maxLength = Math.max(maxLength, Number(L))
        maxWidth = Math.max(maxWidth, Number(W))
        maxHeight = Math.max(maxHeight, Number(H))
      }
    } else if (dimsSource && typeof dimsSource === 'object') {
      const len = Number((dimsSource as any)?.length)
      const wid = Number((dimsSource as any)?.width)
      const ht = Number((dimsSource as any)?.height)
      if (Number.isFinite(len) && len > 0) maxLength = Math.max(maxLength, len)
      if (Number.isFinite(wid) && wid > 0) maxWidth = Math.max(maxWidth, wid)
      if (Number.isFinite(ht) && ht > 0) maxHeight = Math.max(maxHeight, ht)
    }
  }

  const fallbackWeight = Number(process.env.DEFAULT_PACKAGE_WEIGHT_LBS || 5) || 1
  const weight = clamp(totalWeight, fallbackWeight)

  return {
    weight,
    dimensions: {
      length: clamp(maxLength, 12),
      width: clamp(maxWidth, 12),
      height: clamp(maxHeight, 8),
    },
  }
}

const sanity = sanityClient

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
  paymentIntentId?: string | null
  stripePaymentIntentId?: string | null
  fulfillmentAttempts?: number | null
  cart?: Array<{
    quantity?: number
    name?: string
    sku?: string
    productRef?: {_ref?: string}
    shippingWeight?: number
    weight?: any
    shippingDimensions?: any
    dimensions?: any
  }>
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

type UploadedLabelAsset = {
  assetId: string
  assetUrl?: string | null
}

function sanitizeFilenameBase(value?: string | null) {
  const normalized = (value || '').toString().trim()
  const slug = normalized
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'label'
}

async function persistLabelPdf({
  labelUrl,
  order,
  orderId,
  invoiceId,
}: {
  labelUrl?: string
  order?: OrderDoc | null
  orderId?: string | null
  invoiceId?: string | null
}): Promise<UploadedLabelAsset | null> {
  const sourceUrl = (labelUrl || '').trim()
  if (!sourceUrl) return null

  try {
    const response = await fetch(sourceUrl)
    if (!response.ok) {
      throw new Error(`Label fetch failed (HTTP ${response.status})`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const filenameBase = sanitizeFilenameBase(
      order?.orderNumber || orderId || invoiceId || 'shipping-label',
    )
    const asset = await sanity.assets.upload('file', buffer, {
      filename: `shipping-label-${filenameBase}.pdf`,
      contentType: 'application/pdf',
    })
    const assetId = (asset as any)?._id || (asset as any)?.document?._id
    const assetUrl = (asset as any)?.url || (asset as any)?.document?.url

    if (!assetId) {
      return null
    }

    return {assetId, assetUrl}
  } catch (err) {
    console.warn('Unable to persist shipping label PDF', err)
    return null
  }
}

function assertAddress(address: EasyPostAddress) {
  const missing: string[] = []
  if (!address.name) missing.push('name')
  if (!address.street1) missing.push('addressLine1')
  if (!address.street2) missing.push('addressLine2')
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
  currency?: string
  delivery_days?: number | null
}

type SelectedRateInput = {
  carrier?: string | null
  service?: string | null
  rate?: string | number | null
  currency?: string | null
}

function normalizeRateValue(value?: string | number | null) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  return undefined
}

function buildSelectedRatePayload(rate?: SelectedRateInput) {
  if (!rate) return undefined
  const payload = {
    carrier:
      typeof rate.carrier === 'string' && rate.carrier.trim() ? rate.carrier.trim() : undefined,
    service:
      typeof rate.service === 'string' && rate.service.trim() ? rate.service.trim() : undefined,
    rate: normalizeRateValue(rate.rate),
    currency:
      typeof rate.currency === 'string' && rate.currency.trim() ? rate.currency.trim() : undefined,
  }
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined)
  return entries.length ? Object.fromEntries(entries) : undefined
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

  const shipmentPayload = {
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
  } as any
  const missingTo = getEasyPostAddressMissingFields(shipmentPayload.to_address)
  if (missingTo.length) {
    throw new Error(`Missing to_address fields: ${missingTo.join(', ')}`)
  }
  const missingFrom = getEasyPostAddressMissingFields(shipmentPayload.from_address)
  if (missingFrom.length) {
    throw new Error(`Missing from_address fields: ${missingFrom.join(', ')}`)
  }
  const missingParcel = getEasyPostParcelMissingFields(shipmentPayload.parcel)
  if (missingParcel.length) {
    throw new Error(`Missing parcel fields: ${missingParcel.join(', ')}`)
  }
  const shipment = await epClient.Shipment.create(shipmentPayload)

  let updatedShipment: any
  if (typeof (shipment as any).buy === 'function') {
    updatedShipment = await (shipment as any).buy({rate: selectedRate.id})
  } else {
    updatedShipment = await (epClient as any).Shipment.buy(shipment.id, selectedRate.id)
  }

  if (!updatedShipment?.id) {
    updatedShipment = await epClient.Shipment.retrieve(shipment.id)
  }

  const postageLabel = updatedShipment.postage_label || shipment.postage_label || null
  const labelUrl = postageLabel?.label_url || postageLabel?.label_pdf_url || undefined
  const trackingCode = updatedShipment.tracking_code || undefined
  const transitDays =
    typeof selectedRate.delivery_days === 'number' ? selectedRate.delivery_days : undefined
  const selectedRatePayload = buildSelectedRatePayload({
    carrier: selectedRate.carrier,
    service: selectedRate.service,
    rate: selectedRate.rate,
    currency: selectedRate.currency,
  })

  await sanity.create({
    _type: 'shipment',
    easypostId: updatedShipment?.id || shipment.id,
    createdAt: new Date().toISOString(),
    status: updatedShipment?.status,
    trackingCode,
    transitDays,
    recipient: `${address.street1}, ${address.city}`,
    labelUrl,
    selectedRate: selectedRatePayload,
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
  rateId?: string
  selectedRate?: {id?: string}
  shipTo?: EasyPostAddress
  shipFrom?: EasyPostAddress
  weightOverride?: WeightInput
  dimensionsOverride?: DimensionsInput
  packageDetails?: {weight?: WeightInput; dimensions?: DimensionsInput}
  reference?: string
  source?: string
}

export type EasyPostLabelResult = {
  success: boolean
  provider: 'easypost'
  shipmentId: string
  trackerId?: string
  labelUrl?: string
  labelAssetUrl?: string
  labelAssetId?: string
  providerLabelUrl?: string
  packingSlipUrl?: string
  qrCodeUrl?: string
  trackingNumber?: string
  trackingUrl?: string
  cost?: number
  rate?: number
  currency?: string
  status?: string
  carrier?: string
  service?: string
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
      cart[]{
        quantity,
        name,
        sku,
        productRef{_ref},
        shippingWeight,
        weight,
        shippingDimensions,
        dimensions
      },
      customerEmail,
      customerName,
      orderNumber,
      paymentIntentId,
      stripePaymentIntentId,
      fulfillmentAttempts
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
    rateId,
    selectedRate,
    shipTo,
    shipFrom,
    weightOverride,
    dimensionsOverride,
    packageDetails,
    reference,
    source,
  } = options
  if (source !== 'sanity-manual') {
    throw new Error('LABEL_PURCHASE_REQUIRES_MANUAL_SANITY_ACTION')
  }
  if (!orderId && !shipTo) {
    throw new Error('Missing orderId or shipTo address')
  }

  const order = orderId ? await fetchOrder(orderId) : null
  if (orderId && (!order || !order.shippingAddress)) {
    throw new Error('Order not found or missing shipping address')
  }

  if (orderId) {
    const nextAttempts = (order?.fulfillmentAttempts || 0) + 1
    await sanity
      .patch(orderId)
      .set({
        fulfillmentStatus: 'creating_label',
        fulfillmentAttempts: nextAttempts,
      })
      .commit({autoGenerateArrayKeys: true})
  }

  const defaultFrom = getEasyPostFromAddress()
  const toAddress = shipTo || (order ? toEasyPostAddress(order) : null)
  if (!toAddress) {
    throw new Error('Missing shipping address')
  }
  assertAddress(toAddress)

  const fromAddress = shipFrom || defaultFrom

  const packageFromCart = order?.cart ? calculatePackageDetails(order.cart) : null

  const weightInput =
    packageDetails?.weight ?? weightOverride ?? order?.weight ?? packageFromCart?.weight
  const dimensionsInput =
    packageDetails?.dimensions ??
    dimensionsOverride ??
    order?.dimensions ??
    packageFromCart?.dimensions

  const {ounces, pounds} = resolveWeight(weightInput, order?.weight ?? packageFromCart?.weight)
  const dimensions = resolveDimensions(
    dimensionsInput,
    order?.dimensions ?? packageFromCart?.dimensions,
  )
  const orderPaymentIntentId = order?.stripePaymentIntentId || order?.paymentIntentId || null
  const shipmentMetadata = Object.fromEntries(
    Object.entries({
      sanity_order_id: orderId || undefined,
      sanityOrderId: orderId || undefined,
      order_id: orderId || undefined,
      orderId: orderId || undefined,
      sanity_order_number: order?.orderNumber || undefined,
      order_number: order?.orderNumber || undefined,
      orderNumber: order?.orderNumber || undefined,
      sanity_invoice_id: invoiceId || undefined,
      invoice_id: invoiceId || undefined,
      customer_email: order?.customerEmail || undefined,
      customerEmail: order?.customerEmail || undefined,
      email: order?.customerEmail || undefined,
      stripe_payment_intent_id: orderPaymentIntentId || undefined,
      stripePaymentIntentId: orderPaymentIntentId || undefined,
    }).filter(([, value]) => Boolean(value)),
  )
  const metadataPayload = Object.keys(shipmentMetadata).length ? shipmentMetadata : undefined
  const shipmentReference = reference || order?.orderNumber || orderId || invoiceId

  const client = getEasyPostClient()

  const shipmentPayload = {
    to_address: toAddress,
    from_address: fromAddress,
    reference: shipmentReference,
    metadata: metadataPayload,
    options: {
      label_format: 'PDF',
      label_size: '4x6',
      metadata: metadataPayload,
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
  } as any
  const missingTo = getEasyPostAddressMissingFields(shipmentPayload.to_address)
  if (missingTo.length) {
    throw new Error(`Missing to_address fields: ${missingTo.join(', ')}`)
  }
  const missingFrom = getEasyPostAddressMissingFields(shipmentPayload.from_address)
  if (missingFrom.length) {
    throw new Error(`Missing from_address fields: ${missingFrom.join(', ')}`)
  }
  const missingParcel = getEasyPostParcelMissingFields(shipmentPayload.parcel)
  if (missingParcel.length) {
    throw new Error(`Missing parcel fields: ${missingParcel.join(', ')}`)
  }
  const shipment = await client.Shipment.create(shipmentPayload)

  const rates = Array.isArray(shipment?.rates) ? shipment.rates : []
  if (!rates.length) {
    throw new Error('No EasyPost rates available for shipment')
  }
  const sortedRates = rates
    .map((rate: any) => ({
      raw: rate,
      amount: Number.parseFloat(rate?.rate ?? ''),
    }))
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
    .sort((a, b) => a.amount - b.amount)

  const preferredRateId =
    rateId ||
    selectedRate?.id ||
    (packageDetails as any)?.rateId ||
    (packageDetails as any)?.selectedRateId

  const selectedRateEntry = preferredRateId
    ? sortedRates.find((rate) => rate.raw?.id === preferredRateId) || sortedRates[0]
    : sortedRates[0]
  const chosenRate = selectedRateEntry?.raw

  if (!chosenRate?.id) {
    throw new Error('Failed to determine lowest EasyPost rate')
  }

  console.log('easypostCreateLabel selected rate', {
    id: chosenRate.id,
    carrier: chosenRate.carrier,
    service: chosenRate.service,
    rate: chosenRate.rate,
  })

  let updatedShipment: any
  try {
    if (typeof (shipment as any).buy === 'function') {
      updatedShipment = await (shipment as any).buy({rate: chosenRate.id})
    } else {
      updatedShipment = await (client as any).Shipment.buy(shipment.id, chosenRate.id)
    }
  } catch (err) {
    console.error('EasyPost buy failed', err)
    throw err
  }

  if (!updatedShipment?.id) {
    updatedShipment = await client.Shipment.retrieve(shipment.id)
  }

  let packingSlipUrl: string | undefined
  let qrCodeUrl: string | undefined

  // Attempt to generate EasyPost forms (packing slip + optional label QR code)
  try {
    const lineItems =
      order?.cart?.map((item) => ({
        product: {
          title: item?.name || item?.sku || 'Product',
          barcode: item?.sku || undefined,
        },
        units: Number.isFinite(Number(item?.quantity)) ? Number(item?.quantity) : 1,
      })) || []

    const payload = {
      form: {
        type: 'return_packing_slip',
        barcode: order?.orderNumber || shipment.id,
        ...(lineItems.length ? {line_items: lineItems} : {}),
      },
    }

    const formData: any = await easypostRequest('POST', `/shipments/${shipment.id}/forms`, payload)
    packingSlipUrl = formData?.form_url || undefined
    if (packingSlipUrl) {
      console.log('EasyPost packing slip created', {shipmentId: shipment.id, packingSlipUrl})
    }

    try {
      const qrPayload = {form: {type: 'label_qr_code'}}
      const qrData: any = await easypostRequest(
        'POST',
        `/shipments/${shipment.id}/forms`,
        qrPayload,
      )
      qrCodeUrl = qrData?.form_url || undefined
    } catch (err) {
      console.warn('EasyPost label_qr_code form failed (non-blocking)', err)
    }
  } catch (err) {
    console.warn('EasyPost packing slip form failed (non-blocking)', err)
  }

  const tracker = updatedShipment.tracker || null
  const appliedRate = updatedShipment.selected_rate || chosenRate

  const postageLabel = updatedShipment.postage_label || shipment.postage_label || null

  const rawLabelUrl = postageLabel?.label_url || postageLabel?.label_pdf_url || undefined
  const labelAsset =
    rawLabelUrl && orderId
      ? await persistLabelPdf({
          labelUrl: rawLabelUrl,
          order,
          orderId: orderId || null,
          invoiceId: invoiceId || null,
        })
      : null
  const labelUrl = labelAsset?.assetUrl || rawLabelUrl
  const trackingCode = updatedShipment.tracking_code || tracker?.tracking_code || undefined
  const trackingUrl = tracker?.public_url || undefined
  const labelFileField = labelAsset?.assetId
    ? {_type: 'file', asset: {_type: 'reference', _ref: labelAsset.assetId}}
    : undefined

  const latestDetail =
    Array.isArray(tracker?.tracking_details) && tracker.tracking_details.length
      ? tracker.tracking_details[tracker.tracking_details.length - 1]
      : null
  const lastEventAt =
    latestDetail?.datetime || tracker?.updated_at || tracker?.created_at || new Date().toISOString()

  const rateAmount = Number.parseFloat(appliedRate?.rate || '')
  const amount = Number.isFinite(rateAmount) ? Number(rateAmount.toFixed(2)) : undefined

  const resolvedCarrier =
    appliedRate?.carrier ||
    tracker?.carrier ||
    updatedShipment?.selected_rate?.carrier ||
    shipment?.selected_rate?.carrier ||
    undefined

  const shippingStatus: Record<string, any> = {
    carrier: resolvedCarrier,
    service: appliedRate?.service || undefined,
    labelUrl,
    trackingCode,
    trackingUrl,
    status: tracker?.status || 'label_created',
    cost: amount,
    currency: appliedRate?.currency || undefined,
    lastEventAt: lastEventAt ? new Date(lastEventAt).toISOString() : new Date().toISOString(),
  }

  if (orderId) {
    const rateId =
      (appliedRate as any)?.id ||
      (updatedShipment?.selected_rate as any)?.id ||
      (shipment?.selected_rate as any)?.id ||
      appliedRate?.service_code ||
      undefined

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

    const patchSet = Object.fromEntries(
      Object.entries({
        shippingLabelUrl: labelUrl,
        shippingLabelFile: labelFileField,
        trackingNumber: trackingCode,
        trackingUrl,
        shippingStatus,
        easyPostShipmentId: shipment.id,
        easyPostTrackerId: tracker?.id,
        labelCreatedAt: shippingStatus.lastEventAt,
        labelCost: amount,
        labelPurchasedFrom: resolvedCarrier || 'EasyPost',
        'fulfillment.status': 'label_created',
        fulfillmentStatus: 'label_created',
        fulfillmentError: null,
        carrier: resolvedCarrier,
        service: shippingStatus.service || undefined,
        shippedAt: shippingStatus.lastEventAt,
        ...(rateId ? {easypostRateId: rateId} : {}),
        ...(typeof appliedRate?.delivery_days === 'number'
          ? {deliveryDays: appliedRate.delivery_days}
          : {}),
        ...(tracker?.est_delivery_date
          ? {estimatedDeliveryDate: new Date(tracker.est_delivery_date).toISOString().slice(0, 10)}
          : {}),
        packingSlipUrl: packingSlipUrl || undefined,
        qrCodeUrl: qrCodeUrl || undefined,
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
          packingSlipUrl,
          qrCodeUrl,
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
    success: true,
    provider: 'easypost',
    shipmentId: shipment.id,
    trackerId: tracker?.id,
    labelUrl,
    labelAssetUrl: labelAsset?.assetUrl || undefined,
    labelAssetId: labelAsset?.assetId || undefined,
    providerLabelUrl: rawLabelUrl,
    packingSlipUrl,
    qrCodeUrl,
    trackingNumber: trackingCode,
    trackingUrl,
    cost: amount,
    rate: amount,
    currency: appliedRate?.currency || undefined,
    status: shippingStatus.status,
    carrier: resolvedCarrier,
    service: appliedRate?.service || undefined,
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

  const requestSource = (payload.source || '').toString().trim()
  // Prevent any webhook/public checkout call from secretly purchasing labels.
  if (requestSource !== 'sanity-manual') {
    console.warn('Blocked EasyPost label request without manual source flag', {source: requestSource})
    return {
      statusCode: 403,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'LABEL_PURCHASE_REQUIRES_MANUAL_SANITY_ACTION'}),
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
      rateId:
        payload.rateId ||
        payload.rate_id ||
        payload.selectedRateId ||
        payload.selected_rate_id ||
        payload.selectedRate?.id,
      selectedRate: payload.selectedRate,
      source: requestSource,
    })

    return {
      statusCode: 200,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify(result),
    }
  } catch (err: any) {
    if (orderId) {
      try {
        await sanity
          .patch(orderId)
          .set({
            fulfillmentStatus: 'label_creation_failed',
            fulfillmentError: err?.message || 'Label creation failed',
          })
          .commit({autoGenerateArrayKeys: true})
      } catch (patchErr) {
        console.warn('easypostCreateLabel: failed to record fulfillment error', patchErr)
      }
    }
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
