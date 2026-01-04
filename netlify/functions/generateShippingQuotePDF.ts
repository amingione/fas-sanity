import type {Handler} from '@netlify/functions'
import {PDFDocument, PDFPage, PDFFont, StandardFonts, rgb} from 'pdf-lib'
import {createClient} from '@sanity/client'

const SANITY_STUDIO_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID
const SANITY_STUDIO_DATASET = process.env.SANITY_STUDIO_DATASET || 'production'
const SANITY_API_TOKEN =
  process.env.SANITY_API_TOKEN
const SANITY_API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'

const sanityClient =
  SANITY_STUDIO_PROJECT_ID && SANITY_API_TOKEN
    ? createClient({
        projectId: SANITY_STUDIO_PROJECT_ID,
        dataset: SANITY_STUDIO_DATASET,
        token: SANITY_API_TOKEN,
        apiVersion: SANITY_API_VERSION,
        useCdn: false,
      })
    : null

const jsonResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(payload),
})

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, {error: 'Method not allowed'})
  }

  if (!sanityClient) {
    return jsonResponse(500, {error: 'Missing Sanity credentials for file upload'})
  }

  try {
    const {shipToAddress, dimensions, weight, rate} = JSON.parse(event.body || '{}')
    if (!shipToAddress || !dimensions || !weight || !rate) {
      return jsonResponse(400, {error: 'Missing shipToAddress, dimensions, weight, or rate'})
    }

    const pdfBytes = await buildQuotePdf({
      address: shipToAddress,
      dimensions,
      weight,
      rate,
    })

    const asset = await sanityClient.assets.upload('file', Buffer.from(pdfBytes), {
      filename: `shipping-quote-${Date.now()}.pdf`,
      contentType: 'application/pdf',
    })

    return jsonResponse(200, {assetId: asset._id, pdfUrl: asset.url})
  } catch (error: any) {
    console.error('generateShippingQuotePDF failed', error)
    const message = error?.message || 'Unable to generate PDF'
    return jsonResponse(500, {error: message})
  }
}

export {handler}

async function buildQuotePdf({
  address,
  dimensions,
  weight,
  rate,
}: {
  address: string
  dimensions: {length: number; width: number; height: number}
  weight: number
  rate: {carrier: string; service: string; rate: string}
}) {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([600, 800])
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let cursorY = 750

  cursorY = drawTitle(page, 'Shipping Quote', cursorY, boldFont)
  cursorY = drawTextLine(page, `Date: ${new Date().toLocaleDateString()}`, cursorY - 20, regularFont)

  cursorY = drawSectionHeader(page, 'Ship To', cursorY - 30, boldFont)
  cursorY = drawMultiline(page, address, cursorY - 20, regularFont)

  cursorY = drawSectionHeader(page, 'Package Details', cursorY - 20, boldFont)
  cursorY = drawTextLine(
    page,
    `Dimensions: ${dimensions.length}" × ${dimensions.width}" × ${dimensions.height}"`,
    cursorY - 16,
    regularFont,
  )
  cursorY = drawTextLine(page, `Weight: ${weight} lbs`, cursorY - 16, regularFont)

  cursorY = drawSectionHeader(page, 'Shipping Rate', cursorY - 24, boldFont)
  cursorY = drawTextLine(
    page,
    `${rate.carrier} — ${rate.service}`,
    cursorY - 18,
    regularFont,
  )
  drawTextLine(
    page,
    `Cost: $${Number.parseFloat(rate.rate).toFixed(2)}`,
    cursorY - 20,
    boldFont,
    16,
  )

  return pdfDoc.save()
}

function drawTitle(page: PDFPage, text: string, y: number, font: PDFFont) {
  page.drawText(text, {x: 50, y, size: 26, font, color: rgb(0, 0, 0)})
  return y
}

function drawSectionHeader(page: PDFPage, text: string, y: number, font: PDFFont) {
  page.drawText(text, {x: 50, y, size: 14, font, color: rgb(0, 0, 0)})
  return y
}

function drawTextLine(page: PDFPage, text: string, y: number, font: PDFFont, size = 12) {
  page.drawText(text, {x: 50, y, size, font, color: rgb(0, 0, 0)})
  return y
}

function drawMultiline(page: PDFPage, text: string, y: number, font: PDFFont) {
  const lines = (text || '').split(/\r?\n/).filter((line) => line.trim().length > 0)
  let cursor = y
  for (const line of lines) {
    page.drawText(line, {x: 50, y: cursor, size: 12, font, color: rgb(0, 0, 0)})
    cursor -= 16
  }
  return cursor
}
