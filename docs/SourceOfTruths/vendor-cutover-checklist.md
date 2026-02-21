# Vendor Cutover Checklist (Operational Sign-Off)

Last updated: 2026-02-21
Scope: `fas-medusa`, `fas-sanity`, `fas-cms-fresh`, replacement vendor workspace

## Purpose
Define the mandatory go/no-go checklist before disabling legacy vendor integration paths in Sanity.

This checklist must be fully completed and signed off before:
- Removing vendor schemas/routes
- Disabling legacy vendor API paths
- Turning off fallback vendor timeline/message flows

## Cutover Gate (All Required)

### 1) Webhook Timeline Readiness
- [ ] Vendor timeline webhook endpoint is live in Sanity.
- [ ] Signature verification is enabled and validated with real payloads.
- [ ] Idempotency is enforced by `event_id` uniqueness.
- [ ] Replay path exists and can restore missing events.
- [ ] Duplicate and invalid signature behavior is logged/observable.

### 2) Replacement Workspace Readiness
- [ ] Replacement vendor workspace is deployed.
- [ ] Salesperson can view vendor profile/account data.
- [ ] Salesperson can view vendor timeline events.
- [ ] Salesperson can send approved non-transactional vendor communications.
- [ ] Medusa-owned commerce status is read-only in Sanity timeline views.

### 3) Data Integrity + Reconciliation
- [ ] Vendor-to-salesperson mapping is verified.
- [ ] Vendor IDs align across Medusa and Sanity references.
- [ ] Historical timeline backfill/replay completed for agreed lookback window.
- [ ] Reconciliation report shows no critical gaps.
- [ ] Sample vendor journeys pass end-to-end validation.

### 4) Operational Readiness
- [ ] Runbook for incident handling is documented.
- [ ] On-call owner is assigned for cutover window.
- [ ] Alerting/monitoring dashboards are validated.
- [ ] Rollback steps are tested in a lower environment.
- [ ] Stakeholders are notified of cutover timing and freeze window.

### 5) Legacy Decommission Preconditions
- [ ] No critical workflow depends on legacy Sanity transactional vendor path.
- [ ] Legacy endpoints targeted for removal are enumerated.
- [ ] Removal PR includes rollback strategy and owner.
- [ ] Post-cutover validation checklist is prepared.

## Go/No-Go Decision
- [ ] GO approved for vendor cutover
- [ ] NO-GO (blockers remain)

## Sign-Off

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Product Owner |  | GO / NO-GO |  |  |
| Commerce Engineering |  | GO / NO-GO |  |  |
| Ops Lead |  | GO / NO-GO |  |  |
| QA / Validation |  | GO / NO-GO |  |  |

## Related Documents
- `docs/SourceOfTruths/fas-sanity-vendor-portal-keep.md`
- `docs/SourceOfTruths/vendor-portal-webhook-contract.md`
- `docs/SourceOfTruths/nextjs-medusa-takeover-plan/00-START-HERE/INDEX.md`
- `docs/SourceOfTruths/nextjs-medusa-takeover-plan/00-START-HERE/CURRENT-PHASE.md`
