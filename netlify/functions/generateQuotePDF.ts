import type { Handler } from '@netlify/functions'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'
import { createClient } from '@sanity/client'

// ---------- Config ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const sanity = createClient({
  projectId:
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    'r4og35qd',
  dataset:
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET ||
    'production',
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN || undefined, // optional; read works without in public datasets
  useCdn: false,
})

const BUSINESS = {
  name: 'F.A.S. Motorsports LLC',
  address1: '6161 Riverside Dr',
  address2: 'Punta Gorda, FL 33982',
  phone: '(812) 200-9012',
  email: 'sales@fasmotorsports.com',
  logoPath: path.resolve(process.cwd(), 'public/media/New Red FAS Logo.png'),
}

// ---------- Helpers ----------
function money(n: number | undefined | null) {
  const v = typeof n === 'number' && isFinite(n) ? n : 0
  return `$${v.toFixed(2)}`
}

function safeStr(v: any) {
  return (v ?? '').toString()
}

function computeTotals(quote: any) {
  const items = Array.isArray(quote?.lineItems) ? quote.lineItems : []
  const subtotal = items.reduce((sum: number, li: any) => {
    const qty = Number(li?.quantity || 0) || 0
    const price = Number(li?.unitPrice || 0) || 0
    const total = qty * price
    li.lineTotal = total
    return sum + total
  }, 0)
  const discountType = quote?.discountType || 'none'
  const discountValue = Number(quote?.discountValue || 0) || 0
  const taxRate = Number(quote?.taxRate || 0) || 0

  const discount =
    discountType === 'percent' ? subtotal * (discountValue / 100) : discountType === 'amount' ? discountValue : 0
  const taxable = Math.max(subtotal - discount, 0)
  const taxAmount = taxable * (taxRate / 100)
  const total = taxable + taxAmount

  return { subtotal, discount, taxAmount, total }
}

async function fetchQuote(id: string) {
  const q = `*[_type=="quote" && _id==$id][0]{
    _id, title, quoteNumber,
    billTo, shipTo,
    lineItems[]{quantity, unitPrice, customName, description, product->{title}},
    discountType, discountValue, taxRate,
    subtotal, taxAmount, total
  }`
  return sanity.fetch(q, { id })
}

async function tryLoadLogoBytes(): Promise<Uint8Array | null> {
  try {
    const candidates = [
      BUSINESS.logoPath,
      // Fallback: look inside the function bundle directory (works in Netlify functions-serve)
      path.resolve(__dirname, 'data', 'New Red FAS Logo.png'),
    ]
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const b = await fs.promises.readFile(p)
          return new Uint8Array(b)
        }
      } catch {}
    }
  } catch {}
  return null
}

function drawAddress(blockTitle: string, obj: any) {
  const lines: string[] = []
  if (blockTitle) lines.push(blockTitle)
  if (obj?.name) lines.push(safeStr(obj.name))
  if (obj?.email) lines.push(safeStr(obj.email))
  if (obj?.phone) lines.push(safeStr(obj.phone))
  const l1 = [obj?.address_line1, obj?.address_line2].filter(Boolean).join(', ')
  if (l1) lines.push(l1)
  const l2 = [obj?.city_locality, obj?.state_province, obj?.postal_code].filter(Boolean).join(', ')
  const l3 = obj?.country_code ? safeStr(obj.country_code) : ''
  if (l2) lines.push(l2)
  if (l3) lines.push(l3)
  return lines
}

// ---------- Handler ----------
export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ message: 'Method Not Allowed' }) }

  try {
    const body = event.body ? JSON.parse(event.body) : {}
    const quoteId: string = body?.quoteId || body?.id || ''
    if (!quoteId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'quoteId required' }) }
    }

    const quote = await fetchQuote(quoteId)
    if (!quote) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ message: 'Quote not found' }) }
    }

    const { subtotal, discount, taxAmount, total } = computeTotals(quote)

    const pdf = await PDFDocument.create()
    let page = pdf.addPage([612, 792]) // US Letter (72 dpi)
    const { width, height } = page.getSize()

    const black = rgb(0, 0, 0)
    const gray = rgb(0.4, 0.4, 0.4)
    const light = rgb(0.9, 0.9, 0.9)

    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

    let y = height - 40

    // Header: Logo + Business block
    const logoBytes = await tryLoadLogoBytes()
    if (logoBytes) {
      try {
        const img = await pdf.embedPng(logoBytes)
        const logoW = 160
        const scale = logoW / img.width
        const logoH = img.height * scale
        page.drawImage(img, { x: 40, y: y - logoH, width: logoW, height: logoH })
      } catch {
        // ignore logo failure
      }
    }

    // Business info
    page.drawText(BUSINESS.name, { x: 220, y: y - 10, size: 14, font: fontBold, color: black })
    page.drawText(BUSINESS.address1, { x: 220, y: y - 28, size: 10, font, color: gray })
    page.drawText(BUSINESS.address2, { x: 220, y: y - 42, size: 10, font, color: gray })
    page.drawText(BUSINESS.phone, { x: 220, y: y - 56, size: 10, font, color: gray })
    page.drawText(BUSINESS.email, { x: 220, y: y - 70, size: 10, font, color: gray })

    // Title + meta
    page.drawText('QUOTE', { x: width - 140, y: y - 10, size: 22, font: fontBold, color: black })
    const qNum = safeStr(quote.quoteNumber || quote._id)
    page.drawText(`Quote # ${qNum}`, { x: width - 220, y: y - 36, size: 10, font, color: gray })
    page.drawText(`Date: ${new Date().toLocaleDateString()}` , { x: width - 220, y: y - 50, size: 10, font, color: gray })

    y -= 100

    // Bill To / Ship To boxes
    const billLines = drawAddress('Bill To', quote.billTo || {})
    const shipLines = drawAddress('Ship To', quote.shipTo || {})

    function drawBox(x: number, topY: number, w: number, h: number) {
      page.drawRectangle({ x, y: topY - h, width: w, height: h, color: light, opacity: 0.4 })
      page.drawRectangle({ x, y: topY - h, width: w, height: h, borderColor: gray, borderWidth: 1, color: undefined })
    }

    const boxW = (width - 80 - 20) / 2
    const boxH = 90
    drawBox(40, y, boxW, boxH)
    drawBox(60 + boxW, y, boxW, boxH)

    let by = y - 18
    billLines.forEach((line, i) => page.drawText(line, { x: 48, y: by - i * 14, size: 10, font, color: black }))
    shipLines.forEach((line, i) => page.drawText(line, { x: 68 + boxW, y: by - i * 14, size: 10, font, color: black }))

    y -= boxH + 24

    // Items header
    page.drawRectangle({ x: 40, y: y - 20, width: width - 80, height: 20, color: light, opacity: 0.6 })
    page.drawText('Description', { x: 48, y: y - 15, size: 10, font: fontBold, color: black })
    page.drawText('Qty', { x: width - 220, y: y - 15, size: 10, font: fontBold, color: black })
    page.drawText('Unit', { x: width - 170, y: y - 15, size: 10, font: fontBold, color: black })
    page.drawText('Amount', { x: width - 110, y: y - 15, size: 10, font: fontBold, color: black })

    y -= 26

    const items = Array.isArray(quote.lineItems) ? quote.lineItems : []
    for (const li of items) {
      const qty = Number(li?.quantity || 0) || 0
      const unit = Number(li?.unitPrice || 0) || 0
      const amount = qty * unit
      const title = safeStr(li?.product?.title || li?.customName || 'Item')
      const desc = safeStr(li?.description || '')

      // Description (wrap rudimentary)
      const lines = [title, desc].filter(Boolean).join(' — ')
      page.drawText(lines, { x: 48, y: y - 12, size: 10, font, color: black, maxWidth: width - 80 - 240, lineHeight: 12 })
      page.drawText(String(qty), { x: width - 220, y: y - 12, size: 10, font, color: black })
      page.drawText(money(unit), { x: width - 170, y: y - 12, size: 10, font, color: black })
      page.drawText(money(amount), { x: width - 110, y: y - 12, size: 10, font, color: black })

      y -= 18
      if (y < 120) {
        // footer before page break
        page.drawText('Continued…', { x: width - 140, y: 40, size: 10, font, color: gray })
        // new page
        const p = pdf.addPage([612, 792])
        y = p.getSize().height - 40
        page = p
      }
    }

    // Totals box
    const totalsX = width - 240
    let ty = Math.max(y - 6, 140)

    function row(label: string, value: string, bold = false) {
      page.drawText(label, { x: totalsX, y: ty, size: 10, font: bold ? fontBold : font, color: black })
      page.drawText(value, { x: width - 110, y: ty, size: 10, font: bold ? fontBold : font, color: black })
      ty -= 14
    }

    row('Subtotal', money(subtotal))
    row('Discount', money(discount))
    row('Tax', money(taxAmount))
    row('Total', money(total), true)

    // Footer note
    page.drawText('Thank you for the opportunity to earn your business.', {
      x: 40,
      y: 40,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    })

    const bytes = await pdf.save()
    const filename = `Quote_${safeStr(quote.quoteNumber || quote._id)}.pdf`

    return {
      statusCode: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: Buffer.from(bytes).toString('base64'),
      isBase64Encoded: true,
    }
  } catch (e: any) {
    console.error('generateQuotePDF failed', e?.message || e)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'Failed to generate quote PDF', error: e?.message || e }) }
  }
}
