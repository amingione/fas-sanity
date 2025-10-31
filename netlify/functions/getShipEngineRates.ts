const US_STATE_ABBR: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
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
}
function toUsAbbr(val?: string) {
  if (!val) return undefined
  const s = String(val).trim()
  if (s.length === 2) return s.toUpperCase()
  const ab = US_STATE_ABBR[s.toLowerCase()]
  return ab || s.toUpperCase()
}
import type {Handler} from '@netlify/functions'
import {getShipEngineFromAddress} from '../lib/ship-from'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_API_URL = 'https://api.shipengine.com/v1/rates/estimate'

const ALLOW_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3333'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

const DEFAULT_CARRIER_IDS = ['se-2300833', 'se-2945844'] // UPS, FedEx

export const handler: Handler = async (event) => {
  // Preflight support for Studio's POST JSON
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

  if (!SHIPENGINE_API_KEY) {
    return {
      statusCode: 500,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing SHIPENGINE_API_KEY environment variable'}),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const {ship_to, package_details, carrier_ids: bodyCarrierIds} = body
    const ship_from = getShipEngineFromAddress()

    if (!ship_to || !package_details) {
      return {
        statusCode: 400,
        headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: 'Missing required fields (ship_to, package_details).'}),
      }
    }

    const carrierIds = (
      Array.isArray(bodyCarrierIds) && bodyCarrierIds.length > 0
        ? bodyCarrierIds
        : DEFAULT_CARRIER_IDS
    ).filter(Boolean)

    if (!carrierIds || carrierIds.length === 0) {
      return {
        statusCode: 400,
        headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          error: 'No carrier IDs provided for rate lookup.',
          hint: 'Pass carrier_ids in the request body or set DEFAULT_CARRIER_IDS for UPS/FedEx.',
        }),
      }
    }

    // Prepare payload for ShipEngine's rates/estimate API (flat object, not shipment style)
    const {weight, dimensions} = package_details || {}

    const isShipToUS =
      typeof ship_to.country_code === 'string' && ship_to.country_code.toUpperCase() === 'US'
    const isShipFromUS =
      typeof ship_from.country_code === 'string' && ship_from.country_code.toUpperCase() === 'US'

    // Build payload conditionally based on US or non-US addresses
    const payload: any = {
      carrier_ids: carrierIds,
      to_country_code: ship_to?.country_code,
      to_postal_code: ship_to?.postal_code,
      from_country_code: ship_from?.country_code,
      from_postal_code: ship_from?.postal_code,
      weight: weight,
    }

    if (!isShipToUS) {
      payload.to_city_locality = ship_to?.city_locality
      payload.to_state_province = ship_to?.state_province
    }
    if (!isShipFromUS) {
      payload.from_city_locality = ship_from?.city_locality
      payload.from_state_province = ship_from?.state_province
    }
    if (dimensions) {
      payload.dimensions = dimensions
    }

    // Determine required fields based on US or non-US origin/destination
    const requiredFields = [
      'carrier_ids',
      'from_postal_code',
      'from_country_code',
      'to_country_code',
      'to_postal_code',
      'weight',
    ]
    if (!isShipToUS) {
      requiredFields.push('to_city_locality', 'to_state_province')
    }
    if (!isShipFromUS) {
      requiredFields.push('from_city_locality', 'from_state_province')
    }

    const missingFields = requiredFields.filter((f) => {
      if (Array.isArray(payload[f])) return payload[f].length === 0
      return payload[f] === undefined || payload[f] === null || payload[f] === ''
    })
    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          error: `Missing required fields for ShipEngine: ${missingFields.join(', ')}`,
        }),
      }
    }

    console.log('ShipEngine rates estimate payload:', payload)

    const response = await fetch(SHIPENGINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': SHIPENGINE_API_KEY || '',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    console.log('ShipEngine /rates/estimate raw response:', JSON.stringify(data)?.slice(0, 4000))

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: data}),
      }
    }

    let rates: any[] = []

    // Prefer the estimate format if present
    if (Array.isArray((data as any)?.rate_estimates)) {
      rates = (data as any).rate_estimates.map((rate: any) => ({
        carrierId: rate.carrier_id,
        carrierCode: rate.carrier_code,
        carrier: rate.carrier_friendly_name,
        service: rate.service_friendly_name || rate.service_type || rate.service_code,
        serviceCode: rate.service_code,
        amount: Number(rate.shipping_amount?.amount ?? 0),
        currency: rate.shipping_amount?.currency || 'USD',
        deliveryDays: rate.delivery_days ?? null,
        estimatedDeliveryDate: rate.estimated_delivery_date ?? null,
      }))
    } else if (Array.isArray((data as any)?.rate_response?.rates)) {
      // Some accounts return the shipment-style envelope even from /estimate
      rates = (data as any).rate_response.rates.map((rate: any) => ({
        carrierId: rate.carrier_id,
        carrierCode: rate.carrier_code,
        carrier: rate.carrier_friendly_name,
        service: rate.service_friendly_name || rate.service_type || rate.service_code,
        serviceCode: rate.service_code,
        amount: Number(rate.shipping_amount?.amount ?? 0),
        currency: rate.shipping_amount?.currency || 'USD',
        deliveryDays: rate.delivery_days ?? null,
        estimatedDeliveryDate: rate.estimated_delivery_date ?? null,
      }))
    }

    // ── Fallback: if estimate returned no rates, try /v1/rates with shipment-style payload
    if (!rates || rates.length === 0) {
      const haveToFull =
        !!ship_to?.name &&
        !!ship_to?.address_line1 &&
        !!ship_to?.postal_code &&
        !!ship_to?.country_code
      const haveFromFull =
        !!ship_from?.name &&
        !!ship_from?.address_line1 &&
        !!ship_from?.postal_code &&
        !!ship_from?.country_code &&
        !!ship_from?.phone

      if (!haveToFull || !haveFromFull) {
        console.log('Skipping /v1/rates fallback: missing full address fields', {
          haveToFull,
          haveFromFull,
          need: ['name', 'address_line1', 'postal_code', 'country_code', '(from.phone)'],
        })
      } else {
        const shipToIsUS = String(ship_to.country_code).toUpperCase() === 'US'
        const shipFromIsUS = String(ship_from.country_code).toUpperCase() === 'US'

        const to_state = shipToIsUS ? toUsAbbr(ship_to.state_province) : ship_to?.state_province
        const from_state = shipFromIsUS
          ? toUsAbbr(ship_from.state_province)
          : ship_from?.state_province

        const shipmentPayload: any = {
          rate_options: {carrier_ids: carrierIds},
          shipment: {
            validate_address: 'no_validation',
            ship_to: {
              name: ship_to.name,
              phone: ship_to.phone,
              address_line1: ship_to.address_line1,
              address_line2: ship_to.address_line2,
              city_locality: ship_to.city_locality,
              state_province: to_state,
              postal_code: ship_to.postal_code,
              country_code: ship_to.country_code,
            },
            ship_from: {
              name: ship_from.name,
              phone: ship_from.phone,
              address_line1: ship_from.address_line1,
              address_line2: ship_from.address_line2,
              city_locality: ship_from.city_locality,
              state_province: from_state,
              postal_code: ship_from.postal_code,
              country_code: ship_from.country_code,
            },
            packages: [{weight}],
          },
        }

        if (dimensions) shipmentPayload.shipment.packages[0].dimensions = dimensions

        console.log('ShipEngine /rates fallback payload (normalized):', shipmentPayload)

        const resp2 = await fetch('https://api.shipengine.com/v1/rates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'API-Key': SHIPENGINE_API_KEY || '',
          },
          body: JSON.stringify(shipmentPayload),
        })
        const data2 = await resp2.json()
        console.log('ShipEngine /rates raw response:', JSON.stringify(data2)?.slice(0, 4000))

        if (resp2.ok && Array.isArray((data2 as any)?.rate_response?.rates)) {
          rates = (data2 as any).rate_response.rates.map((rate: any) => ({
            carrierId: rate.carrier_id,
            carrierCode: rate.carrier_code,
            carrier: rate.carrier_friendly_name,
            service: rate.service_friendly_name || rate.service_type || rate.service_code,
            serviceCode: rate.service_code,
            amount: Number(rate.shipping_amount?.amount ?? 0),
            currency: rate.shipping_amount?.currency || 'USD',
            deliveryDays: rate.delivery_days ?? null,
            estimatedDeliveryDate: rate.estimated_delivery_date ?? null,
          }))
        } else if (!resp2.ok) {
          return {
            statusCode: resp2.status,
            headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
            body: JSON.stringify({error: data2}),
          }
        }
      }
    }

    rates.sort((a: any, b: any) => a.amount - b.amount)

    return {
      statusCode: 200,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        rates,
        debug: {
          usedFallback:
            !rates || rates.length === 0 ? false : !Array.isArray((data as any)?.rate_estimates),
        },
      }),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: error.message}),
    }
  }
}
