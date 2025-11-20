import type {Handler} from '@netlify/functions'
import PDFDocument from 'pdfkit'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import fs from 'fs'
import path from 'path'

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd'

const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'

const sanityToken = process.env.SANITY_API_TOKEN

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  useCdn: false,
  token: sanityToken,
})

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY
const stripe =
  stripeSecretKey &&
  new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20' as unknown as Stripe.StripeConfig['apiVersion'],
  })

const MICR_FONT_PATH = path.resolve(process.cwd(), 'public', 'fonts', 'micrenc.ttf')
const micrFontBuffer = fs.existsSync(MICR_FONT_PATH) ? fs.readFileSync(MICR_FONT_PATH) : null

const pdfDocumentToBuffer = (doc: InstanceType<typeof PDFDocument>): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk))
    })
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

const SMALL_NUMBERS = [
  'ZERO',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
] as const
const TENS = [
  '',
  '',
  'TWENTY',
  'THIRTY',
  'FORTY',
  'FIFTY',
  'SIXTY',
  'SEVENTY',
  'EIGHTY',
  'NINETY',
] as const
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

async function generateCheckPdf(checkId: string) {
  if (!stripe) {
    throw new Error('Stripe secret key not configured')
  }
  if (!micrFontBuffer) {
    throw new Error('MICR font not found at public/fonts/micrenc.ttf')
  }

  const check = await client.fetch(
    `*[_type == "check" && _id == $id][0]{
      payee,
      mailingAddress,
      bankAccount->{_id, title, stripeAccountId, institutionName, holderName},
      amount,
      memo,
      checkNumber,
      paymentDate,
      lineItems[]{category, description, amount}
    }`,
    {id: checkId},
  )

  if (!check) {
    throw new Error('Check document not found')
  }

  if (!check.bankAccount?.stripeAccountId) {
    throw new Error('Check is missing a connected bank account')
  }

  if (!Number.isFinite(check.amount)) {
    throw new Error('Invalid check amount')
  }

  const stripeAccount = (await stripe.financialConnections.accounts.retrieve(
    check.bankAccount.stripeAccountId,
    {
      expand: ['account_numbers'],
    } as any,
  )) as any

  const bankDetails = stripeAccount.account_numbers?.us_bank_account

  if (!bankDetails?.account_number || !bankDetails.routing_number) {
    throw new Error('Unable to retrieve bank account numbers from Stripe')
  }

  const doc = new PDFDocument({size: 'letter', margin: 36})
  doc.registerFont('MICR', micrFontBuffer)

  const pageWidth = doc.page.width
  const margin = 36
  const checkHeight = 252 // 3.5 inches
  const usableWidth = pageWidth - margin * 2

  const payeeName = check.payee || 'Payee'
  const amount = Number(check.amount)
  const amountFormatted = `$${amount.toFixed(2)}`
  const amountWritten = amountToCheckWords(amount)
  const paymentDate = new Date(check.paymentDate || new Date()).toLocaleDateString()
  const checkNumber = check.checkNumber || '000000'
  const memo = check.memo || ''
  const holder = check.bankAccount.holderName || 'F.A.S. Motorsports LLC'
  const institution =
    check.bankAccount.institutionName || bankDetails.bank_name || 'Financial Institution'

  const micrLine = `A${bankDetails.routing_number}A ${bankDetails.account_number}C${
    typeof checkNumber === 'number'
      ? String(checkNumber).padStart(6, '0')
      : String(checkNumber).padStart(6, '0')
  }C`

  // Header
  doc.fontSize(12).text(holder, margin, margin)
  doc.fontSize(10).text(institution, margin, margin + 16)

  // Date and check number
  doc.fontSize(10)
  const dateLabel = `Date: ${paymentDate}`
  const checkLabel = `Check #: ${checkNumber}`
  doc.text(dateLabel, margin + usableWidth - doc.widthOfString(dateLabel), margin)
  doc.text(checkLabel, margin + usableWidth - doc.widthOfString(checkLabel), margin + 14)

  const payeeY = margin + 48
  doc.fontSize(11).text('Pay to the Order of:', margin, payeeY)
  doc.font('Helvetica-Bold').text(payeeName, margin + 140, payeeY)
  doc.font('Helvetica')
  doc.text(amountFormatted, margin + usableWidth - doc.widthOfString(amountFormatted), payeeY)

  doc
    .moveTo(margin, payeeY + 18)
    .lineTo(margin + usableWidth, payeeY + 18)
    .stroke()

  // Amount in words line
  doc.text(`${amountWritten}***`, margin, payeeY + 28, {width: usableWidth})

  // Address
  if (check.mailingAddress) {
    doc.fontSize(10).text(check.mailingAddress, margin, payeeY + 70, {
      width: usableWidth / 2,
    })
  }

  // Memo and signature line
  doc.fontSize(10).text(`Memo: ${memo}`, margin, margin + checkHeight - 60)
  doc
    .moveTo(margin + usableWidth - 180, margin + checkHeight - 60)
    .lineTo(margin + usableWidth, margin + checkHeight - 60)
    .stroke()
  doc
    .font('Helvetica-Oblique')
    .text('Authorized Signature', margin + usableWidth - 170, margin + checkHeight - 50)
  doc.font('Helvetica')

  // MICR line
  doc
    .font('MICR')
    .fontSize(12)
    .text(micrLine, margin, margin + checkHeight - 30)
  doc.font('Helvetica')

  // Divider for stubs
  doc
    .moveTo(margin, margin + checkHeight)
    .lineTo(margin + usableWidth, margin + checkHeight)
    .stroke()

  const stubHeight = (doc.page.height - margin - (margin + checkHeight)) / 2

  const lineItems: Array<{category?: string; description?: string; amount?: number}> =
    Array.isArray(check.lineItems) && check.lineItems.length > 0
      ? check.lineItems
      : [{description: memo || 'Payment', amount}]

  const totalLineItems = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

  const drawStub = (label: string, offsetY: number) => {
    const stubTop = margin + checkHeight + offsetY
    doc.fontSize(11).text(label, margin, stubTop + 12)
    doc.fontSize(9)
    doc.text(`Payee: ${payeeName}`, margin, stubTop + 28)
    doc.text(`Check #: ${checkNumber}`, margin, stubTop + 42)
    doc.text(`Date: ${paymentDate}`, margin, stubTop + 56)
    doc.text(`Amount: ${amountFormatted}`, margin, stubTop + 70)
    doc.text(`Bank: ${institution}`, margin, stubTop + 84)

    const tableY = stubTop + 108
    doc
      .moveTo(margin, tableY)
      .lineTo(margin + usableWidth, tableY)
      .stroke()
    doc.font('Helvetica-Bold').text('#', margin, tableY + 6)
    doc.text('Category', margin + 20, tableY + 6)
    doc.text('Description', margin + 140, tableY + 6)
    doc.text('Amount', margin + usableWidth - 80, tableY + 6)
    doc.font('Helvetica')

    let currentY = tableY + 24
    lineItems.forEach((item, idx) => {
      const amountText = typeof item.amount === 'number' ? `$${Number(item.amount).toFixed(2)}` : ''
      doc.text(String(idx + 1), margin, currentY)
      doc.text(item.category || '', margin + 20, currentY, {width: 110})
      doc.text(item.description || '', margin + 140, currentY, {width: usableWidth - 240})
      doc.text(
        amountText,
        margin + usableWidth - doc.widthOfString(amountText || '') - 20,
        currentY,
      )
      currentY += 18
    })

    doc.text(`Total: $${totalLineItems.toFixed(2)}`, margin + usableWidth - 120, currentY + 6)
  }

  drawStub('Check Stub', 0)
  doc
    .moveTo(margin, margin + checkHeight + stubHeight)
    .lineTo(margin + usableWidth, margin + checkHeight + stubHeight)
    .stroke()
  drawStub('Check Stub (File Copy)', stubHeight)

  doc.end()

  const pdfBuffer = await pdfDocumentToBuffer(doc)

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=check-${checkNumber}.pdf`,
    },
    body: pdfBuffer.toString('base64'),
    isBase64Encoded: true,
  }
}

async function generateBillCheck(billId: string) {
  const bill = await client.fetch(
    `*[_type == "bill" && _id == $id][0]{
      amount,
      description,
      paidDate,
      checkNumber,
      vendor->{
        companyName,
        businessAddress,
        address
      }
    }`,
    {id: billId},
  )

  if (!bill) {
    throw new Error('Bill not found')
  }

  const vendorName = bill.vendor?.companyName || bill.vendor?.name
  const vendorAddress =
    bill.vendor?.address ||
    [bill.vendor?.businessAddress?.street, bill.vendor?.businessAddress?.city, bill.vendor?.businessAddress?.state, bill.vendor?.businessAddress?.zip]
      .filter(Boolean)
      .join(', ')

  if (!bill.amount || !vendorName || !vendorAddress) {
    throw new Error('Incomplete bill data for check generation')
  }

  const doc = new PDFDocument({size: 'letter', margin: 36})
  const date = new Date(bill.paidDate || new Date()).toLocaleDateString()
  const amountFormatted = `$${bill.amount.toFixed(2)}`
  const amountWritten = amountToCheckWords(Number(bill.amount))

  const sectionHeight = 250

  doc.fontSize(10).text(`Date: ${date}`, 400, 50)
  doc.text(`Check #: ${bill.checkNumber || 'TBD'}`, 400, 65)
  doc.text(`Pay to the Order of: ${vendorName}`, 50, 90)
  doc.text(amountFormatted, 400, 90)
  doc.text(amountWritten, 50, 110)
  doc.text(`Memo: ${bill.description || ''}`, 50, 130)

  doc.moveTo(36, sectionHeight).lineTo(576, sectionHeight).stroke()
  doc.fontSize(12).text('Check Stub', 50, sectionHeight + 20)
  doc.fontSize(10).text(`Payee: ${vendorName}`, 50, sectionHeight + 40)
  doc.text(`Address: ${vendorAddress}`, 50, sectionHeight + 55)
  doc.text(`Amount: ${amountFormatted}`, 50, sectionHeight + 70)
  doc.text(`Memo: ${bill.description || ''}`, 50, sectionHeight + 85)

  const copyY = sectionHeight * 2
  doc.moveTo(36, copyY).lineTo(576, copyY).stroke()
  doc.fontSize(12).text('Check Stub (Copy)', 50, copyY + 20)
  doc.fontSize(10).text(`Payee: ${vendorName}`, 50, copyY + 40)
  doc.text(`Address: ${vendorAddress}`, 50, copyY + 55)
  doc.text(`Amount: ${amountFormatted}`, 50, copyY + 70)
  doc.text(`Memo: ${bill.description || ''}`, 50, copyY + 85)

  doc.end()

  const pdfBuffer = await pdfDocumentToBuffer(doc)

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=check-${bill.checkNumber || billId}.pdf`,
    },
    body: pdfBuffer.toString('base64'),
    isBase64Encoded: true,
  }
}

export const handler: Handler = async (event) => {
  try {
    const payload = JSON.parse(event.body || '{}')
    if (payload.checkId) {
      return await generateCheckPdf(String(payload.checkId))
    }
    if (payload.billId) {
      return await generateBillCheck(String(payload.billId))
    }
    return {
      statusCode: 400,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing checkId or billId'}),
    }
  } catch (err: any) {
    console.error('generateCheckPDF error', err)
    return {
      statusCode: 500,
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({error: err?.message || 'Failed to generate check PDF'}),
    }
  }
}

export default handler
