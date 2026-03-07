# Commerce Authority Checklist

Status: Canonical  
Last updated: 2026-03-07

Use this checklist to prevent architecture drift.

## Core Authority Rules

- `fas-medusa` owns products, variants, pricing, inventory, carts, checkout, shipping logic, and orders.
- `fas-dash` is the internal admin and operations UI and must act through `fas-medusa`.
- `fas-cms-fresh` is the storefront and must not become commerce authority.
- Stripe is payment processor only.
- Sanity is content only.
- Sanity must never be framed or implemented as commerce authority.

## Storefront Checklist

- Product visibility, price, inventory, and checkout state come from `fas-medusa`.
- Sanity enrichment is optional and must never block a valid Medusa product from rendering.
- `fas-cms-fresh` does not authoritatively calculate tax, shipping, totals, or order state.

## Dashboard Checklist

- `fas-dash` writes commerce changes through `fas-medusa` APIs only.
- `fas-dash` does not use Sanity as a transactional commerce database.
- Internal operations workflows defer to `fas-medusa` for authoritative order and inventory state.

## Sanity Checklist

- Allowed: editorial content, SEO, media, templates, annotations, and read-only mirrors.
- Not allowed: authoritative product creation, variant ownership, pricing, inventory, carts, checkout, orders, or shipping execution.
- If Sanity stores mirrored commerce data, that data must explicitly defer to `fas-medusa`.

## Stripe Checklist

- Stripe receives final amounts and metadata from `fas-medusa`.
- Stripe does not own catalog, checkout, tax, shipping, or order state.
- Payment success does not replace Medusa order creation authority.

## Legacy Cleanup Checklist

- Archived planning docs are not cited as implementation authority.
- New architecture references point to the canonical governance and architecture package.
- Any legacy sync or mirror path that conflicts with this checklist is superseded by `fas-medusa` authority.
