/**
 * Master migration script for vendor-portal-reform (Phase 7)
 *
 * Runs all data migrations in the correct order:
 * 1. Backup current state
 * 2. Validate current state
 * 3. Run portal email backfill (if needed)
 * 4. Run portal access backfill (if needed)
 * 5. Fix wholesale order customerRefs
 * 6. Validate final state
 *
 * Usage:
 *   pnpm tsx scripts/run-all-migrations.ts --dry-run    # Test mode
 *   pnpm tsx scripts/run-all-migrations.ts              # Live mode
 */

import {execSync} from 'child_process'

const dryRun = process.argv.includes('--dry-run')

function runScript(scriptPath: string, description: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📝 ${description}`)
  console.log('='.repeat(60))

  try {
    const command = `pnpm tsx ${scriptPath}${dryRun ? ' --dry-run' : ''}`
    execSync(command, {stdio: 'inherit', cwd: process.cwd()})
    console.log(`✓ ${description} completed`)
  } catch (error) {
    console.error(`✗ ${description} failed`)
    console.error(error)
    process.exit(1)
  }
}

async function runAllMigrations() {
  console.log('\n🚀 Vendor Portal Reform - Phase 7 Migrations')
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update data)'}`)

  if (!dryRun) {
    console.log('\n⚠️  WARNING: Running in LIVE mode - data will be modified!')
    console.log('Press Ctrl+C within 5 seconds to cancel...\n')
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  // Step 1: Create backups (skip in dry-run)
  if (!dryRun) {
    runScript('scripts/backup-vendors.ts', 'Step 1: Create Backups')
  } else {
    console.log('\n⏭️  Skipping backup in dry-run mode')
  }

  // Step 2: Validate current state
  runScript('scripts/validate-vendor-customer-links.ts', 'Step 2: Validate Current State')

  // Step 3: Portal email backfill
  runScript(
    'scripts/backfill-vendor-portal-email.ts',
    'Step 3: Backfill Portal Emails (customer.email → vendor.portalAccess.email)'
  )

  // Step 4: Portal access backfill
  runScript(
    'scripts/backfill-vendor-portal-enabled.ts',
    'Step 4: Backfill Portal Access (vendor.portalEnabled → vendor.portalAccess.enabled)'
  )

  // Step 5: Fix wholesale order customerRefs
  runScript(
    'scripts/fix-wholesale-order-customer-refs.ts',
    'Step 5: Fix Wholesale Order customerRefs'
  )

  // Step 6: Validate final state
  runScript('scripts/validate-vendor-customer-links.ts', 'Step 6: Validate Final State')

  console.log('\n' + '='.repeat(60))
  console.log('🎉 All migrations completed successfully!')
  console.log('='.repeat(60))

  if (dryRun) {
    console.log('\n💡 This was a DRY RUN. Run without --dry-run to apply changes.')
  } else {
    console.log('\n✅ Data has been migrated.')
    console.log('📋 Next steps:')
    console.log('   1. Review validation output above')
    console.log('   2. Test vendor login')
    console.log('   3. Test wholesale order creation')
    console.log('   4. Proceed to Phase 8 validation tests')
  }
}

runAllMigrations().catch((error) => {
  console.error('\n❌ Migration failed:', error)
  process.exit(1)
})
