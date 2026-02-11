# Sanity ↔ Medusa Field Mapping

**Generated:** 2026-02-11
**Purpose:** Complete translation table between Sanity schemas and Medusa.js entities
**Authority Reference:** `/fas-medusa/docs/phase3/pipeline.md` (verified runtime mappings)

---

## Mapping Direction Legend

| Symbol | Meaning |
|--------|---------|
| `→` | One-way: Medusa → Sanity (read-only mirror) |
| `↔` | Bidirectional: Sanity ↔ Medusa (sync both ways) |
| `←` | One-way: Sanity → Medusa (Sanity is source) |
| `⊗` | No mapping (field exists only in one system) |

---

## 1. Product Mapping

### Sanity `product` ↔ Medusa `Product` + `ProductVariant`

**Mapping File:** Not yet implemented (pending Phase 3 legacy migration)
**Current State:** Sanity products can reference Medusa products via `medusaProductId`/`medusaVariantId`, but full bidirectional sync is not implemented

| Sanity Field | Direction | Medusa Entity.Field | Transform | Notes |
|--------------|-----------|---------------------|-----------|-------|
| `title` | `↔` | `Product.title` | direct | — |
| `slug.current` | `←` | `Product.handle` | slugify | Sanity generates, Medusa receives |
| `status` | `⊗` | — | — | Sanity-only (active/draft/paused/archived) |
| `productType` | `⊗` | — | — | Sanity-only (physical/service/bundle) |
| `sku` | `↔` | `ProductVariant.sku` | direct | Canonical format: `XX-XXXX-XXX` |
| `price` | `↔` | `ProductVariant.prices[0].amount` | **dollars ↔ cents** | `sanityCents = medusaDollars * 100` |
| `compareAtPrice` | `↔` | `ProductVariant.original_price` | **dollars ↔ cents** | — |
| `cost` | `⊗` | — | — | Sanity-only (COGS tracking) |
| `medusaProductId` | `→` | `Product.id` | direct | Linking field (read-only in Sanity) |
| `medusaVariantId` | `→` | `ProductVariant.id` | direct | Linking field (read-only in Sanity) |
| `inventory.quantity` | `↔` | `ProductVariant.inventory_quantity` | direct | — |
| `inventory.trackQuantity` | `⊗` | — | — | Sanity UI control |
| `shippingConfig.weight` | `↔` | `ProductVariant.weight` | **pounds ↔ grams** | `medusaGrams = sanityPounds * 453.592` |
| `shippingConfig.dimensions.length` | `↔` | `ProductVariant.length` | **inches ↔ cm** | `medusaCm = sanityInches * 2.54` |
| `shippingConfig.dimensions.width` | `↔` | `ProductVariant.width` | **inches ↔ cm** | `medusaCm = sanityInches * 2.54` |
| `shippingConfig.dimensions.height` | `↔` | `ProductVariant.height` | **inches ↔ cm** | `medusaCm = sanityInches * 2.54` |
| `shippingConfig.shippingClass` | `⊗` | — | — | Sanity-only (standard/heavy/fragile/hazmat) |
| `shippingConfig.requiresShipping` | `⊗` | — | — | Sanity-only (controls UI) |
| `options[]` | `←` | `Product.options[]` | **structured** | Complex mapping (see below) |
| `addOns[]` | `⊗` | — | — | Sanity-only (bundle upsells) |
| `images[]` | `↔` | `Product.images[]` | **asset URL** | Sanity image asset → Medusa image URL |
| `seo.metaTitle` | `↔` | `Product.metadata.meta_title` | direct | — |
| `seo.metaDescription` | `↔` | `Product.metadata.meta_description` | direct | — |
| `tags[]` | `↔` | `Product.tags[]` | **array of strings** | — |
| `collections[]` | `↔` | `Product.collections[]` | **reference → ID** | Sanity reference → Medusa collection ID |

#### Product Options Mapping

**Sanity Structure:**
```typescript
product.options: Array<
  | customProductOptionColor
  | customProductOptionSize
  | customProductOptionCustom
>
```

**Medusa Structure:**
```typescript
Product.options: Array<{
  id: string
  title: string
  values: Array<{
    id: string
    value: string
    metadata?: Record<string, any>
  }>
}>
```

**Transformation Logic:**

| Sanity Option Type | Medusa Option.title | Medusa Option.values |
|--------------------|---------------------|----------------------|
| `customProductOptionColor` | `option.title` (e.g., "Color") | `option.colors[].title` → `values[].value` |
| `customProductOptionSize` | `option.title` (e.g., "Size") | `option.sizes[].title` → `values[].value` |
| `customProductOptionCustom` | `option.title` (e.g., "Material") | `option.values[].title` → `values[].value` |

**Required Max:** Sanity enforces max 3 options (Medusa limit)

---

## 2. Order Mapping

### Sanity `order` ← Medusa `Order` (One-Way Mirror)

**Mapping File:** `/fas-cms-fresh/src/pages/api/complete-order.ts`
**Authority:** Medusa is authoritative, Sanity is read-only mirror

| Sanity Field | Direction | Medusa Source | Transform | Status |
|--------------|-----------|---------------|-----------|--------|
| `medusaOrderId` | `→` | `order.id` | direct | aligned |
| `medusaCartId` | `→` | `paymentIntent.metadata.medusa_cart_id` OR `order.cart_id` | fallback | aligned |
| `orderNumber` | `→` | `order.display_id` OR `order.id` | **canonicalize to `FAS-######`** | aligned |
| `status` | `→` | derived | `deriveOrderStatus(order.status, payment_status, fulfillment_status)` | aligned |
| `paymentStatus` | `→` | `order.payment_status` | `normalizePaymentStatus()` | aligned |
| `fulfillmentStatus` | `→` | `order.fulfillment_status` | direct | aligned |
| `customerEmail` | `→` | `order.email` OR `paymentIntent.metadata.customer_email` | fallback | aligned |
| `customerName` | `→` | `order.shipping_address` OR `paymentIntent.shipping` | **compose from first + last** | aligned |
| `customerPhone` | `→` | `order.shipping_address.phone` OR `paymentIntent.shipping.phone` | fallback | aligned |
| `shippingAddress` | `→` | `order.shipping_address` OR `paymentIntent.shipping.address` | **normalized object** | aligned |
| `shippingAddress.name` | `→` | `${shipping_address.first_name} ${shipping_address.last_name}` | compose | aligned |
| `shippingAddress.phone` | `→` | `shipping_address.phone` | direct | aligned |
| `shippingAddress.email` | `→` | `order.email` | direct | aligned |
| `shippingAddress.addressLine1` | `→` | `shipping_address.address_1` | direct | aligned |
| `shippingAddress.addressLine2` | `→` | `shipping_address.address_2` | direct | aligned |
| `shippingAddress.city` | `→` | `shipping_address.city` | direct | aligned |
| `shippingAddress.state` | `→` | `shipping_address.province` | direct | aligned |
| `shippingAddress.postalCode` | `→` | `shipping_address.postal_code` | direct | aligned |
| `shippingAddress.country` | `→` | `shipping_address.country_code` | **uppercase** | aligned |
| `billingAddress` | `→` | `order.billing_address` OR `paymentIntent.shipping.address` | normalized object | aligned |
| `shippingMethod.amountCents` | `→` | `order.shipping_total` | **integer cents** | aligned |
| `shippingMethod.carrier` | `→` | `paymentIntent.metadata.carrier` | direct | aligned |
| `shippingMethod.serviceName` | `→` | `paymentIntent.metadata.service_name` | direct | aligned |
| `shippingMethod.shippoRateId` | `→` | `paymentIntent.metadata.shippo_rate_id` | direct | aligned |
| `shippoRateId` | `→` | `paymentIntent.metadata.shippo_rate_id` | direct | aligned |
| `shippoRateAmount` | `→` | `paymentIntent.metadata.shipping_amount_cents` | **numeric parse** | aligned |
| `shippoRateCurrency` | `→` | `paymentIntent.metadata.shippo_rate_currency` | direct | aligned |
| `shippoServicelevel` | `→` | `paymentIntent.metadata.shippo_servicelevel` | direct | aligned |
| `shippoCarrier` | `→` | `paymentIntent.metadata.shippo_carrier` | direct | aligned |
| `shippoProvider` | `→` | `paymentIntent.metadata.shippo_provider` | direct | aligned |
| `cart[]` | `→` | `order.items[]` | **map to `orderCartItem`** | aligned |
| `cart[].quantity` | `→` | `item.quantity` | **numeric default 1** | aligned |
| `cart[].price` | `→` | `item.unit_price` | **cents → dollars** | aligned |
| `cart[].total` | `→` | `item.total` OR `item.subtotal` | **cents → dollars** | aligned |
| `cart[].lineTotal` | `→` | `item.total` OR `item.subtotal` | **cents → dollars** | aligned |
| `cart[].sku` | `→` | `item.variant.sku` OR `item.variant_sku` | direct | aligned |
| `cart[].optionDetails` | `→` | `item.variant.option_values` | **`key: value[]` format** | aligned |
| `cart[].metadata.raw` | `→` | `item.metadata` | **JSON string snapshot** | aligned |
| `items[]` (legacy) | `→` | derived from `cart[]` | **cents integer backfill** | aligned |
| `amountSubtotal` | `→` | `order.subtotal` | **cents → dollars** | aligned |
| `amountShipping` | `→` | `order.shipping_total` | **cents → dollars** | aligned |
| `amountTax` | `→` | `order.tax_total` | **cents → dollars** | aligned |
| `amountDiscount` | `→` | `order.discount_total` | **cents → dollars** | aligned |
| `totalAmount` | `→` | `order.total` | **cents → dollars** | aligned |
| `subtotalCents` | `→` | `order.subtotal` | **integer parse** | aligned |
| `shippingCents` | `→` | `order.shipping_total` | **integer parse** | aligned |
| `totalCents` | `→` | `order.total` | **integer parse** | aligned |
| `currency` | `→` | `order.currency_code` | direct | aligned |
| `paymentIntentId` | `→` | `paymentIntent.id` | direct | aligned |
| `stripePaymentIntentId` | `→` | `paymentIntent.id` | direct | aligned |
| `weight` | `→` | aggregated from items | **`computeShipmentSnapshot()`** | aligned |
| `weight.value` | `→` | sum of `item.variant.weight` OR `item.metadata.shipping_weight` | aggregate | aligned |
| `weight.unit` | `→` | `item.variant.weight_unit` OR default `"pound"` | resolve unit | aligned |
| `dimensions` | `→` | aggregated from items | **`computeShipmentSnapshot()`** | aligned |
| `dimensions.length` | `→` | max of `item.variant.length` OR `item.metadata.shipping_dimensions.length` | max aggregate | aligned |
| `dimensions.width` | `→` | max of `item.variant.width` OR `item.metadata.shipping_dimensions.width` | max aggregate | aligned |
| `dimensions.height` | `→` | max of `item.variant.height` OR `item.metadata.shipping_dimensions.height` | max aggregate | aligned |
| `createdAt` | `→` | `order.created_at` | fallback `now` | aligned |
| `updatedAt` | `→` | `order.updated_at` | fallback `now` | aligned |
| `paidAt` | `→` | `order.paid_at` OR `paymentIntent.created` | fallback from PI | aligned |

#### Order Status Enum Mapping

**Payment Status:**
```typescript
normalizePaymentStatus(medusa_status: string): SanityPaymentStatus {
  'captured' → 'paid'
  'refunded' → 'refunded'
  'partially_refunded' → 'partially_refunded'
  'canceled' → 'cancelled'
  'not_paid' → 'unpaid'
  'authorized' | 'partially_authorized' | 'awaiting' | 'partially_captured' | 'requires_action' → 'pending'
  default → 'pending'
}
```

**Order Status:**
```typescript
deriveOrderStatus(input: {
  orderStatus?: string
  paymentStatus?: string
  fulfillmentStatus?: string
}): SanityOrderStatus {
  orderStatus === 'canceled' → 'canceled'
  paymentStatus === 'refunded' | 'partially_refunded' → 'refunded'
  fulfillmentStatus === 'delivered' | 'partially_delivered' → 'delivered'
  fulfillmentStatus === 'fulfilled' | 'shipped' | 'partially_shipped' | 'partially_fulfilled' → 'fulfilled'
  paymentStatus === 'paid' → 'paid'
  orderStatus === 'completed' → 'paid'
  default → 'pending'
}
```

#### Order Canonical Number Transform

```typescript
const ORDER_NUMBER_PATTERN = /^FAS-\d{6}$/;

toCanonicalOrderNumber(...values: Array<unknown>): string | undefined {
  // Priority: medusaOrder.display_id, medusaOrder.id
  for (const value of values) {
    const raw = String(value).trim();
    const normalized = raw.toUpperCase();

    // If already canonical, return it
    if (ORDER_NUMBER_PATTERN.test(normalized)) return normalized;

    // Extract digits and pad to 6
    const digits = normalized.replace(/\D/g, '');
    if (digits) {
      return `FAS-${digits.slice(-6).padStart(6, '0')}`;
    }
  }
  return undefined;
}
```

**Example Transforms:**
- `123` → `FAS-000123`
- `"FAS-000456"` → `FAS-000456` (already canonical)
- `"order_01JCQR3K9J"` → `FAS-019000` (extract digits, last 6)

#### Shipping Snapshot Computation

**Function:** `computeShipmentSnapshot(items: any[], weightUnit: string)`

**Logic:**
```typescript
for (const item of items) {
  const qty = Number(item?.quantity || 0);
  const variant = item?.variant || {};
  const metadata = item?.metadata || {};

  // Weight from variant or metadata
  const weight = variant?.weight ?? metadata?.shipping_weight ?? metadata?.weight;

  // Dimensions from variant or metadata
  const length = variant?.length ?? metadata?.shipping_dimensions?.length;
  const width = variant?.width ?? metadata?.shipping_dimensions?.width;
  const height = variant?.height ?? metadata?.shipping_dimensions?.height;

  totalWeight += (weight || 0) * qty;
  maxL = Math.max(maxL, length || 0);
  maxW = Math.max(maxW, width || 0);
  maxH = Math.max(maxH, height || 0);
}

return {
  weight: { value: totalWeight, unit: resolveWeightUnit(weightUnit) },
  dimensions: { length: maxL, width: maxW, height: maxH, unit: 'inch' }
};
```

**Unit Resolution:**
```typescript
resolveWeightUnit(unit: string): 'pound' | 'ounce' | 'gram' | 'kilogram' {
  'oz' → 'ounce'
  'g' → 'gram'
  'kg' → 'kilogram'
  'lb' | default → 'pound'
}
```

#### Fields Not Persisted by `complete-order.ts`

| Sanity Field | Reason Not Persisted |
|--------------|---------------------|
| `customerRef` | Not resolved at mirror-time (email-based linkage happens elsewhere) |
| `shippoRates[]` | Full snapshot not persisted by `complete-order` (only selected rate) |
| `shippoRateEstimatedDays` | Not extracted from PI metadata |
| `source` | Relies on schema `initialValue: "medusa"` |
| `authoritative` | Relies on schema `initialValue: false` |

---

## 3. Customer Mapping

### Sanity `customer` ↔ Medusa `Customer` (Mirror + Annotation)

**Mapping File:** Not yet implemented (pending sync mechanism)
**Current State:** Manual linkage via `medusaCustomerId`, no automated sync

| Sanity Field | Direction | Medusa Field | Transform | Notes |
|--------------|-----------|--------------|-----------|-------|
| `medusaCustomerId` | `→` | `Customer.id` | direct | Linking field |
| `email` | `↔` | `Customer.email` | direct | — |
| `firstName` | `↔` | `Customer.first_name` | direct | — |
| `lastName` | `↔` | `Customer.last_name` | direct | — |
| `phone` | `↔` | `Customer.phone` | direct | — |
| `name` | `⊗` | — | **computed in Sanity** | Auto from firstName + lastName |
| `roles` | `⊗` | — | — | Sanity-only (FAS Auth) |
| `customerStatus` | `⊗` | — | — | Sanity-only (visitor/customer/vip) |
| `segment` | `⊗` | — | — | Sanity-only (derived segmentation) |
| `shippingAddress` | `↔` | `Customer.addresses[]` | **object mapping** | Primary address |
| `billingAddress` | `↔` | `Customer.billing_address` | **object mapping** | Primary address |
| `addresses[]` | `↔` | `Customer.addresses[]` | **array of objects** | All saved addresses |
| `orders[]` | `→` | derived | **summary objects** | Read-only mirror summaries |
| `totalOrders` | `→` | derived | **count** | Derived from orders |
| `lifetimeValue` | `→` | derived | **sum of order totals** | Derived from orders |
| `lifetimeSpend` | `→` | derived | **duplicate** | Same as lifetimeValue |
| `averageOrderValue` | `→` | derived | **avg** | Derived from orders |
| `firstOrderDate` | `→` | derived | **min createdAt** | Derived from orders |
| `lastOrderDate` | `→` | derived | **max createdAt** | Derived from orders |
| `daysSinceLastOrder` | `→` | derived | **days diff** | Derived from lastOrderDate |
| `stripeCustomerId` | `⊗` | — | — | Sanity-only (legacy Stripe sync) |
| `passwordHash` | `⊗` | — | — | Sanity-only (FAS Auth) |
| `emailMarketing.*` | `⊗` | — | — | Sanity-only (marketing preferences) |
| `customerNotes` | `⊗` | — | — | Sanity-only (internal notes) |
| `source` | `⊗` | — | **`"medusa"`** | Sanity schema default |
| `authoritative` | `⊗` | — | **`false`** | Sanity schema default |

---

## 4. Price Conversion Constants

### Cents ↔ Dollars Transformation

**Direction:** Medusa (cents) ↔ Sanity (dollars)

**Functions:**
```typescript
// Medusa → Sanity (cents → dollars)
const toDollars = (cents: unknown): number | undefined => {
  const n = toNumber(cents);
  if (n === undefined) return undefined;
  return Math.round(n) / 100;
};

// Sanity → Medusa (dollars → cents)
const toCents = (dollars: unknown): number | undefined => {
  const n = toNumber(dollars);
  if (n === undefined) return undefined;
  return Math.round(n * 100);
};
```

**Example Conversions:**
- `2999` cents → `29.99` dollars
- `29.99` dollars → `2999` cents
- `100` cents → `1.00` dollars
- `1.00` dollars → `100` cents

**Fields Using This Transform:**
- `order.totalAmount` ↔ `order.total`
- `order.amountSubtotal` ↔ `order.subtotal`
- `order.amountShipping` ↔ `order.shipping_total`
- `order.amountTax` ↔ `order.tax_total`
- `order.amountDiscount` ↔ `order.discount_total`
- `cart[].price` ↔ `item.unit_price`
- `cart[].total` ↔ `item.total`
- `product.price` ↔ `ProductVariant.prices[0].amount`

**Cents Integer Backfill:**
Sanity also stores hidden `*Cents` fields for precision:
- `totalCents` (integer) = `totalAmount * 100`
- `subtotalCents` (integer) = `amountSubtotal * 100`
- `shippingCents` (integer) = `amountShipping * 100`

---

## 5. Unit Conversion Constants

### Weight: Pounds ↔ Grams

**Direction:** Sanity (pounds) ↔ Medusa (grams)

**Formula:**
```typescript
medusaGrams = sanityPounds * 453.592
sanityPounds = medusaGrams / 453.592
```

**Example Conversions:**
- `10` lbs → `4535.92` g
- `4535.92` g → `10` lbs
- `1` lb → `453.592` g

### Dimensions: Inches ↔ Centimeters

**Direction:** Sanity (inches) ↔ Medusa (centimeters)

**Formula:**
```typescript
medusaCm = sanityInches * 2.54
sanityInches = medusaCm / 2.54
```

**Example Conversions:**
- `12` in → `30.48` cm
- `30.48` cm → `12` in
- `1` in → `2.54` cm

---

## 6. Reference Resolution

### Sanity References → Medusa IDs

| Sanity Reference Field | Medusa ID Field | Transform |
|------------------------|-----------------|-----------|
| `product.collections[]._ref` | `Product.collections[].id` | Extract Medusa collection ID from Sanity collection doc |
| `orderCartItem.productRef._ref` | `LineItem.variant_id` | Extract Medusa variant ID from Sanity product doc |
| `order.customerRef._ref` | `Order.customer_id` | Extract Medusa customer ID from Sanity customer doc |

**Resolution Pattern:**
```typescript
// Fetch reference to get Medusa ID
const sanityProduct = await sanityClient.fetch(
  '*[_id == $ref][0]{ medusaProductId }',
  { ref: productRef._ref }
);
const medusaProductId = sanityProduct.medusaProductId;
```

---

## 7. Array Mapping Patterns

### Order Line Items: `order.cart[]` ← `order.items[]`

**Medusa Line Item Structure:**
```typescript
{
  id: string
  variant_id: string
  variant_sku?: string
  quantity: number
  unit_price: number        // cents
  total: number            // cents
  subtotal: number         // cents
  metadata?: Record<string, any>
  variant?: {
    sku: string
    option_values?: Array<{
      option: { title: string }
      value: string
    }>
    weight?: number
    length?: number
    width?: number
    height?: number
  }
}
```

**Sanity Cart Item Mapping:**
```typescript
{
  name: item.title || item.variant?.title || 'Item',
  productName: item.title,
  sku: item.variant?.sku || item.variant_sku,
  quantity: item.quantity || 1,
  price: toDollars(item.unit_price),
  total: toDollars(item.total || item.subtotal),
  lineTotal: toDollars(item.total || item.subtotal),
  selectedVariant: formatVariantDisplay(item.variant?.option_values),
  optionDetails: toOptionDetails(item.variant?.option_values),
  metadata: {
    raw: JSON.stringify(item.metadata || {})
  }
}
```

**Option Details Transform:**
```typescript
const toOptionDetails = (values: Array<{ option: { title: string }, value: string }>): string[] => {
  return values.map(v => `${v.option.title}: ${v.value}`);
};

// Example:
// Input: [{ option: { title: "Color" }, value: "Red" }, { option: { title: "Size" }, value: "L" }]
// Output: ["Color: Red", "Size: L"]
```

---

## 8. Null Safety & Fallback Chains

### Address Fallback Chain

**Pattern:** `order.shipping_address` → `paymentIntent.shipping.address`

```typescript
const buildSanityAddress = (
  medusaAddress: any,
  stripeShipping: any,
  email: string | undefined
) => {
  const first = medusaAddress?.first_name;
  const last = medusaAddress?.last_name;
  const name = [first, last].filter(Boolean).join(' ').trim() || stripeShipping?.name || undefined;

  const line1 = medusaAddress?.address_1 || stripeShipping?.address?.line1;
  const line2 = medusaAddress?.address_2 || stripeShipping?.address?.line2;
  const city = medusaAddress?.city || stripeShipping?.address?.city;
  const state = medusaAddress?.province || stripeShipping?.address?.state;
  const postalCode = medusaAddress?.postal_code || stripeShipping?.address?.postal_code;
  const country = (medusaAddress?.country_code || stripeShipping?.address?.country || '').toUpperCase();
  const phone = medusaAddress?.phone || stripeShipping?.phone;

  // Only return if we have at least minimal address data
  if (!line1 && !city && !postalCode && !country) return undefined;

  return {
    name,
    phone,
    email,
    addressLine1: line1,
    addressLine2: line2,
    city,
    state,
    postalCode,
    country: country || undefined
  };
};
```

### Shipment Snapshot Fallback Chain

**Weight:** `item.variant.weight` → `item.metadata.shipping_weight` → `item.metadata.weight` → `item.metadata.shippingWeight`

**Dimensions:** `item.variant.{length,width,height}` → `item.metadata.shipping_dimensions.{length,width,height}` → `item.metadata.{length,width,height}` → `item.metadata.{shippingLength,shippingWidth,shippingHeight}`

---

## 9. Metadata Extraction Patterns

### Stripe Payment Intent Metadata → Sanity Order Fields

| Sanity Field | Payment Intent Metadata Key | Transform |
|--------------|----------------------------|-----------|
| `medusaCartId` | `medusa_cart_id` | direct |
| `shippoRateId` | `shippo_rate_id` | direct |
| `shippoRateAmount` | `shipping_amount_cents` | **numeric parse** |
| `shippoRateCurrency` | `shippo_rate_currency` | direct |
| `shippoServicelevel` | `shippo_servicelevel` | direct |
| `shippoCarrier` | `shippo_carrier` | direct |
| `shippoProvider` | `shippo_provider` | direct |
| `shippingMethod.carrier` | `carrier` | direct |
| `shippingMethod.serviceName` | `service_name` | direct |
| `shippingMethod.shippoRateId` | `shippo_rate_id` | direct |
| `customerEmail` | `customer_email` | direct |

**Metadata Access Pattern:**
```typescript
const metadata = paymentIntent.metadata || {};
const shippoRateId = metadata.shippo_rate_id;
const shippingAmount = toNumber(metadata.shipping_amount_cents);
```

---

## 10. Timestamp Mapping

### Datetime Field Conventions

| Sanity Field | Medusa Field | Fallback | Format |
|--------------|--------------|----------|--------|
| `createdAt` | `order.created_at` | `new Date().toISOString()` | ISO 8601 |
| `updatedAt` | `order.updated_at` | `new Date().toISOString()` | ISO 8601 |
| `paidAt` | `order.paid_at` | `paymentIntent.created` | ISO 8601 Unix timestamp → ISO |

**Unix Timestamp Conversion:**
```typescript
const timestampToISO = (unixSeconds: number): string => {
  return new Date(unixSeconds * 1000).toISOString();
};

// Payment Intent timestamp is Unix seconds
paidAt: order.paid_at || timestampToISO(paymentIntent.created)
```

---

## 11. Computed Field Dependencies

### Sanity Computed Fields (Not Directly Mapped)

| Sanity Field | Computation Logic | Dependencies |
|--------------|-------------------|--------------|
| `customer.name` | `firstName + " " + lastName` OR `email` | `firstName`, `lastName`, `email` |
| `order.status` | `deriveOrderStatus()` | `orderStatus`, `paymentStatus`, `fulfillmentStatus` |
| `customer.daysSinceLastOrder` | `(now - lastOrderDate) / (1000 * 60 * 60 * 24)` | `lastOrderDate` |
| `customer.averageOrderValue` | `lifetimeValue / totalOrders` | `lifetimeValue`, `totalOrders` |
| `orderCartItem` preview title | `sanitizeCartItemName(name)` | `name` |

---

## 12. Schema-Level Defaults

### Initial Values Set by Schema (Not from Medusa)

| Sanity Field | Initial Value | Applied When |
|--------------|---------------|--------------|
| `order.source` | `"medusa"` | New document creation |
| `order.authoritative` | `false` | New document creation |
| `customer.source` | `"medusa"` | New document creation |
| `customer.authoritative` | `false` | New document creation |
| `customer.roles` | `["customer"]` | New document creation |
| `customer.emailMarketing.subscribed` | `false` | New emailMarketing object |
| `product.status` | `"active"` | New document creation |
| `product.productType` | `"physical"` | New document creation |

---

**END OF FIELD MAPPING**
