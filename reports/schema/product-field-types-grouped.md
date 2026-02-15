# Product Field Types Grouped (Fully Categorized)

Source: `reports/schema/product-field-types.tsv`

Total fields: **150**

## Core Identity (15)

### Branding Attributes (5)

| Field Path | Type |
| --- | --- |
| `brand` | `string` |
| `color` | `string` |
| `condition` | `union` |
| `material` | `string` |
| `size` | `string` |

### Identifiers & Lifecycle (10)

| Field Path | Type |
| --- | --- |
| `canonicalUrl` | `string` |
| `displayTitle` | `string` |
| `gtin` | `string` |
| `mpn` | `string` |
| `productType` | `union` |
| `sku` | `string` |
| `slug` | `inline` |
| `status` | `union` |
| `title` | `string` |
| `variantStrategy` | `union` |

## Content & Merchandising (38)

### Editorial Content (22)

| Field Path | Type |
| --- | --- |
| `description` | `array<union>` |
| `importantNotes` | `array<object>` |
| `importantNotes[].children` | `array<object>` |
| `importantNotes[].children[].marks` | `array<string>` |
| `importantNotes[].children[].text` | `string` |
| `importantNotes[].level` | `number` |
| `importantNotes[].listItem` | `union` |
| `importantNotes[].markDefs` | `array<object>` |
| `importantNotes[].markDefs[].href` | `string` |
| `importantNotes[].style` | `union` |
| `includedInKit` | `array<object>` |
| `keyFeatures` | `array<object>` |
| `shortDescription` | `array<object>` |
| `shortDescription[].children` | `array<object>` |
| `shortDescription[].children[].marks` | `array<string>` |
| `shortDescription[].children[].text` | `string` |
| `shortDescription[].level` | `number` |
| `shortDescription[].listItem` | `union` |
| `shortDescription[].markDefs` | `array<object>` |
| `shortDescription[].markDefs[].href` | `string` |
| `shortDescription[].style` | `union` |
| `specifications` | `array<object>` |

### Fitment & Compatibility (1)

| Field Path | Type |
| --- | --- |
| `compatibleVehicles` | `array<object>` |

### Product Options & Bundles (9)

| Field Path | Type |
| --- | --- |
| `addOns` | `array<union>` |
| `attributes` | `array<object>` |
| `bundleComponents` | `array<object>` |
| `bundleComponents[].notes` | `string` |
| `bundleComponents[].product` | `inline` |
| `bundleComponents[].quantity` | `number` |
| `bundleComponents[].title` | `string` |
| `options` | `array<union>` |
| `variationOptions` | `array<string>` |

### Service Offer Details (6)

| Field Path | Type |
| --- | --- |
| `serviceDeliverables` | `array<string>` |
| `serviceDeliveryModel` | `union` |
| `serviceDuration` | `string` |
| `serviceLaborNotes` | `string` |
| `serviceLocation` | `string` |
| `serviceSchedulingNotes` | `string` |

## Pricing & Inventory (24)

### Base Pricing (12)

| Field Path | Type |
| --- | --- |
| `compareAtPrice` | `number` |
| `discountPercent` | `number` |
| `discountType` | `union` |
| `discountValue` | `number` |
| `onSale` | `boolean` |
| `price` | `number` |
| `priceCurrency` | `string` |
| `pricingTiers` | `array<object>` |
| `saleEndDate` | `string` |
| `saleLabel` | `union` |
| `salePrice` | `number` |
| `saleStartDate` | `string` |

### Inventory & Cost Controls (4)

| Field Path | Type |
| --- | --- |
| `manualInventoryCount` | `number` |
| `manufacturingCost` | `number` |
| `taxBehavior` | `union` |
| `trackInventory` | `boolean` |

### Promo Display Flags (2)

| Field Path | Type |
| --- | --- |
| `promoCardShowPrice` | `boolean` |
| `promotionTagline` | `string` |

### Wholesale Pricing (6)

| Field Path | Type |
| --- | --- |
| `availableForWholesale` | `boolean` |
| `minimumWholesaleQuantity` | `number` |
| `wholesalePricePlatinum` | `number` |
| `wholesalePricePreferred` | `number` |
| `wholesalePriceStandard` | `number` |
| `wholesalePricingHelper` | `string` |

## Shipping & Fulfillment (23)

### Mail-In Service Logistics (7)

| Field Path | Type |
| --- | --- |
| `mailInServiceDetails` | `object` |
| `mailInServiceDetails.componentWeight` | `number` |
| `mailInServiceDetails.insuranceValue` | `number` |
| `mailInServiceDetails.recommendedPackaging` | `string` |
| `mailInServiceDetails.returnShippingIncluded` | `boolean` |
| `mailInServiceDetails.shippingInstructions` | `string` |
| `mailInServiceDetails.turnaroundTime` | `string` |

### Shipping Configuration (16)

| Field Path | Type |
| --- | --- |
| `coreRequired` | `boolean` |
| `shippingConfig` | `object` |
| `shippingConfig.callForShippingQuote` | `boolean` |
| `shippingConfig.dimensions` | `object` |
| `shippingConfig.dimensions.height` | `number` |
| `shippingConfig.dimensions.length` | `number` |
| `shippingConfig.dimensions.width` | `number` |
| `shippingConfig.handlingTime` | `number` |
| `shippingConfig.requiresShipping` | `boolean` |
| `shippingConfig.separateShipment` | `boolean` |
| `shippingConfig.shippingClass` | `union` |
| `shippingConfig.weight` | `number` |
| `shippingLabel` | `string` |
| `shippingPreview` | `object` |
| `shippingPreview.placeholder` | `string` |
| `specialShippingNotes` | `string` |

## Media & Assets (15)

### Customization Assets (2)

| Field Path | Type |
| --- | --- |
| `customPaint` | `inline` |
| `tune` | `inline` |

### Primary Product Media (7)

| Field Path | Type |
| --- | --- |
| `images` | `array<object>` |
| `images[].alt` | `inline` |
| `images[].asset` | `inline` |
| `images[].crop` | `inline` |
| `images[].hotspot` | `inline` |
| `images[].media` | `unknown` |
| `mediaAssets` | `array<object>` |

### Social/Share Media (6)

| Field Path | Type |
| --- | --- |
| `socialImage` | `object` |
| `socialImage.alt` | `string` |
| `socialImage.asset` | `inline` |
| `socialImage.crop` | `inline` |
| `socialImage.hotspot` | `inline` |
| `socialImage.media` | `unknown` |

## SEO & Discovery (12)

### Cross-Sell & Relationships (4)

| Field Path | Type |
| --- | --- |
| `featured` | `boolean` |
| `filters` | `array<object>` |
| `relatedProducts` | `array<object>` |
| `upsellProducts` | `array<object>` |

### SEO Metadata (5)

| Field Path | Type |
| --- | --- |
| `focusKeyword` | `string` |
| `metaDescription` | `string` |
| `metaTitle` | `string` |
| `noindex` | `boolean` |
| `structuredDataPreview` | `string` |

### Taxonomy & Discovery (3)

| Field Path | Type |
| --- | --- |
| `category` | `array<object>` |
| `googleProductCategory` | `union` |
| `tags` | `array<string>` |

## Merchant Center (10)

### Approval & Feed Status (10)

| Field Path | Type |
| --- | --- |
| `merchantCenterStatus` | `object` |
| `merchantCenterStatus.isApproved` | `boolean` |
| `merchantCenterStatus.issues` | `array<object>` |
| `merchantCenterStatus.issues[].code` | `string` |
| `merchantCenterStatus.issues[].description` | `string` |
| `merchantCenterStatus.issues[].severity` | `string` |
| `merchantCenterStatus.lastSynced` | `string` |
| `merchantCenterStatus.needsCategory` | `boolean` |
| `merchantCenterStatus.needsGtin` | `boolean` |
| `merchantCenterStatus.needsMpn` | `boolean` |

## Commerce Integrations (10)

### Medusa Linkage (2)

| Field Path | Type |
| --- | --- |
| `medusaProductId` | `string` |
| `medusaVariantId` | `string` |

### Stripe Linkage & Sync State (8)

| Field Path | Type |
| --- | --- |
| `stripeActive` | `boolean` |
| `stripeDefaultPriceId` | `string` |
| `stripeLastSyncedAt` | `string` |
| `stripeMetadata` | `array<object>` |
| `stripePriceId` | `string` |
| `stripePrices` | `array<object>` |
| `stripeProductId` | `string` |
| `stripeUpdatedAt` | `string` |

## Operations & Analytics (3)

### Catalog Operational Flags (1)

| Field Path | Type |
| --- | --- |
| `availability` | `union` |

### Internal Insights Panels (2)

| Field Path | Type |
| --- | --- |
| `marketingInsightsPanel` | `object` |
| `marketingInsightsPanel.placeholder` | `string` |

## Coverage

- Categorized fields: **150/150**
- Unmapped fields: **0**
