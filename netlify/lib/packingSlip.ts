// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {SanityClient} from '@sanity/client'

export function resolveNetlifyBase(): string | null {
  const raw =
    process.env.SANITY_STUDIO_NETLIFY_BASE ||
    process.env.PUBLIC_SITE_URL ||
    process.env.AUTH0_BASE_URL ||
    ''
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed.replace(/\/$/, '')
}

type PackingSlipOptions = {
  sanity: SanityClient
  orderId: string
  invoiceId?: string | null
  baseUrl?: string | null
}

const ECONN_REFUSED = 'ECONNREFUSED'

function isConnectionRefusedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  if ((err as any).code === ECONN_REFUSED) return true
  const cause = (err as any).cause
  if (cause && typeof cause === 'object') {
    if ((cause as any).code === ECONN_REFUSED) return true
    const nested = (cause as any).errors
    if (Array.isArray(nested)) {
      return nested.some((entry) => isConnectionRefusedError(entry))
    }
  }
  return false
}

export async function generatePackingSlipAsset({
  sanity,
  orderId,
  invoiceId,
  baseUrl,
}: PackingSlipOptions): Promise<string | undefined> {
  try {
    const base = baseUrl ?? resolveNetlifyBase()
    if (!base) return undefined

    const payload: Record<string, string> = {}
    const cleanOrderId = orderId?.replace(/^drafts\./, '')
    const cleanInvoiceId = invoiceId?.replace(/^drafts\./, '')
    if (cleanOrderId) payload.orderId = cleanOrderId
    if (cleanInvoiceId) payload.invoiceId = cleanInvoiceId
    if (!payload.orderId && !payload.invoiceId) return undefined
    const url = `${base}/.netlify/functions/generatePackingSlips`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      })
    } catch (err) {
      if (isConnectionRefusedError(err)) {
        console.warn(
          `generatePackingSlipAsset: Netlify function unreachable at ${url}. Skipping packing slip upload.`,
        )
        return undefined
      }
      throw err
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.warn('generatePackingSlips call failed', response.status, body)
      return undefined
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    let buffer: Buffer
    if (contentType.includes('application/pdf')) {
      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else {
      const base64 = (await response.text()).replace(/^"|"$/g, '')
      buffer = Buffer.from(base64, 'base64')
    }

    if (!buffer || buffer.length === 0) return undefined

    const filenameId = cleanOrderId || cleanInvoiceId || `order-${Date.now()}`
    const asset = await sanity.assets.upload('file', buffer, {
      filename: `packing-slip-${filenameId}.pdf`,
      contentType: 'application/pdf',
    })

    return (asset as any)?.url
  } catch (err) {
    if (isConnectionRefusedError(err)) {
      console.warn(
        'generatePackingSlipAsset: packing slip service unreachable. Set SANITY_STUDIO_NETLIFY_BASE to a deployed site when reprocessing orders.',
      )
      return undefined
    }
    console.warn('generatePackingSlipAsset error', err)
    return undefined
  }
}
