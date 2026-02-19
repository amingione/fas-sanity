# No New Commerce Fields in Sanity

Sanity in this repository is content-only authority.

## Prohibited in Sanity Schemas
- Checkout/cart/order lifecycle state
- Source-of-truth prices, discounts, taxes, totals
- Inventory authority and fulfillment/shipping execution state
- Payment state and gateway artifacts

## Allowed in Sanity Schemas
- Marketing/editorial copy
- Product enrichment content (media, descriptions, compatibility copy)
- SEO and structured content modules
- Bridge identifiers (`medusaProductId`, `medusaVariantId`) as references only

## Enforcement
- CI guard: `scripts/ci/check-content-schema-commerce-authority.mjs`
- Any new schema must declare system authority in PR description.
