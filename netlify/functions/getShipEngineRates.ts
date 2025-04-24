import type { Handler } from '@netlify/functions'

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY
const SHIPENGINE_API_URL = 'https://api.shipengine.com/v1/rates/estimate'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  try {
    const { ship_to, ship_from, package_details } = JSON.parse(event.body || '{}')

    if (!ship_to || !ship_from || !package_details) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields' }),
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
          carrier_ids: [],
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

    const services = (data.rate_response?.rates || []).map((rate: any) => ({
      title: `${rate.carrier_friendly_name} - ${rate.service_friendly_name} ($${rate.shipping_amount.amount})`,
      value: rate.service_code,
    }))

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(services),
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

export const fetchRates = async () => {
  const payload = { /* Add valid payload */ };
  const res = await fetch('/.netlify/functions/getShipEngineRates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  console.log('Response:', res);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const data = await res.json();
  console.log('Data:', data);
  return data;
}