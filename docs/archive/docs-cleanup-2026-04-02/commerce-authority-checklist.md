# Commerce Authority Checklist

DOCS_VERSION: v2026.03.07  
Status: Canonical

## Core rules
- `fas-medusa` owns products, variants, pricing, inventory, cart, checkout, shipping logic, and orders.
- `fas-dash` manages operations through Medusa APIs.
- `fas-cms-fresh` is storefront UI, not commerce authority.
- Stripe is payment processor only.
- Sanity is content only.

## Prohibited claims in active docs
- Sanity as product/pricing/inventory/cart/checkout/order authority.
- Stripe as catalog or order authority.
- Storefront as authoritative totals/tax/shipping/order calculator.

## Required references in active architecture docs
- `docs/governance/checkout-architecture-governance.md`
- `docs/governance/commerce-authority-checklist.md`
- `docs/architecture/canonical-commerce-architecture.md`
- `docs/architecture/migration-status.md`
