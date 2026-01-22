import type {Handler} from '@netlify/functions'
import {getEasyPostClient, resolveDimensions, resolveWeight} from '../lib/easypostClient'
import {getEasyPostFromAddress} from '../lib/ship-from'
import {getEasyPostAddressMissingFields, getEasyPostParcelMissingFields} from '../lib/easypostValidation'

const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')

function makeCORS(origin?: string) {
  let allowed = DEFAULT_ORIGINS[0]
  if (origin) {
    if (/^http:\/\/localhost:\d+$/i.test(origin)) allowed = origin
    else if (DEFAULT_ORIGINS.includes(origin)) allowed = origin
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

type RawAddress = Record<string, unknown> | null | undefined
type RawPackage = Record<string, unknown> | null | undefined

const normalizeAddress = (input: RawAddress) => ({
  name: typeof input?.name === 'string' ? input.name : undefined,
  street1:
    (input as any)?.street1 ||
    (input as any)?.address_line1 ||
    (input as any)?.addressLine1 ||
    (input as any)?.line1 ||
    (input as any)?.street,
  street2:
    (input as any)?.street2 ||
    (input as any)?.address_line2 ||
    (input as any)?.addressLine2 ||
    (input as any)?.line2,
  city: (input as any)?.city || (input as any)?.city_locality,
  state: (input as any)?.state || (input as any)?.state_province,
  zip: (input as any)?.zip || (input as any)?.postal_code || (input as any)?.postalCode,
  country: (input as any)?.country || (input as any)?.country_code || 'US',
  phone: typeof (input as any)?.phone === 'string' ? (input as any)?.phone : undefined,
  email: typeof (input as any)?.email === 'string' ? (input as any)?.email : undefined,
})

const readNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST')
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }

  let body: any = {}
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid JSON'}),
    }
  }

  const shipToInput: RawAddress = body?.ship_to || body?.shipTo || body?.to || null
  const shipFromInput: RawAddress = body?.ship_from || body?.shipFrom || null
  const packageDetails: RawPackage = body?.package_details || body?.packageDetails || null
  const rawDimensions = (packageDetails as any)?.dimensions || body?.dimensions
  const rawWeight = (packageDetails as any)?.weight || body?.weight

  const shipToMissing = getEasyPostAddressMissingFields(shipToInput)
  if (shipToMissing.length) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing ship_to address fields', missing: shipToMissing}),
    }
  }

  const fallbackFrom = getEasyPostFromAddress()
  const shipFromResolved = shipFromInput ? normalizeAddress(shipFromInput) : fallbackFrom
  const shipFromMissing = getEasyPostAddressMissingFields(shipFromResolved)
  if (shipFromMissing.length) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing ship_from address fields', missing: shipFromMissing}),
    }
  }

  const parcelValidation = {
    length: readNumber((rawDimensions as any)?.length),
    width: readNumber((rawDimensions as any)?.width),
    height: readNumber((rawDimensions as any)?.height),
    weight: readNumber((rawWeight as any)?.value ?? rawWeight),
  }
  const missingParcel = getEasyPostParcelMissingFields(parcelValidation)
  if (missingParcel.length) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing package details', missing: missingParcel}),
    }
  }

  const normalizedWeight = resolveWeight(rawWeight, 1)
  const normalizedDimensions = resolveDimensions(rawDimensions, null)
  const parcel = {
    length: Number(normalizedDimensions.length.toFixed(2)),
    width: Number(normalizedDimensions.width.toFixed(2)),
    height: Number(normalizedDimensions.height.toFixed(2)),
    weight: Math.max(1, Math.round(normalizedWeight.ounces)),
  }

  try {
    const client = getEasyPostClient()
    const shipment = await client.Shipment.create({
      to_address: normalizeAddress(shipToInput),
      from_address: shipFromResolved,
      parcel,
    } as any)

    const ratesArr: any[] = Array.isArray(shipment?.rates) ? shipment.rates : []
    const rates = ratesArr
      .map((rate: any) => {
        const amount = Number.parseFloat(rate?.rate || '0')
        return {
          rateId: rate?.id,
          carrierId: rate?.carrier_account_id || '',
          carrierCode: rate?.carrier || '',
          carrier: rate?.carrier_display_name || rate?.carrier || '',
          service: rate?.service || '',
          serviceCode: rate?.service_code || '',
          amount: Number.isFinite(amount) ? amount : 0,
          currency: rate?.currency || 'USD',
          deliveryDays: typeof rate?.delivery_days === 'number' ? rate.delivery_days : null,
          estimatedDeliveryDate: rate?.delivery_date
            ? new Date(rate.delivery_date).toISOString()
            : null,
          accurateDeliveryDate: rate?.est_delivery_date
            ? new Date(rate.est_delivery_date).toISOString()
            : null,
          deliveryDateGuaranteed: Boolean(rate?.delivery_date_guaranteed),
        }
      })
      .filter((rate) => Number.isFinite(rate.amount) && rate.amount > 0)
      .sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0))

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        success: true,
        rates,
        easyPostShipmentId: shipment?.id || '',
      }),
    }
  } catch (error) {
    console.error('getEasyPostRates error', error)
    const message = error instanceof Error ? error.message : 'Unable to fetch EasyPost rates'
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: message}),
    }
  }
}
