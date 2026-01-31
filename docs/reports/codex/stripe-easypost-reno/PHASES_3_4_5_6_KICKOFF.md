# Phases 3-6 Kickoff Prompts (Skeleton Structure)

---

## Phase 3: Make Order Persistence Robust (Stripe → Sanity)

**PREREQUISITE:** Phase 2 complete

**Scope:** Remove silent failures in webhook processing

### Phase 3 Tasks

**Task 3.1:** Validate Sanity client configuration at webhook entry
- Add explicit checks for projectId, dataset, token
- Fail fast with clear error messages
- Files: `fas-cms-fresh/src/pages/api/webhooks.ts`

**Task 3.2:** Resolve stripeSummary field completeness
- Compare schema definition vs webhook persistence
- Either: update webhook to write missing fields OR update docs to match schema
- Reconcile amountDiscount, paymentCaptured, paymentCapturedAt, webhookNotified
- Decision framework: See PHASE_0_DECISION_RECORD.md § Decision 2

**Task 3.3:** Consolidate duplicate webhook implementations
- Remove or hard-disable non-canonical webhook
- Only one implementation should be maintained
- Files: `fas-cms-fresh/src/pages/api/webhooks.ts` vs `netlify/functions/stripe-webhook.ts`

### Phase 3 Outputs

- Modified webhook handler
- Phase 3 Verification Report
- Recommendation to proceed to Phase 4

---

## Phase 4: Address Schema "Quality" Issues (No Schema Changes)

**PREREQUISITE:** Phase 3 complete

**Scope:** Resolve schema-related findings without changing schema (codex.md default)

### Phase 4 Tasks

**Task 4.1:** Address provider metadata fields (audit 1.1.1)
- Update CLAUDE.md to document why Stripe/EasyPost fields exist in schema
- Explain them as operational/audit metadata, not authority
- Keep as-is (no schema changes)

**Task 4.2:** Consolidate duplicate fields (paymentIntentId, carrier/service)
- Establish canonical field for reads
- Continue writing both for backwards compatibility
- Add backfill script to keep historical docs consistent

**Task 4.3:** Enforce amount field validation
- totalAmount = subtotal + tax + shipping - discount
- amountDiscount ≤ amountSubtotal
- amountTax ≥ 0, amountShipping ≥ 0
- Add programmatic validation in webhook handler

**Task 4.4:** Build address normalization helper (Decision 4 from Phase 0)
- Create `fas-sanity/lib/address.ts` with `normalizeAddress()` function
- Handle Stripe, Sanity, and legacy address formats
- Use in webhook, Studio components, EasyPost calls
- Add unit tests

**Task 4.5:** Implement migration scripts for deprecated fields
- `backfill-deprecated-address-fields.ts`
- `backfill-deprecated-tracking-fields.ts`
- `remove-deprecated-fields.ts` (future, post-approval)

**Task 4.6:** Audit and document unused schema types
- Verify which document types are actually used
- Archive or remove truly unused types
- Document decisions in governance

### Phase 4 Outputs

- Updated CLAUDE.md § schema decisions
- Address normalization helper + tests
- Migration scripts for deprecated fields
- Phase 4 Verification Report
- Recommendation to proceed to Phase 5

---

## Phase 5: Cleanup + Documentation Alignment

**PREREQUISITE:** Phase 4 complete

**Scope:** Remove confusion, update stale docs, finish unimplemented features

### Phase 5 Tasks

**Task 5.1:** Update stale contracts and governance docs
- `.docs/CONTRACTS/order-shipping-snapshot.md` (still describes Parcelcraft)
- `.docs/CONTRACTS/service-workflows.md`
- `.docs/CONTRACTS/shipping-provider-boundaries.md`
- Remove Parcelcraft references; document EasyPost flow
- Update CLAUDE.md with all Phase 0-4 decisions

**Task 5.2:** Remove or archive deprecated scripts and endpoints
- Remove `/api/hello.ts` (development artifact)
- Protect `/api/debug.ts` behind dev-only guards
- Protect `/api/stripe/debug-checkout-session.ts`
- Ensure not deployed in production builds

**Task 5.3:** Implement account edit page (complete the stub)
- Create `fas-cms-fresh/src/pages/api/customer/update.ts`
- Endpoint: POST /api/customer/update
- Auth: Bearer token validation
- Whitelist updatable fields: firstName, lastName, email, phone, etc.
- Add integration test

**Task 5.4:** Document intentional disablement of stripeShippingRateCalculation
- Keep returning 410 (if intentional)
- Document in runbook where rate calculation happens now
- Add to `.docs/CONTRACTS/shipping-provider-boundaries.md`

### Phase 5 Outputs

- Updated `.docs/CONTRACTS/` files
- Account update API endpoint + tests
- Phase 5 Verification Report
- Recommendation to proceed to Phase 6

---

## Phase 6: End-to-End "Green Board" Regression Suite

**PREREQUISITE:** Phase 5 complete

**Scope:** Validate all fixes work together in production flow

### Phase 6 Tasks

**Task 6.1:** Test checkout + shipping rates (storefront)
- Create test session with shipping required
- Verify rates appear (no errors)
- Select rate and complete payment
- Confirm order created in Sanity
- Script: `fas-cms-fresh/scripts/create-test-checkout-with-shipping.ts`

**Task 6.2:** Test order creation + persistence (back-office)
- Replay Stripe webhook locally
- Verify all fields persisted correctly
- Check stripeSummary completeness
- Verify totals reconcile
- Script: `fas-sanity/scripts/stripe-maintenance/test-webhook.js`

**Task 6.3:** Test Studio internal shipping workflows
- Confirm restored getEasyPostRates endpoint works
- Confirm label creation still works
- Confirm tracking updates via EasyPost webhook
- Manual test in Studio UI

**Task 6.4:** Test mobile checkout (responsive)
- iOS Safari + Android Chrome mobile viewports
- Verify rates load without JS errors
- Verify shipping address can be changed
- Script: Playwright with mobile viewport

**Task 6.5:** End-to-end workflow test
- Complete user journey: add product → select shipping → complete checkout → verify order → create label → receive tracking update
- Verify no console errors in any step
- Verify Sanity order has all required fields
- Verify EasyPost metadata is correct

### Phase 6 Outputs

- Regression test suite results
- Phase 6 Completion Report: "GREEN BOARD" ✅
- Summary of all fixes applied (Phase 1-6)
- Known issues or caveats (if any)

---

## Progression Through Phases 3-6

After Phase 2 completes, use this structure for each subsequent phase:

```
Phase 3:
"I'm ready for Phase 3.
Reference: docs/reports/PHASES_3_4_5_6_KICKOFF.md
Tasks: 3.1 (Sanity client validation), 3.2 (stripeSummary), 3.3 (duplicate webhooks)
Begin with Task 3.1"

Phase 4:
"Phase 3 complete. Ready for Phase 4.
Reference: docs/reports/PHASES_3_4_5_6_KICKOFF.md
Tasks: 4.1-4.6 (address normalization, validation, migrations)
Begin with Task 4.1"

Phase 5:
"Phase 4 complete. Ready for Phase 5.
Reference: docs/reports/PHASES_3_4_5_6_KICKOFF.md
Tasks: 5.1-5.4 (docs, endpoints, cleanup)
Begin with Task 5.1"

Phase 6:
"Phase 5 complete. Ready for Phase 6.
Reference: docs/reports/PHASES_3_4_5_6_KICKOFF.md
Tasks: 6.1-6.5 (end-to-end regression testing)
Begin with Task 6.1"
```

---

## Cross-Phase Dependencies

```
Phase 1 (Security + Correctness)
        ↓
Phase 2 (Studio Shipping) ← Depends on Phase 1
        ↓
Phase 3 (Webhook Robustness) ← Depends on Phase 2
        ↓
Phase 4 (Schema Alignment) ← Depends on Phase 3
        ↓
Phase 5 (Cleanup) ← Depends on Phase 4
        ↓
Phase 6 (Regression Testing) ← Depends on Phase 5
        ↓
✅ COMPLETE
```

**Do NOT skip phases or run in parallel.** Each phase builds on the previous one.

---

## Metrics for "Phase X Complete"

Each phase is complete when:

✅ All tasks executed in order
✅ All acceptance criteria met
✅ All verification scripts pass
✅ Phase X Completion Report generated
✅ No blockers or TBDs remain
✅ Recommendation given to proceed to next phase (or declare "DONE" after Phase 6)

---

## Questions or Issues During Phases 3-6?

Reference:
- `PHASE_0_DECISION_RECORD.md` for architectural decisions
- `final_easypost-stripe_fix.md` for full task details
- `complete-reno-audit.md` for context on each issue

---

**Status:** Ready (pending Phase 2 completion)
**Full Roadmap:** 6 sequential phases, ~2-3 weeks estimated (depends on team size)
**Success Criteria:** All phases complete, all tests pass, "GREEN BOARD" achieved in Phase 6
