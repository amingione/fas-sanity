# Vendor-Customer Unification Contract

**Version:** 1.0.0
**Status:** AUTHORITATIVE
**Date:** 2025-12-28
**Authority:** fas-sanity Architecture

## Purpose

This contract establishes the authoritative rules for identity resolution between Vendor documents, Customer documents, and Stripe customers. These rules OVERRIDE all prior behavior and MUST be enforced in all sync logic.

## Problem Statement

Vendors that are also Stripe customers are currently duplicated across the system, requiring manual customer linking. The root cause is inconsistent sync logic:

- **Checkout-driven path** (vendor-aware): Uses `strictFindOrCreateCustomer` and correctly links vendors
- **Stripe-driven path** (NOT vendor-aware): Uses `syncStripeCustomer` and creates unlinked customer documents

**Source:** [docs/reports/vendor-customer-stripe-audit.md](../reports/vendor-customer-stripe-audit.md)

## Authoritative Decisions

### 1. Identity Rule ⚖️

**RULE:** A Vendor that maps to a Stripe Customer IS that Customer.

**ENFORCEMENT:**
- There is exactly ONE Stripe customer per real-world entity
- Vendor and Customer documents representing the same entity MUST share the same `stripeCustomerId`
- No duplicate Stripe customers for the same vendor
- Identity is determined by resolution priority (see §4)

### 2. Source of Truth 👑

**RULE:** Vendor document is the authoritative profile when roles include "vendor".

**ENFORCEMENT:**
- When a customer has the `vendor` role, the Vendor document contains the canonical business data
- Customer document serves as the transactional/Stripe sync record
- Profile fields (name, address, contact info) on Vendor take precedence over Customer
- Customer document MUST exist for all vendors to maintain Stripe sync integrity

**Affected Fields:**
- Vendor: `vendorName`, `primaryContactEmail`, `primaryContactPhone`, `shippingAddress`, `billingAddress`
- Customer: `name`, `email`, `phone`, `addresses`, `stripeCustomerId`

### 3. Linking Rule 🔗

**RULE:** `vendor.customerRef` is auto-derived. Manual linking is forbidden.

**ENFORCEMENT:**
- The `customerRef` field on Vendor schema MUST remain `readOnly: true`
- All linking MUST occur programmatically during Stripe sync operations
- Manual updates to `customerRef` via Studio or API are PROHIBITED
- Sync logic MUST compute and set `customerRef` automatically

**Responsible File:** `packages/sanity-config/src/schemaTypes/documents/vendor.ts:L42-L51`

### 4. Resolution Priority 🎯

**RULE:** Identity resolution follows this hierarchy:

1. **stripeCustomerId** (highest priority)
   - Exact match on `customer.stripeCustomerId` === Stripe customer ID

2. **email** (case-insensitive)
   - Match `customer.email` (normalized) to `vendor.primaryContactEmail` (normalized)
   - Email normalization: `email.trim().toLowerCase()`

3. **explicit reference** (fallback only)
   - Use existing `vendor.customerRef` if already set
   - Only valid when stripeCustomerId and email resolution fail

**ENFORCEMENT:**
- Sync logic MUST attempt resolution in this exact order
- First successful match wins
- If no match found, create new customer document
- Never skip resolution steps

### 5. Duplication Rule 🚫

**RULE:** No duplicate customer documents for vendors.

**ENFORCEMENT:**
- Before creating a customer document, sync logic MUST:
  1. Check for existing customer by `stripeCustomerId`
  2. Check for existing vendor by `primaryContactEmail`
  3. If vendor exists but customer does not, create customer and link
  4. If both exist with matching identity, update the link
  5. If both exist with conflicting identity, REJECT and log error

**Reconciliation:**
- If duplicate customers are detected for the same vendor:
  1. Identify the canonical customer (has most recent Stripe data)
  2. Merge references from duplicate to canonical
  3. Archive duplicate customer document
  4. Update `vendor.customerRef` to canonical customer

**Affected Functions:**
- `netlify/functions/stripeWebhook.ts:syncStripeCustomer`
- `netlify/functions/stripeWebhook.ts:strictFindOrCreateCustomer`

### 6. Roles 🏷️

**RULE:** Customer linked to a vendor MUST include role "vendor".

**ENFORCEMENT:**
- When `vendor.customerRef` is set, the referenced customer document MUST have `"vendor"` in its `roles` array
- Sync logic MUST add the `vendor` role when creating the customer-vendor link
- Removing the `vendor` role from a customer REQUIRES breaking the `customerRef` link
- Customer documents with role `vendor` MUST have a corresponding vendor document

**Schema Validation:**
- `customer.ts:L35-L44` defines the `roles` field
- Valid roles: `"customer"`, `"vendor"`, `"wholesale"`, `"retail"`
- `vendor` role can coexist with `wholesale` and `retail`

### 7. Scope 📦

**RULE:** Implementation affects schema + backend logic only.

**IN SCOPE:**
- ✅ Schema fields and validation rules
- ✅ Webhook event handlers (`customer.created`, `customer.updated`, `checkout.session.completed`)
- ✅ Sync functions (`syncStripeCustomer`, `strictFindOrCreateCustomer`)
- ✅ Identity resolution logic
- ✅ Automated reconciliation scripts

**OUT OF SCOPE:**
- ❌ Sanity Studio UI components or forms
- ❌ Frontend customer/vendor selection workflows
- ❌ Stripe API behavior or webhook event structure
- ❌ EasyPost or other third-party integrations
- ❌ Order creation logic (unless it creates/links customers)

**NON-BREAKING CONSTRAINTS:**
- MUST NOT alter existing Stripe customer sync flow for non-vendors
- MUST NOT change Stripe webhook signature verification
- MUST NOT modify completed order documents

## Implementation Requirements

### Required Changes

#### 1. Unify Sync Logic

**File:** `netlify/functions/stripeWebhook.ts`

**Action:** Replace `syncStripeCustomer` with vendor-aware logic

**Current Behavior:**
```typescript
case 'customer.created':
case 'customer.updated':
  await syncStripeCustomer(event.data.object as Stripe.Customer)
  break
```

**Required Behavior:**
```typescript
case 'customer.created':
case 'customer.updated':
  // Use vendor-aware resolution for ALL customer sync events
  await strictFindOrCreateCustomer(event.data.object as Stripe.Customer)
  break
```

**Functions to Modify:**
- `syncStripeCustomer` → Deprecate or refactor to use resolution priority
- `strictFindOrCreateCustomer` → Enhance with full resolution priority logic

#### 2. Implement Resolution Priority

**Function:** `strictFindOrCreateCustomer` (or new `resolveCustomerIdentity`)

**Required Logic:**
```typescript
async function resolveCustomerIdentity(stripeCustomer: Stripe.Customer) {
  const { id: stripeCustomerId, email } = stripeCustomer

  // Priority 1: stripeCustomerId
  let customer = await findCustomerByStripeId(stripeCustomerId)
  if (customer) return { customer, method: 'stripeCustomerId' }

  // Priority 2: email (case-insensitive)
  if (email) {
    const normalizedEmail = email.trim().toLowerCase()

    // Check for vendor first
    const vendor = await findVendorByEmail(normalizedEmail)
    if (vendor) {
      // Priority 2a: Vendor exists, find/create customer
      customer = await findOrCreateCustomerForVendor(vendor, stripeCustomer)
      return { customer, vendor, method: 'vendorEmail' }
    }

    // Priority 2b: Direct customer email match
    customer = await findCustomerByEmail(normalizedEmail)
    if (customer) return { customer, method: 'customerEmail' }
  }

  // Priority 3: Create new customer
  customer = await createCustomer(stripeCustomer)
  return { customer, method: 'created' }
}
```

#### 3. Auto-Link Vendors

**Function:** `findOrCreateCustomerForVendor`

**Required Logic:**
```typescript
async function findOrCreateCustomerForVendor(vendor, stripeCustomer) {
  // Check if vendor already has a customer linked
  if (vendor.customerRef?._ref) {
    const existingCustomer = await getCustomerById(vendor.customerRef._ref)
    if (existingCustomer) {
      // Update existing customer with Stripe data
      await updateCustomerFromStripe(existingCustomer._id, stripeCustomer)
      return existingCustomer
    }
  }

  // Create new customer document
  const customer = await createCustomer(stripeCustomer, { roles: ['customer', 'vendor'] })

  // Link vendor to customer (auto-derived)
  await linkVendorToCustomer(vendor._id, customer._id)

  return customer
}
```

#### 4. Enforce Vendor Role

**Function:** `linkVendorToCustomer`

**Required Logic:**
```typescript
async function linkVendorToCustomer(vendorId: string, customerId: string) {
  // Update customer to include vendor role
  await sanityClient
    .patch(customerId)
    .setIfMissing({ roles: [] })
    .append('roles', ['vendor'])
    .commit()

  // Update vendor customerRef (bypassing readOnly via API)
  await sanityClient
    .patch(vendorId)
    .set({ customerRef: { _type: 'reference', _ref: customerId } })
    .commit()
}
```

### Validation Rules

#### Schema Constraints

**File:** `packages/sanity-config/src/schemaTypes/documents/vendor.ts`

**Required Validation:**
```typescript
{
  name: 'customerRef',
  title: 'Customer Reference',
  type: 'reference',
  to: [{ type: 'customer' }],
  readOnly: true, // MUST remain true
  description: 'Auto-linked to customer document. DO NOT SET MANUALLY.',
  validation: (Rule) => Rule.custom(async (value, context) => {
    if (!value?._ref) return true // Optional field

    const customer = await context.getDocument(value._ref)
    if (!customer) return 'Referenced customer does not exist'

    // Enforce: Customer must have vendor role
    if (!customer.roles?.includes('vendor')) {
      return 'Linked customer must have "vendor" role'
    }

    // Enforce: Customer stripeCustomerId must match vendor email resolution
    const vendorEmail = context.document.primaryContactEmail?.trim().toLowerCase()
    if (vendorEmail && customer.email?.trim().toLowerCase() !== vendorEmail) {
      return 'Customer email must match vendor primary contact email'
    }

    return true
  })
}
```

**File:** `packages/sanity-config/src/schemaTypes/documents/customer.ts`

**Required Validation:**
```typescript
{
  name: 'roles',
  title: 'Roles',
  type: 'array',
  of: [{ type: 'string' }],
  options: {
    list: [
      { title: 'Customer', value: 'customer' },
      { title: 'Vendor', value: 'vendor' },
      { title: 'Wholesale', value: 'wholesale' },
      { title: 'Retail', value: 'retail' }
    ]
  },
  validation: (Rule) => Rule.custom(async (roles, context) => {
    if (!roles?.includes('vendor')) return true

    // Enforce: If customer has vendor role, must have corresponding vendor doc
    const email = context.document.email?.trim().toLowerCase()
    if (!email) return 'Vendor customers must have an email'

    const vendors = await context.client.fetch(
      `*[_type == "vendor" && lower(primaryContactEmail) == $email]`,
      { email }
    )

    if (vendors.length === 0) {
      return 'Customer with "vendor" role must have corresponding vendor document'
    }

    return true
  })
}
```

## Verification Checklist

Before marking implementation complete, verify:

- [ ] `syncStripeCustomer` no longer creates unlinked customers for vendors
- [ ] All `customer.created` and `customer.updated` events use resolution priority
- [ ] Vendor documents auto-link to customer documents on Stripe sync
- [ ] Customer documents with `vendor` role have corresponding vendor documents
- [ ] No duplicate customer documents exist for the same vendor
- [ ] `vendor.customerRef` is never set manually (readOnly enforced)
- [ ] Email matching is case-insensitive
- [ ] Existing completed orders are unaffected
- [ ] Stripe webhook signature verification still works

## Testing Strategy

### Unit Tests

**File:** `netlify/functions/stripeWebhook.test.ts` (create if missing)

**Test Cases:**
1. `resolveCustomerIdentity` with existing stripeCustomerId
2. `resolveCustomerIdentity` with vendor email match
3. `resolveCustomerIdentity` with customer email match
4. `resolveCustomerIdentity` creating new customer
5. `findOrCreateCustomerForVendor` with existing customerRef
6. `findOrCreateCustomerForVendor` creating new customer
7. `linkVendorToCustomer` adds vendor role
8. `linkVendorToCustomer` sets customerRef

### Integration Tests

**Scenarios:**
1. Stripe webhook `customer.created` for new vendor email → creates customer, links vendor
2. Stripe webhook `customer.updated` for existing vendor → updates customer, preserves link
3. Stripe webhook `checkout.session.completed` for vendor → reuses existing customer
4. Manual vendor creation in Studio → does NOT auto-create customer (webhook-driven only)
5. Duplicate customer detection → merges and archives duplicate

## Migration Plan

### Phase 1: Schema Validation (Non-Breaking)

1. Add validation rules to `vendor.ts` and `customer.ts`
2. Deploy schema updates
3. Run validation report to identify existing orphaned records

### Phase 2: Sync Logic Unification (Breaking for New Events)

1. Implement `resolveCustomerIdentity` function
2. Implement `findOrCreateCustomerForVendor` function
3. Implement `linkVendorToCustomer` function
4. Update `customer.created` and `customer.updated` handlers
5. Deploy webhook function
6. Monitor Stripe webhook logs for errors

### Phase 3: Reconciliation (Cleanup)

1. Create reconciliation script to:
   - Find all vendors without `customerRef`
   - Find matching customers by email
   - Auto-link using `linkVendorToCustomer`
2. Run script in dry-run mode
3. Review proposed links
4. Execute reconciliation
5. Archive duplicate customer documents

## Rollback Plan

If issues arise:

1. **Immediate:** Revert webhook function to use `syncStripeCustomer` for `customer.created` and `customer.updated`
2. **Schema:** Validation rules are non-breaking; leave in place for future retry
3. **Data:** Restore archived customer documents from backup if needed
4. **Investigate:** Review webhook logs and error reports
5. **Fix:** Address root cause in `resolveCustomerIdentity` logic
6. **Redeploy:** Retry Phase 2 with corrected logic

## Success Metrics

Implementation is successful when:

1. **Zero manual links:** No vendor documents require manual `customerRef` updates
2. **Zero duplicates:** No customer documents exist for the same vendor email
3. **100% vendor role compliance:** All customers linked to vendors have `vendor` role
4. **100% resolution success:** All Stripe customer sync events correctly identify vendors

## References

- **Audit Report:** [docs/reports/vendor-customer-stripe-audit.md](../reports/vendor-customer-stripe-audit.md)
- **Vendor Schema:** [packages/sanity-config/src/schemaTypes/documents/vendor.ts](../../packages/sanity-config/src/schemaTypes/documents/vendor.ts)
- **Customer Schema:** [packages/sanity-config/src/schemaTypes/documents/customer.ts](../../packages/sanity-config/src/schemaTypes/documents/customer.ts)
- **Webhook Handler:** [netlify/functions/stripeWebhook.ts](../../netlify/functions/stripeWebhook.ts)

## Approval

This contract is AUTHORITATIVE and MUST be enforced.

**Approved By:** ambermin
**Date:** 2025-12-28
**Status:** ACTIVE

---

**All implementations MUST comply with this contract. Non-compliance is a defect.**
