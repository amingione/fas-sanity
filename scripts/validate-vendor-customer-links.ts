import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import {createClient} from '@sanity/client'

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

const sanityClient = createClient({
  projectId,
  dataset,
  token,
  apiVersion: '2024-10-01',
  useCdn: false,
})

async function validateVendorCustomerLinks() {
  console.log('\n🔍 Validating vendor-customer links...\n')

  // Find orphaned vendors (no customerRef)
  const orphanedVendors = await sanityClient.fetch(`
    *[_type == "vendor" && !defined(customerRef)]{
      _id,
      companyName,
      status,
      "contactEmail": primaryContact.email,
      "matchingCustomer": *[_type == "customer" && email == ^.primaryContact.email][0]{
        _id,
        email,
        roles
      }
    }
  `)

  console.log(`\n📊 Orphaned Vendors (no customerRef): ${orphanedVendors.length}`)

  if (orphanedVendors.length > 0) {
    console.log('\nDetails:')
    for (const vendor of orphanedVendors) {
      if (vendor.matchingCustomer) {
        console.log(
          `  ⚠️  ${vendor.companyName} (${vendor.status}) → CAN BE LINKED to customer ${vendor.matchingCustomer.email}`
        )
      } else {
        console.log(
          `  ❌ ${vendor.companyName} (${vendor.contactEmail}) → NO MATCHING CUSTOMER`
        )
      }
    }
  }

  // Validate existing links
  const linkedVendors = await sanityClient.fetch(`
    *[_type == "vendor" && defined(customerRef)]{
      _id,
      companyName,
      status,
      "customer": customerRef->{
        _id,
        email,
        roles,
        customerType
      },
      "portalEmail": portalAccess.email
    }
  `)

  console.log(`\n📊 Linked Vendors: ${linkedVendors.length}\n`)

  let validLinks = 0
  let missingVendorRole = 0
  let emailMismatches = 0
  let brokenLinks = 0

  for (const vendor of linkedVendors) {
    if (!vendor.customer) {
      console.log(`  ❌ ${vendor.companyName} → customerRef points to deleted customer`)
      brokenLinks++
      continue
    }

    if (!vendor.customer.roles?.includes('vendor')) {
      console.log(
        `  ⚠️  ${vendor.companyName} → customer ${vendor.customer.email} missing 'vendor' role`
      )
      missingVendorRole++
    }

    if (vendor.portalEmail && vendor.portalEmail !== vendor.customer.email) {
      console.log(
        `  ⚠️  ${vendor.companyName} → email mismatch: portal=${vendor.portalEmail}, customer=${vendor.customer.email}`
      )
      emailMismatches++
    }

    if (vendor.customer.roles?.includes('vendor') && vendor.portalEmail === vendor.customer.email) {
      validLinks++
    }
  }

  console.log('\n✅ Linked Vendor Summary:')
  console.log(`   Valid links: ${validLinks}`)
  console.log(`   Missing vendor role: ${missingVendorRole}`)
  console.log(`   Email mismatches: ${emailMismatches}`)
  console.log(`   Broken links (deleted customer): ${brokenLinks}`)

  // Check for wholesale orders without customerRef
  const ordersWithoutCustomerRef = await sanityClient.fetch(`
    count(*[_type == "order" && orderType == "wholesale" && !defined(customerRef)])
  `)

  console.log(`\n📊 Wholesale Orders without customerRef: ${ordersWithoutCustomerRef}`)

  // Overall status
  const totalIssues =
    orphanedVendors.length + missingVendorRole + emailMismatches + brokenLinks + ordersWithoutCustomerRef

  if (totalIssues === 0) {
    console.log('\n🎉 All vendor-customer links are valid!')
  } else {
    console.log(`\n⚠️  Found ${totalIssues} total issues`)
    console.log('\nRecommended fixes:')
    if (orphanedVendors.length > 0) {
      console.log(`  - Link ${orphanedVendors.length} orphaned vendors to customers`)
    }
    if (missingVendorRole > 0) {
      console.log(`  - Add 'vendor' role to ${missingVendorRole} customers`)
    }
    if (emailMismatches > 0) {
      console.log(`  - Sync ${emailMismatches} portal emails to match customer emails`)
    }
    if (brokenLinks > 0) {
      console.log(`  - Fix ${brokenLinks} broken customerRef links`)
    }
    if (ordersWithoutCustomerRef > 0) {
      console.log(
        `  - Run fix-wholesale-order-customer-refs.ts to fix ${ordersWithoutCustomerRef} orders`
      )
    }
  }

  console.log('')
}

validateVendorCustomerLinks().catch(console.error)
