import { Handler } from '@netlify/functions'
import PDFDocument from 'pdfkit'
import getStream from 'get-stream'
import sanityClient from '@sanity/client'
import fetch from 'node-fetch'

const client = sanityClient({
  projectId: 'your_project_id',
  dataset: 'production',
  apiVersion: '2024-04-10',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN
})

const handler: Handler = async (event) => {
  const { billId } = JSON.parse(event.body || '{}')

  if (!billId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing billId' })
    }
  }

  const bill = await client.fetch(
    `*[_type == "bill" && _id == $id][0]{
      amount,
      description,
      paidDate,
      checkNumber,
      vendor->{
        name,
        address
      }
    }`,
    { id: billId }
  )

  if (!bill) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Bill not found' })
    }
  }

  if (!bill.amount || !bill.vendor?.name || !bill.vendor?.address) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Incomplete bill data for check generation' })
    }
  }

  const doc = new PDFDocument({ size: 'letter', margin: 36 })
  const date = new Date(bill.paidDate || new Date()).toLocaleDateString()
  const amountFormatted = `$${bill.amount.toFixed(2)}`
  const amountWritten = `${bill.amount.toFixed(2)} DOLLARS` // Still a placeholder

  // Section heights
  const sectionHeight = 250

  // Top Check
  doc.fontSize(10).text(`Date: ${date}`, 400, 50)
  doc.text(`Check #: ${bill.checkNumber || 'TBD'}`, 400, 65)
  doc.text(`Pay to the Order of: ${bill.vendor.name}`, 50, 90)
  doc.text(amountFormatted, 400, 90)
  doc.text(amountWritten, 50, 110)
  doc.text(`Memo: ${bill.description || ''}`, 50, 130)

  // Mid Stub
  doc.moveTo(36, sectionHeight).lineTo(576, sectionHeight).stroke()
  doc.fontSize(12).text('Check Stub', 50, sectionHeight + 20)
  doc.fontSize(10).text(`Payee: ${bill.vendor.name}`, 50, sectionHeight + 40)
  doc.text(`Address: ${bill.vendor.address}`, 50, sectionHeight + 55)
  doc.text(`Amount: ${amountFormatted}`, 50, sectionHeight + 70)
  doc.text(`Memo: ${bill.description || ''}`, 50, sectionHeight + 85)

  // Bottom Stub Copy
  const copyY = sectionHeight * 2
  doc.moveTo(36, copyY).lineTo(576, copyY).stroke()
  doc.fontSize(12).text('Check Stub (Copy)', 50, copyY + 20)
  doc.fontSize(10).text(`Payee: ${bill.vendor.name}`, 50, copyY + 40)
  doc.text(`Address: ${bill.vendor.address}`, 50, copyY + 55)
  doc.text(`Amount: ${amountFormatted}`, 50, copyY + 70)
  doc.text(`Memo: ${bill.description || ''}`, 50, copyY + 85)

  doc.end()
  const { PassThrough } = require('stream')
  const stream = new PassThrough()
  doc.pipe(stream)
  doc.end()
  const buffer = await getStream.buffer(stream)

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="check-${bill.checkNumber || 'draft'}.pdf"`
    },
    body: buffer.toString('base64'),
    isBase64Encoded: true
  }
}

export { handler }
