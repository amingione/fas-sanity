# Phase 1 Kickoff Prompt — For Claude Code / Cursor

**Use this prompt** to kick off Phase 1 execution after Phase 0 decisions are locked and approved.

---

## Context Setup

Before running this prompt, ensure:
- [ ] You've read `PHASE_0_DECISION_RECORD.md` (ADR-0001)
- [ ] You've filled out and approved `PHASE_0_APPROVAL_CHECKLIST.md`
- [ ] All four Phase 0 decisions are marked ✅ **APPROVED**
- [ ] You understand the full 6-phase roadmap in `final_easypost-stripe_fix.md`

---

## The Prompt (Copy-Paste This)

```
You are implementing Phase 1 of a coordinated 6-phase fix plan for fas-sanity + fas-cms-fresh.

CONTEXT:
========
Repositories:
  - fas-sanity: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
  - fas-cms-fresh: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh

Decision Authority:
  - PHASE_0_DECISION_RECORD.md (ADR-0001): Four critical decisions are LOCKED
  - PHASE_0_APPROVAL_CHECKLIST.md: APPROVED ✅
  - Schema is truth (codex.md); no schema changes without "SCHEMA CHANGE APPROVED"
  - EasyPost is the approved shipping provider

Full Roadmap:
  - Phase 1: Stop-the-Bleeding (security + correctness) ← YOU ARE HERE
  - Phase 2: Restore internal/admin shipping (Sanity Studio)
  - Phase 3: Make order persistence robust (webhook validation)
  - Phase 4: Address schema "quality" issues (no schema changes)
  - Phase 5: Cleanup + documentation alignment
  - Phase 6: End-to-end regression testing

PHASE 1 SCOPE: Stop-the-Bleeding (Security + Correctness in Checkout Shipping)
==============================================================================
This phase removes immediate production risks and prevents silent data corruption.

Issues addressed in Phase 1:
  - Follow-up finding (post-audit): Dynamic shipping rate ID prefix collision (easypostRateId overwrite)
  - 2.1.3: STRIPE_SHIPPING_WEBHOOK_SECRET not validated
  - 2.2.1: Inconsistent Stripe API versions
  - 2.2.2: Warehouse address hardcoded fallbacks
  - 1.5: permissions.update_shipping_details enforcement
  - 1.1: Remove secrets/unsafe defaults from code

PHASE 1 TASKS (5 subtasks, execute in order):
==============================================

Task 1.1: Remove secrets and unsafe defaults
  Issue: .env.example contains private keys; EmbeddedCheckout.tsx has hardcoded keys
  Files affected:
    - fas-cms-fresh/.env.example
    - fas-cms-fresh/src/components/checkout/EmbeddedCheckout.tsx
  Acceptance criteria:
    - No private key material in tracked files
    - No pk_live_... fallback in code (require PUBLIC_STRIPE_PUBLISHABLE_KEY)
    - No dev-only script injections in shipped components
    - Checkout still works when PUBLIC_STRIPE_PUBLISHABLE_KEY is set
  Verification:
    - Run: fas-cms-fresh/scripts/security/scan-repo-secrets.ts (create if missing)
    - Confirm no secrets found in grep for "-----BEGIN PRIVATE KEY", "pk_live_", "sk_live_"

Task 1.2: Fix shipping webhook secret validation + unify Stripe API versions
  Issue: STRIPE_SHIPPING_WEBHOOK_SECRET not validated before use; API versions inconsistent
  Files affected:
    - fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts
    - fas-cms-fresh/src/pages/api/stripe/create-checkout-session.ts
  Changes required:
    - Create shared Stripe config: fas-cms-fresh/src/lib/stripe-config.ts
      - Export: const STRIPE_API_VERSION (env override, fallback to '2025-08-27.basil')
      - Both handlers import and use this constant
    - Add validation in shipping-rates-webhook.ts BEFORE constructEvent():
      ```typescript
      const shippingWebhookSecret = import.meta.env.STRIPE_SHIPPING_WEBHOOK_SECRET;
      if (!shippingWebhookSecret) {
        console.error('❌ Missing STRIPE_SHIPPING_WEBHOOK_SECRET');
        return new Response('Webhook secret not configured', { status: 500 });
      }
      ```
  Acceptance criteria:
    - Shipping webhook returns 500 with clear message if STRIPE_SHIPPING_WEBHOOK_SECRET missing
    - All Stripe API calls use same version constant
    - No hardcoded API versions remain
  Verification:
    - Test: call shipping-rates-webhook with missing env var → expect 500 error
    - Grep for 'apiVersion' and 'STRIPE_API' in both files → should see constant import only

Task 1.3: Require warehouse address env vars (no placeholder fallbacks)
  Issue: Shipping origin address uses placeholder '0000 Main St' if env vars missing
  Files affected:
    - fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts (lines 68-75)
  Changes required:
    - Replace fallback logic with validation and a clear 500 JSON error (do not silently substitute placeholders):
    ```typescript
    const REQUIRED_WAREHOUSE_FIELDS = ['WAREHOUSE_ADDRESS_LINE1', 'WAREHOUSE_CITY', 'WAREHOUSE_STATE', 'WAREHOUSE_ZIP'];
    const missing = REQUIRED_WAREHOUSE_FIELDS.filter(key => !import.meta.env[key]);
    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required warehouse config', missing }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resolveOriginAddress = () => ({
      name: 'F.A.S. Motorsports LLC',
      street1: import.meta.env.WAREHOUSE_ADDRESS_LINE1!,  // No fallback
      street2: import.meta.env.WAREHOUSE_ADDRESS_LINE2 || undefined,
      city: import.meta.env.WAREHOUSE_CITY!,              // No fallback
      state: import.meta.env.WAREHOUSE_STATE!,            // No fallback
      zip: import.meta.env.WAREHOUSE_ZIP!,                // No fallback
      country: 'US',
      phone: import.meta.env.WAREHOUSE_PHONE || undefined,  // Optional
      email: import.meta.env.WAREHOUSE_EMAIL || undefined   // Optional
    });
    ```
  Acceptance criteria:
    - Rates cannot be calculated with missing warehouse address
    - Error message clearly lists which env vars are missing
    - .env.example documents required values
  Verification:
    - Test: call shipping-rates-webhook with missing WAREHOUSE_CITY → expect 500 with missing keys listed
    - Confirm .env.example shows actual warehouse address

Task 1.4: Fix the rate ID collision (synthetic dynamic-rate ID overwrites easypostRateId)
  Issue: Dynamic shipping rates generate a synthetic `id` that starts with `rate_`.
         fas-sanity infers EasyPost IDs from any shipping_rate_id that starts with `rate_`, which can overwrite the real EasyPost rate id.
  Files affected:
    - fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts (line ~290)
    - fas-sanity/netlify/lib/fulfillmentFromMetadata.ts
  Changes required:
    1. In shipping-rates-webhook.ts, change returned shipping rate `id` to a stable, non-EasyPost-looking identifier.
       Recommended: `dyn_${easypostRateId}` (stable; cannot be confused with EasyPost `rate_...`)
       ```typescript
       // Change from: id: `rate_${index}_${carrier}_${service}`
       // To (recommended):
       id: `dyn_${rate.rateId}`
       ```
    2. In fulfillmentFromMetadata.ts, only extract EasyPost rate id from explicit metadata keys (never infer from shipping_rate_id):
       ```typescript
       // Only set from explicit metadata, never from shipping_rate_id
       const easyPostRateId =
         pickFromMeta(meta, ['easypost_rate_id', 'easypostRateId']) ||
         shippingDetails.metadata?.['easypost_rate_id'] ||
         undefined
       ```
  Acceptance criteria:
    - After checkout, order.easypostRateId stores real EasyPost ID (not synthetic rate_... ID)
    - If no metadata.easypost_rate_id provided, order.easypostRateId is undefined (not guessed)
  Verification:
    - Test: create checkout with shipping rate → verify order.easypostRateId matches metadata.easypost_rate_id
    - Test: create checkout without EasyPost (test rate only) → verify order.easypostRateId is undefined

Task 1.5: Enforce permissions.update_shipping_details in Stripe session creation
  Issue: codex.md requires shipping_address_collection + permissions.update_shipping_details: 'server_only'
         But fas-cms-fresh/src/pages/api/stripe/create-checkout-session.ts doesn't set permissions
  Files affected:
    - fas-cms-fresh/src/pages/api/stripe/create-checkout-session.ts (session creation ~line 800-900)
  Changes required:
    - Update session params to include:
    ```typescript
    shipping_address_collection: {
      allowed_countries: ['US']
    },
    permissions: {
      update_shipping_details: 'server_only'
    }
    ```
    - If Stripe rejects this combination in embedded mode (or ignores it), do NOT silently drop it:
      - Record the outcome in governance docs (decision record / exception note)
      - Keep the closest codex-compliant configuration possible
  Acceptance criteria:
    - Session creation is codex-compliant (or documented exception recorded in governance)
    - Embedded mode still works with these permissions
    - Customer can modify shipping address during checkout
  Verification:
    - Test: create session and verify permissions.update_shipping_details is set
    - Manual test: in embedded checkout, verify customer can change shipping address without session restart

EXECUTION INSTRUCTIONS:
======================
1. Work through Tasks 1.1 through 1.5 in order
2. For each task:
   a) Read the affected files first (don't make changes blindly)
   b) Make the minimal changes specified
   c) Verify acceptance criteria before moving to next task
   d) Document any issues or unexpected findings
3. After all 5 tasks complete, run Phase 1 verification suite
4. Create a Phase 1 completion report

EXPECTED OUTPUTS:
================
1. Modified files (with git diffs showing changes)
2. Phase 1 Verification Report documenting:
   - Which issues were resolved (follow-up rate-id collision, 2.1.3, 2.2.1, 2.2.2, 1.5, 1.1)
   - Test results for each acceptance criterion
   - Any blockers or exceptions encountered
   - Recommendations for Phase 2
3. Updated .env.example with required warehouse config

HANDOFF TO PHASE 2:
==================
When Phase 1 is complete, you will be asked to begin Phase 2 (Restore Studio Shipping).
Phase 2 addresses:
  - 6 broken getEasyPostRates references in Sanity Studio
  - EasyPost webhook continuity
  - Vendor application handler consolidation
  - Complete these before starting Phase 3

CONSTRAINTS & GUARDRAILS:
=========================
- Schema is truth: Do NOT change order.tsx, orderCartItemType.ts, or any schemas unless "SCHEMA CHANGE APPROVED"
- EasyPost is the approved provider: Do NOT reference Parcelcraft, ShipEngine, or ShipStation in code
- Codex compliance: Reference docs/reports/PHASE_0_DECISION_RECORD.md if any decision ambiguity arises
- Minimal changes: Only modify what's specified; do NOT refactor or "improve" unrelated code
- Type safety: Add ! (non-null assertions) only where env vars are required; use ? for optional
- Testing: Every change must have a clear verification step; don't skip tests

QUESTIONS BEFORE YOU START:
===========================
Before beginning Phase 1, confirm:
1. Do you have write access to both repositories?
2. Can you run scripts in fas-cms-fresh (yarn) and fas-sanity (pnpm)?
3. Are you familiar with Astro/Netlify Functions structure?
4. Do you understand the 4 Phase 0 decisions and agree with them?

Ready to begin Phase 1?
```

---

## How to Use This Prompt

### Option A: Direct Input to Claude Code

```bash
# In Claude Code / Cursor, paste the entire prompt above into the chat
# Then say: "Start Phase 1 using this structure. Begin with Task 1.1."
```

### Option B: Save and Reference

1. Save this prompt to a file: `docs/reports/PHASE_1_KICKOFF_PROMPT.md` ✅ (already done)
2. In Claude Code, reference it:
   ```
   I'm ready to begin Phase 1.
   Use the structure defined in docs/reports/PHASE_1_KICKOFF_PROMPT.md
   Start with Task 1.1.
   ```

### Option C: Create a Shell Script

Create `scripts/phase-1-start.sh`:

```bash
#!/bin/bash
cat << 'EOF'
Starting Phase 1 — Stop-the-Bleeding

Repositories:
  - fas-sanity: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-sanity
  - fas-cms-fresh: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-cms-fresh

Phase 0 Status: ✅ APPROVED

  5 Tasks:
	  1.1 Remove secrets + unsafe defaults
	  1.2 Fix shipping webhook secret validation + unify Stripe API versions
	  1.3 Require warehouse address env vars
	  1.4 Fix dynamic-rate ID collision
	  1.5 Enforce permissions.update_shipping_details

Ready to begin.
EOF
```

---

## What to Expect After Phase 1

**Phase 1 Success Looks Like:**
- ✅ No secrets in code or examples
- ✅ Warehouse address required (no placeholders)
- ✅ Stripe API version unified to 2025-08-27.basil
- ✅ Shipping webhook validates secrets
- ✅ EasyPost rate ID collision fixed (no synthetic `rate_` IDs stored)
- ✅ Session creation enforces permissions
- ✅ All 5 acceptance criteria met

**Then You'll See:**
- Phase 1 Completion Report
- Recommendation to proceed to Phase 2
- Updated git status with Phase 1 changes

---

## Progression Through All 6 Phases

After Phase 1 completes, use similar prompts for each phase:

**Phase 2:** Restore Studio shipping
```
I'm ready for Phase 2.
Use docs/reports/PHASE_2_KICKOFF_PROMPT.md
Tasks: 2.1 (fix broken getEasyPostRates), 2.2 (EasyPost webhook), 2.3 (vendor consolidation)
```

**Phase 3:** Order persistence robustness
```
I'm ready for Phase 3.
Use docs/reports/PHASE_3_KICKOFF_PROMPT.md
Tasks: 3.1 (Sanity client validation), 3.2 (stripeSummary completeness), 3.3 (duplicate webhooks)
```

...and so on through Phase 6.

---

## Key Points

1. **Phase 0 must be locked first** — Use the approval checklist
2. **Each phase is sequential** — Don't start Phase 2 until Phase 1 is complete
3. **Verification is required** — Each task has acceptance criteria that must be tested
4. **Handoff is explicit** — Each phase ends with a completion report before moving to the next
5. **All decisions are documented** — Reference PHASE_0_DECISION_RECORD.md if ambiguity arises

---

## Ready?

Print out this prompt, fill in the Phase 0 approval checklist, and then:

**Option 1 (Direct):** Copy the prompt section into Claude Code and ask:
> "Start Phase 1 using this structure. Begin with Task 1.1."

**Option 2 (Reference):** Point Claude to this file:
> "I'm ready for Phase 1. Use the structure in docs/reports/PHASE_1_KICKOFF_PROMPT.md. Start with Task 1.1."

**Option 3 (Scripted):** Run the shell script and then ask Claude:
> "Based on the Phase 1 kickoff, let's begin with Task 1.1."

---

**Phase 1 Status:** Ready to begin (pending your approval of Phase 0)
**Next Step:** Approve Phase 0 decisions in PHASE_0_APPROVAL_CHECKLIST.md → Then run this prompt
