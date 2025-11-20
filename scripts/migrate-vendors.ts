#!/usr/bin/env tsx

import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'
import {generateReferenceCode} from '../shared/referenceCodes'

const ENV_FILES = ['.env.local', '.env.development', '.env']
for (const filename of ENV_FILES) {
  const fullPath = path.resolve(process.cwd(), filename)
  if (fs.existsSync(fullPath)) {
    dotenv.config({path: fullPath, override: false})
  }
}

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const token = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !token) {
  console.error('Missing SANITY env vars')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-10-01',
  useCdn: false,
  token,
})

const dryRun = process.argv.includes('--dry-run')

type LegacyVendor = {
  _id: string
  name?: string
  companyName?: string
  contactPerson?: string
  email?: string
  phone?: string
  alternatePhone?: string
  address?: string
  businessAddress?: string
  shippingAddress?: Record<string, any>
  pricingTier?: string
  discountPercentage?: number
  paymentTerms?: string
  accountStatus?: string
  status?: string
  taxExempt?: boolean
  taxExemptCertificate?: any
  taxId?: string
  businessType?: string
  yearsInBusiness?: number
  appliedAt?: string
}

const normalizeStatus = (value?: string, fallback?: string) => {
  const normalized = (value || fallback || '').toLowerCase()
  if (['active', 'approved'].includes(normalized)) return 'active'
  if (['on_hold', 'on hold', 'paused'].includes(normalized)) return 'on_hold'
  if (['inactive', 'rejected'].includes(normalized)) return 'inactive'
  if (['suspended'].includes(normalized)) return 'suspended'
  return 'active'
}

const normalizePaymentTerms = (value?: string) => {
  const normalized = (value || '').toLowerCase()
  if (normalized.includes('15')) return 'net_15'
  if (normalized.includes('60')) return 'net_60'
  if (normalized.includes('90')) return 'net_90'
  if (normalized.includes('receipt')) return 'due_on_receipt'
  return 'net_30'
}

const toAddressObject = (value?: string | Record<string, any>) => {
  if (!value) return undefined
  if (typeof value === 'object') return value
  const street = value.trim()
  if (!street) return undefined
  return {street, city: '', state: '', zip: '', country: 'US'}
}

async function migrateVendors() {
  const legacyVendors = await client.fetch<LegacyVendor[]>(
    `*[_type == "vendor" && !defined(vendorNumber)][0...6]{
      _id,
      name,
      companyName,
      contactPerson,
      email,
      phone,
      alternatePhone,
      address,
      businessAddress,
      shippingAddress,
      pricingTier,
      discountPercentage,
      paymentTerms,
      accountStatus,
      status,
      taxExempt,
      taxExemptCertificate,
      taxId,
      businessType,
      yearsInBusiness,
      appliedAt
    }`,
  )

  const updates: Array<{id: string; number: string}> = []

  for (const vendor of legacyVendors) {
    const vendorNumber = await generateReferenceCode(client, {
      prefix: 'VEN-',
      typeName: 'vendor',
      fieldName: 'vendorNumber',
    })

    const patch = {
      vendorNumber,
      companyName: vendor.companyName || vendor.name,
      displayName: vendor.name || vendor.companyName,
      status: normalizeStatus(vendor.accountStatus, vendor.status),
      primaryContact: {
        name: vendor.contactPerson || vendor.name,
        email: vendor.email,
        phone: vendor.phone,
        mobile: vendor.alternatePhone,
      },
      businessAddress: toAddressObject(vendor.businessAddress) || toAddressObject(vendor.address),
      shippingAddress: vendor.shippingAddress,
      pricingTier: vendor.pricingTier || 'standard',
      customDiscountPercentage:
        typeof vendor.discountPercentage === 'number' ? vendor.discountPercentage : undefined,
      paymentTerms: normalizePaymentTerms(vendor.paymentTerms),
      taxExempt: vendor.taxExempt ?? false,
      taxExemptCertificate: vendor.taxExemptCertificate,
      taxId: vendor.taxId,
      businessType: vendor.businessType,
      yearsInBusiness: vendor.yearsInBusiness,
      onboardedAt: vendor.appliedAt,
      minimumOrderAmount: 500,
      allowBackorders: true,
      autoApproveOrders: false,
      portalEnabled: false,
      portalUsers: [],
      currentBalance: 0,
      totalOrders: 0,
      totalRevenue: 0,
    }

    updates.push({id: vendor._id, number: vendorNumber})

    if (!dryRun) {
      await client.patch(vendor._id).set(patch).commit({autoGenerateArrayKeys: true})
    }
  }

  return updates
}

migrateVendors()
  .then((updates) => {
    console.log(
      JSON.stringify(
        {
          dryRun,
          migrated: updates.length,
          vendors: updates,
        },
        null,
        2,
      ),
    )
  })
  .catch((error) => {
    console.error('migrate-vendors failed', error)
    process.exit(1)
  })
