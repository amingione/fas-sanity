type ProbeResult = {
  url: string
  status: number
  ok: boolean
  note: string
}

const baseUrl = (process.env.SANITY_NETLIFY_BASE || 'https://fassanity.fasmotorsports.com').replace(
  /\/$/,
  '',
)
const endpoints = ['/.netlify/functions/easypostWebhook', '/.netlify/functions/easypost-webhook']

const validStatuses = new Set([401, 500])
const validOptionsStatuses = new Set([200, 204])

async function probe(url: string): Promise<ProbeResult> {
  const optionsRes = await fetch(url, {method: 'OPTIONS'})
  const optionsOk = validOptionsStatuses.has(optionsRes.status)
  if (!optionsOk) {
    return {
      url,
      status: optionsRes.status,
      ok: false,
      note: 'OPTIONS did not return 200/204',
    }
  }

  const postRes = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({object: 'Event'}),
  })
  const ok = validStatuses.has(postRes.status)
  return {
    url,
    status: postRes.status,
    ok,
    note: ok
      ? 'POST reached handler (401 invalid signature or 500 missing secret expected)'
      : 'Unexpected POST status',
  }
}

async function run() {
  const results = await Promise.all(
    endpoints.map((path) => probe(`${baseUrl}${path}`)),
  )
  for (const result of results) {
    const prefix = result.ok ? '[phase-2] OK' : '[phase-2] FAIL'
    console.log(`${prefix} ${result.url} -> ${result.status} (${result.note})`)
  }

  if (results.some((result) => !result.ok)) {
    process.exit(1)
  }
}

run().catch((error) => {
  console.error('[phase-2] Webhook routing verification failed:', error)
  process.exit(1)
})
