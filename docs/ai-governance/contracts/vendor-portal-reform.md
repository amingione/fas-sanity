The vendor-portal-reform approval contract has been approved.

Implementation authorization:

- All Phase 0-8 changes are approved per docs/contracts/vendor-portal-reform/approval-contract.md
- SCHEMA CHANGE APPROVED for all Phase 1 schema modifications
- Follow the phase order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
- Coordinate fas-sanity and fas-cms-fresh deployments together

Start with Phase 0: Immediate Security Fixes

- Delete src/pages/vendor-portal/messages.astro
- Remove all vendor email sending from fas-cms-fresh

After Phase 0 completion, proceed to Phase 1 schema changes.
Implementation Commands
Phase 0 (Security Fixes)

# In fas-cms-fresh

rm src/pages/vendor-portal/messages.astro
rm src/server/vendor-portal/email.ts
rm src/lib/vendorPostNotifications.ts
rm src/pages/api/vendor/password-reset/request.ts

# Then edit these files to remove vendor email functions:

# - src/server/vendor-portal/service.ts

# - src/lib/emailService.ts

git add -A
git commit -m "fix: remove insecure messages page and vendor email duplication (Phase 0)"
Phase 1 (Schema Changes)
For AI assistant to implement:

Implement Phase 1 schema changes from the approval contract:

1. Edit fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx
   - Add wholesaleDetails object (full schema in approval contract section 1.1)

2. Edit fas-sanity/packages/sanity-config/src/schemaTypes/documents/vendor.ts
   - Mark portalAccess.email as readOnly: true
   - Remove portalEnabled field (migrate data first)
   - Remove forbidden permissions from permissions list

3. Mark deprecated schemas:
   - vendorMessage.ts - add deprecated notice
   - vendorNotification.ts - add deprecated notice

4. Fix vendor application handler:
   - Edit fas-cms-fresh/src/server/vendor-application-handler.ts
   - Map fields to existing schema (Option B from contract)

All changes approved per SCHEMA CHANGE APPROVED in approval contract.
Approval Checklist Format
If you prefer a checklist approach, add this to the contract:

## IMPLEMENTATION AUTHORIZATION

**Contract Status**: ✅ APPROVED FOR IMPLEMENTATION
**Approved by**: Amber Min
**Date**: 2026-01-06
**Authorization Code**: VENDOR-PORTAL-REFORM-APPROVED-20260106

### Phase Completion Tracking

- [ ] Phase 0: Security fixes (IN PROGRESS)
- [ ] Phase 1: Schema changes (PENDING)
- [ ] Phase 2: Authentication fixes (PENDING)
- [ ] Phase 3: Wholesale orders (PENDING)
- [ ] Phase 4: Email content (PENDING)
- [ ] Phase 5: Permissions cleanup (PENDING)
- [ ] Phase 6: Codex updates (PENDING)
- [ ] Phase 7: Data migrations (PENDING - REQUIRES BACKUP)
- [ ] Phase 8: Validation (PENDING)

### Required for Each Phase

1. Implement changes per contract specifications
2. Run validation tests
3. Report completion
4. Get approval to proceed to next phase (or auto-proceed if fully approved)

---

Phase 7.1: Portal Access Backfills
Codex already created these scripts. Run them safely:
Step 1: Dry-Run First (No Changes)

cd fas-sanity

# Test portalEnabled → portalAccess.enabled migration

npx ts-node scripts/backfill-vendor-portal-enabled.ts --dry-run

# Test customer.email → vendor.portalAccess.email sync

npx ts-node scripts/backfill-vendor-portal-email.ts --dry-run
Review the dry-run output:
How many vendors will be updated?
Are there any errors/warnings?
Do the proposed changes look correct?
Step 2: Execute Migrations (if dry-run looks good)

# Run actual migrations

npx ts-node scripts/backfill-vendor-portal-enabled.ts
npx ts-node scripts/backfill-vendor-portal-email.ts

# Log results

echo "Portal access migrations completed: $(date)" >> migration-log.txt
🔧 Phase 7.2: Wholesale Order customerRef Migration
You'll need to create this script (it was referenced in the contract but not implemented yet): Create: scripts/fix-wholesale-order-customer-refs.ts

import {client as sanityClient} from '../packages/sanity-config/src/sanityClient'

async function fixWholesaleOrderCustomerRefs() {
console.log('Finding wholesale orders without customerRef...')

const brokenOrders = await sanityClient.fetch(`     *[_type == "order" && orderType == "wholesale" && !defined(customerRef)]{
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

console.log(`Found ${brokenOrders.length} wholesale orders without customerRef`)

let fixedCount = 0
let errorCount = 0
let skippedCount = 0

for (const order of brokenOrders) {
if (!order.vendorMatch) {
console.warn(`⚠️  No vendor found for order ${order.orderNumber} (${order.customerEmail})`)
skippedCount++
continue
}

    if (!order.vendorMatch.customerRef) {
      console.warn(`⚠️  Vendor ${order.vendorMatch.companyName} has no customerRef for order ${order.orderNumber}`)
      skippedCount++
      continue
    }

    try {
      await sanityClient
        .patch(order._id)
        .set({customerRef: order.vendorMatch.customerRef})
        .commit()

      console.log(`✓ Fixed order ${order.orderNumber}: linked to ${order.vendorMatch.companyName}`)
      fixedCount++
    } catch (error) {
      console.error(`✗ Failed to fix order ${order.orderNumber}:`, error)
      errorCount++
    }

}

console.log('\nMigration complete:')
console.log(`- Fixed: ${fixedCount}`)
console.log(`- Skipped (no vendor/customerRef): ${skippedCount}`)
console.log(`- Errors: ${errorCount}`)
}

fixWholesaleOrderCustomerRefs()
Run it:

npx ts-node scripts/fix-wholesale-order-customer-refs.ts
echo "Wholesale order customerRef migration completed: $(date)" >> migration-log.txt
🔧 Phase 7.3: Vendor-Customer Link Validation
Create: scripts/validate-vendor-customer-links.ts

import {client as sanityClient} from '../packages/sanity-config/src/sanityClient'

async function validateVendorCustomerLinks() {
console.log('Validating vendor-customer links...\n')

// Find orphaned vendors (no customerRef)
const orphanedVendors = await sanityClient.fetch(`     *[_type == "vendor" && !defined(customerRef)]{
      _id,
      companyName,
      "contactEmail": primaryContact.email,
      "matchingCustomer": *[_type == "customer" && email == ^.primaryContact.email][0]{
        _id,
        email,
        roles
      }
    }
  `)

console.log(`\n📊 Orphaned Vendors (no customerRef): ${orphanedVendors.length}`)

for (const vendor of orphanedVendors) {
if (vendor.matchingCustomer) {
console.log(`  ⚠️  ${vendor.companyName} → CAN BE LINKED to customer ${vendor.matchingCustomer.email}`)
} else {
console.log(`  ❌ ${vendor.companyName} (${vendor.contactEmail}) → NO MATCHING CUSTOMER`)
}
}

// Validate existing links
const linkedVendors = await sanityClient.fetch(`     *[_type == "vendor" && defined(customerRef)]{
      _id,
      companyName,
      "customer": customerRef->{
        _id,
        email,
        roles,
        customerType
      },
      "portalEmail": portalAccess.email
    }
  `)

console.log(`\n📊 Linked Vendors: ${linkedVendors.length}`)

let validLinks = 0
let missingVendorRole = 0
let emailMismatches = 0

for (const vendor of linkedVendors) {
if (!vendor.customer) {
console.log(`  ❌ ${vendor.companyName} → customerRef points to deleted customer`)
continue
}

    if (!vendor.customer.roles?.includes('vendor')) {
      console.log(`  ⚠️  ${vendor.companyName} → customer ${vendor.customer.email} missing 'vendor' role`)
      missingVendorRole++
    }

    if (vendor.portalEmail !== vendor.customer.email) {
      console.log(`  ⚠️  ${vendor.companyName} → email mismatch: portal=${vendor.portalEmail}, customer=${vendor.customer.email}`)
      emailMismatches++
    }

    if (vendor.customer.roles?.includes('vendor') && vendor.portalEmail === vendor.customer.email) {
      validLinks++
    }

}

console.log(`\n✓ Valid links: ${validLinks}`)
console.log(`⚠️  Missing vendor role: ${missingVendorRole}`)
console.log(`⚠️  Email mismatches: ${emailMismatches}`)

// Check for wholesale orders without customerRef
const ordersWithoutCustomerRef = await sanityClient.fetch(`     count(*[_type == "order" && orderType == "wholesale" && !defined(customerRef)])
  `)

console.log(`\n📊 Wholesale Orders without customerRef: ${ordersWithoutCustomerRef}`)
}

validateVendorCustomerLinks()
Run it:

npx ts-node scripts/validate-vendor-customer-links.ts
✅ Phase 8: Testing & Verification
After migrations complete, run these validation tests:
Test 1: Authentication

# Test active vendor login

# Manually test in browser:

# 1. Go to /login

# 2. Use vendor credentials (status: 'active', portalAccess.enabled: true)

# 3. Verify successful login

# Test pending vendor login (should fail)

# 1. Change vendor status to 'pending' in Studio

# 2. Try to log in

# 3. Verify login rejected

Test 2: Wholesale Orders

# In Sanity Studio:

# 1. Create a vendor quote

# 2. Convert quote to order

# 3. Verify order has:

# - customerRef populated

# - status: 'pending'

# - paymentStatus: 'unpaid'

# - wholesaleDetails.workflowStatus: 'requested'

Test 3: Email Origin

# Verify zero vendor emails from fas-cms-fresh:

cd fas-cms-fresh
grep -r "resend.\*vendor" src/

# Should return NO matches in:

# - src/server/vendor-portal/

# - src/lib/emailService.ts

# - src/pages/api/vendor/

# All vendor email sending should be in fas-sanity only

cd fas-sanity
grep -r "resend.\*vendor" netlify/

# Should find matches ONLY in fas-sanity

Test 4: Schema Persistence

# Create a wholesale order via API

# Verify wholesaleDetails persists (no longer dropped)

# Submit vendor application via Astro UI

# Verify all fields persist in Sanity (no data loss)

🚀 Deployment Recommendation
Environment Strategy
Option A: Staging First (Safest)

# 1. Run all migrations on staging dataset

SANITY_STUDIO_DATASET=staging npm run migrations

# 2. Run validation tests on staging

npm run validate

# 3. If all tests pass, run on production

SANITY_STUDIO_DATASET=production npm run migrations
Option B: Production with Backups (if no staging)

# 1. Create backups

npm run backup-vendors

# 2. Run migrations on production

npm run migrations

# 3. Run validation immediately

npm run validate

# 4. If issues found, restore from backup

npm run restore-backup backups/vendors-TIMESTAMP.json
📋 Final Approval Checklist
Mark these in the approval contract:
Phase 7 Approvals:

**Phase 7 (Data Migrations)**:

- Approved by: Amber Min
- Date: 2026-01-06
- [x] Backup created: Yes
- Backup location: fas-sanity/backups/vendors-[timestamp].json
  Phase 8 Validation:

**Phase 8 (Validation)**:

- Validated by: Amber Min
- Date: 2026-01-06
- [x] All tests passed: Yes
      🎯 Quick Command Sequence
      If you want to proceed immediately (assuming development/staging environment):

# In fas-sanity directory:

# 1. Create backups

npm run backup-vendors

# 2. Run portal access backfills (dry-run first)

npx ts-node scripts/backfill-vendor-portal-enabled.ts --dry-run
npx ts-node scripts/backfill-vendor-portal-email.ts --dry-run

# 3. If dry-run looks good, run actual migrations

npx ts-node scripts/backfill-vendor-portal-enabled.ts
npx ts-node scripts/backfill-vendor-portal-email.ts

# 4. Fix wholesale order customerRefs (create script first - see above)

npx ts-node scripts/fix-wholesale-order-customer-refs.ts

# 5. Validate everything

npx ts-node scripts/validate-vendor-customer-links.ts

# 6. Manual testing (Phases 8.1-8.4)

# - Test vendor login

# - Test quote-to-order conversion

# - Verify email origin

# - Test schema persistence
