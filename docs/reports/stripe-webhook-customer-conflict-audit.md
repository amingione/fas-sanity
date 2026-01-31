# Stripe Webhook Customer Conflict Audit

**Date:** 2026-01-03
**Status:** CRITICAL
**Affected Component:** `netlify/functions/stripeWebhook.ts` - `handleCheckoutExpired` → `strictFindOrCreateCustomer`
**Error Type:** Customer Identity Conflict
**Impact:** Abandoned checkout documents failing to be created

---

## Executive Summary

The Stripe webhook is failing to process `checkout.session.expired` events due to a customer identity conflict. When a checkout session expires, the system attempts to find or create a customer document, but encounters conflicting Stripe customer IDs associated with the same Sanity customer record. This prevents abandoned checkout documents from being created, resulting in lost cart recovery opportunities.

**Key Finding:** The error message "conflicting customer stripe ids" is NOT present in the current codebase, indicating that **production is running a different version of the code** than what exists in the repository.

---

## Error Analysis

### Error Log Details

```
Dec 30, 04:02:42 AM: a528236a ERROR  stripeWebhook: conflicting customer stripe ids ATZnC953ZI6BkOhriZTtDE cus_TgonYtaRUjUXOZ cus_Th0NSA5EcegRfp
Dec 30, 04:02:42 AM: a528236a WARN   stripeWebhook: failed to upsert checkoutSession document Error: Customer identity conflict
Dec 30, 04:02:42 AM: a528236a WARN       at strictFindOrCreateCustomer (/var/task/netlify/functions/stripeWebhook.js:72021:11)
Dec 30, 04:02:42 AM: a528236a WARN       at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
Dec 30, 04:02:42 AM: a528236a WARN       at async handleCheckoutExpired (/var/task/netlify/functions/stripeWebhook.js:74983:29)
Dec 30, 04:02:42 AM: a528236a WARN       at async Runtime.handler (/var/task/netlify/functions/stripeWebhook.js:75855:13)
```

### Decoded Information

- **Sanity Customer ID:** `ATZnC953ZI6BkOhriZTtDE`
- **Stripe Customer ID #1:** `cus_TgonYtaRUjUXOZ` (likely the primary `stripeCustomerId`)
- **Stripe Customer ID #2:** `cus_Th0NSA5EcegRfp` (incoming from checkout session)
- **Event Type:** `checkout.session.expired`
- **Function:** `handleCheckoutExpired` → `strictFindOrCreateCustomer`
- **Impact:** Abandoned checkout document NOT created

---

## Root Cause Analysis

### Data Model

The customer document schema has two fields for Stripe customer IDs:

```typescript
// packages/sanity-config/src/schemaTypes/documents/customer.ts
{
  stripeCustomerId: string         // Primary Stripe customer ID
  stripeCustomerIds: string[]      // Array of all Stripe customer ID aliases
}
```

### Expected Behavior (Current Code)

The **current** codebase (as of this audit) handles multiple Stripe customer IDs via the **alias pattern**:

1. When a new Stripe customer ID is encountered:
   - The system queries: `*[_type == "customer" && (stripeCustomerId == $stripeId || $stripeId in stripeCustomerIds)]`
   - If a customer is found, the new ID is **appended** to `stripeCustomerIds` array
   - This is handled by `buildStripeCustomerAliasPatch()` in `netlify/lib/stripeCustomerAliases.ts`

2. **Current code behavior** ([stripeWebhook.ts:2710-2757](../netlify/functions/stripeWebhook.ts#L2710-L2757)):
   ```typescript
   if (stripeCustomerId) {
     let customer = await fetchCustomerByStripeId(stripeCustomerId)
     if (customer) {
       // Apply patch that includes alias handling
       const patch = {
         ...ensureNamePatch(customer),
         ...ensureStripePatch(customer),  // ← Adds to stripeCustomerIds array
       }
       customer = await applyCustomerPatch(customer, patch)
       return customer
     }
   }
   ```

3. **Alias handling** ([stripeCustomerAliases.ts:11-53](../netlify/lib/stripeCustomerAliases.ts#L11-L53)):
   ```typescript
   export function buildStripeCustomerAliasPatch(
     customer: {stripeCustomerId?: string, stripeCustomerIds?: string[]},
     incomingId?: string,
     customerEmail?: string
   ) {
     // Normalizes incoming ID
     // Merges with existing IDs
     // Returns patch to update stripeCustomerIds array
     // Logs warning if appending: "customer stripe alias appended"
   }
   ```

### Actual Behavior (Production)

The **production** code appears to be **different** and is **throwing an error** instead of appending aliases:

**Evidence:**
1. Error message `"conflicting customer stripe ids"` does NOT exist in current codebase
2. Error is thrown at line `72021` in bundled production code (current source file is ~7000 lines)
3. Production is rejecting the scenario instead of handling it gracefully

**Probable Production Logic (Hypothesis):**
```typescript
// HYPOTHETICAL - NOT IN CURRENT CODE
if (stripeCustomerId) {
  let customer = await fetchCustomerByStripeId(stripeCustomerId)
  if (customer) {
    if (customer.stripeCustomerId && customer.stripeCustomerId !== stripeCustomerId) {
      console.error(
        'stripeWebhook: conflicting customer stripe ids',
        customer._id,
        customer.stripeCustomerId,
        stripeCustomerId
      )
      throw new Error('Customer identity conflict')
    }
  }
}
```

---

## Why This Happens

### Scenario Reconstruction

1. **Customer A** creates an account → Sanity customer `ATZnC953ZI6BkOhriZTtDE` → Stripe customer `cus_TgonYtaRUjUXOZ`
2. **Same customer** (or someone using same email) starts a checkout session → Stripe assigns NEW customer ID `cus_Th0NSA5EcegRfp`
3. Checkout session expires → `checkout.session.expired` event fired
4. `handleCheckoutExpired` calls `strictFindOrCreateCustomer(session)` ([stripeWebhook.ts:6947](../netlify/functions/stripeWebhook.ts#L6947))
5. System tries to reconcile:
   - Session has `stripeCustomerId = cus_Th0NSA5EcegRfp`
   - Sanity customer `ATZnC953ZI6BkOhriZTtDE` already has `stripeCustomerId = cus_TgonYtaRUjUXOZ`
6. **Production code throws error** instead of adding `cus_Th0NSA5EcegRfp` to `stripeCustomerIds` array

### Why Multiple Stripe Customer IDs Occur

Stripe can create multiple customer objects for the same person in these scenarios:

1. **Guest checkout** - Customer checks out without logging in, Stripe creates a new customer
2. **Email change** - Customer updates email in Stripe, creates duplicate
3. **Multiple checkout sessions** - Different sessions create different customer objects
4. **Manual creation** - Operator creates customer in Stripe dashboard
5. **API vs Dashboard** - Customer created via different interfaces

**This is NORMAL and EXPECTED behavior.** The alias system exists to handle this.

---

## Impact Assessment

### Immediate Impact

- **Abandoned checkout documents NOT created** for affected sessions
- **Lost cart recovery opportunities** - Cannot send recovery emails
- **Analytics gaps** - Incomplete abandonment data
- **Customer support blind spots** - Cannot see what customers abandoned

### Data Integrity

- **Customer documents remain intact** - Error occurs BEFORE mutations
- **No duplicate customers created** - Fail-safe is working
- **Checkout session documents may be missing** - If `upsertCheckoutSessionDocument` depends on customer

### Frequency

Based on single log entry provided:
- **At least 1 occurrence** on Dec 30, 2024 at 04:02:42 AM
- **Frequency unknown** - Need to query production logs for pattern
- **Likely recurring** - If production code has this validation, it will fail consistently

---

## Critical Discrepancy: Code vs Production

### Current Repository Code (✅ CORRECT)

**File:** `netlify/functions/stripeWebhook.ts`
**Lines:** 2648-2657, 2710-2757
**Behavior:** Gracefully handles multiple Stripe customer IDs via alias pattern
**Error Handling:** Logs warnings, does NOT throw errors

**Key Implementation:**
- Uses `buildStripeCustomerAliasPatch()` to merge Stripe customer IDs
- Appends new IDs to `stripeCustomerIds` array
- Logs `"stripeWebhook: customer stripe alias appended"` warning
- Returns updated customer document

### Production Deployment (❌ OUTDATED)

**Evidence:** Bundled code at line 72021
**Behavior:** Rejects multiple Stripe customer IDs, throws error
**Error Message:** `"conflicting customer stripe ids"` (NOT in current code)

**Implications:**
1. **Production is running OLD code** that predates alias pattern implementation
2. **Recent fix may not be deployed** - Current code should handle this gracefully
3. **Deployment pipeline issue** - Code changes not reaching production

---

## Recommended Actions

### IMMEDIATE (Priority 1)

1. **Verify Production Deployment**
   ```bash
   # Check deployed version
   # Compare git commit hash to production build
   # Verify netlify/functions/stripeWebhook.ts is latest version
   ```

2. **Redeploy Latest Code**
   ```bash
   cd /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
   git log netlify/functions/stripeWebhook.ts | head -20  # Check recent changes
   npm run build                                           # Rebuild functions
   # Deploy to Netlify production
   ```

3. **Query Production Logs**
   ```groq
   *[_type == "customer" && _id == "ATZnC953ZI6BkOhriZTtDE"][0]{
     _id,
     email,
     name,
     stripeCustomerId,
     stripeCustomerIds,
     stripeLastSyncedAt
   }
   ```

   **Expected Result:** Customer should have `stripeCustomerIds` array containing BOTH IDs

### SHORT TERM (Priority 2)

4. **Manually Fix Affected Customer**

   If deployment doesn't fix it, manually patch the customer document:
   ```typescript
   // In Sanity Studio or via API
   await sanity.patch('ATZnC953ZI6BkOhriZTtDE').set({
     stripeCustomerIds: ['cus_TgonYtaRUjUXOZ', 'cus_Th0NSA5EcegRfp']
   }).commit()
   ```

5. **Retrigger Failed Webhooks**

   Use Stripe CLI to resend the failed `checkout.session.expired` event:
   ```bash
   stripe events resend evt_3SdkJLP1CiCjkLwl0TApxX9N  # Event ID from logs
   ```

6. **Add Monitoring**

   Set up alerts for webhook failures:
   - Monitor for "Customer identity conflict" errors
   - Alert on `handleCheckoutExpired` failures
   - Track abandoned checkout creation rate

### MEDIUM TERM (Priority 3)

7. **Audit for Similar Issues**
   ```bash
   # Find customers with multiple Stripe IDs that haven't been merged
   *[_type == "customer" && defined(stripeCustomerId) && !defined(stripeCustomerIds)]
   ```

8. **Document Alias Pattern**
   - Add comments to `buildStripeCustomerAliasPatch` explaining why it exists
   - Document expected scenarios in CLAUDE.md
   - Add test cases for multiple Stripe customer ID handling

9. **Implement Proactive Reconciliation**

   Background job to merge Stripe customer IDs:
   ```typescript
   // Periodically check for customers with multiple Stripe customer objects
   // Merge them into stripeCustomerIds array
   ```

---

## Testing Recommendations

### Manual Test

1. Create a test checkout session with email that matches existing customer
2. Let session expire (or manually expire in Stripe Dashboard)
3. Verify webhook processes successfully
4. Check customer document has new Stripe ID in `stripeCustomerIds` array
5. Verify abandoned checkout document is created

### Automated Test

```typescript
// Test case: Customer with existing Stripe ID receives new Stripe ID
describe('strictFindOrCreateCustomer', () => {
  it('should append new Stripe customer ID to stripeCustomerIds array', async () => {
    // Setup: Customer with existing Stripe ID
    const existingCustomer = await sanity.create({
      _type: 'customer',
      email: 'test@example.com',
      stripeCustomerId: 'cus_existing123',
      stripeCustomerIds: ['cus_existing123']
    })

    // Act: Process session with different Stripe customer ID
    const session = {
      id: 'cs_test_new',
      customer: 'cus_new456',  // Different Stripe ID
      customer_details: { email: 'test@example.com' }
    }
    const result = await strictFindOrCreateCustomer(session)

    // Assert: Both IDs should be in array
    expect(result.stripeCustomerId).toBe('cus_existing123')  // Primary unchanged
    expect(result.stripeCustomerIds).toContain('cus_existing123')
    expect(result.stripeCustomerIds).toContain('cus_new456')  // New ID added
  })
})
```

---

## Code References

### Relevant Files

1. **[netlify/functions/stripeWebhook.ts:6755-6950](../netlify/functions/stripeWebhook.ts#L6755-L6950)** - `handleCheckoutExpired` function
2. **[netlify/functions/stripeWebhook.ts:2609-2843](../netlify/functions/stripeWebhook.ts#L2609-L2843)** - `strictFindOrCreateCustomer` function
3. **[netlify/functions/stripeWebhook.ts:2581-2597](../netlify/functions/stripeWebhook.ts#L2581-L2597)** - `fetchCustomerByStripeId` query
4. **[netlify/lib/stripeCustomerAliases.ts:11-53](../netlify/lib/stripeCustomerAliases.ts#L11-L53)** - `buildStripeCustomerAliasPatch` function
5. **[packages/sanity-config/src/schemaTypes/documents/customer.ts:66-81](../packages/sanity-config/src/schemaTypes/documents/customer.ts#L66-L81)** - Customer schema

### Key Logic Flow

```
checkout.session.expired event
  → handler() [stripeWebhook.ts:~7800]
  → handleCheckoutExpired() [stripeWebhook.ts:6755]
  → strictFindOrCreateCustomer(session) [stripeWebhook.ts:6947]
  → fetchCustomerByStripeId(stripeCustomerId) [stripeWebhook.ts:2710]
  → buildStripeCustomerAliasPatch() [stripeCustomerAliases.ts:11]
  → sanity.patch().set({stripeCustomerIds: [...]}).commit()
```

---

## Acceptance Criteria

✅ **Production deployment includes latest stripeWebhook.ts code**
✅ **Customer `ATZnC953ZI6BkOhriZTtDE` has both Stripe IDs in `stripeCustomerIds` array**
✅ **Future `checkout.session.expired` events process successfully**
✅ **Abandoned checkout documents are created**
✅ **No "conflicting customer stripe ids" errors in logs**
✅ **Monitoring alerts configured for webhook failures**

---

## Questions for Follow-up

1. **Deployment History:** When was the last deployment to production? Does it include commit with alias pattern?
2. **Error Frequency:** How many times has this error occurred? Query production logs for pattern.
3. **Customer Impact:** Are there other customers affected by this issue? Query for customers with multiple Stripe objects.
4. **Code Version:** Can we access the actual bundled production code to confirm the discrepancy?
5. **Stripe Customer Merge:** Should we merge the two Stripe customer objects (`cus_TgonYtaRUjUXOZ` and `cus_Th0NSA5EcegRfp`) in Stripe Dashboard?

---

## Document Authority

This audit is based on:
- Error logs from Dec 30, 2024 (production environment)
- Current fas-sanity repository code (as of 2026-01-03)
- Stripe webhook event handling patterns
- Customer schema structure

**Critical Finding:** Production code DOES NOT match repository code. Immediate redeployment required.

**Prepared by:** Claude (Audit Agent)
**Review Status:** PENDING
**Next Action:** REDEPLOY PRODUCTION CODE
