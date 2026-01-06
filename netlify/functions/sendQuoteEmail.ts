import {Resend} from 'resend'
import {resolveResendApiKey} from '../../shared/resendEnv'
import {createClient} from '@sanity/client'
import type {Handler} from '@netlify/functions'
import {PDFDocument, StandardFonts, rgb} from 'pdf-lib'
import {getMissingResendFields} from '../lib/resendValidation'
import {markEmailLogFailed, markEmailLogSent, reserveEmailLog} from '../lib/emailIdempotency'

const resend = new Resend(resolveResendApiKey()!)

// Prefer the single write token you set up; no fallback to PUBLIC_*
const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  apiVersion: '2024-04-10',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
})

// ---------- helpers ----------
function money(n: number | undefined | null) {
  const v = typeof n === 'number' && isFinite(n) ? n : 0
  return `$${v.toFixed(2)}`
}

function safe(v: any) {
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
    discountType === 'percent'
      ? subtotal * (discountValue / 100)
      : discountType === 'amount'
        ? discountValue
        : 0
  const taxable = Math.max(subtotal - discount, 0)
  const taxAmount = taxable * (taxRate / 100)
  const total = taxable + taxAmount

  return {subtotal, discount, taxAmount, total}
}

async function fetchQuote(id: string) {
  const q = `*[_type=="quote" && _id==$id][0]{
    _id, title, quoteNumber,
    billTo, shipTo,
    lineItems[]{quantity, unitPrice, customName, description, product->{title}},
    discountType, discountValue, taxRate,
    subtotal, taxAmount, total
  }`
  return sanity.fetch(q, {id})
}

async function buildPdf(quote: any): Promise<Uint8Array> {
  const {subtotal, discount, taxAmount, total} = computeTotals(quote)

  const pdf = await PDFDocument.create()
  let page = pdf.addPage([612, 792]) // US Letter
  const {width, height} = page.getSize()

  const black = rgb(0, 0, 0)
  const gray = rgb(0.4, 0.4, 0.4)
  const light = rgb(0.9, 0.9, 0.9)

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let y = height - 40

  // Business header
  page.drawText('F.A.S. Motorsports LLC', {x: 40, y: y - 10, size: 16, font: bold, color: black})
  page.drawText('6161 Riverside Dr', {x: 40, y: y - 28, size: 10, font, color: gray})
  page.drawText('Punta Gorda, FL 33982', {x: 40, y: y - 42, size: 10, font, color: gray})
  page.drawText('(812) 200-9012 • sales@fasmotorsports.com', {
    x: 40,
    y: y - 56,
    size: 10,
    font,
    color: gray,
  })

  page.drawText('QUOTE', {x: width - 140, y: y - 10, size: 22, font: bold, color: black})
  const qNum = safe(quote.quoteNumber || quote._id)
  page.drawText(`Quote # ${qNum}`, {x: width - 220, y: y - 36, size: 10, font, color: gray})
  page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: width - 220,
    y: y - 50,
    size: 10,
    font,
    color: gray,
  })

  y -= 90

  function addrLines(obj: any) {
    const lines: string[] = []
    if (obj?.name) lines.push(safe(obj.name))
    if (obj?.email) lines.push(safe(obj.email))
    if (obj?.phone) lines.push(safe(obj.phone))
    const l1 = [obj?.address_line1, obj?.address_line2].filter(Boolean).join(', ')
    if (l1) lines.push(l1)
    const l2 = [obj?.city_locality, obj?.state_province, obj?.postal_code]
      .filter(Boolean)
      .join(', ')
    if (l2) lines.push(l2)
    if (obj?.country_code) lines.push(safe(obj.country_code))
    return lines
  }

  // Bill To / Ship To boxes
  const boxW = (width - 80 - 20) / 2
  const boxH = 90
  page.drawRectangle({x: 40, y: y - boxH, width: boxW, height: boxH, color: light, opacity: 0.4})
  page.drawRectangle({
    x: 40,
    y: y - boxH,
    width: boxW,
    height: boxH,
    borderColor: gray,
    borderWidth: 1,
  })
  page.drawRectangle({
    x: 60 + boxW,
    y: y - boxH,
    width: boxW,
    height: boxH,
    color: light,
    opacity: 0.4,
  })
  page.drawRectangle({
    x: 60 + boxW,
    y: y - boxH,
    width: boxW,
    height: boxH,
    borderColor: gray,
    borderWidth: 1,
  })

  page.drawText('Bill To', {x: 48, y: y - 16, size: 10, font: bold, color: black})
  page.drawText('Ship To', {x: 68 + boxW, y: y - 16, size: 10, font: bold, color: black})

  const bill = addrLines(quote.billTo || {})
  const ship = addrLines(quote.shipTo || {})
  bill.forEach((t, i) =>
    page.drawText(t, {x: 48, y: y - 32 - i * 12, size: 10, font, color: black}),
  )
  ship.forEach((t, i) =>
    page.drawText(t, {x: 68 + boxW, y: y - 32 - i * 12, size: 10, font, color: black}),
  )

  y -= boxH + 20

  // Items header
  page.drawRectangle({x: 40, y: y - 20, width: width - 80, height: 20, color: light, opacity: 0.6})
  page.drawText('Description', {x: 48, y: y - 15, size: 10, font: bold, color: black})
  page.drawText('Qty', {x: width - 220, y: y - 15, size: 10, font: bold, color: black})
  page.drawText('Unit', {x: width - 170, y: y - 15, size: 10, font: bold, color: black})
  page.drawText('Amount', {x: width - 110, y: y - 15, size: 10, font: bold, color: black})

  y -= 26

  const items = Array.isArray(quote.lineItems) ? quote.lineItems : []
  for (const li of items) {
    const qty = Number(li?.quantity || 0) || 0
    const unit = Number(li?.unitPrice || 0) || 0
    const amount = qty * unit
    const title = safe(li?.product?.title || li?.customName || 'Item')
    const desc = safe(li?.description || '')
    const line = [title, desc].filter(Boolean).join(' — ')

    page.drawText(line, {
      x: 48,
      y: y - 12,
      size: 10,
      font,
      color: black,
      maxWidth: width - 80 - 240,
      lineHeight: 12,
    })
    page.drawText(String(qty), {x: width - 220, y: y - 12, size: 10, font, color: black})
    page.drawText(money(unit), {x: width - 170, y: y - 12, size: 10, font, color: black})
    page.drawText(money(amount), {x: width - 110, y: y - 12, size: 10, font, color: black})

    y -= 18
    if (y < 120) {
      page.drawText('Continued…', {x: width - 140, y: 40, size: 10, font, color: gray})
      const p = pdf.addPage([612, 792])
      y = p.getSize().height - 40
      page = p
    }
  }

  // Totals box
  const totalsX = width - 240
  let ty = Math.max(y - 6, 140)
  function row(label: string, value: string, boldRow = false) {
    page.drawText(label, {x: totalsX, y: ty, size: 10, font: boldRow ? bold : font, color: black})
    page.drawText(value, {
      x: width - 110,
      y: ty,
      size: 10,
      font: boldRow ? bold : font,
      color: black,
    })
    ty -= 14
  }
  row('Subtotal', money(subtotal))
  row('Discount', money(discount))
  row('Tax', money(taxAmount))
  row('Total', money(total), true)

  page.drawText('Thank you for the opportunity to earn your business.', {
    x: 40,
    y: 40,
    size: 10,
    font,
    color: gray,
  })

  const bytes = await pdf.save()
  return bytes
}

export const handler: Handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {}
    const quoteId = body?.quoteId || body?.id
    if (!quoteId) return {statusCode: 400, body: 'Missing quoteId'}

    const quote = await fetchQuote(quoteId)
    if (!quote) return {statusCode: 404, body: 'Quote not found'}

    const toEmail = quote?.billTo?.email || ''
    if (!toEmail) return {statusCode: 400, body: 'Missing customer email (billTo.email)'}

    const {subtotal, discount, taxAmount, total} = computeTotals(quote)

    // Build a concise HTML summary + CTA
    const baseUrl = process.env.SANITY_STUDIO_NETLIFY_BASE || 'https://fassanity.fasmotorsports.com'
    const pdfFilename = `Quote_${safe(quote.quoteNumber || quote._id)}.pdf`

    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111;">
        <h2 style="margin:0 0 8px;">Your Quote from F.A.S. Motorsports</h2>
        <p style="margin:0 0 8px;">Quote <b>#${safe(quote.quoteNumber || quote._id)}</b></p>
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
          <tr><td style="padding:4px 8px;">Subtotal</td><td style="padding:4px 8px; text-align:right;">${money(subtotal)}</td></tr>
          <tr><td style="padding:4px 8px;">Discount</td><td style="padding:4px 8px; text-align:right;">${money(discount)}</td></tr>
          <tr><td style="padding:4px 8px;">Tax</td><td style="padding:4px 8px; text-align:right;">${money(taxAmount)}</td></tr>
          <tr><td style="padding:4px 8px;font-weight:600;border-top:1px solid #ddd;">Total</td><td style="padding:4px 8px; text-align:right;font-weight:600;border-top:1px solid #ddd;">${money(total)}</td></tr>
        </table>
        <p style="margin:16px 0 8px;">The full quote PDF is attached for your records.</p>
        <p style="margin:0 0 16px;">When you’re ready to proceed, reply to this email or call <a href="tel:+18122009012">(812) 200-9012</a>.</p>
        <div style="margin-top:16px;">
          <a href="${baseUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none;">Visit FAS Motorsports</a>
        </div>
      </div>
    `

    // Attach generated PDF
    const pdfBytes = await buildPdf(quote)
    const from = 'FAS Motorsports <quotes@updates.fasmotorsports.com>'
    const subject = `Your Quote #${safe(quote.quoteNumber || quote._id)}`
    const missing = getMissingResendFields({to: toEmail, from, subject})
    if (missing.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({error: `Missing email fields: ${missing.join(', ')}`}),
      }
    }

    const contextKey = `quote-email:${quote._id}:${toEmail.toLowerCase()}`
    const reservation = await reserveEmailLog({contextKey, to: toEmail, subject})
    if (reservation.shouldSend) {
      try {
        const response = await resend.emails.send({
          from,
          to: toEmail,
          subject,
          html,
          attachments: [
            {
              filename: pdfFilename,
              content: Buffer.from(pdfBytes).toString('base64'),
              path: undefined,
              contentType: 'application/pdf',
            },
          ],
        })
        const resendId = (response as any)?.data?.id || (response as any)?.id || null
        await markEmailLogSent(reservation.logId, resendId)
      } catch (err) {
        await markEmailLogFailed(reservation.logId, err)
        throw err
      }
    }

    return {statusCode: 200, body: JSON.stringify({message: 'Quote email sent', to: toEmail})}
  } catch (error: any) {
    console.error('sendQuoteEmail failed', error?.message || error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to send email',
        details: error?.message || 'Unknown error',
      }),
    }
  }
}
