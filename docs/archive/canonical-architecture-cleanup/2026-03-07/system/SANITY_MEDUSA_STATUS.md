# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.


# Sanity <=> Medusa Sync Status

## PHASE 0 — Discovery (NO BEHAVIOR CHANGES)
- [x] Crawl schema definitions in fas-sanity and build mapping-inventory.json
- [x] Crawl Medusa models/endpoints usage and metadata patterns
- [x] Identify where “addOns/upgrades” exist in Sanity and how they appear in storefront
- [x] Identify current sync scripts/webhooks (Stripe→Sanity, ShipEngine/Shippo→Sanity, etc.)

## PHASE 1 — Contract Lock (DOCUMENTATION ONLY + TYPES)
- [x] Define Canonical types (Product, Variant, Option, Category, Customer, Order, Fulfillment, Shipment)
- [ ] Define authority per field (Medusa vs Sanity) + transform rules
- [ ] Document: SANITY_MEDUSA_CONTRACT.md and STATUS.md created and linked

## PHASE 2 — Products Sync (SMALL, SAFE, TESTED)
- [ ] Implement products sync in one direction first (Medusa → Sanity) using metadata mapping
- [ ] Decide how to represent Sanity addOns in Medusa
- [ ] Implement reverse sync for non-commerce fields (Sanity → Medusa)
- [ ] Tests: snapshot tests for transforms + an integration test
- [ ] Update STATUS.md checkboxes

## PHASE 3 — Customers Sync
- [ ] Define identity matching rules
- [ ] Implement customer sync and conflict resolution policy
- [ ] Tests and STATUS update

## PHASE 4 — Orders + Fulfillment Sync
- [ ] Orders originate from Stripe/Medusa → land in Sanity for operations
- [ ] Fulfillment actions occur in Sanity → push status updates back to Medusa
- [ ] Label creation/ShipEngine/Shippo updates reflected in both
- [ ] Tests and STATUS update

## PHASE 5 — Operational Hardening
- [ ] CLI commands for audit
- [ ] Logging + error reporting + replayable sync jobs
- [ ] Final docs cleanup and test suite grouping
