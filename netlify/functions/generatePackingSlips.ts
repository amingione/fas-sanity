import { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:3333,http://localhost:8888').split(',')

function pickOrigin(origin?: string): string {
  if (!origin) return DEFAULT_ORIGINS[0]
  if (DEFAULT_ORIGINS.includes(origin)) return origin
  if (/^http:\/\/localhost:\d+$/i.test(origin)) return origin
  return DEFAULT_ORIGINS[0]
}

const CORS_HEADERS = (origin?: string) => ({
  'Access-Control-Allow-Origin': pickOrigin(origin),
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
})

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN || process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false,
})

const LOGO_URL = process.env.PACKING_SLIP_LOGO_URL || 'https://fassite.netlify.app/logo.png'
const SHOP_NAME = process.env.PACKING_SLIP_SHOP_NAME || process.env.SHIP_FROM_NAME || 'F.A.S. Motorsports'
const SHOP_EMAIL = process.env.PACKING_SLIP_SHOP_EMAIL || process.env.SHIP_FROM_EMAIL || 'orders@fasmotorsports.com'
const SHOP_DOMAIN = (process.env.PUBLIC_SITE_URL || 'https://fasmotorsports.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
const SHOP_ADDRESS = [
  process.env.SHIP_FROM_ADDRESS1,
  process.env.SHIP_FROM_CITY,
  process.env.SHIP_FROM_STATE,
  process.env.SHIP_FROM_POSTAL_CODE,
  process.env.SHIP_FROM_COUNTRY,
]
  .filter(Boolean)
  .join(', ')

interface NormalizedAddress {
  name?: string
  company?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  email?: string
  phone?: string
}

interface PackingItem {
  title: string
  details?: string
  quantity: number
}

interface PackingData {
  orderNumber: string
  orderDate: string
  customerName: string
  shippingAddress: string[]
  billingAddress: string[]
  items: PackingItem[]
  notes?: string
}

function normalizeAddress(raw: any | null | undefined): NormalizedAddress | null {
  if (!raw || typeof raw !== 'object') return null
  const lower = Object.keys(raw).reduce<Record<string, any>>((acc, key) => {
    acc[key.toLowerCase()] = (raw as any)[key]
    return acc
  }, {})

  return {
    name: raw.name || raw.fullName || raw.firstName || undefined,
    company: raw.company || undefined,
    line1: raw.addressLine1 || raw.address_line1 || undefined,
    line2: raw.addressLine2 || raw.address_line2 || undefined,
    city: raw.city || raw.city_locality || undefined,
    state: raw.state || raw.state_province || undefined,
    postalCode: raw.postalCode || raw.postal_code || undefined,
    country: raw.country || raw.country_code || undefined,
    email: raw.email || undefined,
    phone: raw.phone || undefined,
  }
}

function addressLines(address: NormalizedAddress | null): string[] {
  if (!address) return ['No address available']
  const lines: string[] = []
  if (address.name) lines.push(address.name)
  if (address.company) lines.push(address.company)
  if (address.line1) lines.push(address.line1)
  if (address.line2) lines.push(address.line2)
  const cityBits = [address.city, [address.state, address.postalCode].filter(Boolean).join(' ')].filter(Boolean)
  if (cityBits.length) lines.push(cityBits.join(', '))
  if (address.country) lines.push(address.country)
  if (address.email) lines.push(address.email)
  if (address.phone) lines.push(address.phone)
  return lines.length ? lines : ['No address available']
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const sanitized = text.replace(/\s+/g, ' ').trim()
  if (!sanitized) return ['']
  const words = sanitized.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    const width = font.widthOfTextAtSize(candidate, fontSize)
    if (width <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

async function buildPdf(data: PackingData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  let page = pdfDoc.addPage([612, 792]) // 8.5" x 11"
  let { width, height } = page.getSize()
  const margin = 48
  const bodyFontSize = 11
  const smallFontSize = 10
  const lineGap = 16

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let y = height - margin

  // Optional logo
  if (LOGO_URL) {
    try {
      const res = await fetch(LOGO_URL)
      if ((res as any)?.ok) {
        const buffer = await (res as any).arrayBuffer()
        try {
          const img = await pdfDoc.embedPng(buffer)
          const scaled = img.scale(0.4)
          page.drawImage(img, {
            x: margin,
            y: y - scaled.height,
            width: scaled.width,
            height: scaled.height,
          })
          y -= scaled.height + 12
        } catch {
          try {
            const img = await pdfDoc.embedJpg(buffer)
            const scaled = img.scale(0.4)
            page.drawImage(img, {
              x: margin,
              y: y - scaled.height,
              width: scaled.width,
              height: scaled.height,
            })
            y -= scaled.height + 12
          } catch {
            // ignore image failures
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Header
  page.drawText(SHOP_NAME.toUpperCase(), { x: margin, y, font: helveticaBold, size: 20 })

  const orderMeta: string[] = [
    `Order ${data.orderNumber}`,
    data.orderDate,
    data.customerName,
  ].filter(Boolean)

  orderMeta.forEach((line, idx) => {
    const fontToUse = idx === 0 ? helveticaBold : helvetica
    const size = idx === 0 ? 12 : 11
    const textWidth = fontToUse.widthOfTextAtSize(line, size)
    page.drawText(line, {
      x: width - margin - textWidth,
      y: y - idx * 14,
      font: fontToUse,
      size,
    })
  })

  y -= 40

  // Addresses
  const columnGap = 32
  const columnWidth = (width - margin * 2 - columnGap) / 2

  function drawAddress(title: string, lines: string[], x: number): number {
    let localY = y
    page.drawText(title.toUpperCase(), { x, y: localY, font: helveticaBold, size: bodyFontSize })
    localY -= lineGap
    for (const rawLine of lines) {
      const wrapped = wrapText(rawLine, columnWidth, helvetica, smallFontSize)
      for (const w of wrapped) {
        page.drawText(w, { x, y: localY, font: helvetica, size: smallFontSize })
        localY -= lineGap
      }
    }
    return localY
  }

  const shipBottom = drawAddress('Ship to', data.shippingAddress, margin)
  const billBottom = drawAddress('Bill to', data.billingAddress, margin + columnWidth + columnGap)

  y = Math.min(shipBottom, billBottom) - 10

  // Separator
  page.drawRectangle({ x: margin, y, width: width - margin * 2, height: 1, color: rgb(0, 0, 0) })
  y -= 18

  // Items header
  page.drawText('Items'.toUpperCase(), { x: margin, y, font: helveticaBold, size: bodyFontSize })
  const qtyColumnWidth = 120
  const getQtyX = () => width - margin - qtyColumnWidth + 30
  page.drawText('Quantity'.toUpperCase(), {
    x: getQtyX(),
    y,
    font: helveticaBold,
    size: bodyFontSize,
  })
  y -= lineGap

  const getDescWidth = () => width - margin * 2 - qtyColumnWidth - 20

  function ensureSpace(required: number) {
    if (y - required < margin) {
      page = pdfDoc.addPage([612, 792])
      ;({ width, height } = page.getSize())
      y = height - margin
      page.drawText('Items'.toUpperCase(), { x: margin, y, font: helveticaBold, size: bodyFontSize })
      page.drawText('Quantity'.toUpperCase(), {
        x: getQtyX(),
        y,
        font: helveticaBold,
        size: bodyFontSize,
      })
      y -= lineGap
    }
  }

  for (const item of data.items) {
    const descWidth = getDescWidth()
    const primaryLines = wrapText(item.title, descWidth, helveticaBold, bodyFontSize)
    const detailLines = item.details ? wrapText(item.details, descWidth, helvetica, smallFontSize) : []
    const totalLines = primaryLines.length + detailLines.length
    const rowHeight = totalLines * lineGap + 4
    ensureSpace(rowHeight)

    let rowY = y
    primaryLines.forEach((line, idx) => {
      page.drawText(line, { x: margin, y: rowY, font: helveticaBold, size: bodyFontSize })
      rowY -= lineGap
    })
    detailLines.forEach((line) => {
      page.drawText(line, { x: margin, y: rowY, font: helvetica, size: smallFontSize })
      rowY -= lineGap
    })

    const qtyText = item.quantity > 0 ? `${item.quantity}` : '—'
    page.drawText(qtyText, {
      x: getQtyX(),
      y: y,
      font: helvetica,
      size: bodyFontSize,
    })

    y -= rowHeight
  }

  if (data.notes) {
    y -= 4
    page.drawRectangle({ x: margin, y, width: width - margin * 2, height: 1, color: rgb(0.6, 0.6, 0.6) })
    y -= lineGap
    page.drawText('Notes'.toUpperCase(), { x: margin, y, font: helveticaBold, size: bodyFontSize })
    y -= lineGap
    const wrappedNotes = wrapText(data.notes, width - margin * 2, helvetica, smallFontSize)
    wrappedNotes.forEach((line) => {
      page.drawText(line, { x: margin, y, font: helvetica, size: smallFontSize })
      y -= lineGap
    })
  }

  y -= lineGap
  page.drawRectangle({ x: margin, y, width: width - margin * 2, height: 1, color: rgb(0, 0, 0) })
  y -= lineGap

  const footerLines = [
    'Thank you for shopping with us!',
    SHOP_NAME,
    SHOP_ADDRESS,
    SHOP_EMAIL,
    SHOP_DOMAIN,
  ].filter(Boolean)

  footerLines.forEach((line) => {
    page.drawText(line, { x: margin, y, font: helvetica, size: smallFontSize, color: rgb(0.1, 0.1, 0.1) })
    y -= lineGap
  })

  return pdfDoc.save({ useObjectStreams: false })
}

async function fetchPackingData(invoiceId?: string, orderId?: string): Promise<PackingData | null> {
  const cleanInvoiceId = invoiceId?.replace(/^drafts\./, '')
  const cleanOrderId = orderId?.replace(/^drafts\./, '')

  let invoice: any = null
  let order: any = null

  if (cleanInvoiceId) {
    invoice = await sanity.fetch(
      `*[_type == "invoice" && _id == $id][0]{
        _id,
        _createdAt,
        invoiceNumber,
        orderNumber,
        invoiceDate,
        customerEmail,
        customerNotes,
        internalNotes,
        billTo,
        shipTo,
        lineItems[]{
          quantity,
          description,
          sku,
          kind,
          product->{ title, sku },
          unitPrice
        },
        orderRef->{
          _id,
          createdAt,
          stripeSessionId,
          customerEmail,
          shippingAddress,
          cart[]{ name, sku, quantity },
        }
      }`,
      { id: cleanInvoiceId }
    )
    if (invoice?.orderRef && typeof invoice.orderRef === 'object') {
      order = invoice.orderRef
    }
  }

  if (!order && cleanOrderId) {
    order = await sanity.fetch(
      `*[_type == "order" && _id == $id][0]{
        _id,
        createdAt,
        stripeSessionId,
        customerEmail,
        shippingAddress,
        billingAddress,
        cart[]{ name, sku, quantity },
        notes,
        invoiceRef
      }`,
      { id: cleanOrderId }
    )
  }

  if (!invoice && order?.invoiceRef?._ref) {
    invoice = await sanity.fetch(
      `*[_type == "invoice" && _id == $id][0]{
        _id,
        _createdAt,
        invoiceNumber,
        orderNumber,
        invoiceDate,
        customerEmail,
        customerNotes,
        internalNotes,
        billTo,
        shipTo,
        lineItems[]{
          quantity,
          description,
          sku,
          kind,
          product->{ title, sku },
          unitPrice
        }
      }`,
      { id: order.invoiceRef._ref }
    )
  }

  if (!invoice && !order) return null

  const shippingAddress = normalizeAddress(invoice?.shipTo || order?.shippingAddress)
  const billingAddress = normalizeAddress(invoice?.billTo || order?.billingAddress || shippingAddress)

  const invoiceNumber = invoice?.invoiceNumber || invoice?.orderNumber
  const orderNumber = invoiceNumber || order?.orderNumber || order?.stripeSessionId || order?._id || cleanInvoiceId || cleanOrderId || 'Order'
  const dateSource = invoice?.invoiceDate || order?.createdAt || invoice?._createdAt
  const orderDate = dateSource ? new Date(dateSource).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
  const customerName =
    shippingAddress?.name ||
    billingAddress?.name ||
    invoice?.customerEmail ||
    order?.customerEmail ||
    'Customer'

  const items: PackingItem[] = []
  if (Array.isArray(invoice?.lineItems) && invoice.lineItems.length > 0) {
    for (const li of invoice.lineItems) {
      const quantity = Number(li?.quantity || 1)
      const title = li?.description || li?.product?.title || li?.sku || 'Item'
      const detailsParts: string[] = []
      if (li?.product?.title && li?.description && li.description !== li.product.title) {
        detailsParts.push(li.product.title)
      }
      if (li?.sku) detailsParts.push(`SKU ${li.sku}`)
      if (typeof li?.unitPrice === 'number') {
        detailsParts.push(`$${Number(li.unitPrice).toFixed(2)} each`)
      }
      items.push({
        title,
        details: detailsParts.filter(Boolean).join(' • ') || undefined,
        quantity,
      })
    }
  }

  if (items.length === 0 && Array.isArray(order?.cart)) {
    for (const ci of order.cart) {
      if (!ci) continue
      const title = ci.name || ci.sku || 'Item'
      const details = ci.sku ? `SKU ${ci.sku}` : undefined
      const quantity = Number(ci.quantity || 1)
      items.push({ title, details, quantity })
    }
  }

  if (items.length === 0) {
    items.push({ title: 'No items found', quantity: 0 })
  }

  const notes = invoice?.customerNotes || invoice?.internalNotes || order?.notes || undefined

  return {
    orderNumber,
    orderDate,
    customerName,
    shippingAddress: addressLines(shippingAddress),
    billingAddress: addressLines(billingAddress),
    items,
    notes,
  }
}

export const handler: Handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin
  const headers = CORS_HEADERS(origin)

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  let payload: { invoiceId?: string; orderId?: string } = {}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  if (!payload.invoiceId && !payload.orderId) {
    return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Provide invoiceId or orderId' }) }
  }

  try {
    const packingData = await fetchPackingData(payload.invoiceId, payload.orderId)
    if (!packingData) {
      return { statusCode: 404, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Packing slip data not found' }) }
    }

    const pdfBytes = await buildPdf(packingData)
    const base64 = Buffer.from(pdfBytes).toString('base64')

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="packing-slip-${packingData.orderNumber.replace(/[^a-z0-9_-]/gi, '') || 'order'}.pdf"`,
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (err: any) {
    console.error('generatePackingSlips error', err)
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Packing slip generation failed', message: err?.message || String(err) }),
    }
  }
}

export default handler
