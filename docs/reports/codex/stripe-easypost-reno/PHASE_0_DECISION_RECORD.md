# Phase 0 Decision Record (ADR-0001)

**Date:** January 22, 2026
**Status:** LOCKED (Ready for implementation)
**Authority:** Technical review of complete-reno-audit.md findings + final_easypost-stripe_fix.md Phase 0 gaps

---

## Four Critical Decisions That Unblock All Subsequent Phases

### Decision 1️⃣: paymentStatus Enumeration (Audit 1.2.2 / Gap A)

**The Question:**
Schema defines 7 payment status values; CLAUDE.md spec lists 4. Should we remove the extra 3?

**Options Considered:**
- **Option A (Remove them):** Clean up to match spec. Risk: requires schema migration, historical data audit, unknown downstream impact.
- **Option B (Keep & document):** Treat schema as authoritative. Risk: spec drift, confusion about intent.

**Decision: OPTION B — Keep and document.**

**Rationale:**
1. **You do not yet know why these values exist.** Until a usage audit proves they're dead code, removing them creates unnecessary churn.
2. **Schema is truth under codex.md.** If the schema has 7 values, there's likely a reason.
3. **Removing is a breaking change;** adding later is additive. The asymmetry favors keeping.
4. **The 3 extra values** (`'unpaid'`, `'partially_refunded'`, `'cancelled'`) may be used by:
   - Stripe edge cases (e.g., refunded after partial capture)
   - Invoice workflows (not yet explored)
   - Future payment flows (e.g., installments)

**Action Items:**
- ✅ Update `CLAUDE.md` § Order Schema to explicitly list all 7 values and note: "Not all values are currently written by the webhook. Schema is extended for future-proofing."
- ✅ Add to Phase 4 scripts: `fas-cms-fresh/scripts/stripe/audit-payment-status-usage.ts` — query production orders, report actual distribution of paymentStatus values. Revisit removal decision after audit.
- ✅ Document in `CLAUDE.md` that webhook currently only writes: `'pending'`, `'paid'`, `'failed'`, `'refunded'`.

**Lock Status:** ✅ **LOCKED. Do not remove enum values.**

---

### Decision 2️⃣: Order Creation Logic — Collapse-to-Pending (Audit 3.2.1 / Gap B)

**The Question:**
Why does the webhook do `status: normalizedPaymentStatus === 'paid' ? 'paid' : 'pending'`?
Is this intentional design or a bug?

**Evidence This Is Intentional:**
1. Both webhook implementations (`fas-cms-fresh/src/pages/api/webhooks.ts` and `netlify/functions/stripe-webhook.ts`) use **identical logic**.
2. If it were accidental, one would have drifted already (they're old duplicates).
3. The pattern is **semantically clean:**
   - `order.status` = fulfillment lifecycle state (pending → paid → fulfilled → delivered)
   - `paymentStatus` = payment outcome nuance (paid, failed, refunded, etc.)
   - Separating these two concerns is architecturally sound.

**What This Means:**
- Orders are only "real" when payment succeeds.
- Failed/cancelled/refunded payments do not create terminal order states.
- All payment nuance lives in `paymentStatus`; `order.status` tracks fulfillment readiness.

**Decision: YES, THIS IS INTENTIONAL.**

**Action Items:**
- ✅ Update `CLAUDE.md` § Order Lifecycle to explicitly document:
  ```
  order.status reflects fulfillment readiness, not payment outcome.
  - 'pending' = payment succeeded; ready for fulfillment (or awaiting next action)
  - 'paid', 'fulfilled', 'delivered', etc. track progress through fulfillment

  Payment outcome details live in paymentStatus.
  ```
- ✅ Update webhook code comments:
  ```typescript
  // Order.status represents fulfillment lifecycle.
  // Payment outcome (failed, refunded, etc.) is tracked in paymentStatus.
  // We only create orders when payment succeeds.
  status: normalizedPaymentStatus === 'paid' ? 'paid' : 'pending'
  ```
- ✅ No code changes needed. Logic is correct.

**Lock Status:** ✅ **LOCKED. This is intentional. Document it clearly.**

---

### Decision 3️⃣: Stripe Field Caching in Cart Items (Audit 3.1.1 / Gap D)

**The Question:**
Should `stripePriceId` and `stripeProductId` be in cart items?
Are they authority or cache?

**Current State:**
- Schema has these fields
- They're being populated somewhere
- They violate the "provider metadata rule" on first read
- But they could serve a legitimate caching purpose

**Decision: CACHE FOR PERFORMANCE. Treat as non-authoritative metadata.**

**Rationale:**
1. **Caching is valuable.** Avoids repeated Stripe API calls during webhook processing.
2. **Debugging value.** Historical traceability if Stripe IDs change.
3. **Safe to be stale.** Nothing should break if these are missing or outdated.
4. **Schema already has them.** Removing requires migration; keeping requires documentation.

**Critical Guardrail:**
```typescript
// These fields are non-authoritative caches.
// Do NOT make rendering or fulfillment dependent on them.
// If needed, refetch from Stripe API.
stripePriceId?: string;
stripeProductId?: string;
```

**Action Items:**
- ✅ Update `CLAUDE.md` § Cart Item Fields to document:
  ```
  stripePriceId, stripeProductId: Cached from Stripe at order creation.
  Non-authoritative. Provided for debugging and historical reference only.
  Do not make fulfillment logic dependent on these fields.
  ```
- ✅ Add to Phase 3 scripts: `fas-sanity/scripts/order/verify-cart-items-have-no-orphaned-stripe-refs.ts`
  ```
  Check that orders render and fulfill correctly even if:
  - Stripe IDs are missing
  - Stripe IDs are stale (product was deleted/changed)
  ```
- ✅ In webhook handler, mark these as optional/fallback:
  ```typescript
  const cartItem = {
    _type: 'orderCartItem',
    productName: session.lineItems[0].description,
    price: session.lineItems[0].amount / 100,
    // Caches only:
    stripePriceId: session.lineItems[0].price?.id,
    stripeProductId: session.lineItems[0].price?.product,
  }
  ```

**Lock Status:** ✅ **LOCKED. Cache intentionally; document as non-authoritative.**

---

### Decision 4️⃣: Address Normalization Layer — No Schema Change Approach (Audit 3.1.2 / Gap C)

**The Question:**
Address structures are inconsistent across order, customer, invoice, etc.
Should we change the schema or build a normalization layer?

**Option A (Schema change):**
- Pros: Single source of truth
- Cons: Requires migration, high risk, violates codex default, slow

**Option B (Normalization layer):**
- Pros: Immediate, zero-risk, defensive, improves correctness right now
- Cons: Adds a thin layer of indirection

**Decision: OPTION B — Build normalization layer immediately.**

**Why This Is Non-Negotiable:**
You have multiple address producers:
- Stripe checkout (shipping_details.address)
- Sanity Studio (structured fields on order/customer/invoice)
- Admin workflows (various formats)

You have multiple address consumers:
- Fulfillment (EasyPost)
- Label creation
- UI rendering
- Reporting

Without normalization:
- Every consumer reimplements address parsing (bugs in N places)
- Schema change pressure keeps mounting
- Bugs reappear as regressions

With normalization:
- Single canonical transformation logic
- Easy to audit and fix
- No schema changes needed
- Zero risk

**Implementation Pattern:**
```typescript
// fas-sanity/lib/address.ts
export type CanonicalAddress = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
};

export function normalizeAddress(
  input: StripeAddress | SanityAddress | LegacyAddress
): CanonicalAddress {
  // Handle all three formats
  // Return consistent shape
}
```

Use in:
- Webhook persistence: normalize Stripe address before storing
- Studio components: normalize when displaying
- EasyPost calls: normalize before sending
- API responses: normalize before serializing

**Action Items:**
- ✅ Create Phase 3 script: `fas-sanity/scripts/utilities/normalize-address-helper.ts`
  - Implement `normalizeAddress()` function
  - Add unit tests for all three input formats
  - Document assumptions and edge cases
- ✅ Update Phase 3: Use normalizeAddress in webhooks.ts before storing shipping/billingAddress
- ✅ Update Phase 3: Use normalizeAddress in all components that read addresses
- ✅ Add docstring: "Addresses are normalized at intake boundaries for consistency."

**Lock Status:** ✅ **LOCKED. Build helper layer now.**

---

## Summary: Four Decisions Locked

| Decision | Call | Unlock | Risk if Wrong |
|----------|------|--------|---------------|
| **1. paymentStatus enum** | Keep 7 values; document | Clean spec docs | Unnecessary migration |
| **2. Collapse-to-pending** | Intentional design | Add clear comments | Misguided refactoring |
| **3. Stripe fields cache** | Non-authoritative metadata | Guard against deps | Over-reliance on stale data |
| **4. Address normalization** | Helper layer, no schema change | Build immediately | Silent inconsistency bugs |

---

## What Unlocks Next

With these decisions locked, you can now:

1. **Write governance updates** (no more ambiguity)
   - Update `CLAUDE.md` with all four decisions
   - Update `.docs/CONTRACTS/` to reflect intentional design

2. **Begin Phase 1 without second-guessing**
   - All four decisions are documented
   - No "wait, should we reconsider?" moments

3. **Prevent Codex from "fixing" intentional design**
   - If Claude sees `status = normalizedPaymentStatus === 'paid' ? 'paid' : 'pending'` and wants to refactor it, you can point to this ADR

4. **Move implementation forward**
   - Phases 1-6 can proceed with confidence
   - Each phase knows the upstream decisions it depends on

---

## How to Use This Document

**Before starting any phase:**
- Confirm the decisions above match your intent
- If you need to override any decision: document the change, update this ADR, and notify the team

**If decisions need to change later:**
- Create a new ADR (ADR-0002, etc.)
- Document the change and rationale
- Update CLAUDE.md and relevant phase docs

**This ADR is referenced by:**
- Phase 0 checkpoint
- Phase 1-6 when ambiguity arises
- CLAUDE.md updates
- Governance review meetings

---

## Sign-Off

**Technical Authority:** Complete-reno-audit findings + final_easypost-stripe_fix.md Phase 0 gaps analysis
**Status:** LOCKED ✅
**Date:** January 22, 2026
**Approval Required Before Implementation:** YES (confirm all four decisions match your intent)
