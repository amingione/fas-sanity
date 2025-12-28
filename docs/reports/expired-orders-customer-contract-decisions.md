# Expired Orders Customer Contract Decisions

**Date:** 2025-12-27
**Authority:** Decision Document
**Scope:** fas-sanity (abandonedCheckout schema and customer linking)
**Concern:** Expired Stripe checkout orders not displaying customer details in Orders and Customers Desk views
**Audit Source:** docs/reports/expired-orders-customer-audit.md

---

## EXECUTIVE SUMMARY

Expired checkout sessions create `abandonedCheckout` documents that exist in complete isolation from the customer system. The root cause is architectural: the `abandonedCheckout` schema lacks a `customerRef` field, and the expired checkout creation logic in `reprocessStripeSession.ts` bypasses the customer lookup that exists for non-expired orders. This causes abandoned checkouts to be invisible in customer views and prevents operators from understanding which customers abandoned which checkouts. The fix requires adding `customerRef` to the schema and extending the expired checkout logic to perform customer lookup by email, mirroring the pattern already established for completed orders.

---

## DECISIONS

### SCHEMA CHANGES

**STATUS: APPROVED**

Add `customerRef` field to `abandonedCheckout` schema to enable linking abandoned checkouts to customer documents.

**Justification:**

- The audit confirms that non-expired orders create `customerRef` via email lookup in `reprocessStripeSession.ts`
- Expired orders use the same function but follow a different code path that omits customer lookup
- `abandonedCheckout` already captures `customerEmail` as a string, providing the lookup key
- Adding `customerRef` aligns abandoned checkouts with order structure and enables referential integrity
- This allows Desk views to show abandoned checkouts when viewing a customer document

**Approved Schema Addition:**

```typescript
// In packages/sanity-config/src/schemaTypes/documents/abandonedCheckout.ts
defineField({
  name: 'customerRef',
  title: 'Customer',
  type: 'reference',
  to: [{type: 'customer'}],
  description: 'Reference to customer who abandoned this checkout',
  readOnly: true,
  weak: true, // Weak reference - allow customer deletion without breaking checkout
})
```

**Field Specifications:**

- **Name:** `customerRef`
- **Type:** `reference` to `customer`
- **Authority:** `reprocessStripeSession.ts` (server-side logic)
- **Editability:** Read-only (system-managed)
- **Nullability:** Optional (some expired sessions may not have email)
- **Reference Type:** Weak (customer deletion should not block checkout deletion)
- **Default:** `undefined` (will be set if customer lookup succeeds)

**Field Placement:**
Add after `customerEmail` field (line 43) to group customer-related fields together.

---

### LOGIC CHANGES

**STATUS: APPROVED**

Extend expired checkout creation logic in `netlify/functions/reprocessStripeSession.ts` to perform customer lookup by email and set `customerRef` when creating `abandonedCheckout` documents.

**Approved Logic Change:**

In `reprocessStripeSession.ts`, the expired checkout flow (currently lines 34-45 per audit) must add customer lookup logic BEFORE calling `upsertAbandonedCheckoutDocument`.

**Exact Change Location:**

- **File:** `netlify/functions/reprocessStripeSession.ts` (fas-cms-fresh repo)
- **Function:** Main session handler (expired status branch)
- **Insertion Point:** Before `upsertAbandonedCheckoutDocument` call

**Change Pattern (ALIGN TO EXISTING ORDER LOGIC):**

The customer lookup logic already exists for non-expired orders (audit lines 12-22). The EXACT same pattern must be applied to the expired checkout branch:

```typescript
// EXISTING PATTERN (from non-expired order flow):
if (email) {
  try {
    const customerId = await sanity.fetch<string | null>(
      `*[_type == "customer" && email == $email][0]._id`,
      {email},
    )
    if (customerId) baseDoc.customerRef = {_type: 'reference', _ref: customerId}
  } catch (err) {
    console.warn('reprocessStripeSession: failed to lookup customer by email', err)
  }
}
```

This exact logic must be replicated in the expired checkout branch before passing `baseDoc` to `upsertAbandonedCheckoutDocument`.

**Critical Requirements:**

- Use the SAME email lookup query as non-expired orders (no variation in logic)
- Use the SAME error handling pattern (warn and continue if lookup fails)
- Set `customerRef` on the abandoned checkout document using the SAME reference structure
- Do NOT create new customers - only link to existing ones (matches order behavior)
- If email is undefined or customer lookup fails, `customerRef` remains undefined (graceful degradation)

**Why This Logic is Correct:**

- Mirrors established pattern from order creation (consistency)
- Uses existing customer records (no duplicate customer creation)
- Fails gracefully if email missing or customer not found (no blocking errors)
- Maintains weak reference semantics (customer deletion doesn't cascade)

---

### QUERY / DESK STRUCTURE CHANGES

**STATUS: APPROVED**

Enable customer-abandoned checkout linking in Desk queries and views.

**Approved Query Changes:**

1. **Customer Document View:**
   - Allow querying abandoned checkouts by customer reference
   - Pattern: `*[_type == "abandonedCheckout" && references($customerId)]`
   - Display abandoned checkouts in customer detail view (optional enhancement)

2. **Orders "Carts" Tab:**
   - NO CHANGE REQUIRED to existing query
   - Current query already shows all abandoned checkouts
   - `customerRef` will now be available for filtering/display if needed

3. **Abandoned Checkout Preview:**
   - OPTIONAL: Update preview to show customer name from reference instead of string field
   - Fallback: Keep existing string-based display if reference is null

**Desk Structure Enhancement (OPTIONAL):**

Add abandoned checkouts section to customer detail view:

```typescript
// In customer document structure
{
  name: 'abandonedCheckouts',
  title: 'Abandoned Checkouts',
  type: 'array',
  of: [{type: 'reference', to: [{type: 'abandonedCheckout'}]}],
  // OR use reverse reference query in custom component
}
```

**Critical Constraint:**

- Do NOT modify the core "Carts" tab filter or projection in `OrdersDocumentTable.tsx`
- The existing `CARTS_PROJECTION` already includes `customerName` and `customerEmail` as strings
- Adding `customerRef` enhances linking without breaking existing display

---

## DATA INTEGRITY RULES

### Invariants (MUST HOLD)

1. **One Customer Per Email:**
   - `customerRef` must resolve to a customer whose `email` matches `abandonedCheckout.customerEmail`
   - If customer lookup by email returns multiple results, use the first match (existing behavior)
   - Duplicate customer prevention is out of scope (existing issue, not introduced by this fix)

2. **Weak Reference Integrity:**
   - `customerRef` must be a weak reference (allows customer deletion without cascading to abandoned checkouts)
   - Deleting a customer document must NOT delete their abandoned checkouts
   - Abandoned checkouts with deleted customer refs should display gracefully using string fields

3. **Expired Orders Link to Customers:**
   - If `abandonedCheckout.customerEmail` exists AND matches an existing customer, `customerRef` MUST be set
   - If no matching customer exists, `customerRef` remains undefined (no error)
   - If email is missing from session, `customerRef` remains undefined (no error)

4. **Schema-Logic Alignment:**
   - `customerRef` field in schema MUST match reference structure written by logic: `{_type: 'reference', _ref: string}`
   - Logic MUST NOT write `customerRef` if schema field does not exist (deploy schema before deploying logic)

5. **Non-Expired Order Behavior Unchanged:**
   - Customer lookup logic for non-expired orders (line 12-22 in audit) MUST NOT be modified
   - Non-expired orders continue to create `order` documents with `customerRef` using existing logic
   - This fix adds parallel logic for `abandonedCheckout` documents, not replacing order logic

### Validation Requirements

- **Schema Validation:** `customerRef` must validate `to: [{type: 'customer'}]` (no other document types allowed)
- **Logic Validation:** Customer lookup query must use exact email match (case-sensitive, no partial matches)
- **Null Safety:** Code must handle undefined email, failed lookups, and null customer IDs without throwing errors

---

## FORBIDDEN CHANGES

### Absolutely Prohibited

1. **DO NOT modify non-expired order creation logic:**
   - The `upsertOrder` function and its customer lookup logic (audit lines 12-22) must remain unchanged
   - Non-expired orders already work correctly
   - Any changes to order creation logic are out of scope and prohibited

2. **DO NOT create new customer documents from abandoned checkouts:**
   - Customer creation happens only when orders are completed (existing behavior)
   - Expired checkouts must ONLY link to existing customers, never create new ones
   - This prevents abandoned sessions from polluting the customer database

3. **DO NOT change `abandonedCheckout` document structure beyond adding `customerRef`:**
   - Existing fields (`customerEmail`, `customerName`, `customerPhone`) must remain
   - These string fields serve as fallback display values when `customerRef` is undefined
   - Do not rename, remove, or relocate existing fields

4. **DO NOT modify Stripe webhook handling or session processing:**
   - Stripe session expiration logic must remain unchanged
   - The decision to create `abandonedCheckout` vs `order` is correct and must not be altered
   - Only the customer linking step is changing, not the document type decision

5. **DO NOT add duplicate customer lookup logic:**
   - Reuse the EXACT pattern from non-expired orders (audit lines 12-22)
   - Do not introduce variations in query syntax, error handling, or reference structure
   - Copy-paste the existing logic block into the expired checkout branch

6. **DO NOT make `customerRef` required:**
   - Some expired sessions may not have email (Stripe allows anonymous checkouts)
   - Some emails may not match existing customers (first-time visitors who never completed an order)
   - `customerRef` must remain optional to handle these cases gracefully

---

## ROLLBACK SAFETY

### Guarantees This Change Does NOT Affect Non-Expired Orders

1. **Code Path Isolation:**
   - Non-expired orders use `upsertOrder` function (audit line 12-22)
   - Expired orders use `upsertAbandonedCheckoutDocument` function (audit line 34-45)
   - These are separate code paths with no shared state
   - Adding customer lookup to expired path cannot affect order path

2. **Schema Isolation:**
   - Changes apply to `abandonedCheckout` schema only
   - `order` schema remains completely unchanged
   - No shared fields or types between the two schemas

3. **Document Type Isolation:**
   - Expired sessions create documents with `_type: 'abandonedCheckout'`
   - Non-expired sessions create documents with `_type: 'order'`
   - Queries filter by `_type`, so no cross-contamination

4. **Customer Lookup Isolation:**
   - Adds new customer lookup in expired branch
   - Does NOT modify existing customer lookup in order branch
   - Both use identical query pattern, but execute independently

5. **Backward Compatibility:**
   - Existing `abandonedCheckout` documents without `customerRef` continue to display using string fields
   - New abandoned checkouts populate `customerRef` if customer exists
   - No migration required for historical data (field is optional)
   - Desk views already handle undefined reference fields gracefully

### Rollback Plan

If this change causes issues:

1. **Schema Rollback:**
   - Remove `customerRef` field from `abandonedCheckout` schema
   - Existing documents retain the field but it becomes invisible in Studio
   - No data loss (string fields still exist)

2. **Logic Rollback:**
   - Remove customer lookup block from expired checkout branch
   - `customerRef` will no longer be set on new abandoned checkouts
   - Existing abandoned checkouts retain their customer references (no cleanup needed)

3. **Verification:**
   - After rollback, verify non-expired orders still create with `customerRef` (unchanged)
   - Verify expired checkouts still create with `customerEmail` string (unchanged)
   - Confirm no Stripe webhook errors or session processing failures

---

## IMPLEMENTATION SEQUENCE

**Critical:** Changes must be deployed in this exact order to prevent errors.

### Phase 1: Schema Deployment (fas-sanity)

1. Add `customerRef` field to `abandonedCheckout.ts` schema
2. Deploy schema to Sanity dataset
3. Verify field appears in Studio (create test abandoned checkout manually)
4. Confirm reference validation works (can select customer documents)

**Deployment Command:**

```bash
cd /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
npm run deploy
```

**Validation:**

- Open Studio
- Navigate to Content → Orders → Carts tab
- Select any abandoned checkout document
- Confirm "Customer" field is visible (even if empty)

### Phase 2: Logic Deployment (fas-cms-fresh)

1. Locate expired checkout branch in `reprocessStripeSession.ts`
2. Insert customer lookup logic BEFORE `upsertAbandonedCheckoutDocument` call
3. Use exact pattern from audit lines 12-22 (no variations)
4. Deploy to Netlify
5. Test with Stripe test mode (create expired session, verify customer link)

**Deployment Command:**

```bash
cd /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh
# Deploy to Netlify (command varies by setup)
```

**Validation:**

- Create test Stripe checkout session
- Let session expire (or manually expire via Stripe Dashboard)
- Trigger webhook reprocessing
- Verify abandoned checkout document has `customerRef` populated
- Confirm `customerRef` points to correct customer (email match)

### Phase 3: Desk Structure Enhancement (OPTIONAL)

1. Update customer detail view to show abandoned checkouts
2. Add reverse reference query or reference array
3. Test customer view displays abandoned checkouts correctly

---

## SUCCESS CRITERIA

### Functional Requirements

- [x] **Schema:** `abandonedCheckout` has `customerRef` field (reference to customer, weak, read-only)
- [x] **Logic:** Expired checkout creation performs customer lookup by email
- [x] **Logic:** Customer reference is set if lookup succeeds, undefined if it fails (no errors)
- [x] **Display:** Studio shows customer reference in abandoned checkout documents
- [x] **Integrity:** Customer reference resolves to customer with matching email
- [x] **Isolation:** Non-expired order creation logic unchanged
- [x] **Backward Compat:** Existing abandoned checkouts without customerRef still display correctly

### Testing Checklist

**Pre-Deployment:**

- [ ] Schema change reviewed and approved
- [ ] Logic change mirrors existing order pattern exactly
- [ ] No changes to non-expired order code path

**Post-Schema Deployment:**

- [ ] `customerRef` field visible in Studio
- [ ] Field validation accepts customer references
- [ ] Field is read-only (cannot be manually edited)

**Post-Logic Deployment:**

- [ ] New expired checkouts populate `customerRef` if customer exists
- [ ] Expired checkouts without matching customer leave `customerRef` undefined
- [ ] No errors in Netlify function logs during checkout expiration
- [ ] Non-expired orders still create with `customerRef` (regression test)

**End-to-End:**

- [ ] Create customer account with email test@example.com
- [ ] Create Stripe checkout session with same email
- [ ] Let session expire
- [ ] Verify abandoned checkout links to customer
- [ ] View customer document and confirm abandoned checkout is associated
- [ ] Delete customer and verify abandoned checkout still exists (weak reference)

---

## AUDIT TRACEABILITY

**Audit Finding:** "Expired orders completely bypass [customer lookup logic]" (audit line 29)

**Root Cause Confirmed:**

- Audit line 34-45: Expired sessions create `abandonedCheckout` without customer logic
- Audit line 12-22: Non-expired sessions create `order` with customer lookup
- Schema inspection: `abandonedCheckout` has no `customerRef` field (line 1-220 of schema)

**Decision Rationale:**

- Add `customerRef` to schema: Enables referential integrity (same pattern as orders)
- Replicate customer lookup logic: Mirrors existing pattern (consistency)
- Weak reference: Prevents cascading deletes (preserves audit trail)
- Optional field: Handles missing email gracefully (no breaking errors)

**Cross-Reference:**

- Pattern established in: `docs/reports/cross-repo-contract-decisions.md` (schema-first approach)
- Similar fix: Decision #3 (vendor.userSub) and Decision #11 (EasyPost fields)
- Governance model: Schema changes approved when fas-cms-fresh usage is confirmed

---

## DOCUMENT AUTHORITY

This document is the authoritative contract for fixing expired checkout customer linking.

**Codex MUST:**

- Implement ONLY the approved schema and logic changes
- Use EXACT patterns specified (no variations)
- Deploy in the specified sequence (schema before logic)
- Validate all success criteria before marking complete

**Codex MUST NOT:**

- Modify non-expired order logic
- Create customers from abandoned checkouts
- Change document type decision logic (expired → abandonedCheckout)
- Rename or remove existing fields
- Make `customerRef` required

**Enforcement:**
This document supersedes verbal instructions. If implementation deviates from this contract, it must be reverted and re-implemented per specification.

**Approval Authority:** Amber Min (ambermin)
**Review Status:** APPROVED
**Implementation Status:** PENDING
**Last Updated:** 2025-12-27
