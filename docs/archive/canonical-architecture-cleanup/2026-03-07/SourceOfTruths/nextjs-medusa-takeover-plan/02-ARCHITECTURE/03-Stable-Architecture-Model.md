# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---


Astro     → Public Storefront (render layer)
Medusa    → Commerce Engine (money, stock, carts, orders)
Next.js   → Internal Ops Console (order desk, quotes, shipping)
Sanity    → Content + Experience Layer
Stripe    → Payments
Shippo    → Shipping execution


---


Astro   → Public storefront
Medusa  → Commerce authority
Next    → Internal operations
Sanity  → Content + experience
Stripe  → Payments
Shippo  → Shipping execution