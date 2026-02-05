# FAS Sanity + FAS CMS Fresh — Complete Audit & Fix Plan

**Generated:** January 22, 2026
**Scope:** Deep audit of schema definitions, API integrations, code quality, and system alignment
**Status:** ✅ Ready for approval and implementation

---

## 📋 Documents in This Report

### 1. [complete-reno-audit.md](./complete-reno-audit.md)
**Comprehensive audit of all 47+ issues across both repositories**

- **Part 1:** FAS-Sanity schema audit (Critical violations, type mismatches, validation gaps, deprecated fields)
- **Part 2:** FAS-CMS-Fresh API audit (Integration issues, environment config, broken references, unimplemented features)
- **Part 3:** Cross-repo alignment issues (Field mapping mismatches, payment status issues, address inconsistency)
- **Part 4:** Obsolete code & cleanup (Deprecated components, TODOs, dead code indicators)

**Use this to understand:**
- What's broken or misaligned
- Why each issue matters
- Which repository is affected

---

### 2. [final_easypost-stripe_fix.md](../prompts/codex-enf/final_easypost-stripe_fix.md)
**Strategic phased fix plan (Phases 0-6) + 17-gap addendum**

- **Phase 0:** Decision framework (what must be locked before implementation)
- **Phase 1:** Stop-the-Bleeding (security + correctness)
- **Phase 2:** Restore internal/admin shipping (Sanity Studio)
- **Phase 3:** Make order persistence robust (webhook validation)
- **Phase 4:** Address schema "quality" issues (without breaking codex rules)
- **Phase 5:** Cleanup + documentation alignment
- **Phase 6:** End-to-end regression testing

**Plus: Addendum covering 17 gaps** (A-Q) not fully addressed in Phases 1-6, including:
- Missing decision points
- Vague acceptance criteria
- Unspecified implementations
- Test scenarios not yet covered

**Use this to:**
- Understand the full remediation roadmap
- Know what gets built in which phase
- See how issues map to phases
- Understand trade-offs and risks

---

### 3. [PHASE_0_DECISION_RECORD.md](./PHASE_0_DECISION_RECORD.md) ⭐ **START HERE**
**Four critical decisions that unlock Phases 1-6**

This is an **Architecture Decision Record (ADR-0001)** that locks:

1. **paymentStatus enumeration mismatch** (Keep 7 values; update docs)
2. **Order creation logic** (Collapse-to-pending is intentional; document it)
3. **Stripe field caching** (Non-authoritative metadata; add guards)
4. **Address normalization** (Helper layer instead of schema change)

**Each decision includes:**
- Rationale (why this is the correct call)
- What it unlocks
- Action items (what gets implemented)
- Lock status (✅ LOCKED)

**Use this to:**
- Understand the Phase 0 decision framework
- Know which decisions must be approved before implementing
- See the rationale behind each call
- Reference back to these decisions during implementation

---

### 4. [PHASE_0_APPROVAL_CHECKLIST.md](./PHASE_0_APPROVAL_CHECKLIST.md) ⭐ **FILL THIS OUT NEXT**
**Approval checklist for all four Phase 0 decisions**

A practical checklist where you confirm:
- [ ] Do you approve Decision 1 (paymentStatus enum)?
- [ ] Do you approve Decision 2 (collapse-to-pending)?
- [ ] Do you approve Decision 3 (Stripe cache fields)?
- [ ] Do you approve Decision 4 (address helper)?

**Use this to:**
- Sign off on Phase 0 decisions
- Flag any decisions that need discussion
- Provide evidence of approval before starting Phase 1
- Handle exceptions or changes to recommendations

---

## 🚀 Getting Started: The Next 3 Steps

### Step 1: Review Phase 0 Decisions (30 min)
1. Read [PHASE_0_DECISION_RECORD.md](./PHASE_0_DECISION_RECORD.md)
2. Understand why each of the four decisions is recommended
3. Ask yourself: "Does this match my intent?"

### Step 2: Approve or Discuss (30 min)
1. Fill out [PHASE_0_APPROVAL_CHECKLIST.md](./PHASE_0_APPROVAL_CHECKLIST.md)
2. Mark ✅ for approved decisions
3. Mark 🔄 "Discuss" if you have questions
4. Mark 🔁 "Change" if you want a different approach

### Step 3: Proceed to Phase 1 (or resolve decisions)
- **If all approved:** You're ready. Start Phase 1 immediately.
- **If decisions need discussion:** Schedule sync to clarify before Phase 1.
- **If decisions need changes:** Update ADR-0001, notify team, then start Phase 1.

---

## 📊 Issue Summary by Severity

From `complete-reno-audit.md`:

| Severity | Count | Examples | Phase(s) |
|----------|-------|----------|---------|
| **CRITICAL** | 5 | stripeSummary incomplete, provider metadata violation, 6 broken function refs, silent webhook failures, Sanity client not validated | 1, 2, 3 |
| **HIGH** | 12 | Duplicate fields, type mismatches, webhook secret not validated, debug endpoints exposed, deprecated handlers, EasyPost webhook missing | 1, 2, 3 |
| **MEDIUM** | 18 | ReadOnly validation, missing total validation, deprecated fields, inconsistent API versions, warehouse placeholders, duplicate webhooks, field mismatches | 1, 2, 4, 5 |
| **LOW** | 9+ | Unused schema types, TODOs, placeholder endpoints, stale docs | 4, 5 |

**Total Issues:** 47+

---

## 🔗 How Issues Map to Phases

### Phase 0: Decisions (Blocking)
- Sets the direction for all downstream phases
- Must be locked before Phase 1 begins
- See: PHASE_0_DECISION_RECORD.md

### Phase 1: Stop-the-Bleeding (Security + Correctness)
- Addresses: 2.1.3, 2.2.2, 1.1.4, 2.4.1 (CRITICAL/HIGH)
- Removes secrets, validates env vars, fixes rate ID collision, enforces permissions

### Phase 2: Restore Internal/Admin Shipping
- Addresses: 2.3.1, 2.3.2, 2.3.3 (CRITICAL/HIGH)
- Fixes 6 broken Studio function calls, restores EasyPost webhook, consolidates vendor handlers

### Phase 3: Make Order Persistence Robust
- Addresses: 2.1.2, 1.1.2 / 2.1.1, 2.6.1 (CRITICAL/HIGH/MEDIUM)
- Validates Sanity client, completes stripeSummary, consolidates duplicate webhooks

### Phase 4: Address Schema "Quality" Issues (No Schema Changes)
- Addresses: 1.1.1, 1.1.3, 1.1.4, 1.2.1, 1.3.1, 1.3.2, 1.4.1, 1.5.1 (HIGH/MEDIUM/LOW)
- Treats schema as truth, updates documentation, adds guardrails
- Introduces address normalization helper (Decision 4)

### Phase 5: Cleanup + Documentation Alignment
- Addresses: 4.1.1, 4.1.2, 2.5.1, 4.3.1 (LOW/MEDIUM)
- Updates stale docs, removes/archives deprecated code, finishes unimplemented features

### Phase 6: End-to-End Regression Testing
- Validates all fixes work together
- Tests checkout → shipping → order creation → fulfillment flow

---

## 📖 Cross-Reference: Audit Issues → Decision Record

If you're looking at a specific audit finding and want to know what to do about it:

| Audit Finding | Related Decision | Phase | Action |
|---------------|------------------|-------|--------|
| paymentStatus enum mismatch (1.2.2) | Decision 1 | 0 | ✅ Locked: Keep 7 values |
| Order status collapse logic (3.2.1) | Decision 2 | 0 | ✅ Locked: Intentional design |
| stripePriceId/stripeProductId (3.1.1) | Decision 3 | 0 | ✅ Locked: Non-authoritative cache |
| Address inconsistency (3.1.2) | Decision 4 | 0 | ✅ Locked: Helper layer |
| Provider metadata violation (1.1.1) | Decision 1 framework | 4.1 | Document in CLAUDE.md |
| stripeSummary incomplete (1.1.2, 2.1.1) | Decision 2 framework | 3.2 | Reconcile spec vs code |
| Warehouse address placeholders (2.2.2) | Gap E | 1.3 | Require warehouse env vars |
| getEasyPostRates deleted refs (2.3.1) | Gap H | 2.1 | Restore function or update callers |

---

## ✅ Verification Checklist Before Starting Phase 1

Before you approve Phase 0 and start Phase 1, confirm:

- [ ] I've read PHASE_0_DECISION_RECORD.md
- [ ] I understand why each of the 4 decisions is recommended
- [ ] I've filled out PHASE_0_APPROVAL_CHECKLIST.md
- [ ] All four decisions are marked ✅ Approved (or noted for discussion)
- [ ] I understand the issue counts and severity distribution
- [ ] I've reviewed the Phase 1-6 roadmap and it makes sense
- [ ] I'm ready to proceed or I've scheduled a sync to resolve decisions

---

## 📝 Governance Notes

**These documents should be:**
- Checked into version control (already done)
- Referenced in future code reviews
- Updated if decisions change (create ADR-0002, etc.)
- Shared with the team before implementation begins
- Used as a runbook during and after implementation

**Related Governance Docs:**
- [`CLAUDE.md`](../../CLAUDE.md) — Project guidelines (these decisions help clarify CLAUDE.md)
- [`codex.md`](../../codex.md) — Comprehensive patterns and examples
- [`.docs/CONTRACTS/`](../../.docs/CONTRACTS/) — Service workflows (being updated in Phase 5)

---

## 🎯 Success Criteria (Full Audit Completion)

When all phases complete, you should have:

✅ No silent failures in webhook processing
✅ Provider metadata only where appropriate (not in Sanity)
✅ All functions called still exist (no broken references)
✅ Consistent address handling across repos
✅ Validated configurations at startup
✅ Complete Stripe summary for orders
✅ Robust error handling and logging
✅ Updated governance docs reflecting actual behavior
✅ Full end-to-end checkout → order → fulfillment flow works
✅ Mobile + desktop checkout tested

---

## 📞 Questions or Changes?

If you need to:
- **Discuss a Phase 0 decision:** See the checklist notes in PHASE_0_APPROVAL_CHECKLIST.md
- **Understand an issue:** Cross-reference complete-reno-audit.md
- **Find the fix for an issue:** See final_easypost-stripe_fix.md and the Phase it's in
- **Change a decision:** Update ADR-0001 and notify the team

---

**Generated by:** Deep repository audit + strategic gap analysis
**Last Updated:** January 22, 2026
**Status:** ✅ Ready for review and approval
