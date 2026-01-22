import {setTimeout as delay} from 'node:timers/promises'

type RateResponse = {
  success?: boolean
  rates?: Array<{rateId?: string; carrier?: string; service?: string; amount?: number}>
  easyPostShipmentId?: string
  error?: string
  missing?: string[]
}

const baseUrl = (process.env.SANITY_NETLIFY_BASE || 'https://fassanity.fasmotorsports.com').replace(
  /\/$/,
  '',
)
const endpoint = `${baseUrl}/.netlify/functions/getEasyPostRates`

const payload = {
  ship_to: {
    name: 'Test Customer',
    address_line1: '6161 Riverside Dr',
    city_locality: 'Punta Gorda',
    state_province: 'FL',
    postal_code: '33982',
    country_code: 'US',
  },
  package_details: {
    weight: {value: 2, unit: 'pound'},
    dimensions: {unit: 'inch', length: 10, width: 8, height: 4},
  },
}

async function run() {
  console.log(`[phase-2] POST ${endpoint}`)
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  })

  const rawText = await res.text()
  let data: RateResponse | null = null
  try {
    data = rawText ? (JSON.parse(rawText) as RateResponse) : null
  } catch {
    data = null
  }

  console.log(`[phase-2] Status: ${res.status}`)
  if (!res.ok) {
    console.error('[phase-2] Error response:', data ?? rawText)
    process.exit(1)
  }

  const rateCount = Array.isArray(data?.rates) ? data?.rates?.length : 0
  console.log(`[phase-2] Rates returned: ${rateCount}`)
  if (!rateCount) {
    console.warn('[phase-2] No rates returned; verify EasyPost configuration and payload.')
  }

  if (data?.easyPostShipmentId) {
    console.log(`[phase-2] easyPostShipmentId: ${data.easyPostShipmentId}`)
  }

  await delay(100)
}

run().catch((error) => {
  console.error('[phase-2] Test failed:', error)
  process.exit(1)
})
