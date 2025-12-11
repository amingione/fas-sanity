import type {Handler} from '@netlify/functions'
import EasyPost from '@easypost/api'

const API_KEY = process.env.EASYPOST_API_KEY
const easyPostClient = API_KEY ? new EasyPost(API_KEY) : null

const jsonResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(payload),
})

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {error: 'Method not allowed'})
  }

  if (!easyPostClient) {
    return jsonResponse(500, {error: 'Missing EASYPOST_API_KEY environment variable'})
  }

  try {
    const {toAddress, parcel} = JSON.parse(event.body || '{}')
    if (!toAddress || !parcel) {
      return jsonResponse(400, {error: 'Missing toAddress or parcel payload'})
    }

    const normalizedParcel = normalizeParcel(parcel)
    const shipment = await easyPostClient.Shipment.create({
      to_address: parseAddress(toAddress),
      from_address: {
        company: 'F.A.S. Motorsports LLC',
        street1: '6161 Riverside Dr',
        city: 'Punta Gorda',
        state: 'FL',
        zip: '33982',
        country: 'US',
        phone: '(812) 200-9012',
      },
      parcel: normalizedParcel,
    })

    const rates =
      Array.isArray(shipment?.rates) && shipment.rates.length
        ? shipment.rates.map((rate: any) => ({
            rateId: rate.id,
            carrier: rate.carrier,
            service: rate.service,
            rate: rate.rate,
            currency: rate.currency,
            deliveryDays: rate.delivery_days,
          }))
        : []

    return jsonResponse(200, {rates})
  } catch (error: any) {
    console.error('easypostGetRates failed', error)
    const message =
      error?.body?.error?.message || error?.message || 'Failed to retrieve shipping rates'
    return jsonResponse(500, {error: message})
  }
}

export {handler}

function normalizeParcel(parcel: Record<string, unknown>) {
  const length = toPositiveNumber(parcel.length)
  const width = toPositiveNumber(parcel.width)
  const height = toPositiveNumber(parcel.height)
  const weight = toPositiveNumber(parcel.weight)
  return {length, width, height, weight}
}

function toPositiveNumber(value: unknown) {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value || 0))
  return Number.isFinite(num) && num > 0 ? Number(num.toFixed(2)) : 1
}

function parseAddress(addressString: string) {
  const lines = (addressString || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const name = lines.length > 2 ? lines[0] : undefined
  const street1 = lines.length > 1 ? lines[1] : lines[0] || ''
  const cityState = lines.length > 2 ? lines[2] : lines[1] || ''
  const cityMatch = cityState.match(/([^,]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)/)

  return {
    name,
    street1,
    city: cityMatch ? cityMatch[1].trim() : cityState.split(',')[0]?.trim() || '',
    state: cityMatch ? cityMatch[2] : '',
    zip: cityMatch ? cityMatch[3] : '',
    country: 'US',
  }
}
