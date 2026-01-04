import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import Stripe from 'stripe'
import {randomUUID} from 'crypto'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'
import {computeCustomerName, splitFullName} from '../../shared/customerName'

const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')

function makeCORS(origin?: string) {
  const normalized = origin && DEFAULT_ORIGINS.includes(origin) ? origin : DEFAULT_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': normalized,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const stripeSecret = process.env.STRIPE_SECRET_KEY
const stripe = stripeSecret ? new Stripe(stripeSecret, {apiVersion: STRIPE_API_VERSION}) : null

const SANITY_STUDIO_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || ''
const SANITY_STUDIO_DATASET =
  process.env.SANITY_STUDIO_DATASET || 'production'

const sanity = createClient({
  projectId: SANITY_STUDIO_PROJECT_ID,
  dataset: SANITY_STUDIO_DATASET,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

type VendorDoc = {
  _id: string
  companyName?: string
  vendorNumber?: string
  businessType?: string
  status?: string
  primaryContact?: {name?: string; email?: string}
  customerRef?: {_ref?: string} | null
  stripeCustomerId?: string | null
}

type CustomerDoc = {
  _id: string
  email?: string
  name?: string
  firstName?: string
  lastName?: string
  stripeCustomerId?: string | null
  stripeLastSyncedAt?: string | null
  roles?: string[]
  customerType?: string
}

type SyncPayload = {
  vendorId?: string
}

const sanitizeId = (value?: string | null) =>
  value ? value.trim().replace(/^drafts\./, '') : ''

const toMetadataValue = (value?: string | null) => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const buildStripeName = (companyName: string, contactName?: string) => {
  const normalizedContact = contactName?.trim()
  if (normalizedContact) return `${companyName} (${normalizedContact})`
  return companyName
}

const buildStripeMetadata = (vendor: VendorDoc, customerId: string, vendorId: string) => {
  const metadata: Record<string, string> = {
    sanity_customer_id: customerId,
    sanity_vendor_id: vendorId,
    account_type: 'vendor',
  }

  const vendorNumber = toMetadataValue(vendor.vendorNumber)
  if (vendorNumber) metadata.vendor_number = vendorNumber
  const companyName = toMetadataValue(vendor.companyName)
  if (companyName) metadata.company_name = companyName
  const businessType = toMetadataValue(vendor.businessType)
  if (businessType) metadata.business_type = businessType

  return metadata
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers: CORS, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }
  }

  if (!stripe) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Stripe not configured'}),
    }
  }

  if (!SANITY_STUDIO_PROJECT_ID || !process.env.SANITY_API_TOKEN) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Sanity credentials not configured'}),
    }
  }

  let body: SyncPayload = {}
  try {
    body = JSON.parse(event.body || '{}') as SyncPayload
  } catch {
    body = {}
  }

  const vendorId = sanitizeId(body.vendorId)
  if (!vendorId) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Missing vendorId'}),
    }
  }

  const vendorQuery = `*[_type == "vendor" && _id == $id][0]{
    _id,
    companyName,
    vendorNumber,
    businessType,
    status,
    primaryContact,
    customerRef,
    stripeCustomerId
  }`
  let vendor = await sanity.fetch<VendorDoc | null>(vendorQuery, {id: vendorId})
  if (!vendor) {
    vendor = await sanity.fetch<VendorDoc | null>(vendorQuery, {id: `drafts.${vendorId}`})
  }

  if (!vendor) {
    return {
      statusCode: 404,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Vendor not found'}),
    }
  }

  const companyName = vendor.companyName?.trim()
  const primaryEmail = vendor.primaryContact?.email?.trim()

  if (vendor.status !== 'active') {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Vendor is not active'}),
    }
  }

  if (!companyName) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Vendor company name is required'}),
    }
  }

  if (!primaryEmail) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Vendor primary contact email is required'}),
    }
  }

  let customer: CustomerDoc | null = null
  const linkedCustomerId = sanitizeId(vendor.customerRef?._ref)

  if (linkedCustomerId) {
    customer = await sanity.fetch<CustomerDoc | null>(
      `*[_type == "customer" && _id == $id][0]{
        _id,
        email,
        name,
        firstName,
        lastName,
        stripeCustomerId,
        stripeLastSyncedAt,
        roles,
        customerType
      }`,
      {id: linkedCustomerId},
    )
  }

  if (!customer) {
    customer = await sanity.fetch<CustomerDoc | null>(
      `*[_type == "customer" && email == $email][0]{
        _id,
        email,
        name,
        firstName,
        lastName,
        stripeCustomerId,
        stripeLastSyncedAt,
        roles,
        customerType
      }`,
      {email: primaryEmail},
    )
  }

  if (!customer) {
    const nameParts = splitFullName(vendor.primaryContact?.name)
    const computedName = computeCustomerName({
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: primaryEmail,
      fallbackName: vendor.primaryContact?.name,
    })

    const newCustomerId = `customer.${randomUUID()}`
    customer = await sanity.create<CustomerDoc>({
      _id: newCustomerId,
      _type: 'customer',
      email: primaryEmail,
      firstName: nameParts.firstName || undefined,
      lastName: nameParts.lastName || undefined,
      name: computedName || primaryEmail,
      roles: ['vendor'],
      customerType: 'vendor',
    })
  }

  const metadata = buildStripeMetadata(vendor, customer._id, vendorId)
  const stripeName = buildStripeName(companyName, vendor.primaryContact?.name)

  let stripeCustomer: Stripe.Customer
  let stripeCustomerId = customer.stripeCustomerId?.trim() || ''
  let created = false

  if (stripeCustomerId) {
    stripeCustomer = await stripe.customers.update(stripeCustomerId, {
      email: primaryEmail,
      name: stripeName,
      metadata,
    })
  } else {
    const list = await stripe.customers.list({email: primaryEmail, limit: 1})
    if (list.data.length > 0) {
      stripeCustomer = await stripe.customers.update(list.data[0].id, {
        email: primaryEmail,
        name: stripeName,
        metadata,
      })
    } else {
      stripeCustomer = await stripe.customers.create({
        email: primaryEmail,
        name: stripeName,
        metadata,
      })
      created = true
    }
    stripeCustomerId = stripeCustomer.id
  }

  const now = new Date().toISOString()

  await sanity
    .patch(customer._id)
    .set({
      stripeCustomerId: stripeCustomerId,
      stripeLastSyncedAt: now,
    })
    .commit()

  const vendorPatch: Record<string, unknown> = {}
  if (!linkedCustomerId || linkedCustomerId !== customer._id) {
    vendorPatch.customerRef = {_type: 'reference', _ref: customer._id}
  }
  if (stripeCustomerId && vendor.stripeCustomerId !== stripeCustomerId) {
    vendorPatch.stripeCustomerId = stripeCustomerId
  }
  if (Object.keys(vendorPatch).length > 0) {
    await sanity.patch(vendor._id).set(vendorPatch).commit()
  }

  const dashboardBase = stripeCustomer.livemode
    ? 'https://dashboard.stripe.com'
    : 'https://dashboard.stripe.com/test'

  return {
    statusCode: 200,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      ok: true,
      action: created ? 'created' : 'updated',
      vendorId,
      customerId: customer._id,
      stripeCustomerId,
      stripeDashboardUrl: `${dashboardBase}/customers/${stripeCustomerId}`,
    }),
  }
}
