# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---

# FAS Sanity Baseline Matrix (Content + Vendor Workspace)

Date: 2026-02-18
Owner: fas-sanity

## Authority Rules
- `Medusa` owns commerce truth (pricing, inventory, cart, checkout, orders, shipping, payments).
- `Sanity` owns marketing/content/editorial data plus vendor relationship workspace data.
- `fas-cms-fresh` consumes Sanity content; commerce values are read from Medusa.
- Vendor transition: Sanity may host vendor relationship metadata and mirrored lifecycle timeline events until cutover verification.

## Schema Classification

### KEEP
- `post`, `blogCategory`, `article`, `page`
- `product`, `productVariant`, `category`, `collection`, `productBundle`, `filterTag`, `vehicleModel`, `tune`
- `altText`, `downloadResource`, `productTable`, `wheelQuote`
- `campaign`, `marketingChannel`, `attributionSnapshot`, `promotion`
- `emailCampaign`, `emailTemplate`, `emailAutomation`, `marketingOptIn`, `merchantFeed`, `shoppingCampaign`
- `home`, `settings`, `dashboardView`, `colorTheme`

### REFACTOR
- `product` -> content-enrichment only; remove pricing/inventory/payment/shipping authority
- `productVariant` -> content-only variant enrichment; no pricing/inventory authority
- `productBundle` -> merchandising only; no bundle price logic
- `collection` -> content taxonomy and merchandising only
- `shoppingCampaign` -> remove order references
- `productTable` -> content comparison/documentation only
- `addOn`, `productAddOn`, `customProductOption*` -> remove price modifiers

### REMOVE
- Transactional, operational, accounting, inventory, shipping, and shopper-customer ops schemas
- Legacy `shopify/*` object schema set
- Stripe/order/shipping/pricing object schema set used for transaction authority

### DEFERRED REMOVE (Vendor Transition Scope)
- Vendor portal schemas required for in-flight operations remain until:
  - webhook-first vendor timeline is live and verified
  - replacement vendor workspace is accepted
  - `docs/SourceOfTruths/vendor-cutover-checklist.md` is verified

## Exit Criteria Mapping
- Every schema in registry is tagged `KEEP`, `REFACTOR`, or `REMOVE`.
- No ambiguity remains about system-of-record ownership.
