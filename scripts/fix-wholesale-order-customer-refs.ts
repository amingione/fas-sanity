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

async function fixWholesaleOrderCustomerRefs() {
  const dryRun = process.argv.includes('--dry-run')

  console.log(`\n🔍 Finding wholesale orders without customerRef...`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update)'}`)

  const brokenOrders = await sanityClient.fetch(`
    *[_type == "order" && orderType == "wholesale" && !defined(customerRef)]{
      _id,
      orderNumber,
      customerEmail,
      "vendorMatch": *[_type == "vendor" && primaryContact.email == ^.customerEmail][0]{
        _id,
        companyName,
        customerRef
      }
    }
  `)

  console.log(`\n📊 Found ${brokenOrders.length} wholesale orders without customerRef\n`)

  let fixedCount = 0
  let errorCount = 0
  let skippedCount = 0

  for (const order of brokenOrders) {
    if (!order.vendorMatch) {
      console.warn(
        `⚠️  SKIP: No vendor found for order ${order.orderNumber} (${order.customerEmail})`
      )
      skippedCount++
      continue
    }

    if (!order.vendorMatch.customerRef) {
      console.warn(
        `⚠️  SKIP: Vendor ${order.vendorMatch.companyName} has no customerRef for order ${order.orderNumber}`
      )
      skippedCount++
      continue
    }

    try {
      if (dryRun) {
        console.log(
          `[DRY RUN] Would fix order ${order.orderNumber}: link to ${order.vendorMatch.companyName}`
        )
        fixedCount++
      } else {
        await sanityClient
          .patch(order._id)
          .set({customerRef: order.vendorMatch.customerRef})
          .commit()

        console.log(
          `✓ Fixed order ${order.orderNumber}: linked to ${order.vendorMatch.companyName}`
        )
        fixedCount++
      }
    } catch (error) {
      console.error(`✗ Failed to fix order ${order.orderNumber}:`, error)
      errorCount++
    }
  }

  console.log('\n📈 Migration Summary:')
  console.log(`   Fixed: ${fixedCount}`)
  console.log(`   Skipped (no vendor/customerRef): ${skippedCount}`)
  console.log(`   Errors: ${errorCount}`)

  if (dryRun && fixedCount > 0) {
    console.log('\n💡 Run without --dry-run to apply changes')
  }
}

fixWholesaleOrderCustomerRefs().catch(console.error)
