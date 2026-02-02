const MEDUSA_API_URL = (process.env.MEDUSA_API_URL || '').trim()

if (!MEDUSA_API_URL) {
  throw new Error('MEDUSA_API_URL is required for Shippo webhook proxy')
}

const getHeader = (headers: Record<string, any> | undefined, key: string): string | undefined => {
  if (!headers) return undefined
  const direct = headers[key]
  if (typeof direct === 'string') return direct
  const lower = key.toLowerCase()
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === lower) {
      if (typeof value === 'string') return value
      if (Array.isArray(value)) return value[0]
    }
  }
  return undefined
}

export async function handler(event: any) {
  const method = event.httpMethod || 'POST'
  const incomingBody = event.body || ''
  const rawBodyBuffer = event.isBase64Encoded
    ? Buffer.from(incomingBody, 'base64')
    : Buffer.from(incomingBody, 'utf8')

  let eventId: string | undefined
  let eventType: string | undefined
  let fulfillmentId: string | undefined
  let orderId: string | undefined
  try {
    const parsed = JSON.parse(rawBodyBuffer.toString('utf8') || '{}')
    eventId = parsed?.event_id || parsed?.data?.event_id
    eventType = parsed?.event
    fulfillmentId = parsed?.data?.fulfillment_id || parsed?.data?.fulfillment?.id
    orderId = parsed?.data?.order_id || parsed?.data?.order?.id
  } catch {
    // parsing is best-effort for logging only
  }

  console.info('[Shippo Proxy] Received webhook', {
    event_id: eventId,
    event: eventType,
    fulfillment_id: fulfillmentId,
    order_id: orderId,
  })

  const contentType = getHeader(event.headers, 'content-type') || 'application/json'
  const signatureHeader =
    getHeader(event.headers, 'x-shippo-signature') || getHeader(event.headers, 'shippo-signature')

  try {
    const res = await fetch(`${MEDUSA_API_URL}/webhooks/shippo`, {
      method,
      headers: {
        'Content-Type': contentType,
        ...(signatureHeader ? { 'x-shippo-signature': signatureHeader } : {}),
      },
      body: rawBodyBuffer,
    })

    const text = await res.text()

    if (res.ok) {
      console.info('[Shippo Proxy] Medusa accepted webhook', {
        event_id: eventId,
        event: eventType,
        status: res.status,
      })
    } else {
      console.error('[Shippo Proxy] Medusa rejected webhook', {
        event_id: eventId,
        event: eventType,
        status: res.status,
        body: text,
      })
    }

    return {
      statusCode: res.status,
      body: text,
    }
  } catch (error) {
    console.error('[Shippo Proxy] Failed to reach Medusa', error)
    return {
      statusCode: 502,
      body: error instanceof Error ? error.message : 'Proxy error',
    }
  }
}
