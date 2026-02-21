import { createHmac, timingSafeEqual } from 'crypto'

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

const getHeader = (headers: Record<string, any> | undefined, key: string): string | undefined => {
  if (!headers) return undefined
  const direct = headers[key]
  if (typeof direct === 'string') return direct

  const lower = key.toLowerCase()
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === lower) {
      if (typeof value === 'string') return value
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
    }
  }
  return undefined
}

const resolveForwardUrl = (): string => {
  const explicit = readEnv('SANITY_ORDER_SYNC_FORWARD_URL')
  if (explicit) return explicit

  const medusaBase = readEnv('MEDUSA_API_URL')
  if (!medusaBase) return ''
  return `${medusaBase.replace(/\/+$/, '')}/webhooks/sanity-order-sync`
}

const normalizeSignature = (signature: string): string => signature.trim().replace(/^sha256=/i, '')

const verifySignature = (rawBody: Buffer, signature: string, secret: string): boolean => {
  const normalized = normalizeSignature(signature)
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')

  try {
    const expectedBuffer = Buffer.from(expected, 'hex')
    const providedBuffer = Buffer.from(normalized, 'hex')
    if (expectedBuffer.length !== providedBuffer.length) return false
    return timingSafeEqual(expectedBuffer, providedBuffer)
  } catch {
    return false
  }
}

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    }
  }

  const forwardUrl = resolveForwardUrl()
  const forwardEnabled = parseBool(process.env.SANITY_ORDER_SYNC_FORWARD_ENABLED, Boolean(forwardUrl))
  const failOpen = parseBool(process.env.SANITY_ORDER_SYNC_FORWARD_FAIL_OPEN, false)
  const timeoutMs = parseTimeoutMs(process.env.WEBHOOK_FORWARD_TIMEOUT_MS)

  const incomingBody = event.body || ''
  const rawBodyBuffer = event.isBase64Encoded
    ? Buffer.from(incomingBody, 'base64')
    : Buffer.from(incomingBody, 'utf8')

  const contentType = getHeader(event.headers, 'content-type') || 'application/json'

  const signatureHeader = getHeader(event.headers, 'x-sanity-signature')
  const webhookSecret = readEnv('SANITY_WEBHOOK_SECRET')
  const verifyIncoming = parseBool(process.env.SANITY_ORDER_SYNC_WEBHOOK_VERIFY, Boolean(webhookSecret))

  if (verifyIncoming) {
    if (!webhookSecret) {
      return {
        statusCode: 500,
        body: JSON.stringify({received: false, error: 'SANITY_WEBHOOK_SECRET is required'}),
      }
    }

    if (!signatureHeader || !verifySignature(rawBodyBuffer, signatureHeader, webhookSecret)) {
      return {
        statusCode: 401,
        body: JSON.stringify({received: false, error: 'Invalid signature'}),
      }
    }
  }

  let eventId: string | undefined
  let orderId: string | undefined
  let orderNumber: string | undefined

  try {
    const parsed = JSON.parse(rawBodyBuffer.toString('utf8') || '{}')
    eventId =
      parsed?.eventId ||
      parsed?.transactionId ||
      parsed?.id ||
      parsed?.body?.eventId ||
      parsed?.event?.id

    orderId =
      parsed?._id ||
      parsed?.orderId ||
      parsed?.after?._id ||
      parsed?.current?._id ||
      parsed?.result?._id ||
      parsed?.documents?.[0]?._id

    orderNumber =
      parsed?.orderNumber ||
      parsed?.after?.orderNumber ||
      parsed?.current?.orderNumber ||
      parsed?.result?.orderNumber ||
      parsed?.documents?.[0]?.orderNumber
  } catch {
    // Best effort logging only.
  }

  console.info('[Sanity Order Sync Proxy] Received webhook', {
    event_id: eventId,
    order_id: orderId,
    order_number: orderNumber,
  })

  if (!forwardEnabled || !forwardUrl) {
    return {
      statusCode: 202,
      body: JSON.stringify({
        received: true,
        forwarded: false,
        reason: 'sanity order webhook forwarding disabled or target URL missing',
      }),
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const sharedSecret = readEnv('WEBHOOK_FORWARD_SHARED_SECRET')

    const res = await fetch(forwardUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        ...(signatureHeader ? {'x-sanity-signature': signatureHeader} : {}),
        'x-fas-forwarded-from': 'fas-sanity:webhooks/sanity-order-sync',
        ...(eventId ? {'x-fas-forwarded-event-id': String(eventId)} : {}),
        ...(sharedSecret ? {'x-fas-forwarded-secret': sharedSecret} : {}),
      },
      body: rawBodyBuffer,
      signal: controller.signal,
    })

    const text = await res.text()

    if (res.ok) {
      console.info('[Sanity Order Sync Proxy] Medusa accepted webhook', {
        event_id: eventId,
        order_id: orderId,
        status: res.status,
      })
    } else {
      console.error('[Sanity Order Sync Proxy] Medusa rejected webhook', {
        event_id: eventId,
        order_id: orderId,
        status: res.status,
        body: text,
      })
    }

    return {
      statusCode: res.status,
      body: text,
    }
  } catch (error) {
    console.error('[Sanity Order Sync Proxy] Failed to reach Medusa', error)

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
