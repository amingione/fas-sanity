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
  const explicit = readEnv('SANITY_PRODUCT_SYNC_FORWARD_URL')
  if (explicit) return explicit

  const medusaBase = readEnv('MEDUSA_API_URL')
  if (!medusaBase) return ''
  return `${medusaBase.replace(/\/+$/, '')}/webhooks/sanity-product-sync`
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

const getEventId = (headers: Record<string, any> | undefined): string | undefined =>
  getHeader(headers, 'x-sanity-transaction-id') ||
  getHeader(headers, 'x-sanity-event-id') ||
  getHeader(headers, 'x-sanity-webhook-id')

const extractProductIds = (rawBody: Buffer): string[] => {
  try {
    const payload = JSON.parse(rawBody.toString('utf8') || '{}')
    const ids = new Set<string>()

    const add = (value: unknown) => {
      if (typeof value !== 'string') return
      const normalized = value.trim().replace(/^drafts\./, '')
      if (normalized) ids.add(normalized)
    }

    add(payload?.documentId)
    add(payload?.transition?.id)
    add(payload?.after?._id)
    add(payload?.before?._id)

    if (Array.isArray(payload?.ids)) {
      for (const item of payload.ids) add(item)
    }

    return Array.from(ids)
  } catch {
    return []
  }
}

const getDocumentFromPayload = (rawBody: Buffer): any => {
  try {
    const payload = JSON.parse(rawBody.toString('utf8') || '{}')
    return payload?.after || payload?.document || payload
  } catch {
    return null
  }
}

export async function handler(event: any) {
  if ((event.httpMethod || 'POST').toUpperCase() !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed',
    }
  }

  const forwardUrl = resolveForwardUrl()
  const forwardEnabled = parseBool(process.env.SANITY_PRODUCT_SYNC_FORWARD_ENABLED, Boolean(forwardUrl))
  const failOpen = parseBool(process.env.SANITY_PRODUCT_SYNC_FORWARD_FAIL_OPEN, false)
  const timeoutMs = parseTimeoutMs(process.env.WEBHOOK_FORWARD_TIMEOUT_MS)

  const incomingBody = event.body || ''
  const rawBodyBuffer = event.isBase64Encoded
    ? Buffer.from(incomingBody, 'base64')
    : Buffer.from(incomingBody, 'utf8')

  const eventId = getEventId(event.headers)
  const productIds = extractProductIds(rawBodyBuffer)
  const document = getDocumentFromPayload(rawBodyBuffer)

  // Guard: Skip non-published products
  if (document?._type === 'product' && document?.contentStatus !== 'published') {
    console.info('[Sanity Product Sync Proxy] Skipping non-published product', {
      event_id: eventId,
      product_id: document?._id,
      content_status: document?.contentStatus,
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        skipped: true,
        reason: 'contentStatus not published',
      }),
    }
  }

  console.info('[Sanity Product Sync Proxy] Received webhook', {
    event_id: eventId,
    product_ids: productIds,
  })

  const contentType = getHeader(event.headers, 'content-type') || 'application/json'
  const sanitySignature = getHeader(event.headers, 'x-sanity-signature')
  const sharedSecret = readEnv('WEBHOOK_FORWARD_SHARED_SECRET')

  if (!forwardEnabled || !forwardUrl) {
    console.warn('[Sanity Product Sync Proxy] Forwarding disabled or target URL missing', {
      forwardEnabled,
      forwardUrlConfigured: Boolean(forwardUrl),
      event_id: eventId,
      product_ids: productIds,
    })

    return {
      statusCode: 202,
      body: JSON.stringify({
        received: true,
        forwarded: false,
        reason: 'sanity product sync forwarding disabled or not configured',
      }),
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(forwardUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        ...(sanitySignature ? {'x-sanity-signature': sanitySignature} : {}),
        ...(eventId ? {'x-sanity-transaction-id': String(eventId)} : {}),
        'x-fas-forwarded-from': 'fas-sanity:webhooks/sanity-product-sync',
        ...(sharedSecret ? {'x-fas-forwarded-secret': sharedSecret} : {}),
      },
      body: rawBodyBuffer,
      signal: controller.signal,
    })

    const text = await res.text()

    if (res.ok) {
      console.info('[Sanity Product Sync Proxy] Medusa accepted webhook', {
        event_id: eventId,
        status: res.status,
        product_ids: productIds,
      })
    } else {
      console.error('[Sanity Product Sync Proxy] Medusa rejected webhook', {
        event_id: eventId,
        status: res.status,
        body: text,
        product_ids: productIds,
      })
    }

    return {
      statusCode: res.status,
      body: text,
    }
  } catch (error) {
    console.error('[Sanity Product Sync Proxy] Failed to reach Medusa', error)

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
