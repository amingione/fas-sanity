import type {APIRoute} from 'astro'
import {PDFDocument} from 'pdf-lib'
import {sanityClient} from '@/sanity/lib/client'
import {resolveNetlifyBase} from 'netlify/lib/packingSlip'

type MergePayload = {
  labelUrl?: string
  orderId?: string
  shipmentId?: string
}

type OrderForPackingSlip = {
  _id: string
  orderNumber?: string | null
  customerName?: string | null
  shippingAddress?: Record<string, unknown> | null
  cart?: unknown
  createdAt?: string | null
}

const ORDER_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  orderNumber,
  customerName,
  shippingAddress,
  cart,
  createdAt
}`

const PACKING_SLIP_FUNCTION = '/.netlify/functions/generatePackingSlips'

export const POST: APIRoute = async ({request}) => {
  let payload: MergePayload
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({error: 'Invalid JSON payload'}, 400)
  }

  const {labelUrl, orderId, shipmentId} = payload
  if (!labelUrl || !orderId) {
    return jsonResponse({error: 'Missing labelUrl or orderId'}, 400)
  }

  try {
    const labelResponse = await fetch(labelUrl)
    if (!labelResponse.ok) {
      throw new Error(`Failed to fetch shipping label: ${labelResponse.statusText}`)
    }
    const labelPdfBytes = await labelResponse.arrayBuffer()

    const {order, pdf} = await generatePackingSlip(orderId)

    const mergedPdfBuffer = await mergePdfBuffers(labelPdfBytes, pdf)
    const filenameToken =
      sanitizeFileToken(shipmentId || order.orderNumber || sanitizeOrderId(order._id)) || 'order'
    const filename = `shipment-${filenameToken}-merged.pdf`

    return new Response(mergedPdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error merging PDFs:', error)
    return jsonResponse({error: 'Failed to merge PDFs'}, 500)
  }
}

async function generatePackingSlip(orderId: string): Promise<{
  order: OrderForPackingSlip
  pdf: ArrayBuffer
}> {
  const order = await sanityClient.fetch<OrderForPackingSlip | null>(ORDER_QUERY, {orderId})
  if (!order) {
    throw new Error('Order not found')
  }

  const pdf = await downloadPackingSlipPdf(order._id)
  return {order, pdf}
}

async function downloadPackingSlipPdf(orderId: string): Promise<ArrayBuffer> {
  const base = resolvePackingSlipServiceBase()
  const cleanOrderId = sanitizeOrderId(orderId)
  const response = await fetch(`${base}${PACKING_SLIP_FUNCTION}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({orderId: cleanOrderId}),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || 'Packing slip generation failed')
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/pdf')) {
    return response.arrayBuffer()
  }

  const base64Body = (await response.text()).replace(/^"|"$/g, '')
  const buffer = Buffer.from(base64Body, 'base64')
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

async function mergePdfBuffers(label: ArrayBuffer, packingSlip: ArrayBuffer): Promise<Buffer> {
  const mergedPdf = await PDFDocument.create()
  const labelDoc = await PDFDocument.load(label)
  const packingSlipDoc = await PDFDocument.load(packingSlip)

  const labelPages = await mergedPdf.copyPages(labelDoc, labelDoc.getPageIndices())
  labelPages.forEach((page) => mergedPdf.addPage(page))

  const packingSlipPages = await mergedPdf.copyPages(
    packingSlipDoc,
    packingSlipDoc.getPageIndices(),
  )
  packingSlipPages.forEach((page) => mergedPdf.addPage(page))

  const mergedBytes = await mergedPdf.save()
  return Buffer.from(mergedBytes)
}

function resolvePackingSlipServiceBase(): string {
  const explicit =
    process.env.MERGE_LABEL_PACKING_SLIP_BASE ||
    process.env.PACKING_SLIP_SERVICE_BASE ||
    process.env.SANITY_STUDIO_NETLIFY_BASE ||
    ''
  if (explicit.trim()) {
    return explicit.replace(/\/$/, '')
  }

  const resolved = resolveNetlifyBase()
  if (resolved) return resolved

  throw new Error('Packing slip service base URL is not configured')
}

function sanitizeOrderId(orderId: string): string {
  return orderId?.replace(/^drafts\./, '') || ''
}

function sanitizeFileToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
}
