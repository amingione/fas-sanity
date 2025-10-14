import { Handler } from '@netlify/functions'
import { createClient } from '@sanity/client'
import { renderInvoicePdf } from '../lib/invoicePdf'


const DEFAULT_ORIGINS = (process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333').split(',')
function makeCORS(origin?: string) {
  const o = origin && DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

type InvoicePayload = {
  invoiceId?: string
  invoiceNumber?: string
  invoice?: any
}

const hasSanityConfig = Boolean(process.env.SANITY_STUDIO_PROJECT_ID && process.env.SANITY_STUDIO_DATASET)
const sanity = hasSanityConfig
  ? createClient({
      projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
      dataset: process.env.SANITY_STUDIO_DATASET!,
      apiVersion: '2024-04-10',
      token: process.env.SANITY_API_TOKEN || process.env.PUBLIC_SANITY_READ_TOKEN,
      useCdn: false,
    })
  : null

async function fetchInvoiceFromSanity(invoiceId: string) {
  const cleanId = invoiceId?.trim()
  if (!cleanId) return null

  const query = `*[_type == "invoice" && _id == $id][0]{
    _id,
    invoiceNumber,
    invoiceDate,
    dueDate,
    billTo,
    shipTo,
    lineItems[]{
      _key,
      kind,
      product->{_id, title, sku},
      description,
      sku,
      quantity,
      unitPrice,
      lineTotal,
      optionSummary,
      optionDetails,
      upgrades
    },
    orderRef->{
      _id,
      orderNumber,
      cart[]{
        _key,
        name,
        productName,
        sku,
        quantity,
        price,
        lineTotal,
        total,
        optionSummary,
        optionDetails,
        upgrades
      }
    },
    order->{
      _id,
      orderNumber,
      cart[]{
        _key,
        name,
        productName,
        sku,
        quantity,
        price,
        lineTotal,
        total,
        optionSummary,
        optionDetails,
        upgrades
      }
    },
    discountType,
    discountValue,
    taxRate,
    customerNotes,
    terms
  }`

  if (!sanity) return null
  try {
    return await sanity.fetch(query, { id: cleanId })
  } catch (err) {
    console.error('generateInvoicePDF: failed to load invoice', cleanId, err)
    return null
  }
}

function parseIdentifier(input: string | undefined | null) {
  return typeof input === 'string' ? input.trim() : ''
}

// ---- Handler
export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  let payload: InvoicePayload = {}
  let invoiceId = ''

  if (event.httpMethod === 'GET') {
    invoiceId = parseIdentifier(event.queryStringParameters?.invoiceId)
  } else {
    try {
      payload = JSON.parse(event.body || '{}')
    } catch {
      return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) }
    }
    invoiceId = parseIdentifier(payload?.invoiceId)
  }

  let invoiceData = payload?.invoice || {}
  const invoiceNumberFromPayload = parseIdentifier(payload?.invoiceNumber || invoiceData?.invoiceNumber)
  const invoiceDate = invoiceData?.invoiceDate
  const dueDate = invoiceData?.dueDate

  if (!invoiceData || Object.keys(invoiceData).length === 0) {
    const lookupId = invoiceId || (typeof invoiceData?._id === 'string' ? invoiceData._id : '')
    if (!lookupId) {
      return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing invoice data or invoiceId' }) }
    }
    const fetched = await fetchInvoiceFromSanity(lookupId)
    if (!fetched) {
      return { statusCode: 404, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invoice not found' }) }
    }
    invoiceData = fetched
  }

  const billTo = invoiceData?.billTo || {}
  const shipTo = invoiceData?.shipTo || invoiceData?.billTo || {}
  const invoiceNumber = invoiceNumberFromPayload || invoiceData?.invoiceNumber || ''

  try {
    const { base64 } = await renderInvoicePdf(invoiceData, {
      invoiceNumber: String(invoiceNumber || ''),
      invoiceDate: invoiceDate,
      dueDate: dueDate,
    })

    const identifier = String(invoiceNumber || invoiceId || invoiceData?._id || billTo?.name || shipTo?.name || 'invoice')
    const fileId = identifier.replace(/[^\w\-]+/g, '-')
    const filename = fileId ? `invoice-${fileId}.pdf` : 'invoice.pdf'

    return {
      statusCode: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (err: any) {
    console.error('generateInvoicePDF failed', err)
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'PDF generation failed', message: String(err?.message || err) }) }
  }
}
