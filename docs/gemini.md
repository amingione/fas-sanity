# Gemini CLI Automation Guide (Non-Authoritative)

Purpose:
Gemini CLI is used for read-only analysis, inventory, and reporting.
It does NOT modify code, schemas, or integrations.

Gemini reports are **informational only** and must never be treated as approval
to modify code, schemas, or integrations.

Reports may intentionally list items as “missing” that are
out of scope, deferred, or intentionally unimplemented.
Human review is required before any action.

Gemini MUST:

- Inspect files
- Detect gaps, drift, and orphaned assets
- Generate reports only

Gemini MUST NOT:

- Edit files
- Propose architecture
- Enforce rules
- Modify schemas
- Trigger integrations

## Standard Reports

### 1. Schema Coverage

- Fields defined but never written
- Fields written but not defined
- Required fields missing writes

Output:
docs/reports/schema-coverage.md

### 2. Integration Readiness

For each integration (Stripe, EasyPost, Twilio, Resend):

- Existing schemas
- Existing routes
- Missing routes
- Required env vars
- Blocking vs optional gaps

Output:
docs/reports/{integration}-readiness.md

### 3. Drift Detection

- New fields since last snapshot
- New writes to non-schema fields
- Hidden required fields

Output:
docs/reports/drift-report.md

## Workflow

1. Run Gemini reports
2. Review results with Claude (decision-making)
3. Approve changes explicitly
4. Run Codex for enforcement

Gemini is informational only.
