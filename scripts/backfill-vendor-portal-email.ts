#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

type VendorDoc = {
  _id: string
  customerRef?: {_ref?: string} | null
  portalAccess?: {email?: string} | null
}

type CustomerDoc = {
  _id: string
  email?: string
  roles?: string[]
  customerType?: string
}

const envFiles = ['.env.local', '.env.development', '.env']
for (const file of envFiles) {
  const fullPath = path.resolve(process.cwd(), file)
  if (fs.existsSync(fullPath)) {
    dotenv.config({path: fullPath, override: false})
  }
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing Sanity config (projectId/dataset/token).')
  process.exit(1)
}

const client = createClient({projectId, dataset, token, apiVersion: '2024-10-01', useCdn: false})
const dryRun = process.argv.includes('--dry-run')

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

async function run() {
  const vendors = await client.fetch<VendorDoc[]>(
    '*[_type == "vendor"]{_id, customerRef, portalAccess}',
  )

  const customerIds = Array.from(
    new Set(
      vendors
        .map((vendor) => normalizeId(vendor.customerRef?._ref))
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const customers = customerIds.length
    ? await client.fetch<CustomerDoc[]>(
        '*[_type == "customer" && _id in $ids]{_id, email, roles, customerType}',
        {ids: customerIds},
      )
    : []

  const customerMap = new Map(customers.map((customer) => [customer._id, customer]))

  let missingCustomerRef = 0
  let missingCustomer = 0
  let portalEmailUpdates = 0
  let customerRoleUpdates = 0

  const vendorPatches: Array<{id: string; email: string}> = []
  const customerPatches: Array<{id: string; roles?: string[]; customerType?: string | null}> = []

  for (const vendor of vendors) {
    const customerId = normalizeId(vendor.customerRef?._ref)
    if (!customerId) {
      missingCustomerRef++
      continue
    }

    const customer = customerMap.get(customerId)
    if (!customer) {
      missingCustomer++
      continue
    }

    if (customer.email) {
      const currentPortalEmail = vendor.portalAccess?.email || ''
      if (currentPortalEmail.trim() !== customer.email.trim()) {
        vendorPatches.push({id: vendor._id, email: customer.email})
        portalEmailUpdates++
      }
    }

    const vendorRolePatch = ensureVendorRoles(customer)
    if (vendorRolePatch.roles ||
      (vendorRolePatch.customerType && vendorRolePatch.customerType !== customer.customerType)) {
      customerPatches.push({
        id: customer._id,
        roles: vendorRolePatch.roles,
        customerType: vendorRolePatch.customerType || customer.customerType || null,
      })
      customerRoleUpdates++
    }
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          vendorsScanned: vendors.length,
          missingCustomerRef,
          missingCustomer,
          portalEmailUpdates,
          customerRoleUpdates,
        },
        null,
        2,
      ),
    )
    return
  }

  const batchSize = 50
  for (let i = 0; i < vendorPatches.length; i += batchSize) {
    const slice = vendorPatches.slice(i, i + batchSize)
    const tx = client.transaction()
    for (const patch of slice) {
      tx.patch(client.patch(patch.id).setIfMissing({portalAccess: {}}).set({'portalAccess.email': patch.email}))
    }
    await tx.commit({autoGenerateArrayKeys: true})
  }

  for (let i = 0; i < customerPatches.length; i += batchSize) {
    const slice = customerPatches.slice(i, i + batchSize)
    const tx = client.transaction()
    for (const patch of slice) {
      const updates: Record<string, unknown> = {}
      if (patch.roles) updates.roles = patch.roles
      if (patch.customerType) updates.customerType = patch.customerType
      if (Object.keys(updates).length) {
        tx.patch(client.patch(patch.id).set(updates))
      }
    }
    await tx.commit({autoGenerateArrayKeys: true})
  }

  console.log(
    JSON.stringify(
      {
        dryRun: false,
        vendorsScanned: vendors.length,
        missingCustomerRef,
        missingCustomer,
        portalEmailUpdates,
        customerRoleUpdates,
      },
      null,
      2,
    ),
  )
}

run().catch((error) => {
  console.error('backfill-vendor-portal-email failed', error)
  process.exit(1)
})
