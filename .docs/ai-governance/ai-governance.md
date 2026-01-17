# AI Governance & Enforcement Workflow

This document defines the **authoritative, repeatable workflow** for using AI
(Gemini, Claude, Codex) across the fas-sanity and fas-cms-fresh repositories.

This workflow is mandatory for any cross-repo change, schema decision,
integration refactor, or Studio UX change.

---

## Roles & Responsibilities

### Gemini (Discovery & Verification)

- Read-only analysis
- Audits repositories for:
  - Schema usage
  - Data flow
  - Drift
  - Orphaned logic
- Produces factual reports only
- NEVER proposes fixes
- NEVER modifies code

### Claude (Decision Authority)

- Reads Gemini audit reports
- Produces **explicit contract decisions**
- Decides:
  - Source of truth
  - Editability
  - Directionality
  - UX semantics
- NEVER writes code
- NEVER enforces changes

### Codex (Mechanical Enforcement)

- Reads approved decision documents
- Ensures both repositories fas-sanity and fas-cms-fresh comply with schema changes
- If code changes are needed to keep compliance between repos, makes them mechanically
- Makes code & schema changes as needed
- Produces full audit logs
- NEVER invents new decisions
- NEVER deviates from approved decisions
- Applies changes **exactly as written**
- Can modify code and schemas ONLY when explicitly approved
- NEVER invents new decisions
- Stops if ambiguity is encountered

---

## Standard Workflow (Required)

### Phase 1 — Audit (Codex or Gemini)

Purpose: Discover current behavior.

Artifacts produced:

- docs/reports/\_repo-map.md
- docs/reports/cross-repo-data-flow.md
- docs/reports/blocking-issues.md
- docs/reports/confusing-or-risky-patterns.md
- docs/reports/audit-summary.md

Rules:

- No code changes
- No schema changes

---

### Phase 2 — Verification (Gemini)

Purpose: Validate audit completeness and correctness.

Output:

- PASS / FAIL verdict
- Confidence assessment
- No fixes suggested

---

### Phase 3 — Decisions (Claude)

Purpose: Translate audit into enforceable contracts.

Artifacts produced:

- docs/reports/<topic>-contract-decisions.md
- or docs/reports/<topic>-studio-ux.md

Decision document MUST include:

- Explicit decisions
- Blocking vs non-blocking
- “Ready for Codex Enforcement” section
- If schemas change:
  - The phrase: **SCHEMA CHANGE APPROVED**

---

### Phase 4 — Enforcement (Codex)

Purpose: Apply approved decisions mechanically.

Rules:

- Follow docs/reports/<decision-doc>.md exactly
- No scope creep
- No refactors beyond necessity
- Stop if ambiguity is found

Output:

- File list changed
- Decision → implementation checklist
- Confirmation of compliance

---

### Phase 5 — Post-Enforcement Verification (Gemini)

Purpose: Ensure Codex did not drift.

Checks:

- No unapproved changes
- Schema integrity preserved
- UX semantics correct
- Lint + type-check pass

---

## Non-Negotiable Rules

- Schemas are authoritative.
- Stripe/EasyPost remain source of truth for external data.
- Embedded objects are NOT documents.
- No top-level abstractions may be introduced without explicit approval.
- All decisions must live in docs/reports/.

---

## Approved Prompt Templates

See:

- Codex Audit Template
- Claude Decision Template
- Codex Enforcement Template
- Gemini Verification Template

All prompts must reference this document.

---

## Enforcement Philosophy

> Discover → Decide → Enforce → Verify  
> Never skip steps.

This workflow exists to prevent:

- Silent data corruption
- Identity drift
- Schema rot
- UX lies
- AI freelancing

If a step feels slow, it is protecting you.
