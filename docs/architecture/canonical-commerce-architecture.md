# Canonical Commerce Architecture

Status: Canonical  
Last updated: 2026-03-07  
Applies to: `fas-medusa`, `fas-dash`, `fas-cms-fresh`, `fas-sanity`

## Repo Role

`fas-sanity` is the content system. It may store editorial content, templates, annotations, and approved passive mirrors, but it is not commerce authority.

## FAS System Role Map

| System | Canonical role |
| --- | --- |
| `fas-medusa` | Commerce authority, backend, and webhook layer |
| `fas-dash` | Internal admin and operations UI |
| `fas-cms-fresh` | Storefront |
| `Stripe` | Payment processor only |
| `Sanity` | Content only |

## Commerce Source of Truth

- `fas-medusa` owns products, variants, pricing, inventory, carts, checkout, shipping logic, and orders.
- `Stripe` processes payments against amounts and metadata supplied by `fas-medusa`.
- `Sanity` may enrich content and receive mirrors or annotations, but it must never own commerce state.
- `fas-dash` must operate on commerce state through `fas-medusa`.

## Runtime Flow

1. `fas-cms-fresh` reads commerce data from `fas-medusa` and may merge Sanity content enrichment at render time.
2. Cart and checkout actions are sent to `fas-medusa`.
3. `fas-medusa` calculates shipping, tax, totals, and payment payloads.
4. `fas-medusa` creates or manages the Stripe payment object.
5. Stripe confirms payment only; it does not become the source of truth for catalog, checkout, or order state.
6. `fas-medusa` creates the order and emits webhook or mirror events as needed.
7. `fas-dash` operates on the resulting commerce state through `fas-medusa`; Sanity receives passive mirrors only where explicitly allowed.

## Sanity Restrictions

- Sanity must not be described or implemented as commerce authority.
- Sanity must not authoritatively own products, variants, prices, inventory, carts, checkout state, orders, or shipping execution.
- Sanity may store content, enrichment fields, templates, annotations, and read-only mirrors that clearly defer to `fas-medusa`.

## Stripe Restrictions

- Stripe is payment processor only.
- Stripe must not be treated as catalog, cart, checkout, tax, shipping, or order authority.
- Stripe receives final amounts and metadata from `fas-medusa` and returns payment status.

## Legacy Sync Decommission Rule

- Any legacy sync, mirror, draft plan, or historical workflow that conflicts with this document is superseded.
- Legacy mirrored records remain reference material only and must not be used as implementation authority.
- New architecture or governance references must point to this package, not to archived planning documents.
