import type { Handler } from '@netlify/functions'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import fs from 'fs'
import imageUrlBuilder from '@sanity/image-url'
import path from 'path'
import { createClient } from '@sanity/client'
import { fetchPrintSettings, hexToRgb, lightenRgb } from '../lib/printSettings'

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
const quoteLogoBuilder = imageUrlBuilder(sanity)

const BUSINESS = {
  name: 'F.A.S. Motorsports LLC',
  address1: '6161 Riverside Dr',
  address2: 'Punta Gorda, FL 33982',
  phone: '(812) 200-9012',
  email: 'sales@fasmotorsports.com',
  logoPath: path.resolve(process.cwd(), 'public/media/New Red FAS Logo.png'),
  website: 'www.fasmotorsports.com',
}

type QuoteFontKey = 'Helvetica' | 'Arial' | 'Times' | 'Courier'

const QUOTE_FONT_FAMILIES: Record<QuoteFontKey, { regular: StandardFonts; bold: StandardFonts }> = {
  Helvetica: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold },
  Arial: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold },
  Times: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold },
  Courier: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold },
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

async function tryLoadLogoBytes(logoUrl?: string): Promise<Uint8Array | null> {
  if (logoUrl) {
    try {
      const response = await fetch(logoUrl)
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        return new Uint8Array(arrayBuffer)
      }
    } catch {
      // ignore remote failures
    }
  }
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

    const printSettings = await fetchPrintSettings(sanity)
    let logoUrl: string | undefined
    if (printSettings?.logo) {
      try {
        logoUrl = quoteLogoBuilder.image(printSettings.logo).width(400).url()
      } catch (err) {
        console.warn('generateQuotePDF: failed to build logo URL', err)
      }
    }

    const { subtotal, discount, taxAmount, total } = computeTotals(quote)
    const typography = printSettings?.typography
    const fontFamily = (typography?.fontFamily ?? 'Helvetica') as keyof typeof QUOTE_FONT_FAMILIES
    const fontSelection = QUOTE_FONT_FAMILIES[fontFamily] ?? QUOTE_FONT_FAMILIES.Helvetica
    const headerText = printSettings?.quoteSettings?.headerText?.trim() || 'QUOTE'
    const showLogo = printSettings?.quoteSettings?.showLogo !== false
    const footerTemplate =
      printSettings?.quoteSettings?.footerText?.trim() ||
      'Thank you for the opportunity to earn your business.'
    const footerLines = footerTemplate
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const addressLines = (printSettings?.companyAddress ?? BUSINESS.address1)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const companyAddress1 = addressLines[0] || BUSINESS.address1
    const companyAddress2 = addressLines.slice(1).join(', ') || BUSINESS.address2
    const companyName = printSettings?.companyName?.trim() || BUSINESS.name
    const companyPhone = printSettings?.companyPhone?.trim() || BUSINESS.phone
    const companyEmail = printSettings?.companyEmail?.trim() || BUSINESS.email
    const companyWebsite = printSettings?.companyWebsite?.trim() || BUSINESS.website
    const accentColor = hexToRgb(printSettings?.primaryColor?.hex, { r: 0.86, g: 0.23, b: 0.18 })
    const baseTextColor = hexToRgb(printSettings?.textColor?.hex, { r: 0, g: 0, b: 0 })
    const secondaryColor = printSettings?.secondaryColor?.hex
      ? hexToRgb(printSettings.secondaryColor.hex, lightenRgb(baseTextColor, 0.4))
      : lightenRgb(baseTextColor, 0.35)
    const headerLineColor = lightenRgb(baseTextColor, 0.45)
    const lightBgColor = lightenRgb(secondaryColor, 0.4)
    const mutedColor = lightenRgb(baseTextColor, 0.5)
    const primaryRgb = rgb(accentColor.r, accentColor.g, accentColor.b)
    const textRgb = rgb(baseTextColor.r, baseTextColor.g, baseTextColor.b)
    const headerBorderRgb = rgb(headerLineColor.r, headerLineColor.g, headerLineColor.b)
    const lightBackgroundRgb = rgb(lightBgColor.r, lightBgColor.g, lightBgColor.b)
    const mutedRgb = rgb(mutedColor.r, mutedColor.g, mutedColor.b)

    const pdf = await PDFDocument.create()
    let page = pdf.addPage([612, 792]) // US Letter (72 dpi)
    const { width, height } = page.getSize()

    const font = await pdf.embedFont(fontSelection.regular)
    const fontBold = await pdf.embedFont(fontSelection.bold)
    const textColorRgb = textRgb
    const mutedTextRgb = mutedRgb
    const boxBackgroundColor = lightBackgroundRgb
    const borderLineColor = headerBorderRgb
    const accentRgbColor = primaryRgb

    let y = height - 40

    // Header: Logo + Business block
    const logoBytes = showLogo ? await tryLoadLogoBytes(logoUrl) : null
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
    let infoY = y - 10
    const infoX = 220
    page.drawText(companyName, {
      x: infoX,
      y: infoY,
      size: 14,
      font: fontBold,
      color: accentRgbColor,
    })
    infoY -= 18
    page.drawText(companyAddress1, {
      x: infoX,
      y: infoY,
      size: 10,
      font,
      color: mutedTextRgb,
    })
    infoY -= 14
    if (companyAddress2) {
      page.drawText(companyAddress2, {
        x: infoX,
        y: infoY,
        size: 10,
        font,
        color: mutedTextRgb,
      })
      infoY -= 14
    }
    page.drawText(companyPhone, {
      x: infoX,
      y: infoY,
      size: 10,
      font,
      color: mutedTextRgb,
    })
    infoY -= 14
    page.drawText(companyEmail, {
      x: infoX,
      y: infoY,
      size: 10,
      font,
      color: mutedTextRgb,
    })
    infoY -= 14
    if (companyWebsite) {
      page.drawText(companyWebsite, {
        x: infoX,
        y: infoY,
        size: 10,
        font,
        color: mutedTextRgb,
      })
    }

    // Title + meta
    page.drawText(headerText, {
      x: width - 140,
      y: y - 10,
      size: 22,
      font: fontBold,
      color: accentRgbColor,
    })
    const qNum = safeStr(quote.quoteNumber || quote._id)
    page.drawText(`Quote # ${qNum}`, {
      x: width - 220,
      y: y - 36,
      size: 10,
      font,
      color: mutedTextRgb,
    })
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: width - 220,
      y: y - 50,
      size: 10,
      font,
      color: mutedTextRgb,
    })

    y -= 100

    // Bill To / Ship To boxes
    const billLines = drawAddress('Bill To', quote.billTo || {})
    const shipLines = drawAddress('Ship To', quote.shipTo || {})

    function drawBox(x: number, topY: number, w: number, h: number) {
      page.drawRectangle({
        x,
        y: topY - h,
        width: w,
        height: h,
        color: boxBackgroundColor,
        opacity: 0.6,
      })
      page.drawRectangle({
        x,
        y: topY - h,
        width: w,
        height: h,
        borderColor: borderLineColor,
        borderWidth: 1,
        color: undefined,
      })
    }

    const boxW = (width - 80 - 20) / 2
    const boxH = 90
    drawBox(40, y, boxW, boxH)
    drawBox(60 + boxW, y, boxW, boxH)

    let by = y - 18
    billLines.forEach((line, i) =>
      page.drawText(line, { x: 48, y: by - i * 14, size: 10, font, color: textColorRgb }),
    )
    shipLines.forEach((line, i) =>
      page.drawText(line, { x: 68 + boxW, y: by - i * 14, size: 10, font, color: textColorRgb }),
    )

    y -= boxH + 24

    // Items header
    page.drawRectangle({
      x: 40,
      y: y - 20,
      width: width - 80,
      height: 20,
      color: boxBackgroundColor,
      opacity: 0.6,
    })
    page.drawText('Description', {
      x: 48,
      y: y - 15,
      size: 10,
      font: fontBold,
      color: textColorRgb,
    })
    page.drawText('Qty', {
      x: width - 220,
      y: y - 15,
      size: 10,
      font: fontBold,
      color: textColorRgb,
    })
    page.drawText('Unit', {
      x: width - 170,
      y: y - 15,
      size: 10,
      font: fontBold,
      color: textColorRgb,
    })
    page.drawText('Amount', {
      x: width - 110,
      y: y - 15,
      size: 10,
      font: fontBold,
      color: textColorRgb,
    })

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
      page.drawText(lines, {
        x: 48,
        y: y - 12,
        size: 10,
        font,
        color: textColorRgb,
        maxWidth: width - 80 - 240,
        lineHeight: 12,
      })
      page.drawText(String(qty), {
        x: width - 220,
        y: y - 12,
        size: 10,
        font,
        color: textColorRgb,
      })
      page.drawText(money(unit), {
        x: width - 170,
        y: y - 12,
        size: 10,
        font,
        color: textColorRgb,
      })
      page.drawText(money(amount), {
        x: width - 110,
        y: y - 12,
        size: 10,
        font,
        color: textColorRgb,
      })

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
      const fontToUse = bold ? fontBold : font
      const colorToUse = bold ? accentRgbColor : textColorRgb
      page.drawText(label, { x: totalsX, y: ty, size: 10, font: fontToUse, color: colorToUse })
      page.drawText(value, { x: width - 110, y: ty, size: 10, font: fontToUse, color: colorToUse })
      ty -= 14
    }

    row('Subtotal', money(subtotal))
    row('Discount', money(discount))
    row('Tax', money(taxAmount))
    row('Total', money(total), true)

    // Footer note
    let footerY = 40
    footerLines.forEach((line) => {
      page.drawText(line, { x: 40, y: footerY, size: 10, font, color: mutedRgb })
      footerY -= 14
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
