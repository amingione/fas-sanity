# FAS Sanity (`fas-sanity`)

DOCS_VERSION: v2026.03.07  
Role: Content system

## Purpose
`fas-sanity` is the content/editorial platform for FAS.

It owns:
- marketing and editorial content
- SEO copy and media content structures
- content workflows, templates, and internal documentation content
- optional passive mirrors/annotations that explicitly defer to Medusa

## System boundaries
- `fas-medusa` = commerce source of truth
- `fas-dash` = internal operations/admin UI
- `fas-cms-fresh` = storefront UI
- Stripe = payment processor only
- Sanity = content only

## Non-negotiable rules
Sanity must not be described or implemented as authority for:
- products/variants
- pricing/inventory
- cart/checkout/orders
- shipping execution

## Legacy template note
This repository originated from template material that referenced Shopify-centric assumptions.
Those assumptions are superseded and archived; active docs must follow the Medusa-authoritative model.

## Canonical docs
- `docs/governance/checkout-architecture-governance.md`
- `docs/governance/commerce-authority-checklist.md`
- `docs/architecture/canonical-commerce-architecture.md`
- `docs/architecture/migration-status.md`

## Commands
Use existing scripts in `package.json`.

Common checks:
- `node ../scripts/docs-drift-check.mjs --repo fas-sanity`
- `pnpm build`
