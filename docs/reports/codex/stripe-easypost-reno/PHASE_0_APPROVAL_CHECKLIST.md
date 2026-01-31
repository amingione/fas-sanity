APPROVED: ambermin
DATE: 1-22-26

# Phase 0 Approval Checklist

**BEFORE you start Phase 1, confirm all four Phase 0 decisions.**

This checklist ensures you've explicitly approved the direction before implementation begins.

---

## Decision 1: paymentStatus Enumeration

**Recommendation:** Keep all 7 values; update CLAUDE.md to document.

**What This Means:**

- `paymentStatus` will have values: `'pending'`, `'unpaid'`, `'paid'`, `'failed'`, `'refunded'`, `'partially_refunded'`, `'cancelled'`
- Schema is treated as source of truth
- Usage audit script runs in Phase 4
- No schema migration required now

**Questions to Consider:**

- Do you trust that these 7 values exist for a reason?
- Can you live with "spec drift" until usage audit confirms?
- Is removing them later acceptable?

**Approval:**

- [✓] **I approve. Keep the 7 values; update docs.**
- [ ] **I want to discuss this further.**
- [ ] **I want to remove the 3 extra values (requires schema migration).**

---

## Decision 2: Order Creation — Collapse-to-Pending

**Recommendation:** This is intentional design. The webhook correctly does:

```typescript
status: normalizedPaymentStatus === 'paid' ? 'paid' : 'pending'
```

**What This Means:**

- Orders are only "real" when payment succeeds
- Failed/cancelled payments do NOT create terminal order states
- All payment nuance lives in `paymentStatus`
- `order.status` tracks fulfillment readiness only
- This is semantically clean and architecturally sound

**Questions to Consider:**

- Does this order lifecycle make sense for your business?
- Is payment outcome captured sufficiently in `paymentStatus`?
- Do you want to create "failed" orders for reporting purposes?

**Approval:**

- [✓] **I approve. This is the correct design.**
- [ ] **I want to discuss this further.**
- [ ] **I want to change the logic (requires code change + testing).**

---

## Decision 3: Stripe Fields in Cart Items as Cache

**Recommendation:** Keep `stripePriceId` and `stripeProductId` as non-authoritative metadata cache.

**What This Means:**

- These fields are stored for debugging and historical traceability
- They are NOT the source of truth for product information
- Fulfillment must never depend on these fields
- They can be stale or missing without breaking anything
- Guard: Add verification script to ensure orders work even without these IDs

**Questions to Consider:**

- Is debugging/traceability worth keeping these fields?
- Can you guarantee no code path depends on them for authority?
- Is the verification script (Phase 3) acceptable as a safety net?

**Approval:**

- [✓] **I approve. Cache these fields; add guard script.**
- [ ] **I want to discuss this further.**
- [ ] **I want to remove these fields and refetch from Stripe (requires schema migration).**

---

## Decision 4: Address Normalization Helper (No Schema Change)

**Recommendation:** Build a `normalizeAddress()` helper function to handle address inconsistency across documents.

**What This Means:**

- **No schema changes** required
- Single normalization function used by:
  - Webhook persistence
  - Studio components
  - EasyPost calls
  - API responses
- Consistent address handling without migrations
- Immediate fix with zero risk

**Questions to Consider:**

- Does normalizing at intake boundaries feel like the right pattern?
- Can you accept a "thin indirection layer" instead of schema cleanup?
- Is this better than waiting for a schema migration window?

**Approval:**

- [✓] **I approve. Build the helper now.**
- [ ] **I want to discuss this further.**
- [ ] **I want to change the schema instead (requires migration + approval).**

---

## Summary: Ready to Proceed?

**If all four decisions are checked ✅:**
→ You can proceed to **Phase 1** with confidence.

**If any decision is unchecked or marked "discuss":**
→ Schedule a sync to resolve before starting Phase 1.

**If any decision says "I want to change it":**
→ Document the change, update ADR-0001, and notify the team.

---

## Print-Out Form (For Approval Sign-Off)

```
═══════════════════════════════════════════════════════════════

Phase 0 Approval — fas-sanity + fas-cms-fresh EasyPost × Stripe Fix

Date: 1-22-26
Approved by: ambermin

Decision 1 (paymentStatus enum):     √ Approved   ☐ Discuss   ☐ Change
Decision 2 (Collapse-to-pending):    √ Approved   ☐ Discuss   ☐ Change
Decision 3 (Stripe cache fields):    √ Approved   ☐ Discuss   ☐ Change
Decision 4 (Address normalization):  √ Approved   ☐ Discuss   ☐ Change

Notes / Exceptions:
  Updates were made to phase 1.
  APPROVAL NOW GRANTED AFTER UPDATES.

Signature: Amber Mingione

═══════════════════════════════════════════════════════════════
```

---

## What Happens Next

**If all approved:**

1. File this checklist as evidence of decision lock
2. Reference PHASE_0_DECISION_RECORD.md in Phase 1 kickoff
3. Begin Phase 1 (Stop-the-Bleeding) immediately
4. Each subsequent phase references back to these decisions

**If discussion needed:**

1. Note the specific question that needs clarification
2. Schedule sync with stakeholders
3. Update ADR-0001 with the new decision
4. File amended checklist
5. Then proceed to Phase 1

---

**Location:** `docs/reports/PHASE_0_APPROVAL_CHECKLIST.md`
**Status:** APPROVED
