# Final EasyPost × Stripe Fix Plan (fas-sanity + fas-cms-fresh)

**Source audits**
- `docs/reports/complete-reno-audit.md` (47 issues, Jan 22, 2026)
- Codex audit notes from `docs/reports/codex/easypost-reintegration.md` plus follow-up repo scan (Jan 22, 2026)

**Hard constraints (must follow)**
- `codex.md`: schemas are authoritative; **do not change schemas** unless explicitly approved with: **"SCHEMA CHANGE APPROVED"**.
- `codex.md`: EasyPost is the approved provider for dynamic Stripe Checkout rates **and** internal/admin shipping workflows.
- `codex.md`: ShipEngine/ShipStation references are forbidden in code paths (data backups are not a code path).

---

## Phase 0 — Decisions + Single Source of Truth (Do First)

**⚠️ PHASE 0 IS A HARD CHECKPOINT. Phases 1-6 cannot proceed until all Phase 0 decisions are locked.**

See: [PHASE_0_DECISION_RECORD.md](../reports/PHASE_0_DECISION_RECORD.md) (ADR-0001)

### 0.1 Decide the canonical "truth" for order + shipping contracts
The audit report flags multiple "schema violates CLAUDE.md spec" issues. Under `codex.md`, **schema is truth** unless you explicitly approve a schema change.

**Four Critical Decisions (See ADR-0001):**

1. **paymentStatus enumeration** (7 values vs 4 in spec)
   - ✅ LOCKED: Keep all 7; update CLAUDE.md to document.
   - Risk avoided: Unnecessary schema migration.

2. **Order creation logic** (collapse non-paid to pending)
   - ✅ LOCKED: Intentional design; add code comments.
   - Risk avoided: Misguided refactoring.

3. **Stripe fields in cart items** (stripePriceId, stripeProductId)
   - ✅ LOCKED: Non-authoritative cache; guard against dependencies.
   - Risk avoided: Over-reliance on stale data.

4. **Address normalization** (inconsistent shapes across docs)
   - ✅ LOCKED: Build helper layer now (no schema change).
   - Risk avoided: Silent inconsistency bugs in N places.

**Output of this step:**
- ✅ **PHASE_0_DECISION_RECORD.md** documents all four decisions, rationale, and action items.
- ✅ Stripe event ingestion + order creation authority clarified (Sanity → fas-cms-fresh only).
- ✅ What is persisted vs derived: schema defines truth; helpers normalize access patterns.

### 0.2 Pick the canonical Stripe webhook handler (eliminate duplicates)
Audit issue: `fas-cms-fresh` appears to have duplicate webhook handlers:
- `fas-cms-fresh/src/pages/api/webhooks.ts`
- `fas-cms-fresh/netlify/functions/stripe-webhook.ts`

**Decision point (required):**
- Prefer **one** canonical order-creation pipeline (recommended: keep it centralized, then make other endpoints 410/redirect).

**Acceptance criteria**
- Stripe dashboard webhooks point to **exactly one** order-creation endpoint.
- Any secondary implementation is removed, 410’d, or becomes a thin proxy to canonical logic.

**Verification scripts**
- Manual: confirm configured webhook endpoint(s) in Stripe dashboard.
- `fas-sanity`: `pnpm tsx scripts/stripe/run-stripe-audit.ts` (checks webhook health signals; requires Stripe + Netlify CLI access).

---

## Phase 1 — Stop-the-Bleeding (Security + Correctness in Checkout Shipping)

This phase removes immediate production risks and prevents silent data corruption.

### 1.1 Remove secrets and unsafe defaults from examples and UI
**Issues**
- `fas-cms-fresh/.env.example` includes what appears to be a full base64-encoded Google service account private key (must not be in repo).
- `fas-cms-fresh/src/components/checkout/EmbeddedCheckout.tsx` includes a devtools script injection line and a hard-coded `pk_live_...` fallback.

**Fixes**
- Remove any private keys from `.env.example`. If the key is real, rotate immediately.
- Remove `localhost:8097` script injection from `EmbeddedCheckout.tsx`.
- Remove all hard-coded live Stripe publishable key fallbacks; require `PUBLIC_STRIPE_PUBLISHABLE_KEY`.

**Acceptance criteria**
- No private key material or live publishable key fallback is committed.
- Checkout still works when `PUBLIC_STRIPE_PUBLISHABLE_KEY` is set.

**Verification scripts**
- New (repo-local, no secrets): add a “secret scanning” script (see scripts at end of this phase).

### 1.2 Fix shipping webhook secret validation + unify Stripe API versions
**Issues**
- `fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts` constructs the Stripe event without a pre-check for `STRIPE_SHIPPING_WEBHOOK_SECRET` (audit 2.1.3).
- Stripe API version is inconsistent (audit 2.2.1).

**Fixes**
- Validate `STRIPE_SHIPPING_WEBHOOK_SECRET` before `stripe.webhooks.constructEvent`.
- Centralize Stripe API version in a single shared constant used by:
  - `src/pages/api/stripe/create-checkout-session.ts`
  - `src/pages/api/stripe/shipping-rates-webhook.ts`
  - any other Stripe API usage in storefront

**Acceptance criteria**
- Shipping webhook returns a clear 500 error when misconfigured (not a type error).
- All Stripe calls in storefront use the same API version.

**Verification scripts**
- `fas-cms-fresh`: create a minimal “config self-check” endpoint or CLI script to assert required env vars exist (no tokens printed).

### 1.3 Remove “placeholder origin” fallbacks for EasyPost rate calculation
**Issue**
- Shipping origin address uses placeholders if env vars are missing (audit 2.2.2). This causes silent wrong quotes.

**Fix**
- Make origin/warehouse address env vars required (throw/500 if missing).
- Document required values only in `.env.example` (no functional fallbacks).

**Acceptance criteria**
- Rates cannot be calculated with an unknown origin.

**Verification scripts**
- `fas-cms-fresh`: small CLI check that fails if required `WAREHOUSE_*` env vars are missing.

### 1.4 Fix the “`rate_` ID collision” causing wrong `easypostRateId` in Sanity
**Issue discovered in follow-up audit (not covered in the complete report)**
- Storefront dynamic shipping rates generate a synthetic `id` that begins with `rate_` (example: `rate_0_ups_ground`).
- `fas-sanity/netlify/lib/fulfillmentFromMetadata.ts` treats any `shipping_rate_id` that starts with `rate_` as an EasyPost rate ID.
- This can overwrite `order.easypostRateId` with the synthetic Stripe-internal rate ID, instead of the real EasyPost `rate_...` stored in metadata.

**Fixes**
1) In `fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts`, change the returned `shipping_rates[].id` prefix so it can never look like an EasyPost ID (e.g. `dyn_...`, not `rate_...`).
2) In `fas-sanity/netlify/lib/fulfillmentFromMetadata.ts`, only set `easypostRateId` from explicit metadata (`easypost_rate_id`) and never infer it from a non-authoritative `shipping_rate_id` string.

**Acceptance criteria**
- After checkout completes, the Order document stores the real EasyPost `rate_...` (from metadata), not a synthetic dynamic-rate ID.

**Verification scripts**
- `fas-cms-fresh`: `yarn tsx scripts/create-test-checkout-with-shipping.ts` then `yarn tsx scripts/check-shipping-transit-times.ts <sessionId>`
- `fas-sanity`: replay a captured `checkout.session.completed` payload through `pnpm tsx scripts/stripe-maintenance/test-webhook.js <payload.json>` and assert the stored fields match expectations.

### 1.5 Enforce `permissions.update_shipping_details: 'server_only'` (Codex requirement)
**Issue discovered in follow-up audit**
- `fas-cms-fresh/src/pages/api/stripe/create-checkout-session.ts` explicitly avoids setting `permissions`, but `codex.md` requires:
  - `shipping_address_collection` and
  - `permissions.update_shipping_details: 'server_only'`

**Fix**
- Update session creation to comply with `codex.md` without breaking embedded/adaptive pricing flow.
- If Stripe rejects the combination in embedded mode, document the incompatibility and implement the closest compliant configuration (but do not “paper over” by silently ignoring the requirement).

**Acceptance criteria**
- Session creation is codex-compliant or a documented, tested exception is recorded in governance docs.

**Verification scripts**
- Add a session-parameter assert script (see scripts at end of this phase).

### Phase 1 scripts to generate (repo-local; add under `/scripts/`)
If existing scripts are insufficient, add these:

1) `fas-cms-fresh/scripts/security/scan-repo-secrets.ts`
   - Fails CI if any of these appear in tracked files:
     - `-----BEGIN PRIVATE KEY-----`
     - `pk_live_`
     - `sk_live_`
     - `GMC_SERVICE_ACCOUNT_KEY_BASE64=`
2) `fas-cms-fresh/scripts/stripe/assert-checkout-session-params.ts`
   - Given a `cs_...` session ID, retrieves session and asserts:
     - `shipping_address_collection` is present when shipping is required
     - `permissions.update_shipping_details === 'server_only'` (or explicitly reports non-compliance)
     - `ui_mode` matches expected mode

---

## Phase 2 — Restore Internal/Admin Shipping (Sanity Studio) Without Breaking Checkout Boundaries

### 2.1 Fix the 6 broken Studio references to `/.netlify/functions/getEasyPostRates`
**Issue**
- `getEasyPostRates` endpoint was removed, but multiple Studio components/actions still call it (audit 2.3.1), including:
  - `packages/sanity-config/src/schemaTypes/documentActions/getShippingRates.tsx`
  - `packages/sanity-config/src/components/EasyPostServiceInput.tsx`
  - `packages/sanity-config/src/components/wizard/steps/StepRates.tsx`
  - `packages/sanity-config/src/components/ShippingQuoteDialog.tsx`
  - `packages/sanity-config/src/schemaTypes/documents/shippingLabelComponents.tsx`
  - `packages/sanity-config/src/schemaTypes/documents/shippingOption.ts`

**Fix options (choose one)**
- **Option A (recommended: minimal Studio churn):** Re-introduce `netlify/functions/getEasyPostRates.ts` in `fas-sanity` as a backwards-compatible wrapper that calls the current internal quoting implementation (e.g. `getShippingQuoteBySkus`) and returns the response in the legacy shape expected by the Studio UI.
- **Option B:** Update all 6 files to call the new endpoint/contract directly.

**Acceptance criteria**
- Studio “Get Shipping Rates” action works again for invoices/fulfillment workflows.
- `ShippingQuoteDialog` and label preview no longer error.

**Verification scripts**
- Manual (Studio): open affected UI flows; confirm rates appear.
- CLI: add a script that POSTs to the restored endpoint with a known payload and asserts it returns rates.

### 2.2 Restore EasyPost webhook continuity (prevent lost tracking updates)
**Issue**
- Audit claims `easypost-webhook` was deleted (audit 2.3.2). In repo, `netlify/functions/easypostWebhook.ts` exists; the risk is a **path mismatch** (`easypost-webhook` vs `easypostWebhook`) in EasyPost dashboard configuration.

**Fix**
- Add a compatibility alias function `netlify/functions/easypost-webhook.ts` that delegates to `easypostWebhook.ts`, **or** add a Netlify redirect so both URLs work.
- Confirm EasyPost dashboard webhook endpoint points to a live URL that exists in production.

**Acceptance criteria**
- EasyPost webhook deliveries succeed (no 404).
- A label/tracker update event results in the expected order updates in Sanity.

**Verification scripts**
- If you can replay EasyPost events: add a local replay script for `easypostWebhook` using a fixture payload.
- At minimum: Netlify logs check confirming webhook handler hits.

### 2.3 Complete/verify vendor application migration (remove ambiguous routing)
**Issue (audit 2.3.3)**
- Deprecated vendor handlers remain in `fas-sanity`:
  - `fas-sanity/netlify/functions/submitVendorApplication.ts`
  - `fas-sanity/netlify/functions/vendor-application.ts`
- Canonical flow is expected to be in `fas-cms-fresh` (per repo governance docs).

**Fix**
- Confirm which endpoint is deployed and receiving traffic.
- If `fas-cms-fresh` is canonical:
  - Make the `fas-sanity` endpoints respond with 410 + clear error message, **or** proxy/redirect to the canonical endpoint (do not keep two active implementations).
  - Update any docs and UI code that reference the legacy endpoints.

**Acceptance criteria**
- Only one vendor application endpoint is “live” for real traffic.
- Legacy endpoints cannot silently accept requests.

**Verification scripts**
- Add a small log/route audit script that hits both endpoints and ensures only the canonical one returns 200.

### Phase 2 scripts to generate
1) `fas-sanity/scripts/shipping/test-get-easypost-rates-endpoint.ts`
   - Sends a minimal request to `/.netlify/functions/getEasyPostRates` and asserts shape.
2) `fas-sanity/scripts/shipping/replay-easypost-webhook.ts` (optional)
   - Replays a saved EasyPost event payload against the local handler for deterministic testing.
3) `fas-sanity/scripts/vendor/verify-vendor-application-routing.ts`
   - Calls legacy and canonical endpoints in a controlled way and asserts the expected status codes.

---

## Phase 3 — Make Order Persistence Robust (Stripe → Sanity) and Remove Silent Failures

### 3.1 Validate Sanity client configuration at webhook entry
**Issue**
- Audit 2.1.2: webhook can accept request but fail later due to missing Sanity config/token.

**Fix**
- Fail fast when required env is missing, with explicit logs and non-200 response.

**Acceptance criteria**
- Misconfiguration cannot silently “succeed” from Stripe’s perspective.

**Verification scripts**
- Local webhook replay (see `fas-sanity/scripts/stripe-maintenance/test-webhook.js`).
- Netlify webhook audit (`fas-sanity/scripts/stripe/netlify-webhook-audit.ts`).

### 3.2 Stripe summary completeness (resolve the “missing fields” findings safely)
**Issue**
- Audit 1.1.2 / 2.1.1: `stripeSummary` fields may not match spec expectations.

**Fix strategy under `codex.md`**
- First: compare the current schema fields in `packages/sanity-config/src/schemaTypes/documents/order.tsx` with what the webhook writes.
- If it’s purely **spec/doc drift**, update `CLAUDE.md` / governance docs to match schema and current persistence.
- If it’s a **real data gap that the schema already supports**, update webhook to write the missing fields.
- If it requires **schema changes**, stop and require **"SCHEMA CHANGE APPROVED"** before proceeding.

**Acceptance criteria**
- Schema ⇄ webhook data contract is consistent (either via code changes or doc updates).
- Stripe summary is sufficient to debug payment + shipping issues without relying on ad-hoc logs.

**Verification scripts**
- `fas-sanity`: use `scripts/stripe-maintenance/backfill-missing-fields.js` if appropriate for historical orders.
- Add a focused “order contract validator” script (see below).

### 3.3 Consolidate duplicate webhook implementations (storefront)
**Issue**
- Audit 2.6.1: duplicate webhook implementations in `fas-cms-fresh` create divergence risk.

**Fix**
- Remove or hard-disable the non-canonical webhook, or replace it with a delegating wrapper to the canonical handler.

**Acceptance criteria**
- There is exactly one maintained implementation; the other is non-operative and cannot drift.

**Verification scripts**
- Add a grep-based script to fail CI if both webhook implementations remain “active” (e.g. exporting handlers with real logic).

### Phase 3 scripts to generate
1) `fas-sanity/scripts/stripe/validate-order-contract.ts`
   - Queries recent orders and asserts required fields exist and totals reconcile:
     - `totalAmount ≈ amountSubtotal + amountTax + amountShipping - amountDiscount`
     - shipping identifiers (if retained) align with metadata
2) `fas-cms-fresh/scripts/stripe/verify-single-webhook-source.ts`
   - Fails if both `src/pages/api/webhooks.ts` and `netlify/functions/stripe-webhook.ts` appear to be simultaneously “real” handlers.

---

## Phase 4 — Address the Schema “Quality” Issues Without Violating Codex Governance

This phase resolves the schema-related findings in a way that respects “schema is truth”.

### 4.1 Provider metadata fields flagged as violating spec (audit 1.1.1)
**Under codex default**
- Treat schema as authoritative.
- Fix by updating spec/docs (e.g. `CLAUDE.md`) to reflect the persisted fields and explain why each exists (hidden, operational, auditability).

**If you want these removed anyway**
- Requires **"SCHEMA CHANGE APPROVED"**.
- Requires a data migration plan and removing corresponding writer logic and UI dependencies.

### 4.2 Duplicate fields in schema (payment intent ID; carrier/service) (audit 1.1.3 / 1.1.4)
**No schema change route**
- Establish a canonical field for reads in application logic.
- Continue writing both fields for backward compatibility until a scheduled schema change/migration window.
- Add a backfill/migration script to keep historical docs consistent.

### 4.3 weight/dimensions “type mismatch” (audit 1.2.1)
**No schema change route**
- Do not change schema shape.
- Centralize unit conversion and payload-building in a single helper used by:
  - checkout metadata generation
  - internal shipping quote calculation
  - label purchase flows
- Ensure all integrations operate on normalized primitives internally (lbs/inches) and only convert at boundaries.

**Schema change route**
- Requires **"SCHEMA CHANGE APPROVED"** and a migration for historical documents.

### 4.3 Order total validation (audit 1.3.2)
**No schema change route**
- Enforce total reconciliation in webhook code and log + reject mismatches.

**Schema change route**
- Add schema validation rule only after **"SCHEMA CHANGE APPROVED"**.

### 4.4 Address type reuse and weight/dimensions simplification (audit 3.1.2 / 1.2.1)
These are schema-shape changes. Handle only with explicit approval and migration scripts.

### 4.5 ReadOnly fields with validation + deprecated fields + unused schema types (audit 1.3.1 / 1.4.1 / 1.5.1)
**No schema change route**
- Document which fields are system-written only and why schema validation doesn’t run for readOnly fields.
- Add programmatic guards in webhook/mutations to enforce required invariants.

**Schema change route**
- Requires **"SCHEMA CHANGE APPROVED"**:
  - Remove redundant validation on readOnly fields.
  - Remove deprecated fields once all docs migrated.
  - Remove or archive unused schema types after confirming zero usage.

### 4.6 Cart item field mismatches vs spec (audit 3.1.1)
**No schema change route**
- Treat schema fields as canonical.
- Update `CLAUDE.md` and any mapping docs to match real field names and semantics.
- Ensure webhook normalization writes the schema field names consistently (no silent drops).

### Phase 4 scripts to generate
1) `fas-sanity/scripts/migrations/backfill-order-total-integrity.ts`
   - Finds mismatched totals and reports (and optionally patches) with careful safeguards.
2) `fas-sanity/scripts/migrations/backfill-shipping-identifiers.ts`
   - Normalizes orders where shipping identifiers were previously written incorrectly (covers the `rate_` collision aftermath).
3) `fas-sanity/scripts/migrations/audit-schema-type-usage.ts`
   - Emits a report of registered schema types and references in queries/components to identify truly unused types.

---

## Phase 5 — Cleanup + Documentation Alignment (Remove Confusion That Causes Regressions)

### 5.1 Update stale contracts and governance docs that still describe Parcelcraft
**Issue discovered in follow-up audit**
- `.docs/CONTRACTS/order-shipping-snapshot.md` still references Parcelcraft responsibilities and flow.

**Fix**
- Update `.docs/CONTRACTS/order-shipping-snapshot.md` to describe the current EasyPost-driven dynamic shipping webhook and metadata contract.
- Keep archive docs in `docs/archive/` clearly labeled as historical.

### 5.2 Remove or archive deprecated scripts and endpoints
**Issues**
- `fas-cms-fresh/scripts/check-parcelcraft-transit-times.ts` should be renamed/archived if it no longer reflects reality.
- Debug endpoints in `fas-cms-fresh` should be removed or locked down (audit 2.4.1).

**Fix**
- Remove `/api/hello.ts` entirely if unused.
- Protect `/api/debug.ts` and `/api/stripe/debug-checkout-session.ts` behind dev-only guards and/or auth, and ensure they are not deployed in production builds.

### 5.3 Finish the “account edit page” stub (audit 2.5.1)
**Fix**
- Replace the alert-only stub with a real write path:
  - Add an authenticated API route to update the customer document.
  - Validate inputs against schema.
  - Ensure no client-side tokens are exposed.

**Acceptance criteria**
- Customer edits persist and can be reloaded from Sanity.

**Verification scripts**
- Add an API integration test or a script that updates a test customer and then re-queries to confirm.

### 5.4 Document the intentional disablement of `stripeShippingRateCalculation` (audit 4.3.1)
**Fix**
- Keep it disabled (410) if checkout-rate calculation must not live in `fas-sanity`.
- Add a short runbook section explaining:
  - where rate calculation happens now
  - why this endpoint is disabled
  - what to check when rates “disappear”

### Phase 5 scripts to generate
1) `fas-sanity/scripts/docs/verify-no-parcelcraft-in-contracts.sh`
   - Fails if Parcelcraft terms remain in non-archive contract docs.
2) `fas-cms-fresh/scripts/security/assert-no-debug-endpoints-in-prod.ts`
   - Ensures debug endpoints are gated by `NODE_ENV !== 'production'` (or equivalent).
3) `fas-cms-fresh/scripts/customer/test-account-edit-write.ts`
   - Calls the account update API route in a safe test mode and asserts persistence.

---

## Phase 6 — End-to-End “Green Board” Regression Suite (Run Before Declaring Done)

### 6.1 Checkout + shipping rates (storefront)
- Create session: `fas-cms-fresh/scripts/create-test-checkout-with-shipping.ts`
- Verify selected rate: `fas-cms-fresh/scripts/check-shipping-transit-times.ts <sessionId>`
- Ensure products are shippable + metadata is correct: `fas-cms-fresh/scripts/sync-stripe-shipping-metadata.ts` (dry-run first)

### 6.2 Order creation + persistence (back-office)
- Replay Stripe event locally: `fas-sanity/scripts/stripe-maintenance/test-webhook.js <payload.json>`
- Backfill missing Stripe details (if needed): `fas-sanity/scripts/stripe-maintenance/backfill-missing-fields.js`
- Unified webhook health scan: `fas-sanity/scripts/stripe/run-stripe-audit.ts`

### 6.3 Studio internal shipping workflows
- Confirm restored `getEasyPostRates` endpoint works (or updated components do).
- Confirm label creation + tracking updates via EasyPost webhook handler.

**Acceptance criteria**
- A shippable test checkout shows rates, completes payment, creates an order, stores correct shipping metadata, and internal Studio rate/label flows work without console errors.

---

## Cross-audit issue mapping (for tracking)

From `docs/reports/complete-reno-audit.md`:
- CRITICAL: 1.1.1, 1.1.2, 2.1.1, 2.3.1, 2.1.2
- HIGH: 1.1.3, 1.1.4, 1.2.1, 2.1.3, 2.3.2, 2.3.3, 2.4.1
- MEDIUM: 1.3.1, 1.3.2, 1.4.1, 2.2.1, 2.2.2, 2.5.1, 2.6.1, 3.1.1, 3.1.2
- LOW: 1.5.1, 4.1.2, 4.2.1, 4.3.1

Additional issues found in follow-up audit:
- Dynamic shipping rate `id` prefix collision leading to wrong `easypostRateId`
- `permissions.update_shipping_details: 'server_only'` codex requirement not currently enforced in session creation
- Sensitive key material in `fas-cms-fresh/.env.example`
- Unsafe dev artifacts / hard-coded keys in `EmbeddedCheckout.tsx`
- Stale `.docs/CONTRACTS/order-shipping-snapshot.md` still describing Parcelcraft flow

---

## Addendum: Gaps & Under-Addressed Items Not Fully Covered in Phase 0-6

### Gap A: paymentStatus Enumeration Mismatch (Audit 1.2.2) — NO PHASE ASSIGNED

**Issue:** Order schema defines 7 paymentStatus values; CLAUDE.md spec lists only 4.

**Current definition:** `'pending'`, `'unpaid'`, `'paid'`, `'failed'`, `'refunded'`, `'partially_refunded'`, `'cancelled'`

**CLAUDE.md spec:** `'pending'`, `'paid'`, `'failed'`, `'refunded'`

**Questions left unanswered:**
1. Are the 3 extra values (`'unpaid'`, `'partially_refunded'`, `'cancelled'`) actively used or dead code?
2. If unused, should they be removed (requires schema approval) or documented?
3. The webhook handler (webhooks.ts:769) collapses all non-'paid' to 'pending'—is this intentional?

**Missing action:**
- **Decision** (Phase 0.1): Either document these as intentional extensions to CLAUDE.md, or mark as candidates for removal in a future schema update.
- **Verification script** (Phase 4): `fas-cms-fresh/scripts/stripe/audit-payment-status-usage.ts` — search orders in production and report actual usage of each enum value.

---

### Gap B: Order Status Mapping Logic — Unclear Intentional Behavior (Audit 3.2.1)

**Issue (webhooks.ts:769):**
```typescript
status: normalizedPaymentStatus === 'paid' ? 'paid' : 'pending'
```

All failed/cancelled/refunded payments flatten to `'pending'`.

**Question:** Is this intentional (only create orders on success), or should orders be created with status reflecting payment outcome?

**Missing action:**
- **Decision** (Phase 0.1): Confirm this is by design. If yes, document in `CLAUDE.md` that order.status reflects lifecycle, not payment outcome.
- **If change needed:** Requires logic update. Alternatively, track payment failure reason in `paymentStatus` and only let status move to 'pending' → 'paid' progression.

---

### Gap C: Address Field Consistency Across Documents — No "No-Schema-Change" Fallback (Audit 3.1.2)

**Issue:** Address structures are inconsistent across order, customer, invoice, etc. Phase 4.4 defers to schema change approval. **But what if you can't change schema?**

**Missing no-schema-change solution:**
- **Normalization layer** (Phase 3.x): Centralize address parsing/writing in a `normalizeAddress()` helper used by:
  - Webhook handler when storing shipping/billing addresses
  - Studio components when reading/displaying addresses
  - Checkout when collecting addresses from Stripe
- This ensures queries/transforms work consistently even if the underlying schema has varied field names.

**Missing script:**
- `fas-sanity/scripts/utilities/normalize-address-helper.ts` — utility function + unit tests showing address conversion across formats.

---

### Gap D: Cart Item Stripe-Specific Fields (stripePriceId, stripeProductId) — Under-Addressed (Audit 3.1.1)

**Issue:** These fields violate provider metadata rule but are in the schema.

**Current plan (4.1):** Treat schema as truth, document in CLAUDE.md.

**But missing explicit action:**
1. Should webhook handler **stop populating** these fields (no-schema-change approach: leave schema as-is, just don't write them)?
2. Or **continue populating** and document them as integration details?

**Missing decision point (Phase 0.1):**
- Decide: Are `stripePriceId` / `stripeProductId` in cart items a "we'll refetch from Stripe API" field, or a "cached value for performance" field?
- Document in governance: why these are in schema despite violating provider metadata rule.

**Missing verification script (Phase 3):**
- `fas-sanity/scripts/order/verify-cart-items-have-no-orphaned-stripe-refs.ts` — checks that if Stripe product is deleted, orders still render correctly (no dependency on cached IDs).

---

### Gap E: Warehouse Environment Variable Validation — Too Vague (Audit 2.2.2 / Phase 1.3)

**Issue:** Phase 1.3 says "make env vars required," but doesn't specify **which** are required vs. optional.

**Current code (shipping-rates-webhook.ts:68-75):**
```typescript
street1: import.meta.env.WAREHOUSE_ADDRESS_LINE1 || '0000 Main St',  // Fallback
city: import.meta.env.WAREHOUSE_CITY || 'Clermont',                   // Fallback
state: import.meta.env.WAREHOUSE_STATE || 'FL',                       // Fallback
zip: import.meta.env.WAREHOUSE_ZIP || '34711',                        // Fallback
phone: import.meta.env.WAREHOUSE_PHONE || undefined,                  // Optional
email: import.meta.env.WAREHOUSE_EMAIL || undefined,                  // Optional
```

**Missing clarification:**
- **Required:** street1, city, state, zip (for EasyPost to calculate shipping)
- **Optional:** phone, email, street2 (nice-to-have but not required for rate calc)

**Missing action (Phase 1.3 detail):**
```typescript
const REQUIRED_WAREHOUSE_FIELDS = ['WAREHOUSE_ADDRESS_LINE1', 'WAREHOUSE_CITY', 'WAREHOUSE_STATE', 'WAREHOUSE_ZIP'];
const missing = REQUIRED_WAREHOUSE_FIELDS.filter(key => !import.meta.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required warehouse config: ${missing.join(', ')}`);
}
```

---

### Gap F: Sanity API Token Validation — Needs Explicit Check (Audit 2.1.2 / Phase 3.1)

**Issue:** Phase 3.1 mentions "validate projectId/dataset" but doesn't explicitly mention **token** validation.

**Missing action (Phase 3.1 enhancement):**
```typescript
const sanity = createClient({...});

// After creation, add:
const config = sanity.config();
if (!config.token) {
  throw new Error('SANITY_API_TOKEN not configured. Webhook cannot persist orders.');
}
```

---

### Gap G: Deprecated Fields Migration Path — No Concrete Scripts (Audit 1.4.1 / Phase 4.5)

**Issue:** Deprecated fields still in schema:
- `fulfillmentDetails.shippingAddress` (use top-level `shippingAddress` instead)
- `fulfillmentDetails.trackingNumber` (use top-level `trackingNumber` instead)

Phase 4.2 says "continue writing both," but **no migration script planned**.

**Missing scripts (Phase 4 scripts section):**
1. `fas-sanity/scripts/migrations/backfill-deprecated-address-fields.ts`
   - Finds orders with old `fulfillmentDetails.shippingAddress` and copies to top-level
2. `fas-sanity/scripts/migrations/backfill-deprecated-tracking-fields.ts`
   - Finds orders with old `fulfillmentDetails.trackingNumber` and copies to top-level
3. `fas-sanity/scripts/migrations/remove-deprecated-fields.ts` (future, post-approval)
   - After all orders migrated, remove deprecated fields

---

### Gap H: EasyPost Webhook Path Alias — Implementation Ambiguous (Audit 2.3.2 / Phase 2.2)

**Current instruction:** "Add compatibility alias function `netlify/functions/easypost-webhook.ts` that delegates to `easypostWebhook.ts`."

**Missing clarity:**
- Is `easypostWebhook.ts` in the same directory or elsewhere?
- What's the exact delegation pattern?
- Should it re-export or call a handler export?

**Missing explicit implementation (Phase 2.2 detail):**
```typescript
// netlify/functions/easypost-webhook.ts
import { handler as easypostWebhookHandler } from './easypostWebhook';

export const handler = easypostWebhookHandler;
// OR for Netlify Functions pattern:
export default easypostWebhookHandler;
```

Also: **Confirm EasyPost dashboard webhook endpoint URL** is set to the production URL (not localhost, not old path). This should be a checklist item.

---

### Gap I: Stripe Session Metadata Size Risk — Not Monitored (Audit 2.4 / Phase 6)

**Issue (create-checkout-session.ts:1044-1050):**
```typescript
cart: JSON.stringify(cart) // Could exceed Stripe's 50KB metadata limit
```

Plan doesn't address:
1. **No size monitoring.** What if cart gets large?
2. **No fallback strategy.** Does session creation fail gracefully if metadata too large?
3. **No test case.** Regression suite doesn't include "large cart" scenario.

**Missing action (Phase 6.1 enhancement):**
- Add size check before creating session: `if (JSON.stringify(metadataForSession).length > 40000) { throw error }`
- Document in runbook: "If rates stop showing for large carts, check metadata size."

---

### Gap J: Rate Calculation Function Confirmation — Is stripeShippingRateCalculation Truly Moved? (Audit 4.3.1 / Phase 5.4)

**Issue:** `fas-sanity/netlify/functions/stripeShippingRateCalculation.ts` returns 410.

Phase 5.4 says "keep disabled; document where it moved."

**Missing investigation:**
- Is rate calculation **actually** in `fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts`?
- Or was it never moved, just disabled?
- If moved, was all logic migrated (test this in Phase 2)?

**Missing checklist (Phase 2 acceptance criteria):**
```
- [ ] Rate calculation that existed in stripeShippingRateCalculation is now in shipping-rates-webhook.ts
- [ ] All EasyPost calls and Stripe rate generation work identically
- [ ] Historical orders created via old endpoint still match new endpoint rates (within tolerance)
```

---

### Gap K: Amount Field Validation — Only Total Covered (Audit 1.3.2 / Phase 4.3)

**Issue:** Audit flags missing validation on multiple fields:
- `amountDiscount` should be ≤ `amountSubtotal`
- `amountTax` should be ≥ 0
- `amountShipping` should be ≥ 0
- `totalAmount` should match calculation (covered in Phase 4.3)

Phase 4.3 only covers `totalAmount`. Others not addressed.

**Missing detail (Phase 4.3 enhancement):**
Add programmatic validation in webhook:
```typescript
// In webhooks.ts, after calculating amounts:
if (amountDiscount > amountSubtotal) {
  throw new Error(`Discount (${amountDiscount}) exceeds subtotal (${amountSubtotal})`);
}
if (amountTax < 0 || amountShipping < 0) {
  throw new Error('Tax and shipping must be non-negative');
}
```

---

### Gap L: Product-Shipping Metadata Sync — No Validation That Metadata Exists (Phase 6.1)

**Issue:** Regression suite checks that session is created, but doesn't verify that **products in the session have proper shipping metadata** (e.g., weight, dimensions, shipping class).

Without metadata, EasyPost rates will be incomplete/inaccurate.

**Missing verification (Phase 6.1 detail):**
- `fas-cms-fresh/scripts/validate-product-shipping-metadata.ts` — checks that all products in test checkout have weight/dimensions/shippingClass populated in Stripe.

---

### Gap M: Mobile Checkout Testing — Not in Regression Suite (Phase 6)

**Issue:** EmbeddedCheckout component was fixed in Phase 1.1 (removed devtools injection, etc.).

Regression suite tests desktop checkout flow but not **responsive/mobile** behavior.

**Missing (Phase 6.1 detail):**
- Manual testing: "Confirm mobile iOS Safari + Android Chrome can select shipping rates and complete checkout without JavaScript errors."
- Automated: Use Playwright with mobile viewport to test reduced-width session rendering.

---

### Gap N: Multiple Webhook Implementations in fas-sanity (Not Just fas-cms-fresh)

**Current plan (2.3):** Only addresses `fas-sanity` vendor application handlers and `fas-cms-fresh` duplicate webhooks.

**Missing verification:** Are there **other duplicate functions in fas-sanity** that were part of the "consolidation" but not fully removed?

Example: Did `submitVendorApplication.ts` and `vendor-application.ts` have corresponding duplicates elsewhere that might still be active?

**Missing script (Phase 2):**
- `fas-sanity/scripts/audit/find-duplicate-netlify-functions.sh` — fails if multiple versions of critical handlers (webhook, vendor, shipping) exist.

---

### Gap O: Account Edit API Route Not Specified (Audit 2.5.1 / Phase 5.3)

Phase 5.3 says "replace alert with real write path" but doesn't specify:
1. **Where** should the endpoint live?
   - `fas-cms-fresh/src/pages/api/customer/update.ts`?
2. **Authentication:** How to validate the request is from the logged-in customer?
3. **Authorization:** Can customer edit arbitrary fields or only certain ones?
4. **Rate limiting:** Prevent abuse?

**Missing detail (Phase 5.3 expansion):**
```
Endpoint: POST /api/customer/update
Auth: Requires `Authorization: Bearer <sessionToken>`
Body: { firstName, lastName, email, phone, ... } (whitelist fields)
Response: 200 {updated: true} or 400 {error: 'invalid field'}
```

---

### Gap P: Permissions.update_shipping_details Enforcement — Not Tested (Phase 1.5)

Phase 1.5 adds permission to session creation but doesn't **test** that it actually works in embedded mode.

**Missing verification (Phase 1.5 detail):**
- Acceptance criteria should include: "Customer can modify shipping address during checkout without re-creating session."
- Regression test: `fas-cms-fresh/scripts/stripe/test-update-shipping-during-checkout.ts` — simulates customer changing address mid-flow.

---

### Gap Q: Documentation Alignment — No Central "Contract" Document Update (Phase 5.1)

Phase 5.1 updates `.docs/CONTRACTS/order-shipping-snapshot.md` but doesn't address:
- `.docs/CONTRACTS/service-workflows.md` — still describes Parcelcraft?
- `.docs/CONTRACTS/shipping-provider-boundaries.md` — still references old provider split?
- `CLAUDE.md` field definitions — need refresh after schema decisions?

**Missing action (Phase 5.1 detail):**
- `fas-sanity/scripts/docs/verify-contract-consistency.sh` — fails if Parcelcraft terms appear in any non-archive contract docs.

---

## Summary: Items to Add to Fix Plan

| Gap | Phase | Action | Risk if Missed |
|-----|-------|--------|----------------|
| A | 0.1 | paymentStatus enum decision + usage audit script | Silent enum field rot |
| B | 0.1 | Order status mapping intentionality decision | Confusion about order creation rules |
| C | 3.x | Address normalization layer + helper script | Inconsistent data handling across repos |
| D | 0.1 | Cart item Stripe field decision (cache vs refetch) | Silent dependency on stale data |
| E | 1.3 | Explicit warehouse env var validation with required set | Silent rate calculation with placeholder address |
| F | 3.1 | Explicit SANITY_API_TOKEN validation | Silent webhook failures |
| G | 4.x | Deprecation migration scripts (deprecated fields) | Debt accumulation; hard to remove later |
| H | 2.2 | Explicit EasyPost webhook alias implementation + dashboard check | Silent EasyPost event loss |
| I | 6.1 | Stripe metadata size monitoring + large cart test | Silent session creation failures |
| J | 2/5 | Rate calculation movement confirmation + test | Incorrect rates or missing rates |
| K | 4.3 | Amount field boundary validation (discount ≤ subtotal, etc) | Data integrity corruption |
| L | 6.1 | Product shipping metadata validation in regression | Incomplete EasyPost rates |
| M | 6.1 | Mobile checkout testing (responsive + platform) | Mobile users see broken UI |
| N | 2.x | Duplicate function audit across fas-sanity | Routing confusion; split traffic |
| O | 5.3 | Account update API route specification (auth, whitelist, rate limit) | Security hole; data exposure |
| P | 1.5 | Permissions enforcement + change-address test | Embedded mode regression |
| Q | 5.1 | Contract doc consistency across all .docs/CONTRACTS | Stale governance; broken onboarding |
