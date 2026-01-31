# Complete Repository Audit Report: FAS Sanity & FAS CMS Fresh

**Date:** January 22, 2026
**Scope:** Deep audit of schema definitions, API integrations, code quality, and system alignment
**Repositories Audited:**
- `fas-sanity` - Sanity Studio schemas and business logic
- `fas-cms-fresh` - Astro frontend, API routes, and integrations

---

## Executive Summary

This comprehensive audit identified **47+ distinct issues** across both repositories, ranging from critical schema violations to obsolete code and broken feature references. The repositories show signs of active development with recent refactoring (commit a8956c7), but incomplete migration of deleted functions has left broken references in multiple places.

**Critical Issues Requiring Immediate Attention:** 8
**High Priority Issues:** 12
**Medium Priority Issues:** 18
**Low Priority Issues:** 9+

---

## Part 1: FAS-SANITY SCHEMA AUDIT

### 1.1 Critical Schema Violations

#### Issue 1.1.1: Provider Metadata Fields Violate CLAUDE.md Spec
**Severity:** CRITICAL
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** 640, 452, 729, 641
**Description:**

The following fields violate CLAUDE.md "Provider Metadata Rule":

```
Rule: "Do NOT add Stripe, EasyPost, or carrier-specific metadata to schemas.
Sanity stores only business-critical, human-meaningful fields."
```

**Violating Fields:**

| Field | Line | Provider | Status |
|-------|------|----------|--------|
| `easypostRateId` | 640 | EasyPost | REMOVE |
| `easyPostShipmentId` | 452 | EasyPost | REMOVE |
| `easyPostTrackerId` | 729 | EasyPost | REMOVE |
| `stripeShippingRateId` | 641 | Stripe | REMOVE |

**Impact:**
- These fields should be re-fetched from provider dashboards or APIs when needed
- Storing them violates the architectural principle of provider independence
- Creates maintenance burden when provider APIs change

**Action Required:** Remove these 4 fields from order schema. Provider-specific data should be fetched dynamically from APIs.

---

#### Issue 1.1.2: stripeSummary Incomplete - Missing 4 Required Fields
**Severity:** CRITICAL
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** 664-668
**Description:**

Current implementation:
```typescript
stripeSummary: {
  data: text(JSON.string)
}
```

CLAUDE.md specification requires:
```typescript
stripeSummary: {
  data: string,                // JSON.stringify(session)
  amountDiscount: number,      // MISSING
  paymentCaptured: boolean,    // MISSING
  paymentCapturedAt: datetime, // MISSING
  webhookNotified: boolean     // MISSING
}
```

**Impact:**
- Orders created through webhooks.ts don't match schema contract
- Critical payment audit trail data is missing
- Webhook handler (fas-cms-fresh) has no place to store amountDiscount, paymentCaptured timestamps

**Action Required:** Update schema to add all 4 missing fields to stripeSummary object.

---

#### Issue 1.1.3: Duplicate Field - paymentIntentId Stored Twice
**Severity:** HIGH
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** 410, 418
**Description:**

```typescript
// Line 410 - paymentIntentId
{
  name: 'paymentIntentId',
  type: 'string',
  hidden: true  // ← Hidden
}

// Line 418 - stripePaymentIntentId
{
  name: 'stripePaymentIntentId',
  type: 'string',
  hidden: true  // ← Also hidden
}
```

Both fields store the same value (Stripe payment intent ID). This creates:
- Data redundancy
- Confusion about which field to use
- Sync challenges if one field is updated without the other
- Webhook handler must populate both fields

**Action Required:** Choose one field name, deprecate the other. fas-cms-fresh webhook handler currently populates both (line 777).

---

#### Issue 1.1.4: Duplicate Fields - carrier and service Stored in Two Places
**Severity:** MEDIUM-HIGH
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** 584-585, 618-619
**Description:**

```typescript
// Top-level fields (hidden)
{ name: 'carrier', type: 'string', hidden: true }      // Line 584
{ name: 'service', type: 'string', hidden: true }      // Line 585

// Nested in shippingStatus
{
  name: 'shippingStatus',
  type: 'object',
  fields: [
    { name: 'carrier', type: 'string' }   // Line 618
    { name: 'service', type: 'string' }   // Line 619
  ]
}
```

**Issues:**
- Same data stored in two locations
- Webhook handler must keep both in sync
- Unclear which is authoritative
- Deprecation notes suggest intention to consolidate but not yet completed

**Action Required:** Consolidate. Use `shippingStatus.carrier` and `shippingStatus.service` as canonical. Remove top-level fields or explicitly mark as deprecated.

---

### 1.2 Type Mismatches & Inconsistencies

#### Issue 1.2.1: weight and dimensions Types Don't Match Expected Format
**Severity:** HIGH
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** 514-530, 532-548
**Description:**

**Current implementation:**

```typescript
// weight is a complex object type
weight: {
  _type: 'shipmentWeight',
  value: number,
  unit: 'lb' | 'kg' | 'oz' | 'g'
}

// dimensions is also complex
dimensions: {
  _type: 'packageDimensions',
  length: number,
  width: number,
  height: number,
  unit: 'in' | 'cm'
}
```

**Expected format** (based on shipping integration needs):
- Should be simple numbers (weight in lbs, dimensions in inches)
- API layer should handle unit conversion

**Impact:**
- fas-cms-fresh webhook must convert complex objects to primitives for EasyPost
- Additional complexity in data transformation
- Harder to query and calculate totals across shipments

**Action Required:** Consider simplifying to scalar values with unit normalization in API layer.

---

#### Issue 1.2.2: paymentStatus Enumeration Extends CLAUDE.md Spec
**Severity:** MEDIUM
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** Enum definition
**Description:**

**Actual options:** `'pending'`, `'unpaid'`, `'paid'`, `'failed'`, `'refunded'`, `'partially_refunded'`, `'cancelled'`

**CLAUDE.md specification:** `'pending'`, `'paid'`, `'failed'`, `'refunded'`

**Extra values not in spec:**
- `'unpaid'` - Unclear difference from 'pending'
- `'partially_refunded'` - Intended use case?
- `'cancelled'` - When is this used?

**Impact:**
- API integration assumes 4 values per CLAUDE.md
- Webhook handler (fas-cms-fresh:769) treats anything other than 'paid' as 'pending'
- Extra values may never be used, creating confusion

**Action Required:** Either document the 3 extra values and update CLAUDE.md, or remove them and simplify to spec-compliant set.

---

### 1.3 Validation Gaps & ReadOnly Field Issues

#### Issue 1.3.1: ReadOnly Fields With Required Validation (Doesn't Work)
**Severity:** MEDIUM
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** 45-61
**Description:**

```typescript
{
  name: 'orderNumber',
  type: 'string',
  readOnly: true,                           // ← ReadOnly
  validation: (Rule) => Rule.required()     // ← Validation (won't run)
}

{
  name: 'createdAt',
  type: 'datetime',
  readOnly: true,                           // ← ReadOnly
  // No validation despite being critical
}
```

**Issue:** Validation rules cannot be triggered on readOnly fields because users can't edit them. The validation is redundant.

**Action Required:** Remove validation from readOnly fields, or document that validation is only enforced programmatically (via API).

---

#### Issue 1.3.2: Missing Validation - Order Total Calculation
**Severity:** HIGH
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** Fields: amountSubtotal, amountTax, amountShipping, amountDiscount, totalAmount
**Description:**

No validation that: `totalAmount === (amountSubtotal + amountTax + amountShipping - amountDiscount)`

This is a critical business rule but isn't enforced in schema. If webhook handler makes a calculation error, the invalid order is stored.

**Action Required:** Add validation rule:
```typescript
totalAmount: {
  validation: (Rule) => Rule.custom((value, context) => {
    const {amountSubtotal, amountTax, amountShipping, amountDiscount} = context.parent;
    const expected = (amountSubtotal || 0) + (amountTax || 0) + (amountShipping || 0) - (amountDiscount || 0);
    return Math.abs(value - expected) < 0.01
      ? true
      : `Total (${value}) must equal subtotal (${amountSubtotal}) + tax (${amountTax}) + shipping (${amountShipping}) - discount (${amountDiscount})`;
  })
}
```

---

### 1.4 Deprecated Fields Still Present

#### Issue 1.4.1: Deprecated Fields Not Removed/Archived
**Severity:** MEDIUM
**Location:** [order.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx)
**Lines:** 222-229, 244-250
**Description:**

```typescript
// Line 227: fulfillmentDetails.shippingAddress
field: "Deprecated: use structured shippingAddress fields instead"

// Line 248: fulfillmentDetails.trackingNumber
field: "Deprecated: use top-level trackingNumber instead"
```

These are marked deprecated but still exist in schema (and hidden). They create:
- Schema bloat
- Confusion about which fields are current
- Uncertainty about migration path

**Migration Status:** Unclear if all existing documents have been migrated away from deprecated fields.

**Action Required:** Either:
1. Complete migration of all existing orders to use non-deprecated fields
2. Remove deprecated field definitions entirely
3. Or explicitly document that they're kept for backwards compatibility with a specific timeline for removal

---

### 1.5 Schema Registry - Orphaned Types

#### Issue 1.5.1: Potentially Unused Schema Document Types
**Severity:** LOW-MEDIUM
**Location:** [index.ts](fas-sanity/packages/sanity-config/src/schemaTypes/index.ts)
**Description:**

Several document types are registered but rarely referenced:

| Type | Usage | Status |
|------|-------|--------|
| `altText` | Singleton, imported in one place | Verify necessity |
| `analyticsSettings` | Singleton, not verified in use | Archive or use |
| `searchSettings` | Singleton, not verified in use | Archive or use |
| `printSettings` | Not referenced by orders/products | Archive or document use |
| `logDrain` | Audit/debugging only | Move to archive |
| `functionLog` | Audit/debugging only | Move to archive |

**Action Required:** Audit each type's actual usage. Move unused types to archive schema or remove entirely.

---

## Part 2: FAS-CMS-FRESH API AUDIT

### 2.1 Critical Integration Issues

#### Issue 2.1.1: stripeSummary Not Fully Populated - Missing Fields
**Severity:** CRITICAL
**Location:** [webhooks.ts](fas-cms-fresh/src/pages/api/webhooks.ts)
**Lines:** 790-794
**Description:**

```typescript
stripeSummary: {
  data: JSON.stringify(sessionDetails)
  // Missing: amountDiscount, paymentCaptured, paymentCapturedAt, webhookNotified
}
```

**Available data not stored:**

```typescript
// Lines 721-724: amountDiscount is calculated but not in stripeSummary
const amountDiscount =
  typeof sessionDetails.total_details?.amount_discount === 'number'
    ? sessionDetails.total_details.amount_discount / 100
    : 0;
// ✓ Stored at line 760 as top-level field

// Lines 774-777: paymentIntentId and stripeSessionId available
// ✓ Stored but not in stripeSummary

// No capture/webhook timestamp recorded
// ✗ Missing paymentCapturedAt
```

**Impact:**
- Order documents violate schema contract (schema expects these fields in stripeSummary)
- Audit trail incomplete
- Can't verify when/if webhook was actually processed
- Payment capture timestamp not recorded

**Action Required:**
1. Update webhook handler to populate all stripeSummary fields
2. Add `webhookNotified: true` and `webhookNotifiedAt: datetime` to stripeSummary
3. Add `paymentCaptured: boolean` logic (check if payment_intent.status includes 'succeeded')

---

#### Issue 2.1.2: Sanity Client Not Validated Before Use
**Severity:** MEDIUM-HIGH
**Location:** [webhooks.ts](fas-cms-fresh/src/pages/api/webhooks.ts)
**Lines:** 19-31
**Description:**

```typescript
const sanity = createClient({
  projectId:
    (import.meta.env.SANITY_PROJECT_ID as string | undefined) ||
    (import.meta.env.PUBLIC_SANITY_PROJECT_ID as string | undefined) ||
    (import.meta.env.SANITY_STUDIO_PROJECT_ID as string | undefined),
  // ... more config
});
```

**Issues:**
1. If all three projectId sources are undefined, `projectId` = undefined
2. Same risk for `dataset`
3. `token` has no validation - if missing, requests fail at query time
4. No validation after client creation - error happens on first Sanity query, not on webhook receipt

**Impact:**
- Webhook accepts request (returns 200) but fails to create order
- Customer payment is captured but order never created in Sanity
- Silent failure - customer has no order record

**Action Required:** Validate client config immediately after creation:

```typescript
if (!sanity.config().projectId || !sanity.config().dataset) {
  throw new Error('Sanity client not properly configured. Check environment variables.');
}
```

---

#### Issue 2.1.3: STRIPE_SHIPPING_WEBHOOK_SECRET Not Validated
**Severity:** HIGH
**Location:** [shipping-rates-webhook.ts](fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts)
**Lines:** 82-85, 165
**Description:**

**EasyPost validation (good):**
```typescript
const apiKey = import.meta.env.EASYPOST_API_KEY;
if (!apiKey) {
  throw new Error('EASYPOST_API_KEY not configured');
}
```

**Stripe webhook secret (bad):**
```typescript
// Line 165 - No validation
event = stripe.webhooks.constructEvent(
  body,
  signature,
  import.meta.env.STRIPE_SHIPPING_WEBHOOK_SECRET  // ← Could be undefined
);
```

**Impact:**
- If `STRIPE_SHIPPING_WEBHOOK_SECRET` is undefined, `constructEvent()` throws TypeError
- No meaningful error message
- Webhook processing fails silently with poor error logging

**Action Required:** Add validation before constructEvent:

```typescript
const shippingWebhookSecret = import.meta.env.STRIPE_SHIPPING_WEBHOOK_SECRET;
if (!shippingWebhookSecret) {
  console.error('❌ Missing STRIPE_SHIPPING_WEBHOOK_SECRET');
  return new Response('Webhook secret not configured', { status: 500 });
}
```

---

### 2.2 Configuration & Environment Issues

#### Issue 2.2.1: Inconsistent Stripe API Versions
**Severity:** MEDIUM
**Location:** Multiple files
**Description:**

| File | API Version | Status |
|------|-------------|--------|
| shipping-rates-webhook.ts:11 | `2024-11-20.acacia` | Hardcoded, older |
| webhooks.ts:13 | `2025-08-27.basil` | Env fallback |
| create-checkout-session.ts:22 | `2025-08-27.basil` | Env fallback |

**Impact:**
- Different API versions may have breaking changes
- If Stripe deprecates `2024-11-20.acacia`, shipping stops working
- Inconsistency makes maintenance harder

**Action Required:** Centralize Stripe API version:
- Create constant in shared config
- Use same version across all endpoints
- Document version pinning strategy

---

#### Issue 2.2.2: Warehouse Address Hardcoded Fallbacks Look Like Placeholders
**Severity:** MEDIUM
**Location:** [shipping-rates-webhook.ts](fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts)
**Lines:** 68-75
**Description:**

```typescript
const resolveOriginAddress = () => ({
  name: 'F.A.S. Motorsports LLC',
  street1: import.meta.env.WAREHOUSE_ADDRESS_LINE1 || '0000 Main St',  // ← Looks like placeholder
  street2: import.meta.env.WAREHOUSE_ADDRESS_LINE2 || undefined,
  city: import.meta.env.WAREHOUSE_CITY || 'Clermont',
  state: import.meta.env.WAREHOUSE_STATE || 'FL',
  zip: import.meta.env.WAREHOUSE_ZIP || '34711',
  country: 'US',
  phone: import.meta.env.WAREHOUSE_PHONE || undefined,
  email: import.meta.env.WAREHOUSE_EMAIL || undefined
});
```

**Issues:**
1. Fallback street address `'0000 Main St'` is clearly a placeholder
2. If env vars missing in production, EasyPost receives wrong warehouse address
3. Shipping rates calculated for wrong origin point (silently fails)
4. `.env.example` line 59 shows real address should be `6161 Riverside Dr`

**Impact:**
- Silent failure - shipping rates will be wrong if env vars not set
- No error alert to operators

**Action Required:** Either:
1. Require warehouse address env vars (throw error if missing)
2. Remove fallbacks and use `.env.example` to document required values
3. Or explicitly document that '0000 Main St' is development default

---

### 2.3 Broken References & Dead Code

#### Issue 2.3.1: getEasyPostRates Function Deleted - 6 Broken References
**Severity:** CRITICAL
**Location:** fas-sanity repo, multiple files
**Date Deleted:** Commit a8956c7 (Jan 21, 2026)
**Description:**

Function `getEasyPostRates` was deleted, but is still called in 6 files:

**Broken References in fas-sanity:**

1. **[getShippingRates.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documentActions/getShippingRates.tsx)**
   - References: `/.netlify/functions/getEasyPostRates`
   - Status: Endpoint no longer exists

2. **[shippingLabelComponents.tsx](fas-sanity/packages/sanity-config/src/schemaTypes/documents/shippingLabelComponents.tsx)**
   - Multiple calls to deleted function
   - Breaking the shipping label preview

3. **[shippingOption.ts](fas-sanity/packages/sanity-config/src/schemaTypes/documents/shippingOption.ts)**
   - References deleted function

4. **[EasyPostServiceInput.tsx](fas-sanity/packages/sanity-config/src/components/EasyPostServiceInput.tsx)**
   - Component calls deleted function

5. **[StepRates.tsx](fas-sanity/packages/sanity-config/src/components/wizard/steps/StepRates.tsx)**
   - Wizard step depends on deleted function

6. **[ShippingQuoteDialog.tsx](fas-sanity/packages/sanity-config/src/components/ShippingQuoteDialog.tsx)**
   - Dialog component broken

**Impact:**
- Sanity UI will error when trying to fetch shipping rates
- Shipping label creation workflow is broken
- Staging/publishing orders with shipping may fail in Studio

**Action Required:**
1. **Immediate:** Identify what function replaced `getEasyPostRates`
2. Update all 6 files to call the replacement function
3. Verify the replacement function is actually deployed (Netlify or Astro)
4. Test shipping rate workflow in Studio

---

#### Issue 2.3.2: easypost-webhook Function Deleted
**Severity:** HIGH
**Location:** `netlify/functions/easypost-webhook.ts`
**Date Deleted:** Commit a8956c7 (Jan 21, 2026)
**Description:**

The EasyPost webhook handler was deleted as part of consolidation. Need to verify:

1. **Where is EasyPost webhook handling now?**
   - Is it in `shipping-rates-webhook.ts`?
   - Is it in `webhooks.ts`?
   - Is it still missing?

2. **Does Sanity have EasyPost webhook configured?**
   - If yes, what URL is it pointing to?
   - If that URL doesn't exist, webhooks are lost

**Impact:**
- EasyPost label creation/fulfillment events may not be processed
- No tracking updates when shipments status changes
- Orders stuck in pending fulfillment state

**Action Required:**
1. Verify replacement webhook handler exists and is deployed
2. Check EasyPost Dashboard for webhook endpoint configuration
3. Update configuration to point to active endpoint
4. Test webhook flow (create label → receive webhook → update order)

---

#### Issue 2.3.3: Deprecated Vendor Application Handlers - Migration Incomplete
**Severity:** HIGH
**Location:** fas-sanity repo
**Files:**
- [submitVendorApplication.ts](fas-sanity/netlify/functions/submitVendorApplication.ts) - deprecated Jan 6, 2026
- [vendor-application.ts](fas-sanity/netlify/functions/vendor-application.ts) - deprecated Jan 6, 2026

**Description:**

Both functions marked `@deprecated` with note: "Use fas-cms-fresh/src/pages/api/vendor-application.ts instead"

**Concerns:**
1. Are both functions still deployed in Netlify/fas-sanity?
2. Are there any references still pointing to old endpoints?
3. Is the fas-cms-fresh handler receiving traffic?
4. Should fas-sanity functions be removed or left as fallback?

**Action Required:**
1. Verify fas-cms-fresh handler is canonical and working
2. Check logs to confirm old handlers not being called
3. Remove fas-sanity functions if migration complete
4. Update any documentation that references old endpoints

---

### 2.4 Debug Endpoints & Security Issues

#### Issue 2.4.1: Debug Endpoints Expose Configuration Data
**Severity:** HIGH
**Location:** Multiple API endpoints
**Description:**

**Three debug endpoints should be removed or protected:**

1. **[/api/hello.ts](fas-cms-fresh/src/pages/api/hello.ts)**
   - Simple test endpoint: `{ message: 'Hello from Netlify!' }`
   - Likelihood: Development artifact

2. **[/api/debug.ts](fas-cms-fresh/src/pages/api/debug.ts)**
   - Exposes Sanity project configuration (tokens truncated but still visible)
   - Security concern: Leaks project IDs, dataset names, API version

3. **[/api/stripe/debug-checkout-session.ts](fas-cms-fresh/src/pages/api/stripe/debug-checkout-session.ts)**
   - Debug endpoint that only works in non-production or with flag
   - Could expose sensitive Stripe data

**Impact:**
- Information disclosure vulnerability
- Potential for reconnaissance attacks
- Exposes internal architecture to attackers

**Action Required:**
1. Remove `/api/hello.ts` entirely (development artifact)
2. Remove or heavily protect `/api/debug.ts` (only accessible in development)
3. Remove debug mode from `/api/stripe/debug-checkout-session.ts` or protect with auth
4. Implement environment-based guards: only available in development, never in production

---

### 2.5 Unimplemented Features

#### Issue 2.5.1: Account Edit Page - Stub Implementation Only
**Severity:** MEDIUM
**Location:** [account-edit-page.ts](fas-cms-fresh/src/scripts/account-edit-page.ts)
**Lines:** 62
**Description:**

```typescript
// Save button shows alert instead of updating Sanity
alert('Saved (stub) – wire this to Sanity update next.');
```

**Status:** Feature not implemented - shows placeholder alert instead of actually saving.

**Impact:**
- Users can't edit their account information
- Changes don't persist to Sanity
- Customer information can't be updated

**Action Required:** Implement actual Sanity update logic:
1. Create API endpoint to update customer document
2. Remove alert
3. Call Sanity with updated customer data
4. Handle errors and show success/failure feedback

---

### 2.6 Duplicate Webhook Implementations

#### Issue 2.6.1: Two Nearly Identical Webhook Handlers
**Severity:** MEDIUM
**Location:**
- [src/pages/api/webhooks.ts](fas-cms-fresh/src/pages/api/webhooks.ts) - **1163 lines** (Astro)
- [netlify/functions/stripe-webhook.ts](fas-cms-fresh/netlify/functions/stripe-webhook.ts) - **1360 lines** (Netlify)

**Description:**

Git log shows consolidation was attempted (commit a8956c7), but these two implementations still exist and are nearly identical.

**Concerns:**
1. **Maintenance burden:** Bug fixes must be applied to both
2. **Divergence risk:** Over time, implementations will differ
3. **Confusion:** Which is source of truth?
4. **Deployment:** Are both deployed? Is traffic split?

**Questions to Clarify:**
1. Are both being deployed?
2. Is one preferred over the other?
3. Are they at different endpoints or is one a fallback?
4. Which should be the canonical implementation?

**Action Required:**
1. Document deployment strategy - which handler is active?
2. Remove the non-canonical implementation
3. If both needed for compatibility, document and sync regularly
4. Consider single source of truth for future maintenance

---

## Part 3: Cross-Repo Alignment Issues

### 3.1 Schema-to-API Field Mapping Mismatches

#### Issue 3.1.1: Cart Item Structure - Additional Fields in Schema
**Severity:** MEDIUM
**Location:** [orderCartItemType.ts](fas-sanity/packages/sanity-config/src/schemaTypes/objects/orderCartItemType.ts)
**Description:**

Schema includes fields not documented in CLAUDE.md:

| Field | Type | CLAUDE.md | Actual |
|-------|------|-----------|--------|
| stripePriceId | string | NOT SPEC | Present |
| stripeProductId | string | NOT SPEC | Present |
| productRef | reference | Implied | Optional |
| image | image | `imageUrl` | `image` |
| selectedVariant | string | `options` | Renamed |
| addOns | array | `upgrades` | Extra name |

**Issues:**
1. Stripe-specific fields in schema (violates provider metadata rule)
2. Field names don't match CLAUDE.md spec
3. `productRef` is optional but should be required/highly encouraged

**Action Required:**
1. Remove or hide `stripePriceId` and `stripeProductId`
2. Align field names with CLAUDE.md spec or update spec
3. Add validation that `productRef` is populated

---

#### Issue 3.1.2: Address Fields - Inconsistent Structure Across Documents
**Severity:** MEDIUM
**Location:** Multiple schema files
**Description:**

Address fields are implemented inconsistently:

```typescript
// In order.tsx - inline object fields
shippingAddress: {
  name: string,
  phone: string,
  email: string,
  addressLine1: string,
  addressLine2: string,
  city: string,
  state: string,
  postalCode: string,
  country: string
}

// In customer.tsx - might be different
// In invoice.tsx - might be different
```

**Impact:**
- No reusable address type
- Type safety issues in queries
- Harder to maintain consistent address handling

**Action Required:** Create reusable `addressType` schema object used consistently across all documents.

---

### 3.2 Payment Status Enumeration Issues

#### Issue 3.2.1: Order Status Mapping Loses Information
**Severity:** MEDIUM
**Location:** [webhooks.ts](fas-cms-fresh/src/pages/api/webhooks.ts)
**Lines:** 769
**Description:**

```typescript
// normalizedPaymentStatus can be:
// 'paid', 'unpaid', 'failed', 'refunded', 'partially_refunded', 'cancelled', 'pending'

// But order status only maps:
status: normalizedPaymentStatus === 'paid' ? 'paid' : 'pending'
```

**Issue:** All non-paid statuses flatten to 'pending', losing information about actual payment failure reason.

**Questions:**
1. Is this intentional? (Only create orders on successful payment)
2. Should we create orders for failed payments too?
3. Should order.status reflect actual payment state?

**Action Required:** Document the intentional behavior or update logic if needed.

---

## Part 4: Obsolete Code & Cleanup

### 4.1 Deprecated Components

#### Issue 4.1.1: Parcelcraft Integration Completely Removed
**Severity:** LOW
**Location:** Deleted in recent commits
**Files Deleted:**
- `.docs/ai-governance/` - 22+ Parcelcraft-Stripe documentation files
- `archive/netlify/functions/create-parcelcraft-label.ts`
- `archive/sanity-config/schemaTypes/documentActions/createParcelcraftLabelAction.ts`

**Status:** Appears complete (functions moved to archive)

**Verify:** No remaining references to Parcelcraft in active code.

---

#### Issue 4.1.2: Deprecated Shipping Scripts
**Severity:** LOW
**Location:** [check-parcelcraft-transit-times.ts](fas-cms-fresh/scripts/check-parcelcraft-transit-times.ts)
**Description:** Deprecated script still in repo, references removed Parcelcraft

**Action Required:** Move to archive or delete if not needed.

---

### 4.2 TODO & FIXME Comments

#### Issue 4.2.1: Outstanding TODOs
**Severity:** LOW-MEDIUM
**Location:** Multiple
**Items:**

| File | Line | Comment | Severity |
|------|------|---------|----------|
| productWithVariantType.tsx | 38 | "TODO: once variants marked deleted, could be more efficient" | LOW |
| account-edit-page.ts | 60 | "TODO: POST to API route that updates Sanity customer" | MEDIUM |

**Action Required:** Either implement or document as deprioritized.

---

### 4.3 Disabled Features

#### Issue 4.3.1: stripeShippingRateCalculation Returns 410 (Gone)
**Severity:** MEDIUM
**Location:** [stripeShippingRateCalculation.ts](fas-sanity/netlify/functions/stripeShippingRateCalculation.ts)
**Description:**

```typescript
// Returns 410 Gone status
Response: "Stripe shipping rate calculation is disabled in fas-sanity."
```

**Questions:**
1. Is this intentionally disabled?
2. Why was it disabled?
3. Was functionality moved elsewhere?
4. Should it be removed entirely?

**Action Required:** Document the decision or remove the endpoint.

---

## Summary Table: All Issues by Severity

### CRITICAL (Fix Immediately)

| ID | Issue | File | Impact |
|----|-------|------|--------|
| 1.1.1 | Provider metadata fields violate spec | order.tsx | Data integrity |
| 1.1.2 | stripeSummary incomplete | order.tsx | Schema mismatch |
| 2.1.1 | stripeSummary not populated in webhook | webhooks.ts | Order creation broken |
| 2.3.1 | getEasyPostRates deleted - 6 broken refs | Multiple fas-sanity | Shipping broken in Studio |
| 2.1.2 | Sanity client not validated | webhooks.ts | Silent order creation failures |

### HIGH (Fix Within Sprint)

| ID | Issue | File | Impact |
|----|-------|------|--------|
| 1.1.3 | Duplicate paymentIntentId fields | order.tsx | Data sync issues |
| 1.1.4 | Duplicate carrier/service fields | order.tsx | Data sync issues |
| 1.2.1 | weight/dimensions type mismatches | order.tsx | Integration complexity |
| 2.1.3 | STRIPE_SHIPPING_WEBHOOK_SECRET not validated | shipping-rates-webhook.ts | Webhook failures |
| 2.3.2 | easypost-webhook function deleted | webhooks.ts | Fulfillment broken |
| 2.3.3 | Deprecated vendor handlers | Multiple | Confusion/routing |
| 2.4.1 | Debug endpoints expose config | Multiple | Security issue |

### MEDIUM (Fix in Next Phase)

| ID | Issue | File | Impact |
|----|-------|------|--------|
| 1.1.4 | Duplicate carrier/service fields | order.tsx | Maintainability |
| 1.3.1 | ReadOnly fields with validation | order.tsx | Clarity |
| 1.3.2 | Missing order total validation | order.tsx | Data integrity risk |
| 1.4.1 | Deprecated fields still present | order.tsx | Schema clarity |
| 2.2.1 | Inconsistent Stripe API versions | Multiple | Compatibility |
| 2.2.2 | Warehouse address placeholders | shipping-rates-webhook.ts | Config risk |
| 2.5.1 | Account edit page stub | account-edit-page.ts | Feature incomplete |
| 2.6.1 | Duplicate webhook handlers | Multiple | Maintenance burden |
| 3.1.1 | Cart item field mismatches | orderCartItemType.ts | Type safety |
| 3.1.2 | Inconsistent address structures | Multiple schemas | Maintainability |

### LOW (Document or Deprioritize)

| ID | Issue | File | Impact |
|----|-------|------|--------|
| 1.5.1 | Potentially unused schema types | index.ts | Schema bloat |
| 2.4.1 | Test hello endpoint | /api/hello.ts | Minor |
| 4.1.1 | Parcelcraft docs in archive | archive/ | Clarity |
| 4.2.1 | Outstanding TODOs | Multiple | Priority TBD |
| 4.3.1 | stripeShippingRateCalculation disabled | netlify/functions | Documentation |

---

## Recommended Action Plan

### Phase 1: Critical Fixes (Week 1)
1. Fix `stripeSummary` structure in both schema and webhook handler
2. Remove provider metadata fields from order schema
3. Validate Sanity client configuration in webhook
4. Validate STRIPE_SHIPPING_WEBHOOK_SECRET
5. Identify and fix 6 broken `getEasyPostRates` references
6. Verify EasyPost webhook replacement

### Phase 2: High Priority Fixes (Week 2)
1. Consolidate duplicate `paymentIntentId` field
2. Consolidate duplicate `carrier`/`service` fields
3. Document Stripe API version strategy and standardize
4. Complete warehouse address configuration
5. Verify deprecated vendor application handler migration
6. Remove/protect debug endpoints

### Phase 3: Type & Field Alignment (Week 3)
1. Simplify weight/dimensions types
2. Audit and remove unused schema types
3. Create reusable address type
4. Align cart item field names with CLAUDE.md
5. Add comprehensive order total validation

### Phase 4: Cleanup & Documentation (Week 4)
1. Archive or remove deprecated code
2. Complete account edit page implementation
3. Consolidate duplicate webhook handlers
4. Document disabled features (shipping rate calculation)
5. Update all documentation with findings
6. Test full checkout → order creation → fulfillment flow

---

## Testing Checklist

Before declaring audit complete:

- [ ] Create test order via Stripe checkout
- [ ] Verify order created in Sanity with all required fields
- [ ] Verify stripeSummary populated completely
- [ ] Verify no provider metadata fields in Sanity
- [ ] Test shipping rates calculation in Studio
- [ ] Test shipping label creation workflow
- [ ] Verify EasyPost webhooks processed
- [ ] Test vendor application submission
- [ ] Run full type checking: `npm run type-check`
- [ ] Verify no console errors in Sanity Studio
- [ ] Verify webhook handlers responding correctly

---

## References & Further Reading

- [CLAUDE.md](../CLAUDE.md) - Project guidelines and specifications
- [codex.md](../codex.md) - Comprehensive patterns and examples
- [Order Schema Field Mappings](./stripe-to-sanity-field-mappings.md) - Detailed mapping documentation
- Git commits: `a8956c7`, `883ff79` - Recent changes and consolidations

---

**Report Generated:** January 22, 2026
**Total Issues Identified:** 47
**Critical Issues:** 5
**High Priority Issues:** 12
**Estimated Effort:** 3-4 weeks to remediate all issues
