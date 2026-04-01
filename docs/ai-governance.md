# AI Governance and Enforcement Workflow

This workflow governs AI-assisted delivery across all four FAS repositories:

- fas-sanity
- fas-medusa
- fas-cms-fresh
- fas-dash

## Canonical Sources

- Architecture authority: `AGENTS.md`
- Execution tracker: `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md`

If any workflow note conflicts with AGENTS.md, AGENTS.md wins.

## Roles

- Discovery/Verification agent: audit and verify only.
- Decision authority: approve contracts and boundaries.
- Enforcement agent: implement approved decisions mechanically.

## Mandatory Sequence

1. Audit current state and map findings to tracker IDs.
2. Produce explicit decision contract.
3. Enforce only approved decisions.
4. Verify no drift against architecture authority.
5. Update tracker statuses and residual risks.

## Non-Negotiable Architecture Constraints

- Medusa is commerce authority.
- Stripe/Shippo are commerce providers via Medusa only.
- Sanity is content-only and non-transactional.
- fas-cms-fresh and fas-dash consume Medusa commerce state.

## Output Requirement

Every cross-repo governance pass must include:

- Files changed
- Authority-boundary impact
- Tracker IDs updated
- Remaining blockers
