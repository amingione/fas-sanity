import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {computeCustomerName} from '../../shared/customerName'
import {resolveVendor} from '../lib/wholesale'
import {syncVendorPortalEmail} from '../lib/vendorPortalEmail'

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

const SANITY_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID || ''
const SANITY_DATASET =
  process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production'

const sanity = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: '2024-10-01',
  token: process.env.SANITY_API_TOKEN as string,
  useCdn: false,
})

const isEmail = (value: string) => /.+@.+\..+/.test(value)

type VendorProfilePayload = {
  vendorId?: string
  customer?: {
    email?: string
    firstName?: string
    lastName?: string
    phone?: string
  }
  vendor?: {
    companyName?: string
    primaryContact?: {
      name?: string
      email?: string
      phone?: string
    }
    businessAddress?: {
      street?: string
      address2?: string
      city?: string
      state?: string
      zip?: string
      country?: string
    }
    taxId?: string
    paymentTerms?: string
    internalNotes?: string
  }
}

type CustomerDoc = {
  _id: string
  email?: string
  firstName?: string
  lastName?: string
  phone?: string
  name?: string
  roles?: string[]
  customerType?: string
}

type VendorDoc = {
  _id: string
  customerRef?: {_ref?: string} | null
}

const normalizeId = (value?: string | null) => (value ? value.replace(/^drafts\./, '').trim() : '')

const ensureVendorRoles = (customer: CustomerDoc) => {
  const roles = Array.isArray(customer.roles) ? [...customer.roles] : []
  const hasCustomerRole = roles.includes('customer')
  const hasVendorRole = roles.includes('vendor')
  if (!hasVendorRole) roles.push('vendor')

  let customerType = customer.customerType || null
  if (!customerType || customerType === 'retail' || customerType === 'in-store') {
    customerType = hasCustomerRole ? 'both' : 'vendor'
  }
  if (customerType === 'vendor' && hasCustomerRole) customerType = 'both'

  return {roles: hasVendorRole ? undefined : roles, customerType}
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Method Not Allowed'}),
    }
  }

  if (!SANITY_PROJECT_ID || !process.env.SANITY_API_TOKEN) {
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Sanity credentials not configured'}),
    }
  }

  let body: VendorProfilePayload = {}
  try {
    body = JSON.parse(event.body || '{}') as VendorProfilePayload
  } catch {
    body = {}
  }

  const vendorId = normalizeId(body.vendorId)
  const vendor = await resolveVendor({
    vendorId,
    vendorEmail: body.customer?.email || null,
    authorization: event.headers?.authorization || null,
  })

  if (!vendor) {
    return {
      statusCode: 401,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Vendor authorization required'}),
    }
  }

  if (vendorId && vendor._id !== vendorId) {
    return {
      statusCode: 403,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Vendor mismatch'}),
    }
  }

  const vendorDoc = await sanity.fetch<VendorDoc | null>(
    `*[_type == "vendor" && _id == $id][0]{_id, customerRef}`,
    {id: vendor._id},
  )

  const customerId = normalizeId(vendorDoc?.customerRef?._ref)
  if (!vendorDoc || !customerId) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Vendor is not linked to a customer'}),
    }
  }

  const customer = await sanity.fetch<CustomerDoc | null>(
    `*[_type == "customer" && _id == $id][0]{
      _id,
      email,
      firstName,
      lastName,
      phone,
      name,
      roles,
      customerType
    }`,
    {id: customerId},
  )

  if (!customer) {
    return {
      statusCode: 404,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Linked customer not found'}),
    }
  }

  const customerPatch: Record<string, unknown> = {}
  const customerInput = body.customer || {}
  const email = customerInput.email?.trim()
  if (email && !isEmail(email)) {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({error: 'Invalid email format'}),
    }
  }

  if (email) customerPatch.email = email
  if (customerInput.firstName) customerPatch.firstName = customerInput.firstName
  if (customerInput.lastName) customerPatch.lastName = customerInput.lastName
  if (customerInput.phone) customerPatch.phone = customerInput.phone

  const mergedEmail = (customerPatch.email as string | undefined) || customer.email || ''
  const mergedFirstName = (customerPatch.firstName as string | undefined) || customer.firstName
  const mergedLastName = (customerPatch.lastName as string | undefined) || customer.lastName
  const computedName = computeCustomerName({
    firstName: mergedFirstName,
    lastName: mergedLastName,
    email: mergedEmail,
  })
  if (computedName && computedName !== customer.name) customerPatch.name = computedName

  const vendorRolePatch = ensureVendorRoles(customer)
  if (vendorRolePatch.roles) customerPatch.roles = vendorRolePatch.roles
  if (vendorRolePatch.customerType && vendorRolePatch.customerType !== customer.customerType) {
    customerPatch.customerType = vendorRolePatch.customerType
  }

  if (Object.keys(customerPatch).length > 0) {
    await sanity.patch(customer._id).set(customerPatch).commit({autoGenerateArrayKeys: true})
  }

  const updatedCustomerEmail = (customerPatch.email as string | undefined) || customer.email
  if (updatedCustomerEmail) {
    await syncVendorPortalEmail(sanity, vendor._id, updatedCustomerEmail)
  }

  const vendorInput = body.vendor || {}
  const vendorPatch: Record<string, unknown> = {}

  if (vendorInput.companyName) vendorPatch.companyName = vendorInput.companyName
  if (vendorInput.taxId) vendorPatch.taxId = vendorInput.taxId
  if (vendorInput.paymentTerms) vendorPatch.paymentTerms = vendorInput.paymentTerms
  if (vendorInput.internalNotes) vendorPatch.internalNotes = vendorInput.internalNotes

  if (vendorInput.primaryContact?.name) {
    vendorPatch['primaryContact.name'] = vendorInput.primaryContact.name
  }
  if (vendorInput.primaryContact?.email) {
    vendorPatch['primaryContact.email'] = vendorInput.primaryContact.email
  }
  if (vendorInput.primaryContact?.phone) {
    vendorPatch['primaryContact.phone'] = vendorInput.primaryContact.phone
  }

  if (vendorInput.businessAddress) {
    const address = vendorInput.businessAddress
    if (address.street) vendorPatch['businessAddress.street'] = address.street
    if (address.address2) vendorPatch['businessAddress.address2'] = address.address2
    if (address.city) vendorPatch['businessAddress.city'] = address.city
    if (address.state) vendorPatch['businessAddress.state'] = address.state
    if (address.zip) vendorPatch['businessAddress.zip'] = address.zip
    if (address.country) vendorPatch['businessAddress.country'] = address.country
  }

  if (Object.keys(vendorPatch).length > 0) {
    await sanity.patch(vendor._id).set(vendorPatch).commit({autoGenerateArrayKeys: true})
  }

  return {
    statusCode: 200,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      ok: true,
      vendorId: vendor._id,
      customerId: customer._id,
    }),
  }
}

export default handler
