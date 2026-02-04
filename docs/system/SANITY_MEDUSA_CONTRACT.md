# Sanity <=> Medusa Data Contract

This document outlines the field-level mapping between Sanity and Medusa. It defines the single source of truth (Authority) for each piece of data.

**Note:** The Medusa fields listed are based on standard Medusa API responses. This contract should be verified against the specific running instance of `fas-medusa`.

## Product Domain

| Sanity Field | Authority | Medusa Field | Transform Rules | Example |
|---|---|---|---|---|
| `_id` | Sanity | `metadata.sanityId` | `string` | `"abc123"` |
| `title` | Medusa | `title` | `string` | `"My Product"` |
| `slug.current` | Medusa | `handle` | `string` | `"my-product"` |
| `description` | Sanity | `description` | `PortableText` -> `html` | `"<p>Desc...</p>"` |
| `images` | Sanity | `images` | `SanityImage[]` -> `string[]` (URLs) | `["https://cdn..."]` |
| `status` | Medusa | `status` | `string` (active/draft/archived) | `"published"` |
| `productType` | Sanity | `metadata.productType` | `string` (physical/service/bundle) | `"physical"` |
| `tags` | Sanity | `tags` | `string[]` | `["tag1"]` |
| `medusaProductId`| Medusa | `id` | `string` | `"prod_123"` |

## Product Variant Domain

| Sanity Field | Authority | Medusa Field | Transform Rules | Example |
|---|---|---|---|---|
| `_id` | Sanity | `variant.metadata.sanityId` | `string` | `"xyz789"` |
| `sku` | Medusa | `variant.sku` | `string` | `"SKU-123"` |
| `title` | Medusa | `variant.title` | `string` | `"Variant Title"` |
| `price` | Medusa | `variant.prices[].amount` | `number` -> `price_cents` (integer) | `1999` |
| `trackInventory` | Medusa | `variant.manage_inventory` | `boolean` | `true` |
| `manualInventoryCount`| Medusa | `variant.inventory_quantity` | `number` | `100` |
| `shippingConfig.weight` | Medusa | `variant.weight` | `number` (lbs) -> `Weight` object | `{ value: 5, unit: 'lb' }` |
| `shippingConfig.dimensions`| Medusa | `variant.length`, `variant.width`, `variant.height` | `object` -> `Dimensions` object | `{ length: 10, width: 5, height: 2, unit: 'in' }` |
| `shippingConfig.requiresShipping` | Medusa | `product.shippable` | `boolean` | `true` |
| `medusaVariantId`| Medusa | `variant.id` | `string` | `"variant_456"` |
| `options` | Medusa | `variant.options` | `SanityOption[]` -> `MedusaOption[]` | `[{ name: "Color", values: ["Red"]}]` |
