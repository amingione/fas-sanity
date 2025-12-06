import type {Handler} from '@netlify/functions'
import {
  getEasyPostClient,
  resolveDimensions,
  resolveWeight,
  type DimensionsInput,
  type WeightInput,
  easypostRequest,
} from '../lib/easypostClient'
import {getEasyPostFromAddress} from '../lib/ship-from'

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function makeCORS(origin?: string) {
  const fallback = DEFAULT_ORIGINS[0] || '*'
  if (!origin)
    return {
      'Access-Control-Allow-Origin': fallback,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    }
  if (/^http:\/\/localhost:\d+$/i.test(origin) || DEFAULT_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    }
  }
  return {
    'Access-Control-Allow-Origin': fallback,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  }
}

type AddressInput = {
  name?: string
  phone?: string
  email?: string
  address_line1?: string
  address_line2?: string
  city_locality?: string
  state_province?: string
  postal_code?: string
  country_code?: string
}

function normalizeAddress(input: AddressInput | null | undefined) {
  if (!input) return null
  const street = input.address_line1?.trim()
  const city = input.city_locality?.trim()
  const state = input.state_province?.trim()
  const postal = input.postal_code?.trim()
  const country = (input.country_code || 'US').trim()
  if (!street || !city || !state || !postal || !country) return null
  return {
    name: input.name,
    phone: input.phone,
    email: input.email,
    street1: street,
    street2: input.address_line2 || undefined,
    city,
    state,
    zip: postal,
    country,
  }
}

type PackageDetails = {
  weight?: WeightInput
  dimensions?: DimensionsInput
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: CORS, body: ''}
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }
  }

  let payload: Record<string, any> = {}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON payload'}),
    }
  }

  const shipTo = normalizeAddress(payload?.ship_to)
  const defaultFrom = getEasyPostFromAddress()
  const shipFrom =
    normalizeAddress(payload?.ship_from) ||
    normalizeAddress({
      address_line1: defaultFrom.street1,
      address_line2: defaultFrom.street2,
      city_locality: defaultFrom.city,
      state_province: defaultFrom.state,
      postal_code: defaultFrom.zip,
      country_code: defaultFrom.country,
      name: defaultFrom.name,
      phone: defaultFrom.phone,
      email: defaultFrom.email,
    })

  const packageDetails: PackageDetails = payload?.package_details || {}

  if (!shipTo) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing or incomplete ship_to address'}),
    }
  }

  if (!shipFrom) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing ship_from configuration'}),
    }
  }

  const weight = resolveWeight(packageDetails.weight, null)
  const dimensions = resolveDimensions(packageDetails.dimensions, null)

  try {
    const client = getEasyPostClient()
    const shipment = await client.Shipment.create({
      to_address: shipTo,
      from_address: shipFrom,
      parcel: {
        length: dimensions.length,
        width: dimensions.width,
        height: dimensions.height,
        weight: Math.max(1, Number(weight.ounces.toFixed(2))),
      },
    } as any)

    // Attempt SmartRate for richer delivery predictions
    let smartRates: any[] = []
    try {
      const smartRateResponse = await easypostRequest('GET', `/shipments/${shipment.id}/smartrate`)
      if (Array.isArray((smartRateResponse as any)?.result)) {
        smartRates = (smartRateResponse as any).result
      } else if (Array.isArray(smartRateResponse as any)) {
        smartRates = smartRateResponse as any[]
      }
    } catch (err) {
      console.warn('SmartRate failed, falling back to basic rates', err)
    }

    const rates = Array.isArray(shipment?.rates) ? shipment.rates : []
    const formatted = rates.map((rate: any) => {
      const parsedAmount = Number.parseFloat(rate?.rate)
      const smartData = smartRates.find(
        (sr) => sr?.carrier === rate?.carrier && sr?.service === rate?.service,
      )
      const deliveryDate = rate?.delivery_date ? new Date(rate.delivery_date).toISOString() : null
      const smartDeliveryDate = smartData?.delivery_date
        ? new Date(smartData.delivery_date).toISOString()
        : null

      return {
        carrierId: rate?.carrier_account_id || '',
        carrierCode: rate?.carrier || '',
        carrier: rate?.carrier_display_name || rate?.carrier || '',
        service: rate?.service || '',
        serviceCode: rate?.service_code || '',
        amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
        currency: rate?.currency || 'USD',
        deliveryDays: typeof rate?.delivery_days === 'number' ? rate.delivery_days : null,
        estimatedDeliveryDate: deliveryDate,

        // SmartRate enhancements
        timeInTransit: smartData?.time_in_transit || null,
        deliveryDateConfidence:
          typeof smartData?.delivery_date_confidence === 'number'
            ? smartData.delivery_date_confidence
            : null,
        deliveryDateGuaranteed: Boolean(smartData?.delivery_date_guaranteed),
        accurateDeliveryDate: smartDeliveryDate || deliveryDate,
      }
    })

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({rates: formatted}),
    }
  } catch (err: any) {
    console.error('getEasyPostRates error', err)
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Failed to fetch EasyPost rates'}),
    }
  }
}
