# FAS Sanity — Restructure Plan

## Stable Architecture

```
Astro      → Public storefront (render layer)
Medusa     → Commerce engine (money, stock, carts, orders)
Next.js    → Internal ops console (order desk, quotes, shipping)
Sanity     → Content + experience layer
Stripe     → Payments
Shippo     → Shipping execution
```

**Sanity's role**: owns words, media, page composition, and marketing content.  
**Sanity does NOT own**: prices, inventory, order state, customer records, payment data, shipping execution.

---

## Current Schema Audit

### What exists today (87 document schemas)

| Category | Schemas | Verdict |
|----------|---------|---------|
| **Product content** | `product`, `productVariant`, `category`, `collection`, `productBundle`, `filterTag`, `tune`, `vehicleModel`, `altText`, `downloadResource`, `productTable`, `wheelQuote` | **KEEP** (refactor some) |
| **Marketing/campaigns** | `blogPost`, `blogCategory`, `article`, `page`, `campaign`, `promotion`, `emailCampaign`, `emailTemplate`, `emailAutomation`, `emailLog`, `marketingChannel`, `attribution`, `attributionSnapshot`, `marketingOptIn`, `merchantFeed`, `shoppingCampaign` | **KEEP** |
| **Site experience** | `home` (singleton), `siteSettings` (singleton), `colorTheme`, `dashboardView` (singleton) | **KEEP** |
| **Orders/transactions** | `order`, `invoice`, `quote`, `quoteRequest`, `paymentLink`, `abandonedCheckout`, `checkoutSession`, `expiredCart`, `stripeCoupon` | **REMOVE** → Medusa + Next.js |
| **Accounting** | `bill`, `check`, `expense`, `profitLoss`, `cashFlow`, `bankAccount` | **REMOVE** → accounting system |
| **Shipping ops** | `freightQuote`, `createLabel`, `senderAddress` | **REMOVE** → Next.js + Shippo |
| **Inventory ops** | `inventoryRecord`, `inventoryTransaction` | **REMOVE** → Medusa |
| **Manufacturing** | `manufacturingOrder`, `workOrder` | **REMOVE** → Next.js |
| **Vendor portal** | `vendor`, `vendorApplication`, `vendorOrder`, `vendorQuote`, `vendorProduct`, `vendorMessage`, `vendorNotification`, `vendorEmailLog`, `vendorDocument`, `vendorReturn`, `vendorFeedback`, `vendorPost`, `vendorPostCategory`, `vendorAuthToken`, `purchaseOrder` | **REMOVE** → Next.js vendor portal |
| **Customer ops** | `customer`, `customerMessage`, `customerPortalAccess`, `militaryVerification` | **REMOVE** → Medusa + Next.js |
| **Services/appointments** | `appointment`, `service`, `vehicle` | **REMOVE** → Next.js or separate system |
| **Employee portal** | `empProfile`, `empResources`, `empPortal`, `empFormSubmission` | **REMOVE** → Next.js admin |
| **System/logs** | `functionLog`, `logDrain`, `searchQuery`, `searchSettings`, `analyticsSettings` | **REMOVE** (settings singletons can stay) |
| **Auth/infra** | `user`, `workspace`, `connectorInstall`, `integrationPack`, `printSettings`, `portalDoc` | **REMOVE** → Next.js |

### Object schemas

| Category | Schemas | Verdict |
|----------|---------|---------|
| **Portable text** | `portableTextType`, `portableTextSimpleType` | **KEEP** |
| **SEO** | `seoType` | **KEEP** |
| **Modules** | `heroType`, `callToActionType`, `imageCallToActionType`, `gridType`, `gridItemType`, `accordionType`, `accordionGroupType`, `calloutType`, `imageFeaturesType`, `imageFeatureType`, `productFeaturesType`, `collectionReferenceType`, `productReferenceType`, `instagramType` | **KEEP** |
| **Links** | `linkInternalType`, `linkExternalType`, `linkEmailType`, `linkProductType` | **KEEP** |
| **Navigation** | `menuType`, `menuLinksType`, `footerType`, `notFoundPageType` | **KEEP** |
| **Collection** | `collectionGroupType`, `collectionLinksType` | **KEEP** |
| **Product detail** | `specItemType`, `attributeType`, `kitItemType`, `mediaItemType`, `collapsibleFeatureType`, `addOnType`, `productAddOnType`, `productCustomizationType` | **KEEP** (refactor to remove pricing) |
| **Hotspots** | `imageWithProductHotspotsType`, `productHotspotsType`, `spotType` | **KEEP** |
| **Custom options** | `customProductOptionColorType`, `customProductOptionSizeType`, `customProductOptionCustomType`, `colorValueType`, `customPaintType` | **KEEP** (content-only, pricing removed) |
| **Stripe types** | `stripePriceSnapshotType`, `stripeOrderSummaryType`, `stripeMetadataEntryType`, `stripePaymentMethodType` | **REMOVE** |
| **Shopify types** | anything in `objects/shopify/` | **REMOVE** (legacy) |
| **Order/invoice/quote objects** | `orderCartItemType`, `orderCartItemMetaType`, `orderEventType`, `invoiceLineItemType`, `quoteLineItemType`, `quoteTimelineEventType` | **REMOVE** → Next.js |
| **Shipping objects** | `shipToType`, `shipToSnakeType`, `shipFromType`, `shippingAddressType`, `shippingOptionCustomerAddressType`, `shippingOptionDimensionsType`, `packageDetailsType`, `packageDimensionsType`, `shipmentWeightType`, `shippingLogEntryType`, `billToType` | **REMOVE** → Next.js |
| **Customer objects** | `customerAddressType`, `customerBillingAddressType`, `customerDiscountType`, `customerInvoiceSummaryType`, `customerOrderSummaryType`, `customerQuoteSummaryType` | **REMOVE** |
| **Vendor objects** | `vendorOrderSummaryType`, `vendorQuoteSummaryType` | **REMOVE** |
| **Pricing objects** | `pricingTierType`, `modListItemType`, `checkLineItemType`, `buildQuote` | **REMOVE** |

---

## Schemas to KEEP (Reusable As-Is or With Minor Cleanup)

These require no structural change, just import into the new desk structure:

**Documents (22)**:
`blogPost`, `blogCategory`, `article`, `page`, `category`, `collection`, `filterTag`, `vehicleModel`, `tune`, `altText`, `downloadResource`, `productTable`, `promotion`, `emailCampaign`, `emailTemplate`, `emailAutomation`, `marketingOptIn`, `merchantFeed`, `shoppingCampaign`, `colorTheme`

**Singletons (3)**: `home`, `siteSettings`, `dashboardView`

**Marketing (3)**: `campaign`, `marketingChannel`, `attributionSnapshot`

**All module objects (14)**: hero, CTA, grid, accordion, callout, imageFeatures, productFeatures, collectionReference, productReference, instagram, imageCallToAction, gridItem, accordionGroup

**All link objects (4)**: internal, external, email, product

**All global objects (4)**: menu, menuLinks, footer, notFoundPage

**Content objects (8)**: seoType, portableTextType, portableTextSimpleType, specItemType, attributeType, kitItemType, mediaItemType, collapsibleFeatureType

**Collection objects (2)**: collectionGroupType, collectionLinksType

**Hotspot objects (3)**: imageWithProductHotspotsType, productHotspotsType, spotType

---

## Schemas to REFACTOR

### `product` (Heavy refactor)

Current: 1,847 lines mixing commerce data with content. Needs to become a **content enrichment document** that links to Medusa via `medusaProductId`.

**Keep these field groups:**
- Identity: `title`, `displayTitle`, `slug`, `productType`, `sku` (display only)
- Content: `shortDescription`, `description` (rich text), `keyFeatures`, `importantNotes`, `specifications`, `attributes`, `includedInKit`, `mediaAssets`
- Images: `images` array with alt text references
- Options: `options` array (Color/Size/Custom) — content descriptions only
- Add-ons: `addOns` — merchandising copy only, no pricing
- Compatibility: `compatibleVehicles`, `tune` references
- SEO: `metaTitle`, `metaDescription`, `focusKeyword`, `socialImage`, `canonicalUrl`, `structuredData`
- Merchant feed: `brand`, `gtin`, `mpn`, `googleProductCategory`
- Flags: `featured`, `promotionTagline`
- Medusa link: `medusaProductId`, `medusaVariantId`

**Remove these field groups:**
- All pricing: `price`, `compareAtPrice`, `cost`, `salePrice`, `wholesalePricing`, `pricingTiers`
- All inventory: `trackInventory`, `manualInventoryCount`, `availability`
- All shipping calc: `shippingConfig` weight/dimensions (keep as display-only reference if useful for content writers)
- Stripe sync: `stripeProductId`, `stripePriceId`, `stripeActive`, `stripePrices`
- Status management: collapse to `contentStatus` (draft/review/published) separate from Medusa status

**Add:**
- `contentStatus`: `draft | review | published`
- `lastSyncedFromMedusa`: datetime
- `contentCompleteness`: computed object (score, missingFields, lastCalculated)

### `productVariant` (Simplify)

Keep: title, images, description overrides, `medusaVariantId` link.
Remove: pricing, inventory, Stripe fields.

### `productBundle` (Simplify)

Keep: title, description, included products (references), marketing copy, images.
Remove: bundle pricing logic (Medusa handles).

### `addOnType` / `productAddOnType` (Remove pricing)

Keep: title, description, image, product reference.
Remove: `price`, `compareAtPrice`.

### `customProductOption*` types (Remove pricing)

Keep: title, description, color swatches, size labels, custom option descriptions.
Remove: price modifiers.

### `emailLog` (Evaluate)

If used for tracking email sends → remove (Next.js handles).
If used as email content archive → keep as `emailContentArchive`.

---

## Schemas to ADD

### New Documents

| Schema | Purpose | Priority |
|--------|---------|----------|
| `brandAsset` | Logos, color tokens, typography guidelines, brand voice docs | High |
| `legalContent` | Terms, privacy, returns, warranty — one doc type with `contentType` field | High |
| `storePolicy` | Shipping policy, returns policy, warranty policy — rendered on storefront | High |
| `reusableSnippet` | Testimonials, trust badges, partner logos, reusable content blocks | High |
| `navigationMenu` | Header, footer, mega-menu configurations as structured content | High |
| `badge` | Product badges (New, Sale, Limited, Clearance) with display rules | Medium |
| `comparisonTable` | Good/Better/Best product comparison content | Medium |
| `faqPage` | Structured FAQ with schema.org markup support | Medium |
| `orderEmailTemplate` | Order confirmation, shipping notification email content | Medium |
| `quoteTemplate` | Quote document layout and copy blocks | Medium |
| `invoiceTemplate` | Invoice document layout and copy blocks | Medium |
| `redirect` | URL redirect rules (old → new) for SEO migration | Low |

### New Object Types

| Schema | Purpose | Priority |
|--------|---------|----------|
| `badgeType` | Badge definition (label, color, icon, conditions) | Medium |
| `comparisonRowType` | Row in a comparison table | Medium |
| `faqItemType` | Question + answer pair with schema.org support | Medium |
| `templateBlockType` | Reusable content block for email/doc templates | Medium |
| `megaMenuGroupType` | Mega-menu column with links, images, CTAs | High |

---

## Proposed Sanity Studio Desk Structure

This is the working tree your content team sees in Sanity Studio:

```
📁 Products
  ├── All Products                    # product list, filterable
  ├── Categories                      # category taxonomy
  ├── Collections                     # curated collections
  ├── Bundles                         # productBundle
  ├── Compatibility                   # vehicleModel
  │     └── Tunes                     # tune
  ├── Filter Tags                     # filterTag
  ├── Badges                          # badge (NEW)
  ├── Comparison Tables               # comparisonTable (NEW)
  └── Downloads & Resources           # downloadResource

📁 Marketing
  ├── Campaigns                       # campaign
  ├── Promotions                      # promotion
  ├── Email
  │     ├── Campaigns                 # emailCampaign
  │     ├── Templates                 # emailTemplate
  │     └── Automations               # emailAutomation
  ├── Shopping Feeds                  # merchantFeed, shoppingCampaign
  ├── Attribution                     # marketingChannel, attributionSnapshot
  └── Opt-ins                         # marketingOptIn

📁 Content
  ├── Blog
  │     ├── Posts                     # blogPost
  │     └── Categories                # blogCategory
  ├── Articles                        # article
  ├── Landing Pages                   # page
  ├── FAQ                             # faqPage (NEW)
  └── Product Tables                  # productTable

📁 Site
  ├── 🏠 Homepage                     # home (singleton)
  ├── Navigation                      # navigationMenu (NEW)
  ├── Theme                           # colorTheme
  ├── Legal
  │     ├── Terms of Service          # legalContent (filtered)
  │     ├── Privacy Policy            # legalContent (filtered)
  │     ├── Return Policy             # legalContent (filtered)
  │     └── Warranty                  # legalContent (filtered)
  ├── Store Policies                  # storePolicy (NEW)
  └── Alt Text Library                # altText

📁 Brand
  ├── Assets                          # brandAsset (NEW)
  ├── Reusable Snippets               # reusableSnippet (NEW)
  └── Testimonials                    # reusableSnippet (filtered by type)

📁 Templates
  ├── Order Emails                    # orderEmailTemplate (NEW)
  ├── Quote Documents                 # quoteTemplate (NEW)
  └── Invoice Documents               # invoiceTemplate (NEW)

⚙️ Settings
  ├── Site Settings                   # siteSettings (singleton)
  ├── Dashboard                       # dashboardView (singleton)
  └── Redirects                       # redirect (NEW)
```

---

## Integration Map

### Medusa → Sanity (webhooks or sync workflow)

| Medusa Event | Sanity Action |
|-------------|---------------|
| Product created | Create stub `product` doc with `medusaProductId`, title, SKU — status: `draft` |
| Product updated | Update `lastSyncedFromMedusa` timestamp, optionally update display-only fields |
| Product deleted/archived | Flag Sanity doc as archived (don't delete — preserve content) |
| Collection created | Create stub `collection` doc linked to Medusa collection |

**Sanity product doc acts as enrichment layer.** Content team fills in descriptions, images, features, SEO. Medusa remains system of record for price, stock, variants.

### Sanity → Astro (GROQ queries at build/ISR time)

| Astro Page | Sanity Query |
|------------|-------------|
| Homepage (`/`) | `home` singleton → hero, modules, featured collections |
| Shop (`/shop`) | `product` list with category/filter references |
| Product detail (`/shop/[slug]`) | `product` doc + related products + compatibility |
| Category (`/shop/categories/[slug]`) | `category` + products in category |
| Collection (`/shop/collections/[slug]`) | `collection` + curated product list + layout |
| Blog (`/blog`) | `blogPost` list |
| Blog post (`/blog/[slug]`) | `blogPost` doc |
| Landing pages (`/[slug]`) | `page` doc with modular content blocks |
| FAQ (`/faq`) | `faqPage` doc |
| Legal pages (`/terms`, `/privacy`, etc.) | `legalContent` filtered by type |
| About, Contact, etc. | `page` docs |
| Navigation (all pages) | `navigationMenu` + `siteSettings` |

### Sanity → Next.js Admin (read-only content for ops)

| Next.js Use | Sanity Source |
|-------------|--------------|
| Order emails | `orderEmailTemplate` — content blocks for email rendering |
| Quote PDFs | `quoteTemplate` — layout and copy for quote generation |
| Invoice PDFs | `invoiceTemplate` — layout and copy for invoice generation |
| Product context in order view | `product` doc — images, descriptions for order desk reference |
| Shipping notification emails | `orderEmailTemplate` (shipping variant) |

---

## What Gets Removed (and Where It Goes)

### → Medusa (system of record)

| Current Sanity Schema | New Home |
|----------------------|----------|
| Product pricing fields | Medusa product/variant pricing |
| Inventory tracking | Medusa inventory module |
| Customer records | Medusa customer module |
| Order state | Medusa order module |
| Payment data | Medusa + Stripe |
| Shipping rates/profiles | Medusa + Shippo |

### → Next.js Admin Console

| Current Sanity Schema | New Home |
|----------------------|----------|
| `order` | `/admin/orders` |
| `invoice` | `/admin/invoices` |
| `quote`, `quoteRequest` | `/admin/quotes` |
| `abandonedCheckout`, `checkoutSession`, `expiredCart` | `/admin/dashboard/operations-feed` |
| `freightQuote`, `createLabel`, `senderAddress` | `/admin/shipping` |
| `inventoryRecord`, `inventoryTransaction` | `/admin/inventory` |
| `manufacturingOrder`, `workOrder` | `/admin/orders` or custom ops |
| All `vendor*` schemas | `/admin/vendors` |
| `purchaseOrder` | `/admin/vendors/:vendorId/purchase-orders` |
| `customer`, `customerMessage` | `/admin/customers` |
| `appointment`, `service`, `vehicle` | `/admin/dashboard` or separate |
| `empProfile`, `empResources`, `empPortal` | `/admin/profile` or HR system |
| `user`, `workspace` | `/admin/settings/security` |
| `functionLog`, `logDrain` | `/admin/settings/developer` |
| `stripeCoupon` | `/admin/marketing-links` or Medusa promotions |
| `paymentLink` | Stripe Dashboard or Next.js |
| `bill`, `check`, `expense`, `profitLoss`, `cashFlow`, `bankAccount` | Accounting system (QuickBooks, etc.) |

---

## Migration Strategy

### Phase 1 — Clean the product schema (Week 1)

1. Fork `product.ts` → `product-v2.ts`
2. Strip commerce fields (pricing, inventory, shipping calc, Stripe sync)
3. Add `contentStatus`, `lastSyncedFromMedusa`, `contentCompleteness`
4. Keep `medusaProductId` / `medusaVariantId` as the bridge
5. Simplify `productVariant` to content-only
6. Remove pricing from `addOnType`, `productAddOnType`, custom option types
7. Update desk structure to new groupings

### Phase 2 — Add missing content types (Week 2)

1. Create `brandAsset`, `legalContent`, `storePolicy`, `reusableSnippet`
2. Create `navigationMenu` with mega-menu support
3. Create `badge` for product merchandising
4. Migrate hardcoded legal page content into `legalContent` docs

### Phase 3 — Add template types (Week 3)

1. Create `orderEmailTemplate`, `quoteTemplate`, `invoiceTemplate`
2. Define portable text blocks that Next.js can consume for email/PDF rendering
3. Create `faqPage` with schema.org structured data support
4. Create `comparisonTable` for product merchandising

### Phase 4 — Remove dead schemas (Week 4)

1. Remove all vendor schemas (after Next.js vendor portal exists)
2. Remove all transactional schemas (after Next.js admin handles them)
3. Remove all accounting schemas
4. Remove Stripe/Shopify object types
5. Remove shipping/order/invoice operational objects
6. Clean up `index.ts` schema registration

### Phase 5 — Wire integrations (Ongoing)

1. Set up Medusa → Sanity webhook for product stub creation
2. Set up Sanity → Astro rebuild triggers (webhook on publish)
3. Set up Sanity → Next.js content API for templates
4. Build content completeness calculation (custom Sanity plugin or webhook)

---

## Schema Count Summary

| | Current | After Restructure |
|---|---------|-------------------|
| **Document schemas** | 87 | ~38 |
| **Object schemas** | ~55 | ~35 |
| **Singletons** | 3 | 3 |
| **Total** | ~145 | ~76 |

Roughly **half** the current schemas survive. The other half moves to Medusa, Next.js, or gets deleted as dead weight. What remains is focused, content-centric, and within Sanity's strengths.

---

## Files to Reference

This plan was built from a full audit of:

- `fas-sanity/packages/sanity-config/src/schemaTypes/` — all documents, objects, singletons, marketing
- `fas-cms-fresh/src/pages/` — Astro storefront routes
- `fas-medusa/src/` — Medusa modules, routes, workflows
- `fas-sanity-vision-NEW.txt` — your vision doc
- `nextjs-working-tree-idea.txt` — your Next.js admin spec
