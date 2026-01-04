import {randomUUID} from 'node:crypto'
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {generateReferenceCode} from '../../shared/referenceCodes'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'r4og35qd',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  apiVersion: '2024-10-01',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
})

const hasToken = Boolean(process.env.SANITY_API_TOKEN)

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const sanitizeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return undefined
}

const sanitizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

type TradeReference = {
  _key: ReturnType<typeof randomUUID>
  _type: string
  companyName: string | undefined
  contactName: string | undefined
  phone: string | undefined
  email: string | undefined
}

const sanitizeAddress = (value: any) => {
  if (!value || typeof value !== 'object') return undefined
  return {
    street: sanitizeString(value.street) || undefined,
    city: sanitizeString(value.city) || undefined,
    state: sanitizeString(value.state) || undefined,
    zip: sanitizeString(value.zip) || undefined,
    country: sanitizeString(value.country) || 'US',
  }
}

const sanitizeReferences = (value: unknown) => {
  if (!Array.isArray(value)) return undefined
  const entries = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const companyName = sanitizeString((entry as any).companyName)
      const contactName = sanitizeString((entry as any).contactName)
      const phone = sanitizeString((entry as any).phone)
      const email = sanitizeString((entry as any).email)
      if (!companyName && !contactName && !phone && !email) return null
      return {
        _key: randomUUID(),
        _type: 'tradeReference',
        companyName,
        contactName,
        phone,
        email,
      }
    })
    .filter((entry): entry is TradeReference => Boolean(entry))
  return entries.length ? entries : undefined
}

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 204, headers: corsHeaders}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!hasToken) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({error: 'Sanity token is missing'}),
    }
  }

  try {
    const payload = event.body ? JSON.parse(event.body) : {}
    const companyName = sanitizeString(payload.companyName)
    const contactName = sanitizeString(payload.contactName)
    const email = sanitizeString(payload.email)
    const phone = sanitizeString(payload.phone)

    if (!companyName || !contactName || !email || !phone) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({error: 'Missing required fields'}),
      }
    }

    const applicationNumber = await generateReferenceCode(sanity, {
      prefix: 'APP-',
      typeName: 'vendorApplication',
      fieldName: 'applicationNumber',
    })

    const shippingAddressSame = sanitizeBoolean(payload.shippingAddressSame)
    const doc = {
      _type: 'vendorApplication',
      applicationNumber,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      companyName,
      businessType: sanitizeString(payload.businessType),
      taxId: sanitizeString(payload.taxId),
      yearsInBusiness: sanitizeNumber(payload.yearsInBusiness),
      website: sanitizeString(payload.website),
      contactName,
      contactTitle: sanitizeString(payload.contactTitle),
      email,
      phone,
      alternatePhone: sanitizeString(payload.alternatePhone),
      businessAddress: sanitizeAddress(payload.businessAddress),
      shippingAddressSame: shippingAddressSame !== undefined ? shippingAddressSame : true,
      shippingAddress:
        shippingAddressSame === false ? sanitizeAddress(payload.shippingAddress) : undefined,
      estimatedMonthlyVolume: sanitizeString(payload.estimatedMonthlyVolume),
      productsInterested: Array.isArray(payload.productsInterested)
        ? payload.productsInterested.map((item: unknown) => sanitizeString(item)).filter(Boolean)
        : undefined,
      currentSuppliers: sanitizeString(payload.currentSuppliers),
      howDidYouHear: sanitizeString(payload.howDidYouHear),
      taxExempt: sanitizeBoolean(payload.taxExempt) ?? false,
      references: sanitizeReferences(payload.references),
      additionalNotes: sanitizeString(payload.additionalNotes),
    }

    const created = await sanity.create(doc, {autoGenerateArrayKeys: true})

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        id: created._id,
        applicationNumber,
      }),
    }
  } catch (error) {
    console.error('submitVendorApplication error', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({error: message}),
    }
  }
}

export {handler}
