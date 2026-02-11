# Sanity ↔ Medusa Pipeline Gaps Analysis

**Generated:** 2026-02-11
**Purpose:** Document every null risk, orphaned field, type mismatch, and enum difference between Sanity and Medusa
**Scope:** Complete gap analysis across product, order, and customer entities

---

## 1. Fields Not Populated by Runtime Mapping

### 1.1 Order Fields Excluded from `complete-order.ts`

These Sanity `order` fields exist in the schema but are **not populated** during order mirroring:

| Sanity Field | Reason Not Populated | Null Risk | Impact |
|--------------|---------------------|-----------|--------|
| `customerRef` | Email-based linkage happens elsewhere (not at mirror-time) | **HIGH** | Customer profile not linked; requires post-processing |
| `shippoRates[]` | Full rate snapshot not persisted (only selected rate) | **HIGH** | Historical rate comparison unavailable |
| `shippoRateEstimatedDays` | Not extracted from `paymentIntent.metadata` | **MEDIUM** | Estimated delivery days missing |
| `orderType` | Defaults to schema `initialValue: "online"` | **LOW** | Wholesale/retail orders not distinguished |
| `source` | Defaults to schema `initialValue: "medusa"` | **LOW** | Safe default, no null risk |
| `authoritative` | Defaults to schema `initialValue: false` | **LOW** | Safe default, no null risk |

**Resolution Status:**
- `customerRef`: ⚠️ Requires separate customer linkage process
- `shippoRates[]`: ⚠️ Not preserved; only selected rate persisted
- `shippoRateEstimatedDays`: ⚠️ Metadata extraction incomplete
- `orderType`, `source`, `authoritative`: ✅ Schema defaults handle safely

---

### 1.2 Customer Fields Without Medusa Sync

These Sanity `customer` fields have **no Medusa equivalent** and require manual population or derivation:

| Sanity Field | Type | Medusa Equivalent | Population Method |
|--------------|------|-------------------|-------------------|
| `roles` | `string[]` | `⊗` None | Manual assignment (FAS Auth) |
| `customerStatus` | `string` | `⊗` None | Derived (visitor/customer/vip) |
| `segment` | `string` | `⊗` None | Derived (segmentation logic) |
| `stripeCustomerId` | `string` | `⊗` None | Legacy Stripe sync (deprecated) |
| `passwordHash` | `string` | `⊗` None | FAS Auth system |
| `emailMarketing.*` | `object` | `⊗` None | Marketing preferences (manual) |
| `customerNotes` | `text` | `⊗` None | Internal notes (manual) |
| `source` | `string` | `⊗` None | Schema default `"medusa"` |
| `authoritative` | `boolean` | `⊗` None | Schema default `false` |
| `totalOrders` | `number` | `⊗` None | **Derived** from `orders[]` |
| `lifetimeValue` | `number` | `⊗` None | **Derived** from `orders[]` |
| `lifetimeSpend` | `number` | `⊗` None | **Derived** (duplicate of lifetimeValue) |
| `averageOrderValue` | `number` | `⊗` None | **Derived** from `orders[]` |
| `firstOrderDate` | `datetime` | `⊗` None | **Derived** from `orders[]` |
| `lastOrderDate` | `datetime` | `⊗` None | **Derived** from `orders[]` |
| `daysSinceLastOrder` | `number` | `⊗` None | **Derived** from `lastOrderDate` |

**Null Risks:**
- Derived fields (`totalOrders`, `lifetimeValue`, etc.) will be **undefined** until `orders[]` is populated
- `roles` defaults to `["customer"]` (schema initialValue)
- All other fields are optional (no validation rules)

---

### 1.3 Product Fields Without Medusa Sync

These Sanity `product` fields are **Sanity-only** and not bidirectionally synced:

| Sanity Field | Type | Medusa Equivalent | Purpose |
|--------------|------|-------------------|---------|
| `status` | `string` | `⊗` None | Sanity-only (active/draft/paused/archived) |
| `productType` | `string` | `⊗` None | Sanity-only (physical/service/bundle) |
| `cost` | `number` | `⊗` None | COGS tracking (not in Medusa) |
| `addOns[]` | `array` | `⊗` None | Bundle upsells (Sanity concept) |
| `shippingConfig.shippingClass` | `string` | `⊗` None | Sanity-only (standard/heavy/fragile/hazmat) |
| `shippingConfig.requiresShipping` | `boolean` | `⊗` None | Sanity UI control |
| `inventory.trackQuantity` | `boolean` | `⊗` None | Sanity UI control |

**Impact:** These fields exist only for Sanity UI/CMS workflows and do not affect Medusa commerce logic.

---

## 2. Type Mismatches Requiring Conversion

### 2.1 Price Storage Convention

**Problem:** Medusa stores prices in **cents** (integer), Sanity displays in **dollars** (decimal)

| Field Context | Medusa Type | Sanity Type | Transform Function |
|---------------|-------------|-------------|-------------------|
| Product price | `ProductVariant.prices[0].amount` (integer cents) | `product.price` (number dollars) | `toDollars(cents) = cents / 100` |
| Order totals | `order.total` (integer cents) | `order.totalAmount` (number dollars) | `toDollars(cents) = cents / 100` |
| Order subtotal | `order.subtotal` (integer cents) | `order.amountSubtotal` (number dollars) | `toDollars(cents) = cents / 100` |
| Shipping total | `order.shipping_total` (integer cents) | `order.amountShipping` (number dollars) | `toDollars(cents) = cents / 100` |
| Tax total | `order.tax_total` (integer cents) | `order.amountTax` (number dollars) | `toDollars(cents) = cents / 100` |
| Discount total | `order.discount_total` (integer cents) | `order.amountDiscount` (number dollars) | `toDollars(cents) = cents / 100` |
| Line item price | `item.unit_price` (integer cents) | `cart[].price` (number dollars) | `toDollars(cents) = cents / 100` |
| Line item total | `item.total` (integer cents) | `cart[].total` (number dollars) | `toDollars(cents) = cents / 100` |

**Conversion Logic:**
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

**Null Safety:** Both transforms return `undefined` for invalid input; Sanity financial fields default to `0` if undefined.

**Precision Preservation:** Sanity stores hidden `*Cents` integer fields for precision:
- `totalCents` (integer) = `totalAmount * 100`
- `subtotalCents` (integer) = `amountSubtotal * 100`
- `shippingCents` (integer) = `amountShipping * 100`

---

### 2.2 Weight Unit Convention

**Problem:** Medusa stores weight in **grams**, Sanity stores in **pounds**

| Field Context | Medusa Unit | Sanity Unit | Transform Formula |
|---------------|-------------|-------------|-------------------|
| Product weight | `ProductVariant.weight` (grams) | `product.shippingConfig.weight` (pounds) | `sanityLbs = medusaGrams / 453.592` |
| Order weight snapshot | `item.variant.weight` (grams) | `order.weight.value` (pounds) | `sanityLbs = medusaGrams / 453.592` |

**Conversion Formula:**
```typescript
medusaGrams = sanityPounds * 453.592
sanityPounds = medusaGrams / 453.592
```

**Example Conversions:**
- `10 lbs` → `4535.92 g`
- `4535.92 g` → `10 lbs`
- `1 lb` → `453.592 g`

**Null Safety:** Weight snapshot computation returns `undefined` if any line item is missing weight data.

---

### 2.3 Dimension Unit Convention

**Problem:** Medusa stores dimensions in **centimeters**, Sanity stores in **inches**

| Field Context | Medusa Unit | Sanity Unit | Transform Formula |
|---------------|-------------|-------------|-------------------|
| Product dimensions | `ProductVariant.{length,width,height}` (cm) | `product.shippingConfig.dimensions.{length,width,height}` (inches) | `sanityIn = medusaCm / 2.54` |
| Order dimensions snapshot | `item.variant.{length,width,height}` (cm) | `order.dimensions.{length,width,height}` (inches) | `sanityIn = medusaCm / 2.54` |

**Conversion Formula:**
```typescript
medusaCm = sanityInches * 2.54
sanityInches = medusaCm / 2.54
```

**Example Conversions:**
- `12 in` → `30.48 cm`
- `30.48 cm` → `12 in`
- `1 in` → `2.54 cm`

**Null Safety:** Dimensions snapshot computation returns `undefined` if any line item is missing dimension data.

---

### 2.4 Order Number Canonicalization

**Problem:** Medusa uses **numeric `display_id`**, Sanity requires **canonical `FAS-######` format**

| Medusa Source | Example Value | Sanity Format | Transform Logic |
|---------------|---------------|---------------|-----------------|
| `order.display_id` | `123` | `FAS-000123` | Extract digits, pad to 6, prefix with `FAS-` |
| `order.id` | `order_01JCQR3K9J` | `FAS-019000` | Extract last 6 digits, pad, prefix |
| Already canonical | `FAS-000456` | `FAS-000456` | Pass through (already matches pattern) |

**Canonicalization Logic:**
```typescript
const ORDER_NUMBER_PATTERN = /^FAS-\d{6}$/;

const toCanonicalOrderNumber = (...values: Array<unknown>): string | undefined => {
  for (const value of values) {
    const raw = String(value).trim().toUpperCase();

    // If already canonical, return it
    if (ORDER_NUMBER_PATTERN.test(raw)) return raw;

    // Extract digits and pad to 6
    const digits = raw.replace(/\D/g, '');
    if (digits) {
      return `FAS-${digits.slice(-6).padStart(6, '0')}`;
    }
  }
  return undefined;
};
```

**Validation:** `orderNumber` is **required** in Sanity schema (line 53 validation rule). Transform ensures this field is never null.

---

## 3. Enum Value Mapping Differences

### 3.1 Payment Status Enum Mapping

**Problem:** Medusa and Sanity use different enum values for payment status

| Medusa Payment Status | Sanity Payment Status | Notes |
|-----------------------|----------------------|-------|
| `captured` | `paid` | Most common success state |
| `refunded` | `refunded` | Direct match |
| `partially_refunded` | `partially_refunded` | Direct match |
| `canceled` | `cancelled` | **Spelling difference** (one 'l' vs two 'l's) |
| `not_paid` | `unpaid` | **Value difference** |
| `authorized` | `pending` | Grouped as pending |
| `partially_authorized` | `pending` | Grouped as pending |
| `awaiting` | `pending` | Grouped as pending |
| `partially_captured` | `pending` | Grouped as pending |
| `requires_action` | `pending` | Grouped as pending |
| *(any other)* | `pending` | **Default fallback** |

**Normalization Function:**
```typescript
const normalizePaymentStatus = (status: string | undefined): string => {
  switch (status) {
    case 'captured': return 'paid';
    case 'refunded': return 'refunded';
    case 'partially_refunded': return 'partially_refunded';
    case 'canceled': return 'cancelled';
    case 'not_paid': return 'unpaid';
    default: return 'pending';
  }
};
```

**Null Risk:** Unknown Medusa payment statuses default to `'pending'` (safe fallback).

---

### 3.2 Order Status Derivation

**Problem:** Sanity `order.status` is **derived** from **multiple** Medusa status fields using priority logic

**Derivation Priority:**
1. `order.status === 'canceled'` → `'canceled'`
2. `payment_status` is `'refunded'` or `'partially_refunded'` → `'refunded'`
3. `fulfillment_status` is `'delivered'` or `'partially_delivered'` → `'delivered'`
4. `fulfillment_status` is `'fulfilled'`, `'shipped'`, `'partially_shipped'`, or `'partially_fulfilled'` → `'fulfilled'`
5. `payment_status === 'paid'` → `'paid'`
6. `order.status === 'completed'` → `'paid'`
7. *(default)* → `'pending'`

**Derivation Function:**
```typescript
const deriveOrderStatus = (input: {
  orderStatus?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
}): string => {
  if (input.orderStatus === 'canceled') return 'canceled';
  if (input.paymentStatus === 'refunded' || input.paymentStatus === 'partially_refunded') {
    return 'refunded';
  }
  if (input.fulfillmentStatus === 'delivered' || input.fulfillmentStatus === 'partially_delivered') {
    return 'delivered';
  }
  if (input.fulfillmentStatus === 'fulfilled' || input.fulfillmentStatus === 'shipped') {
    return 'fulfilled';
  }
  if (input.paymentStatus === 'paid') return 'paid';
  if (input.orderStatus === 'completed') return 'paid';
  return 'pending';
};
```

**Null Risk:** Undefined inputs default to `'pending'` (safe fallback).

---

## 4. Validation Warnings & Null Risks

### 4.1 Required Fields with Null Risk

| Sanity Field | Validation Rule | Source | Null Risk | Mitigation |
|--------------|-----------------|--------|-----------|----------|
| `order.orderNumber` | **Required** (Rule.required()) | Derived from `display_id` or `id` | **LOW** | Canonicalization transform ensures never null |
| `order.weight` | **Warning** if status=paid and missing | Aggregated from line items | **MEDIUM** | Validation warning fires but doesn't block; label purchase may use defaults |
| `order.dimensions` | **Warning** if status=paid and missing | Aggregated from line items | **MEDIUM** | Validation warning fires but doesn't block; label purchase may use defaults |

**Weight/Dimensions Validation Logic:**
```typescript
validation: (Rule) =>
  Rule.custom((value, context) => {
    const status = context.document?.status;
    if (status === 'paid' && !value) {
      return 'Missing weight snapshot - fulfillment may use defaults';
    }
    return true;
  }).warning()
```

**Impact:** Warning (not error) allows order creation to succeed, but flags incomplete shipping data for manual review.

---

### 4.2 Address Null Risk (Fallback Chain)

**Problem:** Address data may be missing if both `order.shipping_address` and `paymentIntent.shipping` are null

**Fallback Chain:**
1. `order.shipping_address.*` (Medusa order address)
2. `paymentIntent.shipping.address.*` (Stripe Payment Intent)
3. `undefined` (if both sources are null)

**Null Safety in buildSanityAddress():**
```typescript
const buildSanityAddress = (
  medusaAddress: any,
  stripeShipping: any,
  email: string | undefined
) => {
  const line1 = medusaAddress?.address_1 || stripeShipping?.address?.line1;
  const city = medusaAddress?.city || stripeShipping?.address?.city;
  const postalCode = medusaAddress?.postal_code || stripeShipping?.address?.postal_code;
  const country = (medusaAddress?.country_code || stripeShipping?.address?.country || '').toUpperCase();

  // Only return if we have at least minimal address data
  if (!line1 && !city && !postalCode && !country) return undefined;

  return { /* address object */ };
};
```

**Null Risk:** If both Medusa and Stripe sources are null, `shippingAddress` and `billingAddress` will be `undefined`.

**Impact:** Order creation succeeds, but fulfillment requires manual address entry.

---

### 4.3 Financial Fields Null Safety

**Problem:** Financial totals may be undefined if Medusa order data is incomplete

**Default Behavior:**
```typescript
const subtotalCents = toNumber(medusaOrder?.subtotal) ?? 0;
const shippingCents = toNumber(medusaOrder?.shipping_total) ?? 0;
const taxCents = toNumber(medusaOrder?.tax_total) ?? 0;
const discountCents = toNumber(medusaOrder?.discount_total) ?? 0;
const totalCents = toNumber(medusaOrder?.total) ?? 0;
```

**Null Safety:** All financial fields default to `0` if undefined (safe fallback).

**Impact:** Missing financial data results in `$0.00` values rather than null/undefined errors.

---

## 5. Missing Medusa Fields Not Captured

### 5.1 Medusa Order Fields Excluded from Sanity

These Medusa `Order` fields are **not captured** in Sanity because they are administrative internals not needed for fulfillment:

| Medusa Field | Type | Reason Excluded |
|--------------|------|-----------------|
| `region_id` | `string` | Administrative (tax region) |
| `draft_order_id` | `string` | Administrative (draft workflow) |
| `cart.context` | `object` | Administrative (session metadata) |
| `cart.customer_id` | `string` | Redundant (already have `order.customer_id`) |
| `payment_sessions[]` | `array` | Administrative (Stripe internals) |
| `claims[]` | `array` | Not implemented in FAS workflow |
| `swaps[]` | `array` | Not implemented in FAS workflow |
| `returns[]` | `array` | Not implemented in FAS workflow |
| `edits[]` | `array` | Not implemented in FAS workflow |
| `gift_cards[]` | `array` | Not implemented in FAS workflow |
| `no_notification` | `boolean` | Administrative (email control) |
| `idempotency_key` | `string` | Administrative (deduplication) |
| `external_id` | `string` | Administrative (external system linking) |

**Impact:** These fields are Medusa-specific administrative data not relevant to Sanity fulfillment UI.

---

### 5.2 Medusa Line Item Fields Excluded from Sanity

These Medusa `LineItem` fields are **not fully captured** in Sanity `orderCartItem`:

| Medusa Field | Sanity Equivalent | Status |
|--------------|-------------------|--------|
| `item.id` | `cart[].id` | ✅ Captured |
| `item.title` | `cart[].name` | ✅ Captured |
| `item.variant_sku` | `cart[].sku` | ✅ Captured |
| `item.quantity` | `cart[].quantity` | ✅ Captured |
| `item.unit_price` | `cart[].price` | ✅ Captured (converted to dollars) |
| `item.total` | `cart[].total` | ✅ Captured (converted to dollars) |
| `item.metadata` | `cart[].metadata.raw` | ✅ Captured (JSON string) |
| `item.variant_option_values` | `cart[].optionDetails[]` | ✅ Captured (formatted) |
| `item.adjustments[]` | `⊗` Not captured | ⚠️ Excluded (discount details) |
| `item.tax_lines[]` | `⊗` Not captured | ⚠️ Excluded (tax breakdown) |
| `item.is_giftcard` | `⊗` Not captured | ⚠️ Excluded (gift card flag) |
| `item.should_merge` | `⊗` Not captured | ⚠️ Excluded (cart merge logic) |
| `item.allow_discounts` | `⊗` Not captured | ⚠️ Excluded (discount eligibility) |
| `item.has_shipping` | `⊗` Not captured | ⚠️ Excluded (shipping requirement) |

**Impact:** Detailed discount/tax breakdown and cart merge logic are not preserved in Sanity snapshot.

---

## 6. Metadata Extraction Gaps

### 6.1 Stripe Payment Intent Metadata Fields

These metadata fields are **extracted** from `paymentIntent.metadata` during order mirroring:

| Sanity Field | Payment Intent Metadata Key | Status |
|--------------|----------------------------|--------|
| `medusaCartId` | `medusa_cart_id` | ✅ Captured |
| `shippoRateId` | `shippo_rate_id` | ✅ Captured |
| `shippoRateAmount` | `shipping_amount_cents` | ✅ Captured |
| `shippoRateCurrency` | `shippo_rate_currency` | ✅ Captured |
| `shippoServicelevel` | `shippo_servicelevel` | ✅ Captured |
| `shippoCarrier` | `shippo_carrier` | ✅ Captured |
| `shippoProvider` | `shippo_provider` | ✅ Captured |
| `shippingMethod.carrier` | `carrier` | ✅ Captured |
| `shippingMethod.serviceName` | `service_name` | ✅ Captured |
| `customerEmail` | `customer_email` | ✅ Captured (fallback) |

**Missing Metadata Fields:**
- `shippoRateEstimatedDays` → Not extracted from metadata (missing `estimated_days` or `duration_terms` key)

**Null Risk:** If metadata keys are missing, corresponding Sanity fields will be `undefined`.

---

## 7. Computed Field Dependencies

### 7.1 Sanity Computed Fields Requiring Manual Population

These Sanity fields are **computed** and not directly mapped from Medusa:

| Sanity Field | Computation Logic | Dependencies | Null Risk |
|--------------|-------------------|--------------|-----------|
| `customer.name` | `firstName + " " + lastName` OR `email` | `firstName`, `lastName`, `email` | **LOW** (fallback to email) |
| `order.status` | `deriveOrderStatus()` | `orderStatus`, `paymentStatus`, `fulfillmentStatus` | **LOW** (defaults to 'pending') |
| `customer.daysSinceLastOrder` | `(now - lastOrderDate) / (1000 * 60 * 60 * 24)` | `lastOrderDate` | **MEDIUM** (undefined until orders exist) |
| `customer.averageOrderValue` | `lifetimeValue / totalOrders` | `lifetimeValue`, `totalOrders` | **MEDIUM** (undefined until orders exist) |
| `customer.totalOrders` | `orders[].length` | `orders[]` | **MEDIUM** (undefined until orders array populated) |
| `customer.lifetimeValue` | `sum(orders[].totalAmount)` | `orders[]` | **MEDIUM** (undefined until orders array populated) |
| `customer.firstOrderDate` | `min(orders[].createdAt)` | `orders[]` | **MEDIUM** (undefined until orders exist) |
| `customer.lastOrderDate` | `max(orders[].createdAt)` | `orders[]` | **MEDIUM** (undefined until orders exist) |

**Impact:** Customer metrics fields will be `undefined` until the `orders[]` array is populated (requires separate process).

---

## 8. Schema Default Values (Non-Null Guarantees)

### 8.1 Initial Values Set by Schema

These Sanity fields have **schema-level default values** that prevent null:

| Sanity Field | Initial Value | Entity | Applied When |
|--------------|---------------|--------|--------------|
| `order.source` | `"medusa"` | Order | New document creation |
| `order.authoritative` | `false` | Order | New document creation |
| `order.orderType` | `"online"` | Order | New document creation |
| `order.labelPurchased` | `false` | Order | New document creation |
| `order.fulfillmentAttempts` | `0` | Order | New document creation |
| `customer.source` | `"medusa"` | Customer | New document creation |
| `customer.authoritative` | `false` | Customer | New document creation |
| `customer.roles` | `["customer"]` | Customer | New document creation |
| `customer.emailMarketing.subscribed` | `false` | Customer | New emailMarketing object |
| `product.status` | `"active"` | Product | New document creation |
| `product.productType` | `"physical"` | Product | New document creation |

**Null Safety:** Schema defaults ensure these fields are never null/undefined at creation time.

---

## 9. Gap Summary & Risk Matrix

### 9.1 High-Risk Gaps (Null Propagation Likely)

| Gap | Entity | Impact | Resolution Required |
|-----|--------|--------|---------------------|
| `customerRef` not populated | Order | Customer profile not linked | ✅ **Requires post-processing linkage** |
| `shippoRates[]` not populated | Order | Historical rate comparison unavailable | ⚠️ **Not critical** (selected rate is persisted) |
| `weight` null when status=paid | Order | Fulfillment may use defaults | ⚠️ **Validation warning** (non-blocking) |
| `dimensions` null when status=paid | Order | Fulfillment may use defaults | ⚠️ **Validation warning** (non-blocking) |
| Address null (fallback chain exhausted) | Order | Fulfillment requires manual entry | ⚠️ **Rare edge case** (both Medusa & Stripe null) |

---

### 9.2 Medium-Risk Gaps (Computed Field Dependencies)

| Gap | Entity | Impact | Resolution Required |
|-----|--------|--------|---------------------|
| Customer metrics undefined | Customer | Metrics unavailable until orders populated | ✅ **Requires order array population** |
| `shippoRateEstimatedDays` missing | Order | Estimated delivery days unavailable | ⚠️ **Metadata extraction incomplete** |

---

### 9.3 Low-Risk Gaps (Safe Defaults or UI-Only)

| Gap | Entity | Impact | Resolution Required |
|-----|--------|--------|---------------------|
| Sanity-only fields (status, cost, addOns, etc.) | Product | No Medusa sync needed | ✅ **Intentional** (Sanity-only features) |
| Sanity-only fields (opsNotes, opsFlags, etc.) | Order | No Medusa sync needed | ✅ **Intentional** (Sanity-only features) |
| Sanity-only fields (roles, segment, notes, etc.) | Customer | No Medusa sync needed | ✅ **Intentional** (Sanity-only features) |
| `orderType` defaults to "online" | Order | Wholesale/retail not auto-detected | ✅ **Safe default** (manual override available) |

---

## 10. Type Mismatch Summary

| Mismatch | Medusa Type | Sanity Type | Conversion Function | Null Risk |
|----------|-------------|-------------|---------------------|-----------|
| Price storage | `integer` (cents) | `number` (dollars) | `toDollars(cents) = cents / 100` | **LOW** (defaults to 0) |
| Weight units | `number` (grams) | `number` (pounds) | `lbs = grams / 453.592` | **MEDIUM** (undefined if missing) |
| Dimension units | `number` (cm) | `number` (inches) | `inches = cm / 2.54` | **MEDIUM** (undefined if missing) |
| Order number format | `number` (display_id) | `string` (FAS-######) | `toCanonicalOrderNumber()` | **LOW** (required field enforced) |
| Payment status enum | `string` (Medusa values) | `string` (Sanity values) | `normalizePaymentStatus()` | **LOW** (defaults to 'pending') |
| Order status | `string` (derived) | `string` (Sanity values) | `deriveOrderStatus()` | **LOW** (defaults to 'pending') |

---

## 11. Recommendations

### 11.1 Critical Fixes Required

1. **Populate `customerRef` during order mirroring**
   - Add customer email → Sanity customer ID lookup in `complete-order.ts`
   - Link `customerRef` to existing Sanity customer or create new customer record

2. **Extract `shippoRateEstimatedDays` from Payment Intent metadata**
   - Add metadata key `estimated_days` or `duration_terms` to Stripe PI metadata
   - Populate `order.shippoRateEstimatedDays` during mirroring

3. **Enforce weight/dimensions snapshot at checkout**
   - Ensure all products have `shippingConfig.weight` and `shippingConfig.dimensions` populated
   - Block checkout if shipping snapshot computation fails (currently allows creation with warning)

### 11.2 Optional Enhancements

1. **Preserve full `shippoRates[]` snapshot**
   - Persist all Shippo rates (not just selected) for historical comparison
   - Useful for post-purchase rate analysis

2. **Auto-detect `orderType` from metadata**
   - Add wholesale/retail detection logic based on customer segment or cart context
   - Currently defaults to "online" (manual override required)

3. **Implement customer metrics derivation**
   - Add scheduled task to populate `orders[]` array in customer documents
   - Compute `totalOrders`, `lifetimeValue`, `firstOrderDate`, etc.

---

**END OF PIPELINE GAPS ANALYSIS**
