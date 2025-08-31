import { Handler } from '@netlify/functions'
import { Resend } from 'resend'
import { createClient } from '@sanity/client'
import Stripe from 'stripe'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

// --- CORS (more permissive localhost-aware)
const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    // Trust any localhost port during local dev (e.g., 8888, 3333, vite random ports)
    if (/^http:\/\/localhost:\d+$/i.test(origin)) {
      o = origin
    } else if (DEFAULT_ORIGINS.includes(origin)) {
      o = origin
    }
  }
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
  logoPath: path.resolve(process.cwd(), 'public/media/New Red FAS Logo.png'),
  navy: rgb(0.14, 0.20, 0.35),
  accent: rgb(0.86, 0.23, 0.18),
}

const resend = new Resend(process.env.RESEND_API_KEY)
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY as string) : (null as any)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN || process.env.PUBLIC_SANITY_WRITE_TOKEN,
  useCdn: false,
})

const CAN_PATCH = Boolean(process.env.SANITY_API_TOKEN)

// ---- Helpers
function money(n: number) { return `$${Number(n || 0).toFixed(2)}` }

function computeTotals(doc: any) {
  const items = Array.isArray(doc?.lineItems) ? doc.lineItems : []
  const discountType = (doc?.discountType === 'percent') ? 'percent' : 'amount'
  const discountValue = Number(doc?.discountValue || 0)
  const taxRate = Number(doc?.taxRate || 0)

  const subtotal = items.reduce((sum: number, li: any) => {
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

async function ensureCheckoutUrl(invoiceId: string, inv: any, baseUrl: string) {
  // Reuse if already present
  if (inv?.paymentLinkUrl) return String(inv.paymentLinkUrl)
  if (!stripe) return ''

  const { total } = computeTotals(inv)
  const unitAmount = Math.round(Number(total || 0) * 100)
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) return ''

  let session: Stripe.Response<Stripe.Checkout.Session> | undefined
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Invoice ${inv?.invoiceNumber || ''}`.trim() || 'Invoice Payment' },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      customer_email: inv?.billTo?.email || undefined,
      metadata: {
        sanity_invoice_id: String(invoiceId),
        sanity_invoice_number: String(inv?.invoiceNumber || ''),
      },
      payment_intent_data: {
        metadata: {
          sanity_invoice_id: String(invoiceId),
          sanity_invoice_number: String(inv?.invoiceNumber || ''),
        },
      },
      success_url: `${baseUrl}/invoice/success?invoiceId=${encodeURIComponent(invoiceId)}`,
      cancel_url: `${baseUrl}/invoice/cancel?invoiceId=${encodeURIComponent(invoiceId)}`,
    })
  } catch (e) {
    console.error('Stripe session create failed in resendInvoiceEmail.ensureCheckoutUrl:', e)
    return ''
  }

  const url = session?.url || ''
  if (url && CAN_PATCH) {
    try {
      await sanity.patch(invoiceId).set({ paymentLinkUrl: url }).commit({ autoGenerateArrayKeys: true })
    } catch (e: any) {
      const code = (e?.response?.statusCode || e?.statusCode || '').toString()
      console.warn(`resendInvoiceEmail: could not save paymentLinkUrl (status ${code || 'unknown'}) — continuing without persisting.`)
    }
  }
  return url
}

async function buildInvoicePdf(inv: any, invoiceNumber: string) {
  const billTo = inv?.billTo || {}
  const shipTo = inv?.shipTo || inv?.billTo || {}
  const items = Array.isArray(inv?.lineItems) ? inv.lineItems : []
  const { subtotal, discountAmt, taxAmount, total } = computeTotals(inv)

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Try logo
  let logo
  try {
    if (fs.existsSync(brand.logoPath)) {
      const bytes = fs.readFileSync(brand.logoPath)
      logo = brand.logoPath.toLowerCase().endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    }
  } catch {}

  const margin = 50
  let y = 792 - margin

  page.drawText('INVOICE', { x: margin, y, size: 36, font: bold, color: brand.navy })
  if (logo) {
    const lw = 88, lh = (logo.height / logo.width) * lw
    page.drawImage(logo, { x: 612 - margin - lw, y: y - lh + 16, width: lw, height: lh })
  }
  y -= 46

  // Company
  const leftX = margin
  const rightX = 300
  page.drawText(brand.name, { x: leftX, y, size: 11, font: bold, color: rgb(0,0,0) })
  page.drawText(brand.street, { x: leftX, y: y - 14, size: 10, font })
  page.drawText(brand.city, { x: leftX, y: y - 28, size: 10, font })
  page.drawText(`${brand.phone}  •  ${brand.email}`, { x: leftX, y: y - 42, size: 10, font })

  const invDate = inv?.invoiceDate || new Date().toISOString().slice(0,10)
  const dueDate = inv?.dueDate || ''

  page.drawText('INVOICE #', { x: rightX, y, size: 11, font: bold, color: brand.navy })
  page.drawText(String(invoiceNumber || '—'), { x: rightX + 90, y, size: 11, font })
  page.drawText('INVOICE DATE', { x: rightX, y: y - 16, size: 11, font: bold, color: brand.navy })
  page.drawText(String(invDate), { x: rightX + 90, y: y - 16, size: 11, font })
  page.drawText('DUE DATE', { x: rightX, y: y - 32, size: 11, font: bold, color: brand.navy })
  page.drawText(String(dueDate), { x: rightX + 90, y: y - 32, size: 11, font })
  y -= 70

  // Bill/Ship
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

  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, color: brand.accent, thickness: 2 })
  y -= 12

  const colQty = margin
  const colDesc = colQty + 30
  const colUnit = 612 - margin - 120
  const colAmount = 612 - margin - 20

  page.drawText('QTY', { x: colQty, y, size: 11, font: bold, color: brand.navy })
  page.drawText('DESCRIPTION', { x: colDesc, y, size: 11, font: bold, color: brand.navy })
  page.drawText('UNIT PRICE', { x: colUnit, y, size: 11, font: bold, color: brand.navy })
  page.drawText('AMOUNT', { x: colAmount, y, size: 11, font: bold, color: brand.navy })
  page.drawLine({ start: { x: margin, y: y - 6 }, end: { x: 612 - margin, y: y - 6 }, color: brand.accent, thickness: 1 })

  let rowY = y - 22
  const maxRows = 25
  for (let i = 0; i < Math.min(items.length, maxRows); i++) {
    const li = items[i] || {}
    const qty = Number(li?.quantity || 1)
    const unitPrice = Number(li?.unitPrice || 0)
    const line = typeof li?.lineTotal === 'number' ? li.lineTotal : qty * unitPrice
    let desc = String(li?.description || li?.sku || 'Item')
    if (desc.length > 80) desc = desc.slice(0, 77) + '…'
    page.drawText(String(qty), { x: colQty, y: rowY, size: 10, font })
    page.drawText(desc, { x: colDesc, y: rowY, size: 10, font })
    page.drawText(money(unitPrice), { x: colUnit, y: rowY, size: 10, font })
    page.drawText(money(line), { x: colAmount, y: rowY, size: 10, font })
    rowY -= 16
  }

  const totalsX = 612 - margin - 200
  let ty = rowY - 10
  const label = (t: string, size = 11) => page.drawText(t, { x: totalsX, y: ty, size, font })
  const val = (t: string, size = 11, b = false) => page.drawText(t, { x: totalsX + 120, y: ty, size, font: b ? bold : font })
  label('Subtotal'); val(money(subtotal)); ty -= 16
  if (discountAmt > 0) { label('Discount'); val(`-${money(discountAmt).slice(1)}`); ty -= 16 }
  if (taxAmount > 0) { label('Sales Tax'); val(money(taxAmount)); ty -= 16 }
  page.drawLine({ start: { x: totalsX, y: ty - 6 }, end: { x: totalsX + 200, y: ty - 6 }, color: rgb(0.85,0.85,0.85), thickness: 1 })
  label('TOTAL', 12); val(money(total), 12, true)

  const bytes = await pdf.save({ useObjectStreams: false })
  return Buffer.from(bytes).toString('base64')
}

const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Method Not Allowed' }) }

  let email = ''
  let invoiceId = ''
  try {
    const payload = JSON.parse(event.body || '{}')
    email = String(payload.email || '').trim()
    invoiceId = String(payload.invoiceId || '').trim()
  } catch {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Invalid JSON' }) }
  }

  if (!invoiceId) return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Missing invoiceId' }) }

  try {
    const invoice = await sanity.fetch(
      `*[_type == "invoice" && _id == $id][0]{
        _id,
        title,
        invoiceNumber,
        total,
        billTo,
        shipTo,
        lineItems,
        discountType,
        discountValue,
        taxRate,
        paymentLinkUrl,
      }`,
      { id: invoiceId }
    )

    if (!invoice) return { statusCode: 404, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Invoice not found' }) }

    // Derive email
    if (!email) email = String(invoice?.billTo?.email || '').trim()
    if (!email) return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'No email provided and none found on the invoice.' }) }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Invalid email format' }) }

const { total } = computeTotals(invoice)

// Ensure there is a payment link (reuse stored URL or create & patch it)
const baseUrl = process.env.AUTH0_BASE_URL || 'http://localhost:3333'
const payUrl =
  String(invoice?.paymentLinkUrl || '') ||
  (await ensureCheckoutUrl(invoiceId, invoice, baseUrl))
if (!payUrl) {
  const { subtotal, discountAmt, taxAmount, total } = computeTotals(invoice)
  const unitAmount = Math.round(Number(total || 0) * 100)
  console.error('resendInvoiceEmail: No payment link generated', {
    invoiceId,
    unitAmount,
    total,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
  })
  return {
    statusCode: 500,
    headers: CORS,
    body: JSON.stringify({
      message: 'No payment link could be generated for this invoice',
      total,
      unitAmount,
      hint: !process.env.STRIPE_SECRET_KEY
        ? 'Missing STRIPE_SECRET_KEY'
        : unitAmount < 50
        ? 'Total must be at least $0.50'
        : 'Check Stripe logs for a session creation error',
    }),
  }
}

    // Build PDF and attach
    const b64pdf = await buildInvoicePdf(invoice, String(invoice.invoiceNumber || ''))

    const customerName = invoice?.billTo?.name || 'Customer'

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b1b1b;line-height:1.45;">
        <div style="margin:0 0 14px;">
          <h2 style="margin:0 0 8px;font-weight:700;">Invoice from F.A.S. Motorsports</h2>
          <p style="margin:0 0 6px;">Hello ${customerName},</p>
          <p style="margin:0 0 10px;">Please find your invoice ${invoice.invoiceNumber ? `#<strong>${invoice.invoiceNumber}</strong>` : ''} attached as a PDF for your records.</p>
        </div>
        ${payUrl ? `
        <div style="margin:14px 0 10px;">
          <a href="${payUrl}" target="_blank" style="display:inline-block;padding:12px 18px;background:#dc362e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Pay Invoice Securely</a>
        </div>
        <p style="margin:8px 0 10px;font-size:13px;color:#444;">If the button doesn’t work, copy and paste this link into your browser:<br/>
          <a href="${payUrl}" target="_blank" style="color:#0a66c2;text-decoration:underline;word-break:break-all;">${payUrl}</a>
        </p>
        ` : ''}
        <p style="margin:16px 0 0;">Thank you for your business.<br/>— F.A.S. Motorsports</p>
      </div>
    `

    await resend.emails.send({
      from: 'FAS Motorsports <billing@updates.fasmotorsports.com>',
      to: email,
      subject: `Your Invoice${invoice.invoiceNumber ? ' #' + invoice.invoiceNumber : ''}`,
      html,
      text: `Your invoice${invoice.invoiceNumber ? ' #' + invoice.invoiceNumber : ''} is attached. ${payUrl ? 'Pay securely: ' + payUrl : ''}`,
      attachments: [
        {
          filename: `invoice-${invoice.invoiceNumber || invoiceId}.pdf`,
          content: b64pdf,
          contentType: 'application/pdf',
          encoding: 'base64',
        } as any,
      ],
    })

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Invoice email sent with PDF attachment.', to: email, payUrl }) }
  } catch (err: any) {
    console.error('Failed to send invoice email:', err)
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Email send failed.', error: String(err?.message || err) }) }
  }
}

export { handler }
