# Sanity Schema Inventory – Medusa Data Pipeline

**Generated:** 2026-02-11
**Purpose:** Complete field-level documentation of Sanity schemas that exchange data with Medusa.js
**Scope:** Core commerce entities (Product, Order, Customer) + supporting objects

---

## Document Schemas

### 1. `product` (Document)

**File:** `/packages/sanity-config/src/schemaTypes/documents/product.ts` (1847 lines)
**`_type` value:** `"product"`
**Purpose:** Product catalog with Medusa synchronization capability
**Medusa Integration:** Bidirectional – Sanity can be authoritative OR mirror Medusa products

#### Identity & Status Fields

| Field             | Type     | Required | Read-Only | Default         | Validation                                   | Description                         |
| ----------------- | -------- | -------- | --------- | --------------- | -------------------------------------------- | ----------------------------------- |
| `title`           | `string` | ✓        | ✗         | —               | max 100 chars                                | Product display name                |
| `slug`            | `slug`   | ✓        | ✗         | auto from title | unique                                       | URL-safe identifier                 |
| `status`          | `string` | ✓        | ✗         | `"active"`      | enum: active/draft/paused/archived           | Publication status                  |
| `productType`     | `string` | ✓        | ✗         | `"physical"`    | enum: physical/service/bundle                | Delivery model                      |
| `sku`             | `string` | ✗        | ✗         | auto-generated  | pattern: `/^[A-Z]{2}-[A-Z0-9]{4}-[A-Z]{3}$/` | Canonical SKU (e.g., `FP-A1B2-RED`) |
| `medusaProductId` | `string` | ✗        | ✓         | —               | —                                            | Medusa product ID (linking field)   |
| `medusaVariantId` | `string` | ✗        | ✓         | —               | —                                            | Medusa variant ID (linking field)   |

**Medusa Backing Detection:**

```typescript
const isMedusaBacked = (document?: Record<string, any> | null): boolean => {
  if (!document) return false
  return Boolean(
    (typeof document.medusaProductId === 'string' && document.medusaProductId.trim()) ||
    (typeof document.medusaVariantId === 'string' && document.medusaVariantId.trim()),
  )
}
```

#### Pricing Fields

| Field            | Type     | Required | Read-Only   | Default | Validation           | Description                 |
| ---------------- | -------- | -------- | ----------- | ------- | -------------------- | --------------------------- |
| `price`          | `number` | ✓        | conditional | —       | min: 0, precision: 2 | **USD DOLLARS** (not cents) |
| `compareAtPrice` | `number` | ✗        | conditional | —       | min: 0, precision: 2 | MSRP / original price       |
| `cost`           | `number` | ✗        | conditional | —       | min: 0, precision: 2 | COGS for margin calculation |

**Price Validation Warning:**

```typescript
.custom((value) => {
  if (typeof value !== 'number') return true
  if (value >= 1000 && value % 100 === 0) {
    return 'Price looks like cents. Enter dollars (e.g., 21.00 for $21.00).'
  }
  return true
})
```

**Read-Only When Medusa-Backed:** Price fields become read-only when `isMedusaBacked(document)` returns `true`.

#### Product Options vs Add-Ons

**CRITICAL DISTINCTION:**

| Array Field | Purpose                                        | Type Reference                                                                     | Medusa Mapping                 |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
| `options`   | Variant-defining choices (Color, Size, Custom) | `customProductOptionColor`, `customProductOptionSize`, `customProductOptionCustom` | Maps to Medusa product options |
| `addOns`    | Upsell extras (bundles, accessories)           | `addOn`, `productAddOn`                                                            | Separate line items            |

**Options Array:**

- **Required for variants:** If product has variants, options define them
- **Max 3 options** (Medusa limit)
- **Types:** Color, Size, Custom
- **Used in:** Variant generation, SKU composition

**Add-Ons Array:**

- **Optional upsells:** Installation kits, bundles, accessories
- **Pricing:** Supports bundle discount ($ or %)
- **Behavior:** `defaultSelected`, `required` flags
- **Used in:** Cart line items, separate from variant selection

#### Inventory & Shipping Fields

| Field                              | Type      | Required | Read-Only   | Visibility                 | Description                         |
| ---------------------------------- | --------- | -------- | ----------- | -------------------------- | ----------------------------------- |
| `inventory.trackQuantity`          | `boolean` | ✗        | conditional | —                          | Enable stock tracking               |
| `inventory.quantity`               | `number`  | ✗        | conditional | depends on `trackQuantity` | Current stock count                 |
| `inventory.lowStockThreshold`      | `number`  | ✗        | ✗           | depends on `trackQuantity` | Alert threshold                     |
| `shippingConfig.weight`            | `number`  | ✗        | conditional | depends on `productType`   | Weight in pounds                    |
| `shippingConfig.dimensions.length` | `number`  | ✗        | conditional | depends on `productType`   | Length in inches                    |
| `shippingConfig.dimensions.width`  | `number`  | ✗        | conditional | depends on `productType`   | Width in inches                     |
| `shippingConfig.dimensions.height` | `number`  | ✗        | conditional | depends on `productType`   | Height in inches                    |
| `shippingConfig.shippingClass`     | `string`  | ✗        | ✗           | depends on `productType`   | enum: standard/heavy/fragile/hazmat |
| `shippingConfig.requiresShipping`  | `boolean` | ✗        | ✗           | —                          | Defaults based on `productType`     |

**Shipping Visibility Rules:**

- Hidden if `productType === "service"`
- Visible for `physical` and `bundle` types
- `requiresShipping` controls whether shipping calculation runs

#### Media Fields

| Field            | Type        | Required | Description                                         |
| ---------------- | ----------- | -------- | --------------------------------------------------- |
| `images`         | `array`     | ✗        | Array of `image` objects with `alt` text references |
| `images[].alt`   | `reference` | ✗        | Reference to `imageAlt` document for i18n alt text  |
| `images[].asset` | `image`     | ✓        | Sanity image asset                                  |

**Image Fallback for Medusa:**

- If Medusa-backed and no Sanity images: shows placeholder
- Medusa product images can be synced to this field

#### SEO & Metadata Fields

| Field                 | Type     | Required | Description                                    |
| --------------------- | -------- | -------- | ---------------------------------------------- |
| `seo.metaTitle`       | `string` | ✗        | SEO page title (max 60 chars)                  |
| `seo.metaDescription` | `text`   | ✗        | SEO meta description (max 160 chars)           |
| `seo.focusKeyword`    | `string` | ✗        | Primary SEO keyword                            |
| `tags`                | `array`  | ✗        | Array of `string` tags for filtering           |
| `collections`         | `array`  | ✗        | Array of `reference` to `collection` documents |

---

### 2. `order` (Document)

**File:** `/packages/sanity-config/src/schemaTypes/documents/order.tsx` (1145 lines)
**`_type` value:** `"order"`
**Purpose:** Order fulfillment mirror + ops workflow UI
**Medusa Integration:** **ONE-WAY MIRROR** – Sanity receives order data from Medusa (read-only)

#### Core Identity Fields

| Field           | Type       | Required | Read-Only | Description                                   |
| --------------- | ---------- | -------- | --------- | --------------------------------------------- |
| `orderNumber`   | `string`   | ✓        | ✓         | Canonical order number (format: `FAS-######`) |
| `medusaOrderId` | `string`   | ✗        | ✓         | Medusa order ID (linking field)               |
| `medusaCartId`  | `string`   | ✗        | ✓         | Medusa cart ID before completion              |
| `createdAt`     | `datetime` | ✗        | ✓         | Order creation timestamp                      |
| `updatedAt`     | `datetime` | ✗        | ✓         | Last update timestamp                         |
| `paidAt`        | `datetime` | ✗        | ✓         | Payment capture timestamp                     |

#### Status Fields

| Field               | Type     | Required | Read-Only | Enum Values                                                      | Description          |
| ------------------- | -------- | -------- | --------- | ---------------------------------------------------------------- | -------------------- |
| `status`            | `string` | ✓        | ✓         | pending/paid/fulfilled/delivered/canceled/refunded               | Derived order status |
| `paymentStatus`     | `string` | ✗        | ✓         | pending/unpaid/paid/failed/refunded/partially_refunded/cancelled | Payment state        |
| `fulfillmentStatus` | `string` | ✗        | ✓         | unfulfilled/processing/shipped/delivered                         | Fulfillment state    |
| `orderType`         | `string` | ✗        | ✗         | online/retail/wholesale/in-store/phone                           | Order source channel |

**Status Derivation Logic:**

```typescript
deriveOrderStatus({
  orderStatus: medusaOrder.status,
  paymentStatus: normalizedPaymentStatus,
  fulfillmentStatus: medusaOrder.fulfillment_status,
})
```

Priority: `canceled` → `refunded` → `delivered` → `fulfilled` → `paid` → `pending`

#### Customer Fields

| Field                  | Type        | Required | Read-Only | Description                                     |
| ---------------------- | ----------- | -------- | --------- | ----------------------------------------------- |
| `customerRef`          | `reference` | ✗        | ✗         | Reference to `customer` document                |
| `customerName`         | `string`    | ✗        | ✓         | Composed from shipping address or PI            |
| `customerEmail`        | `string`    | ✗        | ✓         | Email from Medusa order or PI metadata          |
| `customerPhone`        | `string`    | ✗        | ✓         | Phone from shipping address or PI               |
| `customerInstructions` | `text`      | ✗        | ✗         | UX-only customer notes (not synced from Medusa) |

#### Cart Line Items

| Field            | Type    | Required | Read-Only | Description                                   |
| ---------------- | ------- | -------- | --------- | --------------------------------------------- |
| `cart`           | `array` | ✓        | ✓         | Array of `orderCartItem` objects              |
| `items` (legacy) | `array` | ✗        | ✓         | Legacy format (hidden, backfill for old code) |

**Cart Item Schema:** See `orderCartItem` object type below.

**Validation:** Minimum 1 item required.

#### Financial Fields (All Read-Only)

| Field            | Type     | Unit        | Description                         |
| ---------------- | -------- | ----------- | ----------------------------------- |
| `totalAmount`    | `number` | USD dollars | Order total (visible)               |
| `totalCents`     | `number` | cents       | Order total (hidden, for precision) |
| `amountSubtotal` | `number` | USD dollars | Subtotal before tax/shipping        |
| `subtotalCents`  | `number` | cents       | Subtotal (hidden)                   |
| `amountTax`      | `number` | USD dollars | Tax total                           |
| `amountShipping` | `number` | USD dollars | Shipping total                      |
| `shippingCents`  | `number` | cents       | Shipping (hidden)                   |
| `amountDiscount` | `number` | USD dollars | Discount total                      |
| `currency`       | `string` | —           | Currency code (default: `USD`)      |

**Price Conversion:** Medusa stores cents, Sanity displays dollars
**Formula:** `toDollars(cents) = Math.round(cents) / 100`

#### Shipping Address & Details

| Field                          | Type     | Required | Read-Only | Description                 |
| ------------------------------ | -------- | -------- | --------- | --------------------------- |
| `shippingAddress`              | `object` | ✗        | ✓         | Structured shipping address |
| `shippingAddress.name`         | `string` | ✗        | ✓         | Recipient name              |
| `shippingAddress.phone`        | `string` | ✗        | ✓         | Recipient phone             |
| `shippingAddress.email`        | `string` | ✗        | ✓         | Recipient email             |
| `shippingAddress.addressLine1` | `string` | ✗        | ✓         | Street address line 1       |
| `shippingAddress.addressLine2` | `string` | ✗        | ✓         | Street address line 2       |
| `shippingAddress.city`         | `string` | ✗        | ✓         | City                        |
| `shippingAddress.state`        | `string` | ✗        | ✓         | State/province code         |
| `shippingAddress.postalCode`   | `string` | ✗        | ✓         | ZIP/postal code             |
| `shippingAddress.country`      | `string` | ✗        | ✓         | Country code (uppercase)    |
| `billingAddress`               | `object` | ✗        | ✓         | Same structure (hidden)     |

**Billing Address:** Hidden by default, same structure as `shippingAddress`.

#### Shipping Snapshot Fields (Order Shipping Contract)

| Field               | Type                | Required | Read-Only | Description                     |
| ------------------- | ------------------- | -------- | --------- | ------------------------------- |
| `weight`            | `shipmentWeight`    | ✗        | ✓         | Package weight snapshot         |
| `weight.value`      | `number`            | ✗        | ✓         | Weight value                    |
| `weight.unit`       | `string`            | ✗        | ✓         | Unit: pound/ounce/gram/kilogram |
| `dimensions`        | `packageDimensions` | ✗        | ✓         | Package dimensions snapshot     |
| `dimensions.length` | `number`            | ✗        | ✓         | Length in inches                |
| `dimensions.width`  | `number`            | ✗        | ✓         | Width in inches                 |
| `dimensions.height` | `number`            | ✗        | ✓         | Height in inches                |
| `dimensions.unit`   | `string`            | ✗        | ✓         | Unit: inch (default)            |

**Validation Warning:**

```typescript
Rule.custom((value, context) => {
  const status = context.document?.status
  if (status === 'paid' && !value) {
    return 'Missing weight snapshot - fulfillment may use defaults'
  }
  return true
}).warning()
```

**Enforcement:** `complete-order.ts` calls `computeShipmentSnapshot(items, weightUnit)` to aggregate from line items.

#### Shippo Rate Fields (Metadata from Checkout)

| Field                     | Type     | Read-Only | Visibility | Description                                                    |
| ------------------------- | -------- | --------- | ---------- | -------------------------------------------------------------- |
| `shippoRateId`            | `string` | ✓         | hidden     | Selected Shippo rate ID                                        |
| `shippoRateAmount`        | `number` | ✓         | hidden     | Rate amount (numeric)                                          |
| `shippoRateCurrency`      | `string` | ✓         | hidden     | Rate currency                                                  |
| `shippoServicelevel`      | `string` | ✓         | hidden     | Service level token                                            |
| `shippoCarrier`           | `string` | ✓         | hidden     | Carrier name                                                   |
| `shippoProvider`          | `string` | ✓         | hidden     | Provider name                                                  |
| `shippoRateEstimatedDays` | `number` | ✓         | hidden     | Estimated delivery days                                        |
| `shippoRates`             | `array`  | ✓         | hidden     | Full snapshot of all rates (not persisted by `complete-order`) |

**Shipping Method Object:**

```typescript
shippingMethod: {
  amountCents: number // from medusaOrder.shipping_total
  carrier: string // from PI metadata
  serviceName: string // from PI metadata
  shippoRateId: string // from PI metadata
}
```

#### Fulfillment Workflow Fields

| Field                         | Type     | Read-Only | Description                                                                      |
| ----------------------------- | -------- | --------- | -------------------------------------------------------------------------------- |
| `trackingNumber`              | `string` | ✗         | Ops annotation (does not execute fulfillment)                                    |
| `shippingStatus`              | `object` | ✓         | Shipping status from Shippo webhook                                              |
| `shippingStatus.status`       | `string` | ✓         | enum: pre_transit/in_transit/out_for_delivery/delivered/returned/failure/unknown |
| `shippingStatus.carrier`      | `string` | ✓         | Carrier name                                                                     |
| `shippingStatus.trackingCode` | `string` | ✓         | Tracking code                                                                    |
| `shippingStatus.trackingUrl`  | `url`    | ✓         | Tracking URL                                                                     |
| `shippingStatus.labelUrl`     | `url`    | ✓         | Label PDF URL                                                                    |
| `shippingLog`                 | `array`  | ✓         | Array of `shippingLogEntry` (webhook events)                                     |

**Label Purchase Fields:**

```typescript
labelPurchased: boolean // read-only
labelPurchasedAt: datetime // read-only
labelPurchasedBy: string // read-only
labelTransactionId: string // read-only
labelCost: number // hidden
```

#### Wholesale Workflow Fields

| Field                                | Type       | Visibility  | Description                                                                                      |
| ------------------------------------ | ---------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `wholesaleDetails`                   | `object`   | conditional | Visible when `orderType === "wholesale"`                                                         |
| `wholesaleDetails.workflowStatus`    | `string`   | ✓           | enum: requested/pending_approval/approved/in_production/ready_to_ship/shipped/delivered/rejected |
| `wholesaleDetails.approvedBy`        | `string`   | ✗           | Staff member who approved                                                                        |
| `wholesaleDetails.approvedAt`        | `datetime` | ✗           | Approval timestamp                                                                               |
| `wholesaleDetails.rejectionReason`   | `text`     | ✗           | Reason if rejected                                                                               |
| `wholesaleDetails.estimatedShipDate` | `date`     | ✗           | Estimated ship date                                                                              |
| `wholesaleDetails.internalNotes`     | `text`     | ✗           | Internal notes (not visible to vendor)                                                           |

**Governance Note:** "Legacy wholesale workflow fields. Treat as transitional; long-term wholesale commerce should be Medusa-owned."

#### Stripe & Payment Fields

| Field                   | Type     | Read-Only | Visibility | Description                                |
| ----------------------- | -------- | --------- | ---------- | ------------------------------------------ |
| `paymentIntentId`       | `string` | ✓         | hidden     | Stripe Payment Intent ID                   |
| `stripePaymentIntentId` | `string` | ✓         | hidden     | Duplicate of above (legacy)                |
| `stripeSessionId`       | `string` | ✓         | hidden     | Stripe Checkout Session ID (if applicable) |

#### Operations Flags

| Field                          | Type      | Description                                 |
| ------------------------------ | --------- | ------------------------------------------- |
| `opsInternalNotes`             | `text`    | Internal ops notes (not synced from Medusa) |
| `opsFlags.needsReview`         | `boolean` | Flag for manual review                      |
| `opsFlags.reviewReason`        | `text`    | Reason for review flag                      |
| `opsFlags.refundRequested`     | `boolean` | Flag for refund request                     |
| `opsFlags.refundRequestNotes`  | `text`    | Notes about refund                          |
| `opsFlags.adjustmentRequested` | `boolean` | Flag for adjustment                         |
| `opsFlags.adjustmentNotes`     | `text`    | Notes about adjustment                      |

#### Source & Authority Fields

| Field           | Type      | Read-Only | Default    | Description                            |
| --------------- | --------- | --------- | ---------- | -------------------------------------- |
| `source`        | `string`  | ✓         | `"medusa"` | enum: medusa/legacy_stripe/manual      |
| `authoritative` | `boolean` | ✓         | `false`    | Always false – Medusa is authoritative |

**Governance Enforcement:** "Always false in Sanity. This record is a UI mirror/snapshot; Medusa remains the source of truth for commerce."

#### Refund Fields

| Field              | Type       | Visibility  | Description                          |
| ------------------ | ---------- | ----------- | ------------------------------------ |
| `amountRefunded`   | `number`   | conditional | Visible when `status === "refunded"` |
| `lastRefundId`     | `string`   | conditional | Stripe refund ID                     |
| `lastRefundReason` | `string`   | conditional | Refund reason                        |
| `lastRefundStatus` | `string`   | conditional | Refund status                        |
| `lastRefundedAt`   | `datetime` | conditional | Refund timestamp                     |

---

### 3. `customer` (Document)

**File:** `/packages/sanity-config/src/schemaTypes/documents/customer.ts` (559 lines)
**`_type` value:** `"customer"`
**Purpose:** Office dashboard customer record with ops annotations
**Medusa Integration:** **MIRROR + ANNOTATION** – Medusa is authoritative for commerce identity; Sanity adds notes and segmentation

#### Identity Fields

| Field              | Type     | Required | Read-Only | Description                             |
| ------------------ | -------- | -------- | --------- | --------------------------------------- |
| `medusaCustomerId` | `string` | ✗        | ✓         | Medusa customer ID (linking field)      |
| `userId`           | `string` | ✗        | ✗         | Legacy external user ID (hidden)        |
| `email`            | `string` | ✓        | ✗         | Customer email (validated)              |
| `name`             | `string` | ✓        | ✓         | Auto-computed from firstName + lastName |
| `firstName`        | `string` | ✗        | ✗         | First name                              |
| `lastName`         | `string` | ✗        | ✗         | Last name                               |
| `phone`            | `string` | ✗        | ✗         | Phone number                            |

**Name Computation:**

```typescript
components: {
  input: ComputedCustomerNameInput as any
}
```

Auto-generated from `firstName` + `lastName`, falls back to `email`.

#### Roles & Access Control

| Field   | Type    | Default        | Validation                   | Description           |
| ------- | ------- | -------------- | ---------------------------- | --------------------- |
| `roles` | `array` | `["customer"]` | min 1 item, async validation | Array of role strings |

**Role Options:**

- `customer` (default)
- `vendor`
- `wholesale`
- `retail`

**Async Validation:**

- If role = `vendor`: Must have corresponding `vendor` document linked by email
- Cannot remove `vendor` role if vendor document exists

**Usage:** FAS Auth uses this to gate access to portals.

#### Stripe Integration Fields

| Field                | Type       | Read-Only | Visibility | Description                      |
| -------------------- | ---------- | --------- | ---------- | -------------------------------- |
| `stripeCustomerId`   | `string`   | ✓         | hidden     | Primary Stripe customer ID       |
| `stripeCustomerIds`  | `array`    | ✓         | hidden     | Array of all Stripe customer IDs |
| `stripeLastSyncedAt` | `datetime` | ✓         | hidden     | Last Stripe sync timestamp       |
| `stripeMetadata`     | `array`    | ✓         | hidden     | Array of `stripeMetadataEntry`   |

#### Contact Preferences

| Field                                    | Type       | Options                             | Description              |
| ---------------------------------------- | ---------- | ----------------------------------- | ------------------------ |
| `preferredContactMethod`                 | `string`   | email/phone/text                    | Preferred contact method |
| `emailMarketing.subscribed`              | `boolean`  | —                                   | Marketing email opt-in   |
| `emailMarketing.subscribedAt`            | `datetime` | —                                   | Opt-in timestamp         |
| `emailMarketing.unsubscribedAt`          | `datetime` | —                                   | Opt-out timestamp        |
| `emailMarketing.source`                  | `string`   | checkout/newsletter/manual/backfill | Subscription source      |
| `emailMarketing.preferences.newProducts` | `boolean`  | —                                   | New product emails       |
| `emailMarketing.preferences.promotions`  | `boolean`  | —                                   | Promotion emails         |
| `emailMarketing.preferences.tips`        | `boolean`  | —                                   | Tips & advice emails     |

#### Address Fields

| Field             | Type                     | Description                                                   |
| ----------------- | ------------------------ | ------------------------------------------------------------- |
| `shippingAddress` | `customerBillingAddress` | Primary shipping address object                               |
| `billingAddress`  | `customerBillingAddress` | Primary billing address object                                |
| `addresses`       | `array`                  | Array of `customerAddress` (multiple saved addresses, hidden) |

**Address Object Fields:**

```typescript
customerBillingAddress: {
  name: string
  company: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  phone: string
}
```

#### Order Activity (Read-Only Display Fields)

| Field                | Type       | Read-Only | Description                         |
| -------------------- | ---------- | --------- | ----------------------------------- |
| `orders`             | `array`    | ✓         | Array of `customerOrderSummary`     |
| `quotes`             | `array`    | ✓         | Array of `customerQuoteSummary`     |
| `totalOrders`        | `number`   | ✓         | Total order count                   |
| `orderCount`         | `number`   | ✓         | Duplicate of `totalOrders` (hidden) |
| `quoteCount`         | `number`   | ✓         | Total quote count                   |
| `lifetimeValue`      | `number`   | ✓         | Lifetime spend (USD)                |
| `lifetimeSpend`      | `number`   | ✓         | Duplicate (hidden)                  |
| `averageOrderValue`  | `number`   | ✓         | AOV (hidden)                        |
| `firstOrderDate`     | `datetime` | ✓         | First order timestamp (hidden)      |
| `lastOrderDate`      | `datetime` | ✓         | Last order timestamp (hidden)       |
| `daysSinceLastOrder` | `number`   | ✓         | Days since last order (hidden)      |

**Governance Note:** "Derived/display-only KPI. Not used as a commerce authority."

#### Customer Segmentation (Read-Only Display)

| Field            | Type     | Options                                | Description                       |
| ---------------- | -------- | -------------------------------------- | --------------------------------- |
| `segment`        | `string` | vip/repeat/new/at_risk/inactive/active | Derived customer segment          |
| `customerStatus` | `string` | visitor/customer/vip                   | Legacy classification (read-only) |

**Segment Definitions:**

- `vip`: >$10k lifetime value
- `repeat`: 3+ orders
- `new`: <30 days since first order
- `at_risk`: 6+ months since last order
- `inactive`: 12+ months since last order
- `active`: Default

**Governance Note:** "Derived/display-only segmentation for staff context. Must not drive pricing, discounts, checkout, or fulfillment decisions."

#### Discounts (Legacy)

| Field       | Type    | Read-Only | Description                 |
| ----------- | ------- | --------- | --------------------------- |
| `discounts` | `array` | ✓         | Array of `customerDiscount` |

**Governance Note:** "Legacy Stripe-synced discounts. Not authoritative for checkout; discounts must be enforced in Medusa."

#### Internal Notes & Workflow

| Field            | Type    | Description                                                    |
| ---------------- | ------- | -------------------------------------------------------------- |
| `customerNotes`  | `text`  | Internal notes about customer                                  |
| `shippingQuotes` | `array` | Ops attachments for manual quoting (not used in live checkout) |

**Governance Note:** "Ops attachments/notes for manual quoting only. Not used to calculate live checkout shipping (Medusa owns shipping)."

#### Source & Authority

| Field           | Type      | Read-Only | Default    | Description                            |
| --------------- | --------- | --------- | ---------- | -------------------------------------- |
| `source`        | `string`  | ✓         | `"medusa"` | Origin system                          |
| `authoritative` | `boolean` | ✓         | `false`    | Always false – Medusa is authoritative |

**Governance Note:** "Always false in Sanity. This document is an ops-facing mirror + annotation layer."

---

## Object Schemas

### 1. `orderCartItem` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/orderCartItemType.ts` (277 lines)
**`_type` value:** `"orderCartItem"`
**Purpose:** Cart line item snapshot at time of order
**Used In:** `order.cart[]` array

#### Core Item Fields

| Field         | Type        | Read-Only | Description                                         |
| ------------- | ----------- | --------- | --------------------------------------------------- |
| `name`        | `string`    | ✗         | Product name (editable for correction)              |
| `productName` | `string`    | ✓         | Product title snapshot (required for invoices/PDFs) |
| `productRef`  | `reference` | ✗         | Reference to `product` document (hidden)            |
| `sku`         | `string`    | ✗         | Product SKU                                         |
| `image`       | `url`       | ✗         | Product image URL from Stripe (hidden)              |

#### Pricing Fields

| Field       | Type     | Unit        | Description                   |
| ----------- | -------- | ----------- | ----------------------------- |
| `quantity`  | `number` | —           | Item quantity                 |
| `price`     | `number` | USD dollars | Unit price                    |
| `total`     | `number` | USD dollars | Line total                    |
| `lineTotal` | `number` | USD dollars | Duplicate line total (hidden) |

#### Variant & Option Fields

| Field             | Type     | Visibility | Description                                    |
| ----------------- | -------- | ---------- | ---------------------------------------------- |
| `selectedVariant` | `string` | visible    | Variant display string (e.g., "Red")           |
| `optionDetails`   | `array`  | hidden     | Raw option data from Stripe (array of strings) |
| `optionSummary`   | `string` | hidden     | Computed option summary                        |

**Option Details Format:**

```typescript
;['Color: Red', 'Size: Large']
```

#### Add-Ons & Upgrades

| Field           | Type     | Visibility | Description                                     |
| --------------- | -------- | ---------- | ----------------------------------------------- |
| `addOns`        | `array`  | visible    | Array of upgrade strings (display name + price) |
| `upgrades`      | `array`  | hidden     | Raw upgrades from Stripe                        |
| `upgradesTotal` | `number` | hidden     | Total upgrade cost                              |

**Add-Ons Format:**

```typescript
;['Installation Kit: $50.00', 'Extended Warranty: $100.00']
```

#### Metadata Fields

| Field             | Type     | Visibility | Description                          |
| ----------------- | -------- | ---------- | ------------------------------------ |
| `metadata`        | `object` | hidden     | Stripe metadata container            |
| `metadata.raw`    | `text`   | hidden     | JSON string snapshot of all metadata |
| `metadataEntries` | `array`  | hidden     | Array of `orderCartItemMeta`         |

#### Stripe Reference IDs

| Field             | Type     | Visibility | Description         |
| ----------------- | -------- | ---------- | ------------------- |
| `id`              | `string` | hidden     | Stripe line item ID |
| `stripePriceId`   | `string` | hidden     | Stripe price ID     |
| `stripeProductId` | `string` | hidden     | Stripe product ID   |

---

### 2. `customProductOptionColor` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/customProductOption/customProductOptionColorType.tsx` (71 lines)
**`_type` value:** `"customProductOptionColor"`
**Purpose:** Color variant option definition
**Used In:** `product.options[]` array

#### Fields

| Field      | Type      | Required | Validation                | Description                                     |
| ---------- | --------- | -------- | ------------------------- | ----------------------------------------------- |
| `title`    | `string`  | ✓        | —                         | Option name (case-sensitive, e.g., "Color")     |
| `required` | `boolean` | ✗        | —                         | Whether selection is required (default: `true`) |
| `colors`   | `array`   | ✓        | min 1 item, unique titles | Array of `customProductOptionColorObject`       |

**Color Object Fields:**

```typescript
customProductOptionColorObject: {
  title: string // Display name (e.g., "Red")
  value: string // Color code or identifier
  swatch: image // Color swatch image (optional)
}
```

**Validation:** Each color must have unique title (case-insensitive).

---

### 3. `customProductOptionSize` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/customProductOption/customProductOptionSizeType.ts`
**`_type` value:** `"customProductOptionSize"`
**Purpose:** Size variant option definition
**Used In:** `product.options[]` array

#### Fields

| Field      | Type      | Required | Description                              |
| ---------- | --------- | -------- | ---------------------------------------- |
| `title`    | `string`  | ✓        | Option name (e.g., "Size")               |
| `required` | `boolean` | ✗        | Whether selection is required            |
| `sizes`    | `array`   | ✓        | Array of `customProductOptionSizeObject` |

**Size Object Fields:**

```typescript
customProductOptionSizeObject: {
  title: string // Display name (e.g., "Large")
  value: string // Size identifier
  stockKeepingUnit: string // SKU suffix (optional)
}
```

---

### 4. `customProductOptionCustom` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/customProductOption/customProductOptionCustomType.ts`
**`_type` value:** `"customProductOptionCustom"`
**Purpose:** Custom variant option (freeform)
**Used In:** `product.options[]` array

#### Fields

| Field      | Type      | Required | Description                                |
| ---------- | --------- | -------- | ------------------------------------------ |
| `title`    | `string`  | ✓        | Option name (e.g., "Material")             |
| `required` | `boolean` | ✗        | Whether selection is required              |
| `values`   | `array`   | ✓        | Array of `customProductOptionCustomObject` |

**Custom Object Fields:**

```typescript
customProductOptionCustomObject: {
  title: string // Display name
  value: string // Option value
}
```

---

### 5. `productAddOn` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/productAddOnType.ts` (130 lines)
**`_type` value:** `"productAddOn"`
**Purpose:** Bundle add-on / upsell product
**Used In:** `product.addOns[]` array

#### Fields

| Field                   | Type        | Required | Validation         | Description                                   |
| ----------------------- | ----------- | -------- | ------------------ | --------------------------------------------- |
| `product`               | `reference` | ✓        | to `product`       | Referenced add-on product                     |
| `quantity`              | `number`    | ✓        | min 1, integer     | Quantity included in bundle                   |
| `bundleDiscount`        | `number`    | ✗        | min 0, precision 2 | Discount in USD (e.g., 50 for $50 off)        |
| `bundleDiscountPercent` | `number`    | ✗        | min 0, max 100     | Discount as percentage (e.g., 10 for 10% off) |
| `customLabel`           | `string`    | ✗        | —                  | Override product title                        |
| `description`           | `text`      | ✗        | —                  | Benefit explanation                           |
| `defaultSelected`       | `boolean`   | ✗        | —                  | Auto-add to cart (customer can remove)        |
| `required`              | `boolean`   | ✗        | —                  | Customer must purchase with main product      |

**Pricing Logic:**

```typescript
finalPrice = productPrice * quantity - bundleDiscount
// OR
finalPrice = productPrice * quantity * (1 - bundleDiscountPercent / 100)
```

---

### 6. `shipmentWeight` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/shipmentWeightType.ts`
**`_type` value:** `"shipmentWeight"`
**Purpose:** Weight specification with unit
**Used In:** `order.weight`, `product.shippingConfig.weight`

#### Fields

| Field   | Type     | Required | Description                                   |
| ------- | -------- | -------- | --------------------------------------------- |
| `value` | `number` | ✓        | Weight numeric value                          |
| `unit`  | `string` | ✓        | Unit: `pound` / `ounce` / `gram` / `kilogram` |

**Default Unit:** `pound`

---

### 7. `packageDimensions` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/packageDimensionsType.ts`
**`_type` value:** `"packageDimensions"`
**Purpose:** Package dimensions specification
**Used In:** `order.dimensions`, `product.shippingConfig.dimensions`

#### Fields

| Field    | Type     | Required | Description            |
| -------- | -------- | -------- | ---------------------- |
| `length` | `number` | ✓        | Length in inches       |
| `width`  | `number` | ✓        | Width in inches        |
| `height` | `number` | ✓        | Height in inches       |
| `unit`   | `string` | ✗        | Unit (default: `inch`) |

---

### 8. `shippingLogEntry` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/shippingLogEntryType.ts`
**`_type` value:** `"shippingLogEntry"`
**Purpose:** Shipping event from Shippo webhook
**Used In:** `order.shippingLog[]`

#### Fields

| Field       | Type       | Description                           |
| ----------- | ---------- | ------------------------------------- |
| `timestamp` | `datetime` | Event timestamp                       |
| `status`    | `string`   | Shipping status code                  |
| `location`  | `string`   | Event location                        |
| `message`   | `text`     | Event message                         |
| `source`    | `string`   | Event source (e.g., "shippo_webhook") |

---

### 9. `orderCartItemMeta` (Object)

**File:** `/packages/sanity-config/src/schemaTypes/objects/orderCartItemMetaType.ts`
**`_type` value:** `"orderCartItemMeta"`
**Purpose:** Metadata key-value pair
**Used In:** `orderCartItem.metadataEntries[]`

#### Fields

| Field   | Type     | Description    |
| ------- | -------- | -------------- |
| `key`   | `string` | Metadata key   |
| `value` | `string` | Metadata value |

---

## Field Mapping Summary

### Product → Medusa Product

| Sanity Field            | Medusa Field               | Transform                  | Direction       |
| ----------------------- | -------------------------- | -------------------------- | --------------- |
| `title`                 | `product.title`            | direct                     | bidirectional   |
| `price`                 | `variant.prices[0].amount` | dollars → cents (\*100)    | bidirectional   |
| `sku`                   | `variant.sku`              | direct                     | bidirectional   |
| `medusaProductId`       | `product.id`               | direct                     | Medusa → Sanity |
| `medusaVariantId`       | `variant.id`               | direct                     | Medusa → Sanity |
| `shippingConfig.weight` | `variant.weight`           | pounds → grams (?)         | bidirectional   |
| `options`               | `product.options`          | structured → Medusa format | Sanity → Medusa |

### Order → Medusa Order

See `/fas-medusa/docs/phase3/pipeline.md` lines 17-65 for complete 65-field mapping table.

**Key Transformations:**

- **Order Number:** `medusaOrder.display_id` → `toCanonicalOrderNumber()` → `FAS-######`
- **Prices:** cents → dollars (divide by 100)
- **Status:** `deriveOrderStatus(medusaOrder.status, payment_status, fulfillment_status)`
- **Payment Status:** `normalizePaymentStatus(medusaOrder.payment_status)`
- **Shipping Snapshot:** `computeShipmentSnapshot(items, weightUnit)`

### Customer → Medusa Customer

| Sanity Field       | Medusa Field          | Transform | Direction       |
| ------------------ | --------------------- | --------- | --------------- |
| `email`            | `customer.email`      | direct    | bidirectional   |
| `firstName`        | `customer.first_name` | direct    | bidirectional   |
| `lastName`         | `customer.last_name`  | direct    | bidirectional   |
| `phone`            | `customer.phone`      | direct    | bidirectional   |
| `medusaCustomerId` | `customer.id`         | direct    | Medusa → Sanity |

---

## GROQ Projection Patterns

### Fetch Order with Customer Reference

```groq
*[_type == "order" && medusaOrderId == $orderId][0] {
  _id,
  orderNumber,
  medusaOrderId,
  medusaCartId,
  status,
  paymentStatus,
  fulfillmentStatus,
  customerEmail,
  customerName,
  customerRef->{
    _id,
    email,
    firstName,
    lastName,
    roles
  },
  cart[]{
    name,
    sku,
    quantity,
    price,
    total,
    selectedVariant,
    addOns
  },
  shippingAddress,
  totalAmount,
  amountTax,
  amountShipping
}
```

### Fetch Product with Options & Add-Ons

```groq
*[_type == "product" && slug.current == $slug][0] {
  _id,
  title,
  slug,
  status,
  productType,
  sku,
  price,
  medusaProductId,
  medusaVariantId,
  options[]{
    _type,
    title,
    required,
    colors[]{
      title,
      value,
      swatch
    },
    sizes[]{
      title,
      value
    },
    values[]{
      title,
      value
    }
  },
  addOns[]{
    customLabel,
    quantity,
    bundleDiscount,
    bundleDiscountPercent,
    defaultSelected,
    required,
    product->{
      _id,
      title,
      price,
      sku,
      images[0]
    }
  },
  shippingConfig,
  inventory
}
```

---

## Slug & ID Generation Logic

### Product SKU Generation

**File:** `/packages/sanity-config/src/utils/generateSKU.ts`

**Pattern:** `XX-XXXX-XXX`
**Format:** `{Prefix}-{Sequence}-{Variant}`

**Example:** `FP-A1B2-RED`

**Logic:**

- Prefix: 2 uppercase letters (product category/type)
- Sequence: 4 alphanumeric characters
- Variant: 3 uppercase letters (color/size code)

**Validation:** `/^[A-Z]{2}-[A-Z0-9]{4}-[A-Z]{3}$/`

### Order Number Generation

**File:** `/fas-cms-fresh/src/lib/order-number.ts` + `/fas-cms-fresh/src/pages/api/complete-order.ts`

**Pattern:** `FAS-######`
**Format:** `FAS-{6-digit-number}`

**Example:** `FAS-000123`

**Logic:**

```typescript
const ORDER_NUMBER_PATTERN = /^FAS-\d{6}$/

const toCanonicalOrderNumber = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
    if (!raw) continue
    const normalized = raw.toUpperCase()
    // If already canonical, return it
    if (ORDER_NUMBER_PATTERN.test(normalized)) return normalized
    // Extract digits and pad to 6
    const digits = normalized.replace(/\D/g, '')
    if (digits) {
      return `FAS-${digits.slice(-6).padStart(6, '0')}`
    }
  }
  return undefined
}
```

**Sources (in priority order):**

1. `medusaOrder.display_id` (if already canonical)
2. `medusaOrder.id` (extract digits, pad to 6)

---

## Validation Rules Summary

### Product Validations

1. **Price Cents Warning:** Warns if price looks like cents (value >= 1000 and divisible by 100)
2. **SKU Pattern:** Must match `/^[A-Z]{2}-[A-Z0-9]{4}-[A-Z]{3}$/`
3. **Options Max:** Maximum 3 options (Medusa limit)
4. **Option Titles Unique:** Each option must have unique title within same type

### Order Validations

1. **Cart Min Items:** Minimum 1 item required in `cart[]` array
2. **Weight Snapshot Warning:** Warns if `status === "paid"` and no `weight` value
3. **Dimensions Snapshot Warning:** Warns if `status === "paid"` and no `dimensions` value

### Customer Validations

1. **Email Required:** Email must be valid email format
2. **Roles Min:** Minimum 1 role required
3. **Vendor Role Constraint:** If role includes "vendor", must have corresponding vendor document by email
4. **Name Computed:** Name is auto-computed from firstName + lastName (cannot be manually edited)

---

## Custom Input Components

### 1. `ComputedCustomerNameInput`

**Used In:** `customer.name`
**Purpose:** Auto-compute name from `firstName` + `lastName`, fallback to `email`
**Behavior:** Read-only display, updates when firstName/lastName change

### 2. `CustomerDiscountsInput`

**Used In:** `customer.discounts`
**Purpose:** Display Stripe discounts in read-only format
**Behavior:** Shows discount details from Stripe sync

---

## Schema Groups (Tabs in Sanity Studio)

### Product Groups

1. `details` (default) - Core product info
2. `pricing` - Price, cost, compareAtPrice
3. `inventory` - Stock tracking
4. `shipping` - Weight, dimensions, shipping class
5. `options` - Variant options (Color, Size, Custom)
6. `media` - Images, videos
7. `seo` - SEO metadata
8. `technical` - Medusa IDs, advanced settings

### Order Groups

1. `overview` (default) - Order header, status, totals
2. `fulfillment` - Shipping, tracking, labels
3. `documents` - Packing slips, shipping labels
4. `technical` - IDs, metadata, source fields

### Customer Groups

1. `profile` (default) - Identity, roles, contact
2. `addresses` - Shipping & billing addresses
3. `activity` - Orders, quotes, lifetime value
4. `marketing` - Email preferences, segmentation
5. `stripe` - Stripe IDs, sync data
6. `discounts` - Legacy discount data

---

## Read-Only vs Editable Fields

### Read-Only Enforcement Rules

**Product:** All pricing and inventory fields become read-only when `isMedusaBacked(document) === true`

**Order:** All fields marked read-only EXCEPT:

- `customerRef` (ops can link customer manually)
- `trackingNumber` (ops annotation, does not execute fulfillment)
- `customerInstructions` (UX-only, not synced)
- `opsInternalNotes` (ops workflow, not synced)
- `opsFlags.*` (ops workflow, not synced)
- `wholesaleDetails.*` (wholesale workflow, not synced to Medusa)

**Customer:** Most activity fields are read-only (orders, quotes, lifetime value, etc.)

---

## Schema Version & API Version

**Sanity API Version:** `2024-01-01` (used in all client instantiations)
**Stripe API Version:** `2023-10-16` (defined in `/fas-cms-fresh/src/lib/stripe-config.ts`)

---

**END OF SCHEMA INVENTORY**
