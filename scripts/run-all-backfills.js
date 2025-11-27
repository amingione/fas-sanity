import { execSync } from 'child_process'

const scripts = [
  'backfill-customer-references.js',
  'backfill-stripe-payment-details.js',
  'backfill-cart-product-references.js',
  'backfill-order-metadata.js',
  'backfill-create-invoices.js',
]

for (const script of scripts) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Running: ${script}`)
  console.log('='.repeat(60))

  try {
    execSync(`node scripts/${script}`, { stdio: 'inherit' })
  } catch (error) {
    console.error(`Failed: ${script}`)
  }
}

console.log('\n✨ All backfills complete!')
