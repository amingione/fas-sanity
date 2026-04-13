# Canonical Commerce Architecture

DOCS_VERSION: v2026.03.07  
Status: Canonical  
Applies to: `fas-medusa`, `fas-dash`, `fas-cms-fresh`, `fas-sanity`

## Role map
| System | Canonical role |
| --- | --- |
| `fas-medusa` | Commerce authority, backend, webhook layer |
| `fas-dash` | Internal admin and operations UI |
| `fas-cms-fresh` | Customer-facing storefront |
| Stripe | Payment processor only |
| Sanity | Content only |

## Commerce source of truth
Medusa is source of truth for products, variants, pricing, inventory, cart, checkout, shipping logic, and orders.

## Runtime flow
Storefront -> Medusa cart/checkout -> Stripe payment processing -> Stripe webhook -> Medusa order authority -> Dash operations.

## Restrictions
- Sanity must not be active commerce authority.
- Stripe must not be catalog/pricing/inventory/order authority.
- Dash and storefront must not bypass Medusa authority for commerce-critical state.
