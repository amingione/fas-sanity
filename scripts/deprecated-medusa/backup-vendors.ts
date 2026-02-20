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

async function backupVendors() {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
  const backupDir = path.join(process.cwd(), 'backups')

  // Create backups directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, {recursive: true})
  }

  console.log('\n📦 Creating backups...\n')

  try {
    // Backup vendors
    console.log('Backing up vendors...')
    const vendors = await sanityClient.fetch(`*[_type == "vendor"]`)
    const vendorsFile = path.join(backupDir, `vendors-${timestamp}.json`)
    fs.writeFileSync(vendorsFile, JSON.stringify(vendors, null, 2))
    console.log(`✓ Vendors backed up: ${vendors.length} documents`)

    // Backup customers (for vendor-customer link safety)
    console.log('Backing up customers...')
    const customers = await sanityClient.fetch(`*[_type == "customer"]`)
    const customersFile = path.join(backupDir, `customers-${timestamp}.json`)
    fs.writeFileSync(customersFile, JSON.stringify(customers, null, 2))
    console.log(`✓ Customers backed up: ${customers.length} documents`)

    // Backup wholesale orders
    console.log('Backing up wholesale orders...')
    const orders = await sanityClient.fetch(`*[_type == "order" && orderType == "wholesale"]`)
    const ordersFile = path.join(backupDir, `wholesale-orders-${timestamp}.json`)
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2))
    console.log(`✓ Wholesale orders backed up: ${orders.length} documents`)

    console.log('\n✅ Backups created successfully!')
    console.log(`   Location: ${backupDir}`)
    console.log(`   Timestamp: ${timestamp}`)
    console.log(`\nBackup files:`)
    console.log(`   - vendors-${timestamp}.json`)
    console.log(`   - customers-${timestamp}.json`)
    console.log(`   - wholesale-orders-${timestamp}.json`)

    // Save backup manifest
    const manifest = {
      timestamp,
      date: new Date().toISOString(),
      counts: {
        vendors: vendors.length,
        customers: customers.length,
        wholesaleOrders: orders.length,
      },
    }
    const manifestFile = path.join(backupDir, `backup-manifest-${timestamp}.json`)
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))

    console.log(`\n💾 Backup manifest: backup-manifest-${timestamp}.json\n`)
  } catch (error) {
    console.error('\n❌ Backup failed:', error)
    process.exit(1)
  }
}

backupVendors().catch(console.error)
