import type { SanityClient } from '@sanity/client'

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

    const response = await fetch(`${base}/.netlify/functions/generatePackingSlips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

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
    console.warn('generatePackingSlipAsset error', err)
    return undefined
  }
}
