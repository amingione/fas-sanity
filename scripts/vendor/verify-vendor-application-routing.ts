const baseUrl = (process.env.SANITY_NETLIFY_BASE || 'https://fassanity.fasmotorsports.com').replace(
  /\/$/,
  '',
)

const endpoints = [
  '/.netlify/functions/vendor-application',
  '/.netlify/functions/submitVendorApplication',
]

async function probe(url: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({}),
  })
  const text = await res.text()
  const ok = res.status === 410
  const note = ok ? 'Deprecated endpoint returns 410' : `Unexpected status (${res.status})`
  console.log(`[phase-2] ${ok ? 'OK' : 'FAIL'} ${url} -> ${note}`)
  if (!ok) {
    console.log(`[phase-2] Response body: ${text}`)
  }
  return ok
}

async function run() {
  const results = await Promise.all(endpoints.map((path) => probe(`${baseUrl}${path}`)))
  if (results.some((ok) => !ok)) {
    process.exit(1)
  }
}

run().catch((error) => {
  console.error('[phase-2] Vendor routing verification failed:', error)
  process.exit(1)
})
