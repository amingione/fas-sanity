# AI-GATED TASK: Vendor Portal Polish (fas-sanity + fas-cms-fresh)

## ROLE

You are Codex operating under AI-gated rules.  
You have read/write access to **fas-sanity** and **fas-cms-fresh**.  
You must follow schema-first governance and approval gates.

You are NOT allowed to:

- Change schemas without explicit approval
- Implement before audits are complete
- Remove data silently
- Merge flows without documenting intent

---

## BUSINESS TRUTH (NON-NEGOTIABLE)

Vendors at FAS Motorsports are **customers with wholesale access**, not suppliers.

Vendors:

- Do NOT manage products
- Do NOT manage inventory
- Do NOT upload invoices
- Do NOT view analytics dashboards
- ONLY:
  - Apply to become a vendor
  - Be approved internally
  - Access wholesale pricing
  - Place wholesale orders
  - View order status
  - Receive transactional emails

Any UI, schema, permission, or email implying vendor-managed inventory, storefronts, analytics, or supplier workflows is **incorrect**.

---

## CANONICAL ARTIFACTS (READ-ONLY)

You MUST treat the following as source-of-truth unless explicitly approved otherwise:

### Schema ↔ API Contract

- `.docs/reports/field-to-api-map.md` (READ-ONLY)

### Vendor Audit

- `docs/reports/vendor-portal-usability-reform-audit.md`

### Cross-Repo Auth Audit

- `docs/reports/fasauth-cross-repo-audit.md`

### Governance

- `docs/codex.md`
- `.docs/CONTRACTS/schema-field-mapping.md`

If behavior diverges, you must use a **DRIFT ACKNOWLEDGEMENT** comment in runtime code.

---

## FILES CREATED / MODIFIED DURING INITIAL AUDIT (REFERENCE ONLY)

These exist already — do not recreate:

### Documentation

- `docs/reports/vendor-portal-usability-reform-audit.md`
- `docs/reports/fasauth-cross-repo-audit.md`
- `.docs/reports/field-to-api-map.md`
- `.docs/CONTRACTS/schema-field-mapping.md`
- `packages/sanity-config/src/schemaTypes/README.md`

### Normalization Boundary

- `src/lib/normalize/normalizeStripeOrderToSanityOrder.ts`

### CI / Drift Awareness

- `scripts/check-schema-drift.mjs`
- `.github/workflows/schema-drift-warning.yml`

---

## END GOAL (TARGET STATE)

Deliver a **professional, minimal, secure, and operable vendor portal** where:

1. Vendors start as **customers**
2. Wholesale access is granted internally
3. Authentication is canonical and single-path
4. Wholesale pricing is visible only to authenticated vendors
5. Ordering is consistent, auditable, and secure
6. Emails originate from **fas-sanity only**
7. No dead pages, broken links, or misleading copy exist
8. No supplier-side concepts remain exposed to vendors

---

## TASK PHASING (AUDIT → DECIDE → IMPLEMENT)

### PHASE 1 — FULL SYSTEM AUDIT (NO CODE CHANGES)

You must audit **both repos together**:

#### Auth

- Audit FASauth across **fas-sanity** and **fas-cms-fresh**
- Identify:
  - All login endpoints
  - Role checks
  - Status checks
  - Session payload contents
- Decide and document:
  - ONE canonical vendor login path
  - ONE vendor status model

#### Email Origination

- Identify every vendor-related email sender
- Determine which repo sends what
- Goal:
  - All vendor transactional emails originate from **fas-sanity only**
  - fas-cms-fresh must not send vendor emails

#### Vendor Application Flow

- Confirm:
  - Canonical UI (Astro vs static HTML)
  - Canonical API handler
- Identify duplicate or broken paths

👉 Output required:

- Audit notes written to:
  - `docs/ai-gated/vendor-portal-polish/audit.md`

NO implementation yet.

---

### PHASE 2 — DECISION CHECKPOINT (HUMAN APPROVAL REQUIRED)

Before touching code, you must produce:

- A **Decision Summary**
- A **Proposed Target Flow Diagram**
- A **Schema Impact Assessment** (even if “none”)

👉 Write to:

- `docs/ai-gated/vendor-portal-polish/decisions.md`

Stop and wait for approval.

---

### PHASE 3 — IMPLEMENTATION (ONLY AFTER APPROVAL)

Only after explicit approval:

#### Auth Consolidation

- Remove or disable non-canonical vendor auth paths
- Enforce authenticated vendor sessions on wholesale endpoints
- No vendorId/email access without auth

#### Email Consolidation

- Disable vendor emails in fas-cms-fresh
- Route all vendor emails through fas-sanity
- Ensure email logging exists in fas-sanity

#### Vendor Application Cleanup

- Keep ONE intake path
- Drop non-schema fields safely
- No silent data loss

#### Portal Surface Cleanup

- Remove or disable:
  - `/vendor-portal/messages` (until auth exists)
  - Any unimplemented portal pages
- No links to dead routes

---

### PHASE 4 — WHOLESALE ORDER INTEGRITY

- Enforce `customerRef` on all wholesale orders
- Ensure order/payment status semantics are correct
- Prevent writes to undefined fields
- Use normalization boundary for all inbound payloads

---

### PHASE 5 — TESTING & VERIFICATION

You must run:

- Auth flow tests
- Wholesale order creation tests
- Email origination verification
- Drift check (`scripts/check-schema-drift.mjs`)

Document results in:

- `docs/ai-gated/vendor-portal-polish/tests.md`

---

## ENFORCEMENT RULES

- ❌ No schema changes without **SCHEMA CHANGE APPROVED**
- ❌ No silent drift
- ❌ No implementation before audits
- ✅ Drift must be acknowledged in runtime code if intentional
- ✅ CI drift warnings may exist, but must be explained

---

## COMPLETION CRITERIA

This task is complete only when:

- Vendor workflow matches business truth
- No misleading UI or email copy remains
- Auth, email, and ordering are single-path
- Tests pass
- Documentation reflects reality

---

## START HERE

Begin with **Phase 1 audit only**.  
Do not implement.  
Do not modify schemas.  
Produce the audit file and stop.
