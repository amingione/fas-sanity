🧹 COPILOT PROMPT — PHASE 3 CLEANUP (SAFE, CHECKLIST-DRIVEN)

You are executing **PHASE 3 CLEANUP** for the FAS Motorsports platform.

This phase is **ARCHIVAL + CONSOLIDATION**, not refactoring.

You have access to all repositories:

- fas-cms-fresh
- fas-sanity
- fas-medusa

You MUST follow the provided audits exactly.
You MUST NOT remove anything marked “MUST NOT REMOVE”.

---

## 📚 Authoritative Audit Inputs (READ FIRST)

These documents are authoritative and must be followed exactly:

1. docs/STEP2_ALIGNMENT_AUDIT.md
2. fas-sanity/docs/office-dashboard-role-definition.md
3. fas-sanity/docs/audits/sanity-office-dashboard-schema-audit-2026-01-31.md
4. Codex Phase 3 Preparation Audit (runtime dependencies, env vars, webhooks)
5. Claude Phase 3 Read-Only Audit (dependency inventory)

If there is any conflict:

- Prefer the **most restrictive interpretation**
- Do NOT guess

---

## 🎯 Phase 3 Objectives

1. Archive legacy API routes that are **explicitly marked safe to remove**
2. Consolidate environment variables to canonical names
3. Preserve all active runtime paths
4. Preserve all webhook functionality
5. Leave an audit trail for future deletion (Phase 4, optional)

This phase must NOT change runtime behavior.

---

## 🚫 ABSOLUTE CONSTRAINTS

You MUST NOT:

- Delete files outright
- Refactor business logic
- Modify Medusa behavior
- Modify checkout logic
- Modify Sanity schemas
- Remove active webhooks
- Break historical orders
- Change Stripe or Shippo integrations

---

## ✅ ALLOWED ACTIONS (ONLY THESE)

### 1️⃣ Archive Legacy API Routes

Create the following directories if they do not exist:

```bash
src/pages/api/legacy/
src/pages/api/legacy/stripe/
src/pages/api/legacy/medusa/

Move (DO NOT DELETE) the following files exactly as listed:

# Stripe Hosted Checkout (legacy)
mv src/pages/api/stripe/create-checkout-session.ts src/pages/api/legacy/stripe/

# Legacy Medusa checkout sessions
mv src/pages/api/medusa/checkout/create-session.ts src/pages/api/legacy/medusa/
mv src/pages/api/medusa/checkout/complete.ts src/pages/api/legacy/medusa/

# Old cart endpoint (if present)
mv src/pages/api/cart.ts src/pages/api/legacy/

# Legacy shipping quote endpoint (already disabled)
mv src/pages/api/shipping/quote.ts src/pages/api/legacy/

Add a README.md in src/pages/api/legacy/ explaining:
	•	Why these routes were archived
	•	Which new routes replaced them
	•	Date of archival
	•	When deletion is safe (e.g. 6 months)

⸻

2️⃣ Environment Variable Consolidation

Create a new file:

.env.canonical

Populate it using the recommended canonical variables from the audits.

Then:
	•	Update code references to use canonical names only
	•	Remove deprecated env vars from:
	•	.env
	•	.env.local
	•	.env.production
	•	Netlify/Vercel config (if applicable)

Specifically REMOVE:
	•	VITE_SANITY_*
	•	NEXT_PUBLIC_SANITY_*
	•	SANITY_STUDIO_*
	•	SANITY_WRITE_TOKEN
	•	SANITY_ACCESS_TOKEN
	•	SANITY_AUTH_TOKEN
	•	SHIP_FROM_*
	•	STRIPE_API_VERSION
	•	Unused Stripe/META/AFFILIATE vars listed in audit

DO NOT remove:
	•	STRIPE_SECRET_KEY
	•	STRIPE_WEBHOOK_SECRET
	•	STRIPE_SHIPPING_WEBHOOK_SECRET
	•	SANITY_API_TOKEN
	•	SANITY_PROJECT_ID
	•	SANITY_DATASET
	•	MEDUSA_BACKEND_URL
	•	MEDUSA_PUBLISHABLE_KEY
	•	RESEND_API_KEY
	•	Active webhook secrets

⸻

3️⃣ Shipping Provider Cleanup (Decision-Based)

Check the configured provider:

SHIPPING_PROVIDER=shippo|easypost

	•	If shippo:
	•	Remove ALL EASYPOST_* variables
	•	If easypost:
	•	Remove ALL SHIPPO_* variables

Do NOT attempt to migrate logic here.
This phase only removes unused configuration.

⸻

4️⃣ Documentation & Safety Rails

Update or create:
	•	docs/WEBHOOKS.md listing:
	•	Active webhook URLs
	•	Secrets used
	•	Events handled
	•	docs/PHASE3_ARCHIVAL_LOG.md recording:
	•	Files archived
	•	Env vars removed
	•	Date
	•	Validation steps

Add comments to archived files stating:

“Archived in Phase 3. Do not reintroduce into runtime.”

⸻

🧪 Required Validation (Do Before Finishing)

Before concluding:
	1.	Checkout flow still works end-to-end
	2.	PaymentIntent webhook fires successfully
	3.	Orders still appear in Sanity
	4.	Vendor portal still loads
	5.	No 404s for active routes
	6.	No webhook signature failures
	7.	No missing env vars at startup

⸻

📤 Final Output

Provide a summary with:
	1.	Files archived
	2.	Env vars removed
	3.	Env vars kept
	4.	Docs created/updated
	5.	Confirmation that no runtime behavior changed

This phase should feel boring.
If it feels exciting, you went too far.

Proceed carefully.

```
