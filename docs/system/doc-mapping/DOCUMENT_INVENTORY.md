# Document Inventory — Current State (fas-sanity)

Status: ACTIVE
Last reviewed: 2026-04-12
Authority source: `AGENTS.md`

This inventory reflects the current repo state and architecture boundaries:
- Sanity is content + ops support only.
- Medusa is commerce authority (pricing, inventory, checkout, orders, shipping/payment orchestration).
- Stripe/Shippo are accessed via Medusa only.

## Canonical Tracking Docs

| Document | Purpose | Status |
|---|---|---|
| `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md` | Cross-repo workstream task tracker | Active |
| `docs/PROGRESS.md` | Ongoing phase/progress log | Active |
| `docs/governance/RELEASE_CHECKLIST.md` | Release gates and sign-off checklist | Active |
| `docs/architecture/canonical-commerce-architecture.md` | Architecture reference in this repo | Active |

## Current Mapping/Inventory Docs

| Document | Purpose | Status |
|---|---|---|
| `docs/system/mapping-inventory.json` | Current schema + authority inventory snapshot | Active |
| `docs/architecture/schema-authority-checklist.yml` | Governance checklist rules for schema authority | Active |
| `docs/system/SANITY_MEDUSA_CONTRACT.md` | Sanity/Medusa contract reference | Active |

## Historical / Non-Authoritative Mapping Docs

The following documents are retained for history only and must not be treated as current architecture truth:

- `docs/schema-audit/sanity-schema-inventory.md`
- `docs/schema-audit/sanity-to-medusa-field-map.md`
- `docs/schema-audit/existing-sync-points.md`
- `docs/schema-audit/translation-layer-spec.md`

Each file now includes a status banner indicating it is historical/outdated.

## Archived Inventory Package

A deprecated document package was archived because it referenced missing files and pre-lock architecture assumptions:

- `docs/archive/docs-cleanup-2026-04-12/system/doc-mapping/DOCUMENT_INVENTORY.md`
- `docs/archive/docs-cleanup-2026-04-12/system/mapping-inventory.json`

