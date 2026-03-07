# FAS Checkout Architecture Governance

Status: Canonical  
Last updated: 2026-03-07

This document governs checkout ownership across the FAS ecosystem. If an older plan, audit, or implementation package says something different, this document wins.

## System Roles

| System | Checkout role |
| --- | --- |
| `fas-medusa` | Commerce authority, backend, and webhook layer |
| `fas-dash` | Internal admin and operations UI |
| `fas-cms-fresh` | Storefront and customer-facing checkout surface |
| `Stripe` | Payment processor only |
| `Sanity` | Content only |

## Checkout Runtime Flow

1. `fas-cms-fresh` reads product, pricing, inventory, cart, and checkout state from `fas-medusa`.
2. Sanity may enrich product presentation, but it must never decide commerce state.
3. `fas-cms-fresh` sends address, shipping, cart, and checkout actions to `fas-medusa`.
4. `fas-medusa` calculates shipping, tax, totals, and payment payloads.
5. `fas-medusa` creates or updates the Stripe payment object.
6. Stripe processes payment only and returns status.
7. `fas-medusa` creates the order, owns the resulting commerce record, and emits webhook or mirror events.
8. `fas-dash` and any sanctioned mirrors consume the resulting state; Sanity remains passive and non-authoritative.

## Enforcement Rules

- `fas-medusa` is the only commerce authority.
- `fas-dash` must manage commerce through `fas-medusa`, not through direct Sanity writes.
- `fas-cms-fresh` must not calculate authoritative prices, shipping, tax, totals, or order state.
- Stripe must not be treated as cart, checkout, tax, shipping, or order authority.
- Sanity must never be described or used as commerce authority.

## Prohibited Patterns

- Creating orders, carts, or shipping state in Sanity.
- Treating Stripe objects as the authoritative order record.
- Letting `fas-dash` or `fas-cms-fresh` authoritatively calculate totals outside `fas-medusa`.
- Using archived planning docs as implementation authority.

## Canonical Companion Docs

- `docs/governance/commerce-authority-checklist.md`
- `docs/architecture/canonical-commerce-architecture.md`
- `docs/architecture/migration-status.md`
