# AI Governance and Enforcement Workflow

Scope: fas-sanity, fas-medusa, fas-cms-fresh, fas-dash.

## Canonical References

- `AGENTS.md` (architecture authority)
- `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md` (execution tracker)

## Enforcement Principles

- Discover -> decide -> enforce -> verify.
- No cross-repo architecture changes without tracker mapping.
- No split-authority behavior introduced during remediation.

## Authority Constraints

- Medusa owns all commerce invariants and state.
- Stripe and Shippo are integrated through Medusa only.
- Sanity owns content and editorial concerns only.
- CMS and Dash are Medusa consumers for commerce operations.

## Verification Minimums

- Lint and type-check pass in touched repositories.
- Governance docs remain aligned with AGENTS.md.
- Tracker statuses updated for completed and blocked tasks.
