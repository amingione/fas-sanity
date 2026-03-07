# FAS Checkout Architecture Governance

DOCS_VERSION: v2026.03.07  
Status: Canonical

## System roles
| System | Checkout role |
| --- | --- |
| `fas-medusa` | Commerce authority, backend, webhook layer |
| `fas-dash` | Internal admin and operations UI |
| `fas-cms-fresh` | Storefront and customer-facing checkout surface |
| `Stripe` | Payment processor only |
| `Sanity` | Content only |

## Checkout runtime flow
1. Storefront reads commerce state from Medusa-backed flows.
2. Storefront sends cart/address/shipping/checkout actions to Medusa.
3. Medusa calculates shipping, tax, totals, and payment payloads.
4. Medusa creates/updates Stripe payment objects.
5. Stripe processes payment only and returns status.
6. Medusa creates orders and owns authoritative order state.
7. Dash consumes and operates on Medusa-owned state.
8. Sanity remains content-only and non-authoritative.

## Enforcement
- Medusa is the only commerce authority.
- Stripe is payment processor only.
- Sanity is content only.
- Storefront and Dash must not become parallel commerce authorities.
