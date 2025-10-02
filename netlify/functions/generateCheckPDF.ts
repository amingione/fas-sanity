import { Handler } from '@netlify/functions'
import PDFDocument from 'pdfkit'
import getStream from 'get-stream'
import { createClient } from '@sanity/client'

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.SANITY_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
  process.env.VITE_SANITY_STUDIO_PROJECT_ID ||
  process.env.PUBLIC_SANITY_PROJECT_ID ||
  'r4og35qd'

const dataset =
  process.env.SANITY_STUDIO_DATASET ||
  process.env.SANITY_DATASET ||
  process.env.NEXT_PUBLIC_SANITY_DATASET ||
  process.env.VITE_SANITY_STUDIO_DATASET ||
  process.env.PUBLIC_SANITY_DATASET ||
  'production'

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN || process.env.PUBLIC_SANITY_WRITE_TOKEN,
})

const SMALL_NUMBERS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'] as const
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'] as const
const SCALE = ['', 'THOUSAND', 'MILLION', 'BILLION'] as const

function chunkToWords(num: number): string {
  const hundreds = Math.floor(num / 100)
  const remainder = num % 100
  const parts: string[] = []

  if (hundreds > 0) {
    parts.push(`${SMALL_NUMBERS[hundreds]} HUNDRED`)
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(SMALL_NUMBERS[remainder])
    } else {
      const tens = Math.floor(remainder / 10)
      const ones = remainder % 10
      if (tens > 0) {
        parts.push(ones ? `${TENS[tens]}-${SMALL_NUMBERS[ones]}` : TENS[tens])
      }
    }
  }

  return parts.join(' ')
}

function numberToWords(num: number): string {
  if (!Number.isFinite(num) || num < 0) return 'ZERO'
  if (num === 0) return SMALL_NUMBERS[0]

  let remaining = num
  let scaleIndex = 0
  const segments: string[] = []

  while (remaining > 0 && scaleIndex < SCALE.length) {
    const chunk = remaining % 1000
    if (chunk > 0) {
      const chunkWords = chunkToWords(chunk)
      const scaleWord = SCALE[scaleIndex]
      segments.unshift(scaleWord ? `${chunkWords} ${scaleWord}` : chunkWords)
    }
    remaining = Math.floor(remaining / 1000)
    scaleIndex += 1
  }

  return segments.join(' ')
}

function amountToCheckWords(amount: number): string {
  if (!Number.isFinite(amount)) return 'ZERO DOLLARS'
  const safeAmount = Math.max(0, Math.round(amount * 100) / 100)
  const dollars = Math.floor(safeAmount)
  const cents = Math.round((safeAmount - dollars) * 100)

  const dollarWords = numberToWords(dollars)
  const dollarLabel = dollars === 1 ? 'DOLLAR' : 'DOLLARS'
  const centPortion = cents > 0 ? ` AND ${String(cents).padStart(2, '0')}/100` : ''

  return `${dollarWords} ${dollarLabel}${centPortion}`
}

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
  const amountWritten = amountToCheckWords(Number(bill.amount))

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
