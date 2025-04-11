import { Handler } from '@netlify/functions'
import PDFDocument from 'pdfkit'
import getStream from 'get-stream'
import fetch from 'node-fetch'
import { PassThrough } from 'stream'

const logoUrl = 'https://fassite.netlify.app/logo.png' // Replace with your actual logo URL

const handler: Handler = async (event) => {
  const { customerName, invoiceId, products = [] } = JSON.parse(event.body || '{}')

  const doc: PDFKit.PDFDocument = new PDFDocument({ size: '4x6', margin: 20 })

  const response = await fetch(logoUrl)
  const imageBuffer = await response.buffer()
  doc.image(imageBuffer, { fit: [200, 80], align: 'center' })
  doc.moveDown()

  doc.fontSize(16).text('📦 FAS Motorsports Packing Slip', { align: 'center' })
  doc.moveDown()
  doc.fontSize(12).text(`Customer: ${customerName}`)
  doc.text(`Invoice: ${invoiceId}`)
  doc.moveDown()
  doc.fontSize(12).text('Products:')
  doc.moveDown()

  products.forEach((p: any, i: number) => {
    doc.text(`${i + 1}. ${p.title || 'Unnamed Product'} (${p.quantity || 1})`)
  })

  doc.end()
  let buffer: Buffer
  try {
    const stream = doc.pipe(new PassThrough());
    buffer = await getStream.buffer(stream)
  } catch (err) {
    console.error('Failed to generate PDF buffer', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'PDF generation failed', error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="packing-slip-${invoiceId}.pdf"`
    },
    body: buffer.toString('base64'),
    isBase64Encoded: true
  }
}

export { handler }
