import { Handler } from '@netlify/functions'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const logoUrl = 'https://fassite.netlify.app/logo.png' // optional

const ALLOW_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3333'
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    }
  }

  let payload: any = {}
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    }
  }

  const { customerName = 'Customer', invoiceId = 'N/A', products = [] } = payload

  try {
    // Create a 4x6 inch page (72 pts/inch)
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([288, 432])

    // Built-in Helvetica — no filesystem access required
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)

    let y = 432 - 24 // top padding

    // Try to draw logo (optional)
    try {
      const res = await fetch(logoUrl)
      if ((res as any)?.ok) {
        const arrBuf = await (res as any).arrayBuffer()
        // pdf-lib can embed PNG or JPEG; try PNG first
        try {
          const png = await pdfDoc.embedPng(arrBuf)
          const pngDims = png.scale(0.25)
          page.drawImage(png, { x: (288 - pngDims.width) / 2, y: y - pngDims.height, width: pngDims.width, height: pngDims.height })
          y -= pngDims.height + 8
        } catch {
          try {
            const jpg = await pdfDoc.embedJpg(arrBuf)
            const jpgDims = jpg.scale(0.25)
            page.drawImage(jpg, { x: (288 - jpgDims.width) / 2, y: y - jpgDims.height, width: jpgDims.width, height: jpgDims.height })
            y -= jpgDims.height + 8
          } catch {}
        }
      }
    } catch {}

    // Header
    const title = 'FAS Motorsports Packing Slip'
    page.drawText(title, { x: 20, y: y, size: 12, font: helvetica })
    y -= 18

    page.drawText(`Customer: ${customerName}`, { x: 20, y, size: 10, font: helvetica })
    y -= 14
    page.drawText(`Invoice: ${invoiceId}`, { x: 20, y, size: 10, font: helvetica })
    y -= 18

    page.drawText('Products:', { x: 20, y, size: 11, font: helvetica })
    y -= 14

    if (Array.isArray(products) && products.length > 0) {
      products.forEach((p: any, i: number) => {
        const qty = Number(p?.quantity ?? 1)
        const line = `${i + 1}. ${p?.title || 'Unnamed Product'}  x${qty}`
        page.drawText(line, { x: 24, y, size: 10, font: helvetica })
        y -= 12
      })
    } else {
      page.drawText('— None —', { x: 24, y, size: 10, font: helvetica })
      y -= 12
    }

    const pdfBytes = await pdfDoc.save({ useObjectStreams: false }) // broadest compatibility
    const base64 = Buffer.from(pdfBytes).toString('base64')

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="packing-slip-${invoiceId}.pdf"`,
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (err: any) {
    console.error('Failed to generate PDF (pdf-lib)', err)
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'PDF generation failed', error: String(err?.message || err) }),
    }
  }
}
