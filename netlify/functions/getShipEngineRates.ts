import type { Handler } from '@netlify/functions'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_API_URL = 'https://api.shipengine.com/v1/rates/estimate'

async function getActiveCarrierIds(apiKey: string): Promise<string[]> {
  const resp = await fetch('https://api.shipengine.com/v1/carriers', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'API-Key': apiKey,
    },
  })

  if (!resp.ok) {
    throw new Error(`Failed to load carriers: ${resp.status}`)
  }

  const carriers = await resp.json() as Array<{ carrier_id: string; account_id?: string; nickname?: string; }>
  return carriers.map((c) => c.carrier_id).filter(Boolean)
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  if (!SHIPENGINE_API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing SHIPENGINE_API_KEY environment variable' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { ship_to, ship_from, package_details, carrier_ids: bodyCarrierIds } = body

    if (!ship_to || !ship_from || !package_details) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields' }),
      }
    }

    const carrierIds = Array.isArray(bodyCarrierIds) && bodyCarrierIds.length > 0
      ? bodyCarrierIds
      : await getActiveCarrierIds(SHIPENGINE_API_KEY)

    if (!carrierIds || carrierIds.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No active carriers available for this ShipEngine account.' }),
      }
    }

    const response = await fetch(SHIPENGINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': SHIPENGINE_API_KEY || '',
      },
      body: JSON.stringify({
        rate_options: {
          carrier_ids: carrierIds,
        },
        shipment: {
          validate_address: 'no_validation',
          ship_to,
          ship_from,
          packages: [package_details],
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: data }),
      }
    }

    const rates = (data.rate_response?.rates || []).map((rate: any) => ({
      carrierId: rate.carrier_id,
      carrierCode: rate.carrier_code,
      carrier: rate.carrier_friendly_name,
      service: rate.service_friendly_name,
      serviceCode: rate.service_code,
      amount: Number(rate.shipping_amount?.amount ?? 0),
      currency: rate.shipping_amount?.currency || 'USD',
      deliveryDays: rate.delivery_days ?? null,
      estimatedDeliveryDate: rate.estimated_delivery_date ?? null,
    }))

    // Sort by price ascending for convenience
    rates.sort((a: any, b: any) => a.amount - b.amount)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates }),
    }
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    }
  }
}

export default handler