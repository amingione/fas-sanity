# Phase 2 Kickoff Prompt — Restore Internal/Admin Shipping

**PREREQUISITE:** Phase 1 must be complete and verified. See: `PHASE_1_KICKOFF_PROMPT.md`

---

## Phase 2 Scope: Restore Internal/Admin Shipping (Sanity Studio) Without Breaking Checkout Boundaries

This phase fixes broken Studio references and ensures EasyPost webhook continuity.

---

## Phase 2 Tasks (3 subtasks, execute in order)

### Task 2.1: Fix the 6 broken Studio references to `/.netlify/functions/getEasyPostRates`

**Issue:** `getEasyPostRates` function was deleted; 6 files in fas-sanity still call it

**Affected files:**
1. `packages/sanity-config/src/schemaTypes/documentActions/getShippingRates.tsx`
2. `packages/sanity-config/src/components/EasyPostServiceInput.tsx`
3. `packages/sanity-config/src/components/wizard/steps/StepRates.tsx`
4. `packages/sanity-config/src/components/ShippingQuoteDialog.tsx`
5. `packages/sanity-config/src/schemaTypes/documents/shippingLabelComponents.tsx`
6. `packages/sanity-config/src/schemaTypes/documents/shippingOption.ts`

**Fix approach (choose one per user feedback):**
- **Option A (recommended):** Re-introduce `netlify/functions/getEasyPostRates.ts` as backwards-compatible wrapper
- **Option B:** Update all 6 files to call new endpoint directly

**Acceptance criteria:**
- Studio "Get Shipping Rates" action works without errors
- ShippingQuoteDialog loads rates and displays them
- Label preview calculates rates correctly

**Verification:**
- Manual (Studio): Open affected UI flows; confirm rates appear
- Script: `fas-sanity/scripts/shipping/test-get-easypost-rates-endpoint.ts`

---

### Task 2.2: Restore EasyPost webhook continuity (prevent lost tracking updates)

**Issue:** EasyPost webhook endpoint path may be misconfigured in EasyPost Dashboard

**Affected files:**
- `netlify/functions/easypostWebhook.ts` (exists)
- May need alias: `netlify/functions/easypost-webhook.ts`

**Fix:**
1. Create alias if path mismatch exists:
   ```typescript
   // netlify/functions/easypost-webhook.ts
   import { handler as easypostWebhookHandler } from './easypostWebhook';
   export const handler = easypostWebhookHandler;
   ```
2. Confirm EasyPost Dashboard webhook URL points to correct production endpoint

**Acceptance criteria:**
- EasyPost webhook deliveries succeed (no 404)
- Label/tracker update events result in order updates in Sanity

**Verification:**
- Manual: Check Netlify logs for webhook handler hits
- Script: `fas-sanity/scripts/shipping/verify-easypost-webhook-routing.ts` (if replay possible)

---

### Task 2.3: Complete/verify vendor application migration (remove ambiguous routing)

**Issue:** Two deprecated vendor handlers remain in fas-sanity; canonical should be fas-cms-fresh only

**Affected files:**
- `fas-sanity/netlify/functions/submitVendorApplication.ts` (deprecated)
- `fas-sanity/netlify/functions/vendor-application.ts` (deprecated)
- `fas-cms-fresh/src/pages/api/vendor-application.ts` (canonical)

**Fix:**
1. Verify fas-cms-fresh handler is canonical and working
2. Make fas-sanity endpoints respond with 410 + clear message **OR** proxy to canonical endpoint
3. Document in governance which endpoint is canonical

**Acceptance criteria:**
- Only one vendor application endpoint is "live" for real traffic
- Legacy endpoints cannot silently accept requests

**Verification:**
- Script: `fas-sanity/scripts/vendor/verify-vendor-application-routing.ts`

---

## Execution Instructions

1. Work through Tasks 2.1 through 2.3 in order
2. For each task, follow the standard flow:
   - Read affected files
   - Make minimal specified changes
   - Test acceptance criteria
   - Document findings
3. Create Phase 2 completion report

## Expected Outputs

1. Modified files (git diffs)
2. Phase 2 Verification Report with:
   - Issues resolved (2.3.1, 2.3.2, 2.3.3)
   - Test results
   - Any blockers
   - Recommendation to proceed to Phase 3

## Next Phase

When complete, you will be asked to begin Phase 3 (Make Order Persistence Robust).

---

**Status:** Ready (pending Phase 1 completion)
**Reference:** See `final_easypost-stripe_fix.md` § Phase 2 for full details
