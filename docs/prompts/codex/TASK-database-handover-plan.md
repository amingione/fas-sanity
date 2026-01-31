# TASK: database-handover plan

## Goal
Safely archive/retire non-canonical webhooks and database write paths outside `fas-sanity`, and establish `fas-sanity` as the single source of truth for Stripe + order/fulfillment data flows.

## Success criteria
- All live webhook endpoints are hosted in `fas-sanity` only.
- No production paths write order/shipping/invoice data to Sanity from `fas-cms-fresh`.
- Stripe event routing is unambiguous, documented, and verified (test + live).
- All required data artifacts for storefront (orders, invoices, shipping status) are served via `fas-sanity`-derived APIs.

## Guardrails
- No schema changes unless explicit approval: "SCHEMA CHANGE APPROVED".
- Never remove a function unless its replacement is verified in test and live.
- Archive instead of delete for any webhook endpoint until 2 full billing cycles pass.
- Update docs and audit logs for every change.

## Canonical agents and responsibilities
Assign these agents explicitly per step. Codex (this agent) executes only the final build phases.

- Agent A: "Audit-Map" (canonical inventory + dataflow mapping)
  - Deliverable: full webhook/function inventory, ownership map, event routing matrix, and data-write destinations.
- Agent B: "Contracts-Guard" (contract/spec alignment)
  - Deliverable: normalized metadata key map, Stripe webhook event contract, Legacy provider metadata contract, and schema alignment summary.
- Agent C: "Ops-Verify" (deployment + routing verification)
  - Deliverable: Stripe Dashboard endpoint list, Netlify/hosting routes, env var audit, and runtime verification plan.
- Agent D: "Risk-Archive" (deprecation plan + safety checks)
  - Deliverable: archival strategy, rollback plan, and monitoring checklist.
- Agent E: "Docs-Consistency" (documentation reconciliation)
  - Deliverable: updated docs, canonical references, and migration notes.

## Phase 0: Pre-shipping stabilization (do not start removal)
Owner: Ops-Verify
- Confirm shipping issues resolved.
- Verify `fas-sanity` webhook endpoint is receiving all required Stripe events (test + live).
- Ensure `fas-cms-fresh` webhook endpoints are not configured in Stripe.
- Snapshot current Stripe webhook endpoint list (test + live) with timestamps.

## Phase 1: Canonical inventory and dataflow map
Owner: Audit-Map
- Enumerate all webhook endpoints in both repos.
- Enumerate all functions that write to Sanity (orders, invoices, shipping, fulfillment, customers).
- Map each Stripe event type to destination handler(s).
- Identify overlaps, duplicates, or conflicting writes.
- Produce an ownership matrix:
  - Event -> Handler -> Repo -> Writes -> Downstream dependencies

## Phase 2: Contract alignment and normalization
Owner: Contracts-Guard
- Define canonical metadata keys (Legacy provider, Stripe shipping, order summary).
- List accepted aliases and normalizations (case, legacy keys, UI overrides).
- Compare `fas-sanity` vs `fas-cms-fresh` parsing logic for shipping metadata.
- Identify any mismatches that could cause data loss or duplication.
- Output a contract spec and change list required before deprecation.

## Phase 3: Ops verification (routing + env)
Owner: Ops-Verify
- Verify Stripe webhook endpoints (live/test) and signing secrets.
- Confirm no `fas-cms-fresh` webhook endpoints are live in Stripe.
- Validate hosting routes for `fas-sanity` webhook functions.
- Check envs for both repos to ensure only `fas-sanity` has webhook secrets in use.

## Phase 4: Deprecation strategy draft
Owner: Risk-Archive
- Propose archive locations (e.g., `archive/stripe-webhooks/` or `archive/netlify/functions/`), without deletion.
- Define “soft disable” options:
  - Return 410/422 with clear log message.
  - Guard behind feature flag or ENV (default off in prod).
  - Remove from deploy manifest while retaining code.
- Provide rollback procedure with timestamps and revert steps.

## Phase 5: Documentation reconciliation
Owner: Docs-Consistency
- Align all Legacy provider docs in `.docs/ai-governance/legacy provider-stripe-setup/` with `fas-sanity` canonical flow.
- Update doc notes to state: `fas-sanity` is the only production webhook endpoint.
- Ensure metadata keys in docs match actual production code.
- Add a single "source of truth" doc entry point.

## Phase 6: Pre-build readiness checklist
Owner: Codex (final gate)
- Shipping issue is confirmed resolved.
- All phase deliverables accepted.
- Confirm no schema changes required.
- Confirm rollback plan and monitoring plan are approved.

## Phase 7: Build execution (Codex only)
- Apply code changes in small batches:
  1) Introduce deprecation guards in `fas-cms-fresh` webhook functions.
  2) Update routing/docs/env to remove `fas-cms-fresh` from Stripe endpoints.
  3) Archive unused functions after verification window.
- Add explicit logging for any deprecated endpoint hit.
- Ensure no production data writes originate outside `fas-sanity`.

## Phase 8: Verification + monitoring
Owner: Ops-Verify + Codex
- Verify Stripe events flow to `fas-sanity` only.
- Verify order creation, shipping updates, and invoice creation.
- Monitor for 2 billing cycles before removing archived code.

## Deliverables checklist
- Inventory map (Phase 1)
- Contract spec (Phase 2)
- Routing/env audit (Phase 3)
- Deprecation plan + rollback (Phase 4)
- Docs update plan (Phase 5)
- Final build checklist (Phase 6)

## Notes
- No destructive deletes until Phase 8 complete.
- All changes should be tested in a Stripe test environment before live.
