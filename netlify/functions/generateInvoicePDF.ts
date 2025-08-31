import { Handler } from '@netlify/functions'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'


const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  const o = origin && DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

// ---- Brand settings
const brand = {
  name: 'F.A.S. Motorsports LLC',
  street: '6161 Riverside Dr',
  city: 'Punta Gorda, FL 33982',
  phone: '(812) 200-9012',
  email: 'sales@fasmotorsports.com',
  // attempt to load from repo; if not found, we skip logo
  logoPath: path.resolve(process.cwd(), 'public/media/New Red FAS Logo.png'),
  // colors similar to the sample image
  navy: rgb(0.14, 0.20, 0.35),
  accent: rgb(0.86, 0.23, 0.18),
}

// ---- Types
type LineItem = {
  description?: string
  sku?: string
  quantity?: number
  unitPrice?: number
  lineTotal?: number
}

type InvoicePayload = {
  invoiceId?: string
  invoiceNumber?: string
  invoice?: any
}

// ---- Helpers
function money(n = 0) { const v = typeof n === 'number' && !isNaN(n) ? n : 0; return `$${v.toFixed(2)}` }

function computeTotals(doc: any) {
  const items: LineItem[] = Array.isArray(doc?.lineItems) ? doc.lineItems : []
  const discountType: 'amount' | 'percent' = (doc?.discountType === 'percent') ? 'percent' : 'amount'
  const discountValue = Number(doc?.discountValue || 0)
  const taxRate = Number(doc?.taxRate || 0)

  const subtotal = items.reduce((sum: number, li: LineItem) => {
    const qty = Number(li?.quantity || 1)
    const unit = Number(li?.unitPrice || 0)
    const override = typeof li?.lineTotal === 'number' ? li.lineTotal : undefined
    const line = typeof override === 'number' ? override : qty * unit
    return sum + (isNaN(line) ? 0 : line)
  }, 0)

  const discountAmt = discountType === 'percent' ? subtotal * (discountValue / 100) : discountValue
  const taxableBase = Math.max(0, subtotal - discountAmt)
  const taxAmount = taxableBase * (taxRate / 100)
  const total = Math.max(0, taxableBase + taxAmount)

  return { subtotal, discountAmt, taxAmount, total }
}

async function tryLoadLogo(pdf: PDFDocument) {
  try {
    if (fs.existsSync(brand.logoPath)) {
      const bytes = fs.readFileSync(brand.logoPath)
      // support png or jpg implicitly
      if (brand.logoPath.toLowerCase().endsWith('.png')) return await pdf.embedPng(bytes)
      return await pdf.embedJpg(bytes)
    }
  } catch {}
  return null
}

// ---- Handler
export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  let payload: InvoicePayload
  try { payload = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const inv = payload?.invoice || {}
  const billTo = inv?.billTo || {}
  const shipTo = inv?.shipTo || inv?.billTo || {}
  const lineItems: LineItem[] = Array.isArray(inv?.lineItems) ? inv.lineItems : []
  const { subtotal, discountAmt, taxAmount, total } = computeTotals(inv)

  try {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([612, 792]) // Letter
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const margin = 50
    let y = 792 - margin

    // --- Top bar & title
    page.drawText('INVOICE', { x: margin, y, size: 36, font: bold, color: brand.navy })

    // Logo
    const logo = await tryLoadLogo(pdf)
    if (logo) {
      const lw = 88, lh = (logo.height / logo.width) * lw
      page.drawImage(logo, { x: 612 - margin - lw, y: y - lh + 16, width: lw, height: lh })
    }

    y -= 46

    // Company info
    const leftX = margin
    const rightX = 300

    page.drawText(brand.name, { x: leftX, y, size: 11, font: bold, color: rgb(0,0,0) })
    page.drawText(brand.street, { x: leftX, y: y - 14, size: 10, font })
    page.drawText(brand.city, { x: leftX, y: y - 28, size: 10, font })
    page.drawText(`${brand.phone}  •  ${brand.email}`, { x: leftX, y: y - 42, size: 10, font })

    // Invoice meta (right block)
    const invNo = payload?.invoiceNumber || inv?.invoiceNumber || '—'
    const invDate = inv?.invoiceDate || new Date().toISOString().slice(0,10)
    const dueDate = inv?.dueDate || ''

    page.drawText('INVOICE #', { x: rightX, y, size: 11, font: bold, color: brand.navy })
    page.drawText(String(invNo), { x: rightX + 90, y, size: 11, font })

    page.drawText('INVOICE DATE', { x: rightX, y: y - 16, size: 11, font: bold, color: brand.navy })
    page.drawText(String(invDate), { x: rightX + 90, y: y - 16, size: 11, font })

    page.drawText('DUE DATE', { x: rightX, y: y - 32, size: 11, font: bold, color: brand.navy })
    page.drawText(String(dueDate), { x: rightX + 90, y: y - 32, size: 11, font })

    y -= 70

    // Bill To & Ship To
    const btX = margin
    const stX = 230

    page.drawText('BILL TO', { x: btX, y, size: 11, font: bold, color: brand.navy })
    page.drawText(String(billTo?.name || ''), { x: btX, y: y - 16, size: 10, font })
    page.drawText(String(billTo?.address_line1 || ''), { x: btX, y: y - 30, size: 10, font })
    const btCity = [billTo?.city_locality, billTo?.state_province, billTo?.postal_code].filter(Boolean).join(', ')
    page.drawText(btCity, { x: btX, y: y - 44, size: 10, font })

    page.drawText('SHIP TO', { x: stX, y, size: 11, font: bold, color: brand.navy })
    page.drawText(String(shipTo?.name || ''), { x: stX, y: y - 16, size: 10, font })
    page.drawText(String(shipTo?.address_line1 || ''), { x: stX, y: y - 30, size: 10, font })
    const stCity = [shipTo?.city_locality, shipTo?.state_province, shipTo?.postal_code].filter(Boolean).join(', ')
    page.drawText(stCity, { x: stX, y: y - 44, size: 10, font })

    y -= 64

    // Table header separator (accent line)
    page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, color: brand.accent, thickness: 2 })
    y -= 12

    // Columns
    const colQty = margin
    const colDesc = colQty + 30
    const colUnit = 612 - margin - 120
    const colAmount = 612 - margin - 20

    page.drawText('QTY', { x: colQty, y, size: 11, font: bold, color: brand.navy })
    page.drawText('DESCRIPTION', { x: colDesc, y, size: 11, font: bold, color: brand.navy })
    page.drawText('UNIT PRICE', { x: colUnit, y, size: 11, font: bold, color: brand.navy })
    page.drawText('AMOUNT', { x: colAmount, y, size: 11, font: bold, color: brand.navy })

    // Underline
    page.drawLine({ start: { x: margin, y: y - 6 }, end: { x: 612 - margin, y: y - 6 }, color: brand.accent, thickness: 1 })

    let rowY = y - 22

    const items = lineItems.length ? lineItems : []
    const maxRows = 25
    for (let i = 0; i < Math.min(items.length, maxRows); i++) {
      const li = items[i] || {}
      const qty = Number(li?.quantity || 1)
      const unitPrice = Number(li?.unitPrice || 0)
      const line = typeof li?.lineTotal === 'number' ? li.lineTotal : qty * unitPrice

      let desc = String(li?.description || '')
      if (desc.length > 80) desc = desc.slice(0, 77) + '…'

      page.drawText(String(qty), { x: colQty, y: rowY, size: 10, font })
      page.drawText(desc, { x: colDesc, y: rowY, size: 10, font })
      page.drawText(money(unitPrice), { x: colUnit, y: rowY, size: 10, font })
      page.drawText(money(line), { x: colAmount, y: rowY, size: 10, font })

      rowY -= 16
    }

    // Totals block on right
    const totalsX = 612 - margin - 200
    let ty = rowY - 10

    const label = (t: string, size = 11) => page.drawText(t, { x: totalsX, y: ty, size, font })
    const val = (t: string, size = 11, b = false) => page.drawText(t, { x: totalsX + 120, y: ty, size, font: b ? bold : font })

    label('Subtotal'); val(money(subtotal)); ty -= 16
    if (discountAmt > 0) { label('Discount'); val(`-${money(discountAmt).slice(1)}`); ty -= 16 }
    if (taxAmount > 0) { label('Sales Tax'); val(money(taxAmount)); ty -= 16 }
    page.drawLine({ start: { x: totalsX, y: ty - 6 }, end: { x: totalsX + 200, y: ty - 6 }, color: rgb(0.85,0.85,0.85), thickness: 1 })
    label('TOTAL', 12); val(money(total), 12, true); ty -= 24

    // Thank you + terms area at bottom
    const thanksY = 90
    page.drawText('Thank you', { x: margin, y: thanksY, size: 26, font: bold, color: brand.navy })

    const tcX = 360
    page.drawLine({ start: { x: tcX - 10, y: thanksY + 24 }, end: { x: tcX - 10, y: thanksY - 24 }, thickness: 1, color: rgb(0.6,0.6,0.6) })
    page.drawText('TERMS & CONDITIONS', { x: tcX, y: thanksY + 18, size: 11, font: bold, color: brand.accent })
    const terms = inv?.terms || 'Payment is due within 15 days. Please make checks payable to F.A.S. Motorsports LLC.'
    page.drawText(terms, { x: tcX, y: thanksY, size: 10, font })

    const bytes = await pdf.save({ useObjectStreams: false })
    const base64 = Buffer.from(bytes).toString('base64')

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="invoice-${String(invNo)}.pdf"` }, body: base64, isBase64Encoded: true }
  } catch (err: any) {
    console.error('generateInvoicePDF failed', err)
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'PDF generation failed', message: String(err?.message || err) }) }
  }
}
