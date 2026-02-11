const DEFAULT_FORWARD_TIMEOUT_MS = 10000

const readEnv = (name: string): string => {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

const parseTimeoutMs = (value: string | undefined): number => {
  if (!value) return DEFAULT_FORWARD_TIMEOUT_MS
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1000) return DEFAULT_FORWARD_TIMEOUT_MS
  return parsed
}

const resolveForwardUrl = (): string => {
  const explicit = readEnv('SHIPPO_WEBHOOK_FORWARD_URL')
  if (explicit) return explicit

  const medusaBase = readEnv('MEDUSA_API_URL')
  if (!medusaBase) return ''
  return `${medusaBase.replace(/\/+$/, '')}/webhooks/shippo`
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
  const forwardUrl = resolveForwardUrl()
  const forwardEnabled = parseBool(process.env.SHIPPO_WEBHOOK_FORWARD_ENABLED, Boolean(forwardUrl))
  const failOpen = parseBool(process.env.SHIPPO_WEBHOOK_FORWARD_FAIL_OPEN, false)
  const timeoutMs = parseTimeoutMs(process.env.WEBHOOK_FORWARD_TIMEOUT_MS)

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
  const sharedSecret = readEnv('WEBHOOK_FORWARD_SHARED_SECRET')

  if (!forwardEnabled || !forwardUrl) {
    console.warn('[Shippo Proxy] Forwarding disabled or target URL missing', {
      forwardEnabled,
      forwardUrlConfigured: Boolean(forwardUrl),
      event_id: eventId,
      event: eventType,
    })
    return {
      statusCode: 202,
      body: JSON.stringify({
        received: true,
        forwarded: false,
        reason: 'shippo webhook forwarding disabled or not configured',
      }),
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(forwardUrl, {
      method,
      headers: {
        'Content-Type': contentType,
        ...(signatureHeader ? { 'x-shippo-signature': signatureHeader } : {}),
        'x-fas-forwarded-from': 'fas-sanity:webhooks/shippo',
        ...(eventId ? { 'x-fas-forwarded-event-id': String(eventId) } : {}),
        ...(sharedSecret ? { 'x-fas-forwarded-secret': sharedSecret } : {}),
      },
      body: rawBodyBuffer,
      signal: controller.signal,
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
    if (failOpen) {
      return {
        statusCode: 202,
        body: JSON.stringify({
          received: true,
          forwarded: false,
          fail_open: true,
          error: error instanceof Error ? error.message : 'Proxy error',
        }),
      }
    }
    return {
      statusCode: 502,
      body: error instanceof Error ? error.message : 'Proxy error',
    }
  } finally {
    clearTimeout(timer)
  }
}
