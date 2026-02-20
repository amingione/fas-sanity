# GROQ Consumer Migration Notes (Content-Only Restructure)

## Product Query Changes

Use product content as enrichment only. Do not read price/inventory/order/payment fields from Sanity.

Recommended product selection:
```groq
*[_type == "product" && medusaProductId in $ids]{
  _id,
  medusaProductId,
  medusaVariantId,
  title,
  displayTitle,
  "slug": slug.current,
  shortDescription,
  description,
  keyFeatures,
  specifications,
  attributes,
  compatibleVehicles[]->{_id,title,slug},
  tunes[]->{_id,title,slug},
  images,
  featured,
  promotionTagline,
  metaTitle,
  metaDescription,
  canonicalUrl,
  contentStatus,
  lastSyncedFromMedusa
}
```

## Removed Expectations
- `price`, `compareAtPrice`, `cost`
- `inventory*`, `trackInventory`, `shippingConfig`
- `order*`, `checkout*`, `payment*` fields
- Stripe authority fields in product schemas

## Consumer Routing
- `fas-cms-fresh`: render content from Sanity + commerce from Medusa.
- `fas-medusa`: remains authority for all commerce values.
