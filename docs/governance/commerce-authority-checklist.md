_Purpose:_
Prevent architecture drift in the FAS ecosystem by enforcing the Medusa-authoritative commerce model.

_Applies to:_
fas-medusa, fas-cms-fresh, fas-dash, fas-sanity

⸻

1. Commerce Source of Truth

The following must always remain true.

Domain Authority
Products Medusa
Variants Medusa
Pricing Medusa
Inventory Medusa
Cart Medusa
Checkout Medusa
Orders Medusa
Shipping Medusa
Payment execution Stripe
Content / marketing Sanity

Sanity must never control commerce state.

⸻

2. Storefront Runtime Rule

A valid Medusa product must always render on storefront.

Medusa product
→ sales channel publish
→ storefront query
→ optional Sanity enrichment
→ PDP
→ cart
→ checkout
→ PaymentIntent
→ Stripe webhook
→ Medusa order

Rules:
• A missing Sanity document must never block product visibility
• Sanity fields may enrich only
• Medusa fields always override Sanity

⸻

3. Sanity Restrictions

Sanity must not mutate or control:
• product creation
• variant definitions
• price
• inventory
• checkout
• order creation
• payment confirmation
• shipping logic

Allowed:
• product descriptions
• images
• SEO
• blog
• campaigns
• email templates

Sanity may store Medusa IDs only as references.

⸻

4. Stripe Restrictions

Stripe is not a commerce authority.

Stripe must never:
• create products as catalog source
• calculate tax
• calculate shipping
• calculate totals

Stripe only receives:

amount
currency
metadata

from Medusa.

⸻

5. Storefront Rules

fas-cms-fresh must:
• read product visibility from Medusa
• render PDP using Medusa product data
• use canonical cart state
• send checkout operations to Medusa

fas-cms-fresh must never:
• calculate price
• calculate shipping
• calculate tax
• create orders
• confirm payments

⸻

6. Dashboard Rules

fas-dash is the admin control surface.

It must operate through:

Medusa Admin API

It must not:
• mutate commerce data through Sanity
• bypass Medusa APIs
• maintain a separate catalog

⸻

7. Legacy Sanity Sync

If these exist, they are technical debt:

/api/webhooks/sanity-product-sync
Sanity → Medusa upsert workflows
Sanity inventory mutation logic
Sanity order overlays

Migration path: 1. Freeze mutation 2. Convert to content linkage 3. Remove infrastructure 4. Validate Medusa-only commerce

⸻

8. Merge Gate Checklist

Before merging commerce-related changes verify:
• No Sanity → Medusa mutation paths added
• No storefront dependency on Sanity product records
• No Sanity fields overriding Medusa commerce fields
• No Stripe catalog creation logic introduced
• Checkout flow still matches canonical runtime flow
• Medusa remains single source of truth

⸻

9. Quick Repo Audit Commands

Run these before approving architecture changes:

Detect Sanity commerce reads

rg sanity src | rg -E "price|inventory|variant|order"

Detect Sanity writes

rg "sanityClient.create|sanityClient.patch"

Detect Stripe catalog usage

rg "stripe.products.create|stripe.prices.create"

⸻

10. Failure Conditions

Stop implementation immediately if:
• a storefront feature requires a Sanity product document to render
• pricing comes from anywhere except Medusa
• checkout totals are calculated outside Medusa
• orders are created outside Medusa

These indicate architecture regression.

⸻

Governance

This checklist supplements:

docs/governance/checkout-architecture-governance.md

If any rule conflicts with implementation behavior, the architecture document takes precedence and the implementation must be corrected.
