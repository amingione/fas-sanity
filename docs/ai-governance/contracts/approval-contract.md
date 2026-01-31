# Vendor Portal Reform - Approval Contract & Fix Plan

## PHASE 0 APPROVAL - IMMEDIATE SECURITY FIXES

**Approved by**: Amber Min  
**Date**: 2026-01-06

### Approved Actions

- ✅ DELETE: fas-cms-fresh/src/pages/vendor-portal/messages.astro (security vulnerability)
- ✅ DELETE: All vendor email files from fas-cms-fresh:
  - src/server/vendor-portal/email.ts
  - src/lib/emailService.ts (vendor parts)
  - src/lib/vendorPostNotifications.ts
  - src/pages/api/vendor/password-reset/request.ts
  - Remove email functions from src/server/vendor-portal/service.ts

**Implementation Instruction**: Implement Phase 0 only. Report back when complete before proceeding to Phase 1.

---

**Contract Version:** 1.0.0
**Date:** 2026-01-06
**Task:** vendor-portal-reform
**Related Audit:** [final-audit.md](../../prompts/claude-dec/vendor-portal-reform/final-audit.md)

---

## Contract Purpose

This contract defines the **approved scope, fix order, and schema changes** for the vendor portal reform initiative. It serves as the authoritative reference for AI assistants (Claude Code, Cursor, etc.) implementing fixes.

**All schema changes proposed in this contract require explicit human approval with the phrase**:

```
SCHEMA CHANGE APPROVED
```

**No schema modifications may proceed without this approval.**

---

## Executive Approval Summary

### Critical Issues Requiring Immediate Fix

| Issue                                       | Severity | Approval Status            | Fix Phase |
| ------------------------------------------- | -------- | -------------------------- | --------- |
| Messages page security vulnerability        | CRITICAL | ⏳ Pending                 | Phase 0   |
| `wholesaleDetails` schema gap (data loss)   | CRITICAL | ⏳ Pending Schema Approval | Phase 1   |
| Vendor status mismatch (auth blocker)       | CRITICAL | ⏳ Pending                 | Phase 2   |
| Dual-email identity risk                    | HIGH     | ⏳ Pending Schema Approval | Phase 2   |
| Email duplication (business rule violation) | HIGH     | ⏳ Pending                 | Phase 0   |
| Missing `customerRef` on wholesale orders   | HIGH     | ⏳ Pending                 | Phase 3   |
| Forbidden permissions in schema             | HIGH     | ⏳ Pending Schema Approval | Phase 1   |
| Vendor application schema mismatch          | HIGH     | ⏳ Pending Schema Approval | Phase 1   |

### Approval Checkpoints

**Checkpoint 1: Security & Email** (Phase 0 - No Schema Changes)

- [ ] Approved: Delete insecure messages page
- [ ] Approved: Remove all vendor email sending from fas-cms-fresh

**Checkpoint 2: Schema Changes** (Phase 1 - Requires SCHEMA CHANGE APPROVED)

- [ ] **SCHEMA CHANGE APPROVED**: Add `wholesaleDetails` to order schema
- [ ] **SCHEMA CHANGE APPROVED**: Mark `vendor.portalAccess.email` as read-only
- [ ] **SCHEMA CHANGE APPROVED**: Remove `vendor.portalEnabled` duplicate field
- [ ] **SCHEMA CHANGE APPROVED**: Remove forbidden permissions from vendor schema
- [ ] **SCHEMA CHANGE APPROVED**: Mark `vendorMessage`/`vendorNotification` as deprecated
- [ ] **SCHEMA CHANGE APPROVED**: Fix `vendorApplication` schema mismatch

**Checkpoint 3: Authentication & Identity** (Phase 2 - Code Changes)

- [ ] Approved: Fix vendor status checks (remove 'Approved', use 'active')
- [ ] Approved: Consolidate to single vendor login endpoint
- [ ] Approved: Create `syncVendorPortalEmail` hook
- [ ] Approved: Refactor `syncStripeCustomer` for vendor detection
- [ ] Approved: Data migration (sync portal emails)

**Checkpoint 4: Wholesale Orders** (Phase 3 - Code Changes)

- [ ] Approved: Always set `customerRef` on wholesale order creation
- [ ] Approved: Fix initial order status (pending/unpaid)
- [ ] Approved: Add wholesale order validation

**Checkpoint 5: Content & Documentation** (Phase 4-5)

- [ ] Approved: Rewrite vendor onboarding emails
- [ ] Approved: Update codex with new sections
- [ ] Approved: Remove forbidden permissions from auth logic

---

## Fix Plan Overview

### Fix Phases

1. **Phase 0**: Immediate Security & Email Fixes (No Schema Changes)
2. **Phase 1**: Schema Corrections (Requires Approval)
3. **Phase 2**: Authentication & Identity Fixes
4. **Phase 3**: Wholesale Order Workflow Fixes
5. **Phase 4**: Email Content & UX Corrections
6. **Phase 5**: Permissions & Cleanup
7. **Phase 6**: Codex Documentation Updates
8. **Phase 7**: Data Migration & Validation
9. **Phase 8**: Testing & Verification

### Cross-Repository Coordination

Changes span **both** repositories:

| Repository    | Change Count | Schema Changes   | Code Changes   | Deletions      |
| ------------- | ------------ | ---------------- | -------------- | -------------- |
| fas-sanity    | 12 files     | 6 schema changes | 4 code changes | 2 deprecations |
| fas-cms-fresh | 11 files     | 0 schema changes | 6 code changes | 5 deletions    |

**Deployment Strategy**: Changes must be deployed **together** to prevent intermediate broken states.

---

## Phase 0: Immediate Security & Email Fixes

**Approval Required**: Code Deletion
**Schema Changes**: None
**Risk**: Critical security vulnerability
**Estimated Impact**: High (breaks existing insecure messaging, removes duplicate emails)

### 0.1 Delete Insecure Messages Page

**File**: `fas-cms-fresh/src/pages/vendor-portal/messages.astro`

**Action**: DELETE ENTIRE FILE

**Reason**:

- Exposes Sanity API token on client-side
- Accepts `vendorId` from URL query string (any user can view any vendor's messages)
- No authentication validation before rendering
- Violates vendor data isolation

**Approval Checkpoint**:

```
[ ] APPROVED: Delete src/pages/vendor-portal/messages.astro
```

**Validation**: File no longer exists, no references in codebase

---

### 0.2 Remove Vendor Email Sending from fas-cms-fresh

**Reason**: All vendor emails must originate from fas-sanity (business rule)

**Files to DELETE**:

1. `src/server/vendor-portal/email.ts`
   - Duplicate of fas-sanity email templates
   - Sends vendor emails via Resend

2. `src/lib/vendorPostNotifications.ts`
   - Vendor blog notifications
   - Duplicate of fas-sanity vendor post system

3. `src/pages/api/vendor/password-reset/request.ts`
   - Vendor password reset emails
   - Duplicate of fas-sanity invite/reset flow

**Files to MODIFY** (remove vendor email functions):

1. `src/server/vendor-portal/service.ts`
   - Remove: `sendVendorInvite()`
   - Remove: `sendPasswordResetEmail()`
   - Keep: Other vendor service functions (if any)

2. `src/lib/emailService.ts`
   - Remove: Vendor onboarding email trigger
   - Keep: Customer email functions

**Approval Checkpoint**:

```
[ ] APPROVED: Delete vendor email files from fas-cms-fresh
[ ] APPROVED: Remove vendor email functions from service.ts and emailService.ts
```

**Validation**:

- Zero references to Resend for vendor emails in fas-cms-fresh
- All vendor email sending via fas-sanity functions only
- No vendor email logs outside `vendorEmailLog` schema

---

## Phase 1: Schema Corrections

**Approval Required**: SCHEMA CHANGE APPROVED (for each change)
**Risk**: Medium (data model changes)
**Deployment**: Must deploy schema changes before dependent code changes

---

### 1.1 Add wholesaleDetails to Order Schema

**File**: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx`

**Current State**: Field does not exist
**Impact**: Silent data loss (both repos write this field)

**Schema Addition**:

```typescript
{
  name: 'wholesaleDetails',
  title: 'Wholesale Details',
  type: 'object',
  group: 'fulfillment',
  description: 'Wholesale-specific workflow and pricing details',
  fields: [
    {
      name: 'workflowStatus',
      title: 'Wholesale Workflow Status',
      type: 'string',
      description: 'Current state in wholesale order workflow',
      options: {
        list: [
          { title: 'Requested', value: 'requested' },
          { title: 'Pending Approval', value: 'pending_approval' },
          { title: 'Approved', value: 'approved' },
          { title: 'In Production', value: 'in_production' },
          { title: 'Ready to Ship', value: 'ready_to_ship' },
          { title: 'Shipped', value: 'shipped' },
          { title: 'Delivered', value: 'delivered' },
          { title: 'Rejected', value: 'rejected' }
        ],
        layout: 'radio'
      },
      validation: (Rule) => Rule.required()
    },
    {
      name: 'approvedBy',
      title: 'Approved By',
      type: 'string',
      description: 'Staff member who approved the order',
      hidden: ({ parent }) => !['approved', 'in_production', 'ready_to_ship', 'shipped', 'delivered'].includes(parent?.workflowStatus)
    },
    {
      name: 'approvedAt',
      title: 'Approved At',
      type: 'datetime',
      hidden: ({ parent }) => !['approved', 'in_production', 'ready_to_ship', 'shipped', 'delivered'].includes(parent?.workflowStatus)
    },
    {
      name: 'rejectionReason',
      title: 'Rejection Reason',
      type: 'text',
      rows: 3,
      hidden: ({ parent }) => parent?.workflowStatus !== 'rejected'
    },
    {
      name: 'estimatedShipDate',
      title: 'Estimated Ship Date',
      type: 'date',
      description: 'Estimated date when order will be ready to ship'
    },
    {
      name: 'internalNotes',
      title: 'Internal Notes',
      type: 'text',
      rows: 4,
      description: 'Internal notes about wholesale order (not visible to vendor)'
    }
  ],
  hidden: ({ document }) => document?.orderType !== 'wholesale'
}
```

**Approval Checkpoint**:

```
[ ] SCHEMA CHANGE APPROVED: Add wholesaleDetails object to order schema
```

**Validation**:

- Field appears in Sanity Studio for wholesale orders
- Wholesale orders created via API persist `wholesaleDetails`
- No data loss when creating wholesale orders

**Dependent Code Changes** (Phase 3):

- Always populate `wholesaleDetails.workflowStatus` on wholesale order creation
- Validate `workflowStatus` is valid enum value

---

### 1.2 Mark vendor.portalAccess.email as Read-Only

**File**: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/vendor.ts`

**Current State**: Field is editable
**Impact**: Prevents manual email mismatches

**Schema Change**:

```typescript
{
  name: 'portalAccess',
  title: 'Portal Access',
  type: 'object',
  fields: [
    {
      name: 'enabled',
      title: 'Portal Access Enabled',
      type: 'boolean',
      description: 'Whether this vendor can access the wholesale portal'
    },
    {
      name: 'email',
      title: 'Portal Login Email',
      type: 'string',
      description: 'Mirror of customer.email (read-only, synced automatically)',
      readOnly: true, // ← ADD THIS
      validation: (Rule) => Rule.email()
    },
    {
      name: 'userSub',
      title: 'User Subject ID',
      type: 'string',
      description: 'FASauth user subject identifier',
      readOnly: true
    },
    {
      name: 'invitedAt',
      title: 'Invited At',
      type: 'datetime',
      readOnly: true
    },
    {
      name: 'setupToken',
      title: 'Setup Token',
      type: 'string',
      description: 'One-time token for account setup',
      readOnly: true,
      hidden: true
    },
    {
      name: 'lastLogin',
      title: 'Last Login',
      type: 'datetime',
      readOnly: true
    }
  ]
}
```

**Approval Checkpoint**:

```
[ ] SCHEMA CHANGE APPROVED: Mark vendor.portalAccess.email as readOnly: true
```

**Validation**:

- Field cannot be edited manually in Studio
- Field updates only via `syncVendorPortalEmail` hook

**Dependent Code Changes** (Phase 2):

- Create `syncVendorPortalEmail` hook
- Trigger on `customer.email` change

---

### 1.3 Remove vendor.portalEnabled Duplicate Field

**File**: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/vendor.ts`

**Current State**: Both `portalEnabled` and `portalAccess.enabled` exist
**Impact**: Removes access control confusion

**Schema Change**:

```typescript
// REMOVE this field entirely:
{
  name: 'portalEnabled',
  title: 'Portal Enabled',
  type: 'boolean',
  description: 'Whether portal access is enabled'
}

// KEEP this field (single source of truth):
{
  name: 'portalAccess',
  title: 'Portal Access',
  type: 'object',
  fields: [
    {
      name: 'enabled',
      title: 'Portal Access Enabled',
      type: 'boolean',
      description: 'Whether this vendor can access the wholesale portal'
    },
    // ... other portalAccess fields
  ]
}
```

**Approval Checkpoint**:

```
[ ] SCHEMA CHANGE APPROVED: Remove vendor.portalEnabled field
```

**Validation**:

- Field no longer appears in Studio
- No code references `portalEnabled` (only `portalAccess.enabled`)

**Code Updates Required**:

- Search and replace all `vendor.portalEnabled` → `vendor.portalAccess.enabled`
- Update all GROQ queries

**Pre-Migration Required**:

```typescript
// Before removing field, migrate data
const vendors = await sanityClient.fetch(`*[_type == "vendor"]`)
for (const vendor of vendors) {
  if (vendor.portalEnabled && !vendor.portalAccess?.enabled) {
    await sanityClient
      .patch(vendor._id)
      .set({'portalAccess.enabled': vendor.portalEnabled})
      .commit()
  }
}
```

---

### 1.4 Remove Forbidden Permissions from Vendor Schema

**File**: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/vendor.ts`

**Current State**: Permissions include inventory/product management
**Impact**: Aligns schema with business constraints

**Schema Change**:

```typescript
// BEFORE (forbidden permissions present):
{
  name: 'permissions',
  title: 'Permissions',
  type: 'array',
  of: [{ type: 'string' }],
  options: {
    list: [
      { title: 'View Orders', value: 'view_orders' },
      { title: 'Create Orders', value: 'create_orders' },
      { title: 'Update Inventory', value: 'update_inventory' }, // ← REMOVE
      { title: 'Manage Products', value: 'manage_products' },   // ← REMOVE
      { title: 'View Analytics', value: 'view_analytics' },     // ← REMOVE
      { title: 'Upload Invoices', value: 'upload_invoices' }    // ← REMOVE
    ]
  }
}

// AFTER (only allowed permissions):
{
  name: 'permissions',
  title: 'Vendor Permissions',
  type: 'array',
  of: [{ type: 'string' }],
  description: 'Permissions for vendor portal access',
  options: {
    list: [
      { title: 'View Own Orders', value: 'view_own_orders' },
      { title: 'Create Wholesale Orders', value: 'create_wholesale_orders' },
      { title: 'View Own Quotes', value: 'view_own_quotes' },
      { title: 'View Wholesale Catalog', value: 'view_wholesale_catalog' },
      { title: 'Send Support Messages', value: 'send_support_messages' }
    ]
  },
  validation: (Rule) => Rule.unique().custom((permissions) => {
    const forbidden = ['update_inventory', 'manage_products', 'view_analytics', 'upload_invoices']
    const hasForbidden = permissions?.some(p => forbidden.includes(p))
    return hasForbidden ? 'Vendors cannot have inventory/product management permissions' : true
  })
}
```

**Approval Checkpoint**:

```
[ ] SCHEMA CHANGE APPROVED: Remove forbidden permissions from vendor schema
```

**Validation**:

- Forbidden permissions no longer appear in Studio dropdown
- Existing vendors with forbidden permissions are migrated or flagged

**Code Updates Required** (Phase 5):

- Update `fas-cms-fresh/src/server/vendor-portal/auth.ts` permission checks

---

### 1.5 Deprecate vendorMessage and vendorNotification Schemas

**Files**:

- `fas-sanity/packages/sanity-config/src/schemaTypes/documents/vendorMessage.ts`
- `fas-sanity/packages/sanity-config/src/schemaTypes/documents/vendorNotification.ts`

**Current State**: Orphaned (no backend functions use them)
**Impact**: Removes unused code, clarifies messaging strategy

**Schema Change**:

```typescript
// Add to both vendorMessage and vendorNotification schemas:
{
  name: 'vendorMessage', // or 'vendorNotification'
  title: 'Vendor Message',
  type: 'document',
  deprecated: {
    reason: 'Vendor messaging consolidated into customer support system. This schema is orphaned (no backend functions use it). See vendor-portal-reform audit (2026-01-06) for details.'
  },
  // ... rest of schema unchanged
}
```

**Approval Checkpoint**:

```
[ ] SCHEMA CHANGE APPROVED: Mark vendorMessage and vendorNotification as deprecated
```

**Validation**:

- Schemas marked as deprecated in Studio
- Warning shown when creating new documents of these types
- Schemas NOT deleted (preserves historical data)

**Desk Structure Update** (Phase 5):

- Remove from vendor portal desk section
- Move to "Deprecated" section if historical data exists

**Alternative Path** (if messaging is required):

- Add `messages` array to `vendor` document
- Use generic message object type
- Document in codex as approved messaging pattern

---

### 1.6 Fix vendorApplication Schema Mismatch

**File**: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/vendorApplication.ts`

**Current State**: Handler writes fields that don't exist in schema
**Impact**: Prevents data loss on application submission

**Option A: Fix Schema (Add Missing Fields)**

```typescript
// Add to vendorApplication schema:
{
  name: 'businessAddress',
  title: 'Business Address',
  type: 'object',
  fields: [
    { name: 'street', type: 'string' },
    { name: 'street2', type: 'string' },
    { name: 'city', type: 'string' },
    { name: 'state', type: 'string' },
    { name: 'zip', type: 'string' },
    { name: 'country', type: 'string' },
    // ↓ ADD THIS FIELD (currently dropped)
    { name: 'full', type: 'string', description: 'Full formatted address' }
  ]
},
{
  // ↓ ADD THIS FIELD (currently dropped)
  name: 'additionalInfo',
  title: 'Additional Information',
  type: 'text',
  rows: 4
},
{
  // ↓ ADD THIS FIELD (currently dropped)
  name: 'resaleCertificateId',
  title: 'Resale Certificate ID',
  type: 'string'
}
```

**Option B: Fix Handler (Recommended - No Schema Change)**

Refactor `fas-cms-fresh/src/server/vendor-application-handler.ts` to map to existing schema fields:

```typescript
// BEFORE (writes dropped fields):
const application = {
  businessAddress: {
    full: formData.businessAddress, // ← DROPPED (field doesn't exist)
    street: formData.street,
    city: formData.city,
    state: formData.state,
    zip: formData.zip,
  },
  additionalInfo: formData.additionalInfo, // ← DROPPED
  resaleCertificateId: formData.resaleCertId, // ← DROPPED
}

// AFTER (maps to existing schema):
const application = {
  businessAddress: {
    street: formData.street || formData.businessAddress, // Use full address as street if needed
    street2: '',
    city: formData.city,
    state: formData.state,
    zip: formData.zip,
    country: formData.country || 'US',
  },
  notes: formData.additionalInfo, // Map to existing 'notes' field
  taxId: formData.resaleCertId, // Map to existing 'taxId' field
}
```

**Recommended Approach**: **Option B** (fix handler, no schema change)

**Approval Checkpoint**:

```
[ ] APPROVED: Fix vendor application handler field mapping (Option B - no schema change)
```

OR

```
[ ] SCHEMA CHANGE APPROVED: Add businessAddress.full, additionalInfo, resaleCertificateId fields (Option A)
```

**Validation**:

- Submit vendor application via Astro UI
- Verify all fields persist in Sanity
- No console errors about dropped fields

---

## Phase 2: Authentication & Identity Fixes

**Approval Required**: Code Changes
**Schema Changes**: None (assumes Phase 1 schema changes approved)
**Risk**: Medium (affects vendor login)

---

### 2.1 Fix Vendor Status Checks

**Files**:

- `fas-cms-fresh/src/pages/api/auth/login.ts`
- `fas-cms-fresh/src/pages/api/vendor/login.ts`

**Current Issue**: Checks for `'Approved'` status (doesn't exist in schema)

**Code Change**:

```typescript
// BEFORE (in src/pages/api/auth/login.ts):
if (vendor && vendor.status !== 'Approved') {
  throw new Error('Vendor not approved')
}

// AFTER:
if (vendor && vendor.status !== 'active') {
  throw new Error('Vendor account not active')
}

// Also fix undefined status check (in src/pages/api/vendor/login.ts):
// BEFORE:
const blockedStatuses = ['suspended', 'inactive', 'on_hold']
// 'inactive' does not exist in schema

// AFTER:
const blockedStatuses = ['suspended', 'on_hold', 'pending']
// Use only schema-defined values: 'active', 'pending', 'suspended', 'on_hold'
```

**Approval Checkpoint**:

```
[ ] APPROVED: Fix vendor status checks to use schema values only
```

**Validation**:

- Vendor with `status: 'active'` can log in successfully
- Vendor with `status: 'pending'` cannot log in
- Vendor with `status: 'suspended'` cannot log in
- No references to `'Approved'` or `'inactive'` in codebase

---

### 2.2 Consolidate to Single Vendor Login Endpoint

**Files**:

- `fas-cms-fresh/src/pages/api/auth/login.ts`
- `fas-cms-fresh/src/pages/api/vendor/login.ts`

**Current Issue**: Two login endpoints with different validation logic

**Recommended Approach**: Use single endpoint `/api/auth/login` for both customers and vendors

**Code Change**:

```typescript
// In src/pages/api/auth/login.ts (canonical endpoint):
export async function POST({request}) {
  const {email, password} = await request.json()

  // Check if user is a vendor
  const vendor = await sanityClient.fetch(
    `*[_type == "vendor" && portalAccess.email == $email][0]{
      _id,
      status,
      portalAccess,
      customerRef
    }`,
    {email},
  )

  if (vendor) {
    // Vendor login validation
    if (vendor.status !== 'active') {
      return new Response(JSON.stringify({error: 'Vendor account not active'}), {status: 403})
    }

    if (!vendor.portalAccess?.enabled) {
      return new Response(JSON.stringify({error: 'Portal access not enabled'}), {status: 403})
    }

    // Validate password via vendor auth token
    const validPassword = await verifyVendorPassword(vendor._id, password)
    if (!validPassword) {
      return new Response(JSON.stringify({error: 'Invalid credentials'}), {status: 401})
    }

    // Create session
    const session = await createSession({userId: vendor._id, userType: 'vendor', email})
    return new Response(JSON.stringify({success: true}), {
      headers: {'Set-Cookie': session},
    })
  }

  // Fall through to customer login logic
  // ... existing customer login code
}
```

**Deprecate**: `src/pages/api/vendor/login.ts` (redirect to `/api/auth/login`)

**Approval Checkpoint**:

```
[ ] APPROVED: Consolidate vendor and customer login to single endpoint
```

**Validation**:

- Vendors log in via `/api/auth/login`
- Customers log in via `/api/auth/login`
- No duplicate login logic
- Session includes `userType: 'vendor'` or `'customer'`

---

### 2.3 Create syncVendorPortalEmail Hook

**New File**: `fas-sanity/packages/sanity-config/src/hooks/syncVendorPortalEmail.ts`

**Purpose**: Automatically sync `vendor.portalAccess.email` when `customer.email` changes

**Implementation**:

```typescript
import {defineDocumentActions} from 'sanity'
import {client} from '../sanityClient'

export function syncVendorPortalEmail(prev, context) {
  return {
    onUpdate: async (props) => {
      const {document, previousDocument} = props

      // Only run for customer documents
      if (document._type !== 'customer') return

      // Check if email changed
      if (document.email === previousDocument?.email) return

      // Find vendors linked to this customer
      const linkedVendors = await client.fetch(
        `*[_type == "vendor" && customerRef._ref == $customerId]{ _id }`,
        {customerId: document._id},
      )

      // Sync email to all linked vendors
      for (const vendor of linkedVendors) {
        await client.patch(vendor._id).set({'portalAccess.email': document.email}).commit()

        console.log(`Synced vendor ${vendor._id} portal email to ${document.email}`)
      }
    },
  }
}
```

**Register Hook** (in `packages/sanity-config/src/index.ts`):

```typescript
import {syncVendorPortalEmail} from './hooks/syncVendorPortalEmail'

export default defineConfig({
  // ... other config
  document: {
    actions: syncVendorPortalEmail,
  },
})
```

**Approval Checkpoint**:

```
[ ] APPROVED: Create syncVendorPortalEmail hook
```

**Validation**:

- Change `customer.email` in Studio
- Verify `vendor.portalAccess.email` updates automatically
- Check Studio console for sync confirmation logs

---

### 2.4 Refactor syncStripeCustomer for Vendor Detection

**File**: `fas-sanity/netlify/functions/stripeWebhook.ts`

**Current Issue**: `syncStripeCustomer` doesn't check for vendor match

**Code Change**:

```typescript
// In syncStripeCustomer function:
async function syncStripeCustomer(stripeCustomer: Stripe.Customer) {
  // Find existing customer by Stripe ID
  let customer = await sanityClient.fetch(
    `*[_type == "customer" && stripeCustomerId == $stripeCustomerId][0]`,
    {stripeCustomerId: stripeCustomer.id},
  )

  // Check if email matches existing vendor
  const matchingVendor = await sanityClient.fetch(
    `*[_type == "vendor" && primaryContact.email == $email][0]`,
    {email: stripeCustomer.email},
  )

  if (customer) {
    // Update existing customer
    await sanityClient
      .patch(customer._id)
      .set({
        email: stripeCustomer.email,
        firstName: stripeCustomer.name?.split(' ')[0] || '',
        lastName: stripeCustomer.name?.split(' ').slice(1).join(' ') || '',
        phone: stripeCustomer.phone || customer.phone,
      })
      .commit()

    // If vendor match found, link them
    if (matchingVendor && !matchingVendor.customerRef) {
      await linkVendorToCustomer(matchingVendor._id, customer._id)
    }
  } else {
    // Create new customer
    const roles = matchingVendor ? ['vendor'] : ['customer']
    const customerType = matchingVendor ? 'vendor' : 'retail'

    customer = await sanityClient.create({
      _type: 'customer',
      email: stripeCustomer.email,
      firstName: stripeCustomer.name?.split(' ')[0] || '',
      lastName: stripeCustomer.name?.split(' ').slice(1).join(' ') || '',
      phone: stripeCustomer.phone || '',
      stripeCustomerId: stripeCustomer.id,
      roles,
      customerType,
    })

    // Link vendor to customer
    if (matchingVendor) {
      await linkVendorToCustomer(matchingVendor._id, customer._id)
    }
  }

  return customer
}

async function linkVendorToCustomer(vendorId: string, customerId: string) {
  // Link vendor to customer
  await sanityClient
    .patch(vendorId)
    .set({customerRef: {_type: 'reference', _ref: customerId}})
    .commit()

  // Sync portal email
  const customer = await sanityClient.fetch(
    `*[_type == "customer" && _id == $customerId][0]{ email }`,
    {customerId},
  )

  await sanityClient.patch(vendorId).set({'portalAccess.email': customer.email}).commit()

  console.log(`Linked vendor ${vendorId} to customer ${customerId}`)
}
```

**Approval Checkpoint**:

```
[ ] APPROVED: Refactor syncStripeCustomer to include vendor detection
```

**Validation**:

- Create Stripe customer via Stripe dashboard (email matches vendor)
- Verify `customer` document created with `'vendor'` role
- Verify `vendor.customerRef` populated automatically
- Verify `vendor.portalAccess.email` synced

---

### 2.5 Data Migration: Sync Portal Emails

**New Script**: `fas-sanity/scripts/migrate-vendor-portal-emails.ts`

**Purpose**: One-time sync of existing `vendor.portalAccess.email` ← `customer.email`

**Implementation**:

```typescript
import {client as sanityClient} from '../packages/sanity-config/src/sanityClient'

async function syncVendorPortalEmails() {
  console.log('Starting vendor portal email sync migration...')

  const vendors = await sanityClient.fetch(`
    *[_type == "vendor" && defined(customerRef)]{
      _id,
      companyName,
      "customerEmail": customerRef->email,
      "portalEmail": portalAccess.email,
      "customerId": customerRef._ref
    }
  `)

  console.log(`Found ${vendors.length} vendors with customerRef`)

  let syncedCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const vendor of vendors) {
    if (!vendor.customerEmail) {
      console.warn(
        `⚠️  Vendor ${vendor.companyName} (${vendor._id}) has customerRef but customer has no email`,
      )
      errorCount++
      continue
    }

    if (vendor.customerEmail === vendor.portalEmail) {
      console.log(`✓ ${vendor.companyName}: emails already match (${vendor.customerEmail})`)
      skippedCount++
      continue
    }

    try {
      await sanityClient
        .patch(vendor._id)
        .set({'portalAccess.email': vendor.customerEmail})
        .commit()

      console.log(
        `✓ Synced ${vendor.companyName}: ${vendor.portalEmail || 'null'} → ${vendor.customerEmail}`,
      )
      syncedCount++
    } catch (error) {
      console.error(`✗ Failed to sync ${vendor.companyName}:`, error)
      errorCount++
    }
  }

  console.log('\nMigration complete:')
  console.log(`- Synced: ${syncedCount}`)
  console.log(`- Skipped (already matched): ${skippedCount}`)
  console.log(`- Errors: ${errorCount}`)
}

syncVendorPortalEmails()
```

**Run Command**:

```bash
cd fas-sanity
npx ts-node scripts/migrate-vendor-portal-emails.ts
```

**Approval Checkpoint**:

```
[ ] APPROVED: Run vendor portal email migration script
```

**Validation**:

- All vendors with `customerRef` have matching `portalAccess.email`
- Migration logs show sync counts
- No errors reported

---

## Phase 3: Wholesale Order Workflow Fixes

**Approval Required**: Code Changes
**Schema Changes**: None (assumes Phase 1 `wholesaleDetails` schema approved)
**Risk**: Medium (affects order data integrity)

---

### 3.1 Always Set customerRef on Wholesale Order Creation

**Files**:

- `fas-sanity/packages/sanity-config/src/schemaTypes/documentActions/vendorQuoteActions.tsx`
- `fas-cms-fresh/src/pages/api/vendors/create-order.ts`

**Current Issue**: Quote-to-order conversion creates orders without `customerRef`

**Code Change (fas-sanity)**:

```typescript
// In vendorQuoteActions.tsx - convertToOrder action:
async function convertQuoteToOrder(quote) {
  // Fetch vendor's customerRef
  const vendor = await client.fetch(`*[_type == "vendor" && _id == $vendorId][0]{ customerRef }`, {
    vendorId: quote.vendorRef._ref,
  })

  if (!vendor?.customerRef) {
    throw new Error(
      `Vendor ${quote.vendorRef._ref} has no linked customer. Link vendor to customer before converting quote.`,
    )
  }

  // Create order with customerRef
  const order = await client.create({
    _type: 'order',
    orderNumber: generateOrderNumber(),
    orderType: 'wholesale',
    status: 'pending', // ← FIX: was 'paid'
    paymentStatus: 'unpaid', // ← ADD THIS
    customerRef: vendor.customerRef, // ← ADD THIS
    customerName: quote.companyName,
    customerEmail: quote.email,
    cart: quote.items.map((item) => ({
      _type: 'orderCartItem',
      _key: generateKey(),
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      unitPrice: item.unitPrice,
    })),
    amountSubtotal: quote.subtotal,
    amountTax: quote.tax,
    amountShipping: quote.shipping,
    totalAmount: quote.total,
    wholesaleDetails: {
      workflowStatus: 'requested', // ← ADD THIS (requires Phase 1 schema)
      estimatedShipDate: quote.estimatedShipDate,
    },
    createdAt: new Date().toISOString(),
  })

  return order
}
```

**Code Change (fas-cms-fresh)**:

```typescript
// In src/pages/api/vendors/create-order.ts:
// Already requires customerRef - just verify enforcement

export async function POST({request}) {
  const {vendorId, cart, shippingAddress} = await request.json()

  // Fetch vendor with customerRef
  const vendor = await sanityClient.fetch(
    `*[_type == "vendor" && _id == $vendorId][0]{ customerRef, pricingTier }`,
    {vendorId},
  )

  if (!vendor?.customerRef) {
    return new Response(
      JSON.stringify({error: 'Vendor must be linked to customer before placing orders'}),
      {status: 400},
    )
  }

  // Create order (customerRef already enforced)
  const order = await sanityClient.create({
    _type: 'order',
    orderNumber: generateOrderNumber(),
    orderType: 'wholesale',
    status: 'pending', // ← VERIFY THIS (was incorrectly 'paid')
    paymentStatus: 'unpaid', // ← VERIFY THIS
    customerRef: vendor.customerRef, // ← Already present
    // ... rest of order
    wholesaleDetails: {
      workflowStatus: 'requested', // ← VERIFY THIS (requires Phase 1 schema)
    },
  })

  return new Response(JSON.stringify({order}), {status: 201})
}
```

**Approval Checkpoint**:

```
[ ] APPROVED: Always set customerRef on wholesale order creation
[ ] APPROVED: Block quote conversion if vendor has no customerRef
```

**Validation**:

- Convert quote to order → verify `customerRef` populated
- Create wholesale order via API → verify `customerRef` required
- Vendor order history query returns all orders

---

### 3.2 Fix Initial Order Status

**Files**:

- `fas-sanity/packages/sanity-config/src/schemaTypes/documentActions/vendorQuoteActions.tsx`
- `fas-cms-fresh/src/pages/api/vendors/create-order.ts`

**Current Issue**: Wholesale orders created with `status: 'paid'` before payment

**Code Change**:

```typescript
// Both files - ensure consistent initial status:
const order = await sanityClient.create({
  _type: 'order',
  orderType: 'wholesale',
  status: 'pending', // ← NOT 'paid'
  paymentStatus: 'unpaid', // ← Must be unpaid until payment captured
  wholesaleDetails: {
    workflowStatus: 'requested', // ← Initial workflow state
  },
  // ... other fields
})

// Update to 'paid' ONLY after payment confirmation:
// (Triggered by payment webhook or manual payment capture)
```

**Approval Checkpoint**:

```
[ ] APPROVED: Fix wholesale order initial status (pending/unpaid)
```

**Validation**:

- Create wholesale order → verify `status: 'pending'`, `paymentStatus: 'unpaid'`
- After payment → verify updates to `status: 'paid'`, `paymentStatus: 'paid'`

---

### 3.3 Add Wholesale Order Validation

**New File**: `fas-sanity/packages/sanity-config/src/validation/wholesaleOrderValidation.ts`

**Purpose**: Validate wholesale orders before creation

**Implementation**:

```typescript
import {client} from '../sanityClient'

export async function validateWholesaleOrder(order) {
  const errors = []

  // Validate orderType
  if (order.orderType !== 'wholesale') {
    errors.push('Order type must be "wholesale"')
  }

  // Validate customerRef exists
  if (!order.customerRef) {
    errors.push('customerRef is required for wholesale orders')
  }

  // Validate customerRef points to customer with vendor role
  if (order.customerRef) {
    const customer = await client.fetch(
      `*[_type == "customer" && _id == $customerId][0]{ roles }`,
      {customerId: order.customerRef._ref},
    )

    if (!customer) {
      errors.push('customerRef does not point to valid customer')
    } else if (!customer.roles?.includes('vendor')) {
      errors.push('Customer linked to wholesale order must have "vendor" role')
    }
  }

  // Validate wholesaleDetails exists
  if (!order.wholesaleDetails) {
    errors.push('wholesaleDetails is required for wholesale orders')
  }

  // Validate wholesaleDetails.workflowStatus
  const validStatuses = [
    'requested',
    'pending_approval',
    'approved',
    'in_production',
    'ready_to_ship',
    'shipped',
    'delivered',
    'rejected',
  ]
  if (order.wholesaleDetails && !validStatuses.includes(order.wholesaleDetails.workflowStatus)) {
    errors.push(`Invalid wholesaleDetails.workflowStatus: ${order.wholesaleDetails.workflowStatus}`)
  }

  // Validate initial status
  if (order.status === 'paid' && order.paymentStatus !== 'paid') {
    errors.push('Order cannot have status "paid" if paymentStatus is not "paid"')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
```

**Use in Order Creation**:

```typescript
// In vendorQuoteActions.tsx and create-order.ts:
import {validateWholesaleOrder} from '../validation/wholesaleOrderValidation'

// Before creating order:
const validation = await validateWholesaleOrder(orderData)
if (!validation.valid) {
  throw new Error(`Invalid wholesale order: ${validation.errors.join(', ')}`)
}

const order = await sanityClient.create(orderData)
```

**Approval Checkpoint**:

```
[ ] APPROVED: Add wholesale order validation
```

**Validation**:

- Attempt to create wholesale order without `customerRef` → error
- Attempt to create with invalid `workflowStatus` → error
- Attempt to create with `status: 'paid'`, `paymentStatus: 'unpaid'` → error

---

## Phase 4: Email Content & UX Corrections

**Approval Required**: Content Changes
**Schema Changes**: None
**Risk**: Low (affects vendor communication)

---

### 4.1 Rewrite Vendor Onboarding Emails

**File**: `fas-sanity/scripts/seed-vendor-onboarding-campaign.ts`

**Current Issues**: Promises inventory management, analytics, bulk uploads

**Content Rewrites**:

#### Email #1 (Welcome Email) - BEFORE:

```
Subject: Welcome to FAS Motorsports Vendor Partnership

manage orders, invoices, inventory
```

#### Email #1 (Welcome Email) - AFTER:

```
Subject: Welcome to FAS Motorsports Wholesale Partnership

Hi {vendorName},

Welcome to the FAS Motorsports wholesale ordering system!

As a wholesale partner, you can:
- Browse our complete wholesale catalog
- View tier-based pricing (your tier: {pricingTier})
- Place wholesale orders directly through the portal
- Track order status and fulfillment

Your Next Steps:
1. Set up your portal password (click link below)
2. Review your wholesale pricing
3. Place your first order

[Complete Account Setup]

Questions? Contact our wholesale team at wholesale@fasmotorsports.com

Best regards,
FAS Motorsports Wholesale Team
```

#### Email #2 ("Getting Started") - BEFORE:

```
Update Your Inventory
Explore the Dashboard
```

#### Email #2 ("Getting Started") - AFTER:

```
Subject: Your FAS Wholesale Portal Guide

Hi {vendorName},

Here's how to get started with your wholesale portal:

1. Browse the Wholesale Catalog
   View all available products with your tier pricing
   Filter by category, availability, or product type

2. Place Your First Order
   Add products to your cart
   Review pricing and shipping options
   Submit your wholesale order

3. Track Order Status
   View all your orders in one place
   Monitor fulfillment progress
   Access order history and invoices

4. Manage Your Account
   Update business details and shipping addresses
   View payment terms and credit limits
   Contact wholesale support

[Access Your Portal]

Best regards,
FAS Motorsports Wholesale Team
```

#### Email #4 (Features Email) - BEFORE:

```
Analytics Dashboard
Bulk Inventory Upload
Document Library upload
```

#### Email #4 (Features Email) - AFTER:

```
Subject: Maximize Your Wholesale Partnership

Hi {vendorName},

Get the most out of your FAS wholesale account:

Wholesale Ordering Tips:
- Plan ahead: Lead times vary by product
- Bulk orders: Higher quantities may qualify for better pricing
- Seasonal planning: Contact us for seasonal product previews

Your Account Resources:
- Order History: Access past orders and invoices
- Product Catalog: Updated weekly with new releases
- Support: Dedicated wholesale support team

Need Help?
- Email: wholesale@fasmotorsports.com
- Phone: [wholesale support number]
- Portal: Submit support tickets directly

[View Wholesale Catalog]

Best regards,
FAS Motorsports Wholesale Team
```

**Code Changes**:

```typescript
// In seed-vendor-onboarding-campaign.ts:
const campaigns = [
  {
    _id: 'vendor-onboarding-welcome',
    name: 'Vendor Onboarding - Welcome',
    subject: 'Welcome to FAS Motorsports Wholesale Partnership',
    htmlContent: `<!-- UPDATED CONTENT FROM ABOVE -->`,
    // Remove all inventory/analytics/dashboard references
  },
  {
    _id: 'vendor-onboarding-getting-started',
    name: 'Vendor Onboarding - Getting Started',
    subject: 'Your FAS Wholesale Portal Guide',
    htmlContent: `<!-- UPDATED CONTENT FROM ABOVE -->`,
    // Replace dashboard/inventory with catalog/ordering
  },
  {
    _id: 'vendor-onboarding-features',
    name: 'Vendor Onboarding - Features',
    subject: 'Maximize Your Wholesale Partnership',
    htmlContent: `<!-- UPDATED CONTENT FROM ABOVE -->`,
    // Remove analytics/bulk uploads, add ordering tips
  },
]
```

**Approval Checkpoint**:

```
[ ] APPROVED: Rewrite vendor onboarding emails (content provided above)
```

**Validation**:

- Send test emails to team members
- Verify no references to inventory/product management
- Verify no promises of unimplemented features
- Verify all links point to implemented pages only

---

### 4.2 Fix Email Logo Rendering

**File**: `fas-sanity/scripts/seed-vendor-onboarding-campaign.ts`

**Current Issue**: Logo uses `http://` and `.webp` (poorly supported in email)

**Option A: Use HTTPS PNG**

```html
<!-- BEFORE: -->
<img src="http://example.com/logo.webp" alt="FAS Motorsports" width="200" />

<!-- AFTER: -->
<img
  src="https://example.com/logo.png"
  alt="FAS Motorsports"
  width="200"
  height="60"
  style="display:block"
/>
```

**Option B: Remove Logo**

```html
<!-- Simple text header instead -->
<h1 style="font-size: 24px; color: #333;">FAS Motorsports</h1>
```

**Recommended**: **Option A** (use HTTPS PNG at fixed size)

**Approval Checkpoint**:

```
[ ] APPROVED: Fix email logo (Option A - HTTPS PNG) OR
[ ] APPROVED: Remove email logo (Option B - text only)
```

**Validation**:

- Send test emails to Gmail, Outlook, Yahoo
- Verify logo renders correctly
- Verify no broken images

---

### 4.3 Remove Links to Nonexistent Portal Pages

**File**: `fas-sanity/scripts/seed-vendor-onboarding-campaign.ts`

**Current Issue**: Emails link to `/vendor-portal/dashboard`, `/vendor-portal/onboarding/*`

**Code Change**:

```html
<!-- BEFORE (broken links): -->
<a href="/vendor-portal/dashboard">View Dashboard</a>
<a href="/vendor-portal/onboarding/guide">Onboarding Guide</a>
<a href="/vendor-portal/catalog">Browse Catalog</a>

<!-- AFTER (only link to implemented pages): -->
<!-- IF portal is not implemented, use email content only: -->
<p>Your portal access will be available soon.</p>
<p>Contact wholesale@fasmotorsports.com to place orders.</p>

<!-- OR IF minimal portal exists: -->
<a href="/vendor-portal">Access Your Portal</a>
<!-- Single link to portal home (if it exists) -->
```

**Approval Checkpoint**:

```
[ ] APPROVED: Remove links to nonexistent portal pages
```

**Validation**:

- Click all email links
- Verify no 404 errors
- Verify links go to implemented pages only

---

## Phase 5: Permissions & Cleanup

**Approval Required**: Code Changes
**Schema Changes**: None (assumes Phase 1 schema changes approved)
**Risk**: Low (cleanup only)

---

### 5.1 Remove Forbidden Permissions from Auth Logic

**File**: `fas-cms-fresh/src/server/vendor-portal/auth.ts`

**Current Issue**: Permission checks include forbidden permissions

**Code Change**:

```typescript
// BEFORE:
const vendorPermissions = [
  'view_orders',
  'create_orders',
  'view_quotes',
  'inventory_management', // ← REMOVE
  'product_management', // ← REMOVE
  'analytics', // ← REMOVE
  'upload_invoices', // ← REMOVE
  'view_messages',
]

// AFTER:
const ALLOWED_VENDOR_PERMISSIONS = [
  'view_own_orders',
  'create_wholesale_orders',
  'view_own_quotes',
  'view_wholesale_catalog',
  'send_support_messages',
] as const

// Permission check function:
function hasPermission(vendor, permission: (typeof ALLOWED_VENDOR_PERMISSIONS)[number]) {
  return vendor.permissions?.includes(permission) ?? false
}

// Forbidden permission guard:
function validateVendorPermissions(permissions: string[]) {
  const forbidden = [
    'inventory_management',
    'product_management',
    'analytics',
    'upload_invoices',
    'update_inventory',
    'manage_products',
    'view_analytics',
  ]
  const hasForbidden = permissions.some((p) => forbidden.includes(p))

  if (hasForbidden) {
    throw new Error('Vendor cannot have inventory/product management permissions')
  }

  return true
}
```

**Approval Checkpoint**:

```
[ ] APPROVED: Remove forbidden permissions from vendor portal auth logic
```

**Validation**:

- Permission checks reject forbidden permissions
- No code references `inventory_management`, `product_management`, `analytics` for vendors

---

### 5.2 Update Vendor Portal Desk Structure

**File**: `fas-sanity/packages/sanity-config/src/desk/deskStructure.ts`

**Current Issue**: Vendor portal section includes supplier-side documents

**Code Change**:

```typescript
// BEFORE (vendor portal section includes wrong documents):
S.listItem()
  .title('Vendor Portal')
  .child(
    S.list()
      .title('Vendor Portal')
      .items([
        S.documentTypeListItem('vendor'),
        S.documentTypeListItem('vendorApplication'),
        S.documentTypeListItem('vendorQuote'),
        S.documentTypeListItem('purchaseOrder'), // ← REMOVE (supplier-side)
        S.documentTypeListItem('vendorProduct'), // ← REMOVE (supplier-side)
        S.documentTypeListItem('vendorMessage'), // ← REMOVE (deprecated)
        S.documentTypeListItem('vendorNotification'), // ← REMOVE (deprecated)
        S.documentTypeListItem('vendorReturn'),
      ]),
  )

// AFTER (only wholesale buyer documents):
;(S.listItem()
  .title('Wholesale Management')
  .child(
    S.list()
      .title('Wholesale Management')
      .items([
        S.documentTypeListItem('vendor').title('Vendors'),
        S.documentTypeListItem('vendorApplication').title('Applications'),
        S.documentTypeListItem('vendorQuote').title('Quotes'),
        S.listItem()
          .title('Wholesale Orders')
          .child(
            S.documentList()
              .title('Wholesale Orders')
              .filter('_type == "order" && orderType == "wholesale"')
              .defaultOrdering([{field: 'createdAt', direction: 'desc'}]),
          ),
        S.documentTypeListItem('vendorReturn').title('Returns'),
        S.documentTypeListItem('vendorDocument').title('Documents'),
        S.documentTypeListItem('vendorPost').title('Vendor News'),
        S.documentTypeListItem('vendorEmailLog').title('Email Log'),
      ]),
  ),
  // Add procurement section IF needed (separate from wholesale):
  S.listItem()
    .title('Procurement (Internal)')
    .child(
      S.list()
        .title('Procurement')
        .items([
          S.documentTypeListItem('purchaseOrder').title('Purchase Orders'),
          S.documentTypeListItem('vendorProduct').title('Supplier Products'),
        ]),
    ))
```

**Approval Checkpoint**:

```
[ ] APPROVED: Update vendor portal desk structure (remove supplier-side documents)
```

**Validation**:

- Vendor portal section shows only wholesale buyer documents
- Purchase orders/vendor products moved to procurement section (if needed)
- Deprecated schemas hidden or moved to "Deprecated" section

---

### 5.3 Deprecate Duplicate Application Handlers

**Files**:

- `fas-sanity/netlify/functions/vendor-application.ts`
- `fas-sanity/netlify/functions/submitVendorApplication.ts`

**Action**: Add deprecation notices (do not delete - may have existing integrations)

**Code Change**:

```typescript
// In vendor-application.ts and submitVendorApplication.ts:

/**
 * @deprecated This function is deprecated as of 2026-01-06 (vendor-portal-reform).
 *
 * Canonical vendor application handler is:
 * fas-cms-fresh/src/pages/api/vendor-application.ts
 *
 * This function remains for backward compatibility but should not be used for new integrations.
 *
 * See docs/contracts/vendor-portal-reform/approval-contract.md for details.
 */
export async function handler(event: HandlerEvent, context: HandlerContext) {
  console.warn(
    'DEPRECATED: vendor-application.ts is deprecated. Use fas-cms-fresh/src/pages/api/vendor-application.ts instead.',
  )

  // Existing logic remains for backward compatibility
  // ...
}
```

**Approval Checkpoint**:

```
[ ] APPROVED: Add deprecation notices to fas-sanity vendor application handlers
```

**Validation**:

- Deprecation warnings logged when functions called
- Documentation clearly states canonical handler

---

## Phase 6: Codex Documentation Updates

**Approval Required**: Documentation Changes
**Schema Changes**: None
**Risk**: None (documentation only)

---

### 6.1 Add Required Codex Sections

**File**: `fas-sanity/docs/codex.md`

**Action**: Add all sections from Final Audit Part 13

**Sections to Add**:

1. **Wholesale Orders (CRITICAL)**
2. **Vendor Authentication (CRITICAL)**
3. **Email Origination (CRITICAL)**
4. **Vendor Application Flow**
5. **Vendor Portal Security (CRITICAL)**
6. **Wholesale Workflow State (CRITICAL)**

**Full content provided in Final Audit Part 13.**

**Approval Checkpoint**:

```
[ ] APPROVED: Add all 6 new sections to codex.md
```

**Validation**:

- Codex includes all required sections
- Schema gaps documented
- Forbidden actions clearly stated
- AI assistants can reference these sections

---

## Phase 7: Data Migration & Validation

**Approval Required**: Data Migration
**Schema Changes**: None
**Risk**: Medium (affects production data)

---

### 7.1 Vendor Portal Email Migration

**Script**: `fas-sanity/scripts/migrate-vendor-portal-emails.ts` (from Phase 2.5)

**Action**: Run one-time migration

**Pre-Migration Checklist**:

- [ ] Phase 1 schema changes deployed (vendor.portalAccess.email is readOnly)
- [ ] Phase 2.3 hook deployed (syncVendorPortalEmail)
- [ ] Backup of vendor documents created

**Migration Steps**:

```bash
# 1. Backup vendor documents
cd fas-sanity
npm run backup-vendors # (create this script)

# 2. Run migration
npx ts-node scripts/migrate-vendor-portal-emails.ts

# 3. Validate results
npx ts-node scripts/validate-vendor-customer-links.ts
```

**Approval Checkpoint**:

```
[ ] APPROVED: Run vendor portal email migration
```

**Validation**:

- All vendors have matching portal/customer emails
- Migration logs show no errors
- Test vendor login after migration

---

### 7.2 Wholesale Order customerRef Migration

**Script**: `fas-sanity/scripts/fix-wholesale-order-customer-refs.ts`

**Purpose**: Add `customerRef` to existing wholesale orders missing it

**Implementation** (from Final Audit Appendix B):

```typescript
// Full script provided in Final Audit Appendix B.3
```

**Approval Checkpoint**:

```
[ ] APPROVED: Run wholesale order customerRef migration
```

**Validation**:

- All wholesale orders have `customerRef`
- Vendor order history queries return complete results

---

### 7.3 Validate Vendor-Customer Links

**Script**: `fas-sanity/scripts/validate-vendor-customer-links.ts`

**Purpose**: Audit and fix orphaned vendors

**Implementation** (from Final Audit Appendix B):

```typescript
// Full script provided in Final Audit Appendix B.2
```

**Approval Checkpoint**:

```
[ ] APPROVED: Run vendor-customer link validation
```

**Validation**:

- All vendors have valid `customerRef`
- No orphaned vendors (without customer link)
- All linked customers have `vendor` role

---

## Phase 8: Testing & Verification

**Approval Required**: None (validation only)
**Schema Changes**: None
**Risk**: None

---

### 8.1 Authentication Tests

**Test Scenarios** (from Final Audit Appendix C):

1. Active vendor login (should succeed)
2. Pending vendor login (should fail)
3. Email sync test (change customer.email → verify portal email updates)

**Approval Checkpoint**:

```
[ ] VALIDATED: All authentication tests pass
```

---

### 8.2 Wholesale Order Tests

**Test Scenarios**:

1. Order creation from portal (verify `customerRef`, `status: 'pending'`, `wholesaleDetails`)
2. Quote conversion (verify `customerRef` included)
3. Order history query (verify all orders appear)

**Approval Checkpoint**:

```
[ ] VALIDATED: All wholesale order tests pass
```

---

### 8.3 Email Tests

**Test Scenarios**:

1. Vendor invitation (verify sent from fas-sanity, logged)
2. Password reset (verify sent from fas-sanity)
3. No duplicate emails (verify zero emails from fas-cms-fresh)

**Approval Checkpoint**:

```
[ ] VALIDATED: All email tests pass
```

---

### 8.4 Schema Tests

**Test Scenarios**:

1. Wholesale order creation (verify `wholesaleDetails` persists)
2. Vendor application submission (verify all fields persist)
3. Forbidden permissions check (verify rejected)

**Approval Checkpoint**:

```
[ ] VALIDATED: All schema tests pass
```

---

## Success Criteria

**The vendor portal reform is considered complete when ALL of the following are true:**

### Schema Integrity

- [ ] All wholesale orders persist with `wholesaleDetails` field
- [ ] No data loss on vendor application submission
- [ ] Single portal access field (`portalAccess.enabled`)
- [ ] Forbidden permissions removed from all schemas
- [ ] `vendor.portalAccess.email` is read-only

### Authentication & Identity

- [ ] Vendors with `status: 'active'` can log in successfully
- [ ] `customer.email` is enforced as canonical identity
- [ ] `vendor.portalAccess.email` syncs automatically from `customer.email`
- [ ] All vendors have valid `customerRef` linkage
- [ ] Stripe customer sync detects and links vendors automatically

### Wholesale Orders

- [ ] All wholesale orders include `customerRef`
- [ ] Wholesale orders created with correct initial status (`pending`, `unpaid`)
- [ ] Vendor order history shows complete order list
- [ ] Quote conversion creates schema-compliant orders with `customerRef`

### Email System

- [ ] Zero vendor emails sent from fas-cms-fresh
- [ ] All vendor emails logged in `vendorEmailLog`
- [ ] Email copy reflects actual vendor role (wholesale buyers)
- [ ] No promises of unimplemented features
- [ ] Email logo renders reliably (or removed)

### Security

- [ ] No client-side Sanity API tokens
- [ ] No vendor data accessible via URL parameters
- [ ] Vendor isolation enforced (vendors see only own data)
- [ ] All vendor endpoints require authentication
- [ ] Insecure messages page deleted

### Documentation

- [ ] Codex includes wholesale order schema requirements
- [ ] Codex includes vendor authentication rules
- [ ] Codex includes email origination rules
- [ ] Codex includes vendor portal security requirements
- [ ] All forbidden actions documented

### User Experience

- [ ] Vendor onboarding email sets correct expectations
- [ ] Login process works reliably for active vendors
- [ ] Order history is accurate and complete
- [ ] No broken links in emails

---

## Deployment Plan

### Pre-Deployment Checklist

- [ ] All Phase 1 schema changes approved (SCHEMA CHANGE APPROVED)
- [ ] All code changes reviewed and approved
- [ ] Data migration scripts tested in staging
- [ ] Backup of vendor/customer/order documents created
- [ ] Rollback plan documented

### Deployment Order (CRITICAL - Must Deploy Together)

**fas-sanity deployment:**

1. Deploy schema changes (Phase 1)
2. Deploy `syncVendorPortalEmail` hook (Phase 2.3)
3. Deploy `syncStripeCustomer` refactor (Phase 2.4)
4. Deploy quote-to-order fixes (Phase 3.1)
5. Deploy updated email templates (Phase 4.1)

**fas-cms-fresh deployment:**

1. Delete insecure messages page (Phase 0.1)
2. Delete vendor email files (Phase 0.2)
3. Fix vendor status checks (Phase 2.1)
4. Consolidate login endpoint (Phase 2.2)
5. Remove forbidden permissions (Phase 5.1)

**Data migrations (after code deployment):**

1. Run vendor portal email migration (Phase 7.1)
2. Run wholesale order customerRef migration (Phase 7.2)
3. Run vendor-customer link validation (Phase 7.3)

**Validation (after migrations):**

1. Run all test scenarios (Phase 8)
2. Verify success criteria (all checkboxes)

### Rollback Plan

If critical issues discovered after deployment:

1. **Revert code changes** (both repos)
2. **Restore vendor document backup** (if email migration caused issues)
3. **Restore order document backup** (if customerRef migration caused issues)
4. **Document issues and create fix plan**
5. **Re-test in staging before retry**

---

## Contract Signature

**This contract requires explicit human approval before implementation.**

### Approval Signatures

**Phase 0 (Immediate Security Fixes)**:

- Approved by: ******\_\_\_\_******
- Date: ******\_\_\_\_******
- Notes: ******\_\_\_\_******

**Phase 1 (Schema Changes)**:

- **SCHEMA CHANGE APPROVED**: ******\_\_\_\_******
- Approved by: ******\_\_\_\_******
- Date: ******\_\_\_\_******
- Schema changes approved:
  - [ ] Add `wholesaleDetails` to order schema
  - [ ] Mark `vendor.portalAccess.email` as read-only
  - [ ] Remove `vendor.portalEnabled` duplicate
  - [ ] Remove forbidden permissions from vendor schema
  - [ ] Mark `vendorMessage`/`vendorNotification` as deprecated
  - [ ] Fix `vendorApplication` schema mismatch (Option: **\_\_\_**)

**Phase 2-5 (Code Changes)**:

- Approved by: ******\_\_\_\_******
- Date: ******\_\_\_\_******
- Notes: ******\_\_\_\_******

**Phase 6 (Documentation)**:

- Approved by: ******\_\_\_\_******
- Date: ******\_\_\_\_******

**Phase 7 (Data Migrations)**:

- Approved by: ******\_\_\_\_******
- Date: ******\_\_\_\_******
- Backup created: [ ] Yes [ ] No
- Backup location: ******\_\_\_\_******

**Phase 8 (Validation)**:

- Validated by: ******\_\_\_\_******
- Date: ******\_\_\_\_******
- All tests passed: [ ] Yes [ ] No

**Final Approval (Deployment to Production)**:

- Approved by: ******\_\_\_\_******
- Date: ******\_\_\_\_******
- Production deployment authorized: [ ] Yes [ ] No

---

## Post-Implementation Follow-Up

### 30-Day Review

**Metrics to Track**:

- Vendor login success rate
- Email delivery rate (vendor emails)
- Wholesale order creation success rate
- Support tickets related to vendor portal issues
- Data integrity audits (no orphaned vendors/orders)

**Review Date**: ******\_\_\_\_******
**Review Notes**: ******\_\_\_\_******

### Known Limitations After Implementation

1. **Vendor Portal UI**: Still not implemented (only auth infrastructure exists)
2. **Messaging System**: Deprecated (vendors use customer support channels)
3. **Procurement Workflows**: Purchase orders/vendor products moved to separate section (if needed)

### Future Enhancements (Out of Scope)

- Implement minimal vendor portal UI (catalog, cart, orders, history)
- Add vendor-specific order analytics dashboard
- Implement automated credit limit checks
- Add wholesale order approval workflow automation

---

**Contract Version**: 1.0.0
**Last Updated**: 2026-01-06
**Related Documents**:

- [Final Audit](../../prompts/claude-dec/vendor-portal-reform/final-audit.md)
- [Codex](../../codex.md)

**END OF APPROVAL CONTRACT**
