# FAS Sanity Baseline Matrix (Content-Only Authority)

Date: 2026-02-18
Owner: fas-sanity

## Authority Rules
- `Medusa` owns commerce truth (pricing, inventory, cart, checkout, orders, shipping, payments).
- `Sanity` owns marketing/content/editorial truth only.
- `fas-cms-fresh` consumes Sanity content; commerce values are read from Medusa.

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
- Transactional, operational, accounting, inventory, shipping, vendor, customer ops schemas
- Legacy `shopify/*` object schema set
- Stripe/order/shipping/pricing object schema set used for transaction authority

## Exit Criteria Mapping
- Every schema in registry is tagged `KEEP`, `REFACTOR`, or `REMOVE`.
- No ambiguity remains about source-of-truth ownership.
