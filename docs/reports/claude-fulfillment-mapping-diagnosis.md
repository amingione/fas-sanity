# Fulfillment Mapping Diagnosis

**Purpose:** Identify exact field-level mapping errors preventing package weight and dimensions from propagating from product → order → shipment payload.

**Date:** 2025-12-29

---

## 1. Observed Failure Point

**Failure Stage:** Order creation (webhook handler)

**Observed Behavior:**
- Product shipping fields (`shippingConfig.weight`, `shippingConfig.dimensions`) are never written to order document
- Shipment builder always falls back to hardcoded defaults: 10×8×4 inches, 1 lb
- EasyPost receives incorrect package specifications

**Evidence:**
- **File:** `fas-cms-fresh/src/pages/api/webhooks.ts`
  - **Lines 437-495:** Order creation payload
  - **Missing:** No `weight` or `dimensions` fields populated from product data

- **File:** `fas-sanity/netlify/functions/fulfillOrder.ts`
  - **Lines 63-76:** `buildParcel()` function
  - **Line 64:** `resolveDimensions(order.packageDimensions ?? order.dimensions, {length: 10, width: 8, height: 4})`
  - **Line 69:** `resolveWeight(order.weight, {value: 1, unit: 'pound'})`
  - **Result:** Hardcoded fallbacks used when order fields are null

- **File:** `fas-sanity/netlify/lib/easypostClient.ts`
  - **Lines 148-196:** `resolveDimensions()` - returns fallback when input is null
  - **Lines 73-146:** `resolveWeight()` - returns fallback when input is null

---

## 2. Required Order-Level Fields (Authoritative)

| Field | Status | Evidence |
|-------|--------|----------|
| `Order.weight` | **missing** - never written | order.tsx:398-404 (schema exists), webhooks.ts:437-495 (not populated) |
| `Order.dimensions.length` | **missing** - never written | order.tsx:406-412 (schema exists), webhooks.ts:437-495 (not populated) |
| `Order.dimensions.width` | **missing** - never written | order.tsx:406-412 (schema exists), webhooks.ts:437-495 (not populated) |
| `Order.dimensions.height` | **missing** - never written | order.tsx:406-412 (schema exists), webhooks.ts:437-495 (not populated) |

**Note:** Schema defines these fields but they are read-only and hidden (order.tsx:402-403, 410-411). The fulfillment function queries them (fulfillOrder.ts:140-141) but receives null values.

---

## 3. Mapping Gap Analysis

### Field: `order.weight`

**Expected Source:**
- `product.shippingConfig.weight` (type: number, unit: lbs)
- Source file: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/product.ts:1181-1199`

**Actual Source Used:**
- NONE - field never written during order creation

**Failure Mode:**
- **never written** - Order document created without weight field
- **defaulted** - Fulfillment function falls back to 1 lb hardcoded default

---

### Field: `order.dimensions.length`

**Expected Source:**
- `product.shippingConfig.dimensions.length` (type: number, unit: inches)
- Source file: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/product.ts:1228-1246`

**Actual Source Used:**
- NONE - field never written during order creation

**Failure Mode:**
- **never written** - Order document created without dimensions
- **defaulted** - Fulfillment function falls back to 10 inches hardcoded default

---

### Field: `order.dimensions.width`

**Expected Source:**
- `product.shippingConfig.dimensions.width` (type: number, unit: inches)
- Source file: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/product.ts:1248-1266`

**Actual Source Used:**
- NONE - field never written during order creation

**Failure Mode:**
- **never written** - Order document created without dimensions
- **defaulted** - Fulfillment function falls back to 8 inches hardcoded default

---

### Field: `order.dimensions.height`

**Expected Source:**
- `product.shippingConfig.dimensions.height` (type: number, unit: inches)
- Source file: `fas-sanity/packages/sanity-config/src/schemaTypes/documents/product.ts:1268-1286`

**Actual Source Used:**
- NONE - field never written during order creation

**Failure Mode:**
- **never written** - Order document created without dimensions
- **defaulted** - Fulfillment function falls back to 4 inches hardcoded default

---

## 4. Files That Require Enforcement

### **File:** `fas-cms-fresh/src/pages/api/webhooks.ts`

**Lines:** 264-369 (cart line item construction), 437-495 (order payload creation)

**Reason:**
- Webhook constructs order from Stripe session and cart metadata
- Cart items contain product IDs but do NOT resolve product shipping configuration
- Order payload does NOT include `weight` or `dimensions` fields
- Product shipping data is never fetched or snapshotted onto order

**Required Change:**
- After constructing cart lines (line 369), fetch product shipping configs for each cart item
- Aggregate weight (sum of `product.shippingConfig.weight * quantity`)
- Determine largest dimensions (max of all product `shippingConfig.dimensions`)
- Write `order.weight` and `order.dimensions` to order payload (before line 495)

---

### **File:** `fas-sanity/netlify/functions/fulfillOrder.ts`

**Lines:** 63-76 (`buildParcel` function), 131-142 (order query)

**Reason:**
- Currently uses hardcoded fallback values when order fields are missing
- Should enforce that order MUST have shipping data or reject fulfillment

**Required Change:**
- Remove hardcoded fallbacks from `buildParcel()`
- Throw error if `order.weight` or `order.dimensions` is null/undefined
- Force webhook to populate shipping data correctly

---

### **File:** `fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx`

**Lines:** 398-412 (weight and dimensions fields)

**Reason:**
- Fields are currently `readOnly: true` and `hidden: true`
- This prevents manual editing but does NOT prevent programmatic writes
- No validation enforces that these fields MUST be populated

**Required Change:**
- Add validation to require `weight` and `dimensions` when order is created via webhook
- Keep `readOnly: true` to prevent manual edits
- Remove `hidden: true` so ops can see shipping data snapshot
- Document that these fields are populated automatically from product catalog

---

## 5. Enforcement Instructions (Codex-Readable)

**Codex is authorized to:**

1. **Modify webhook handler** (`fas-cms-fresh/src/pages/api/webhooks.ts`):
   - After cart line item construction (line 369), query Sanity for product shipping configs
   - For each cart item with `productId`, fetch `product.shippingConfig.weight` and `product.shippingConfig.dimensions`
   - Calculate aggregate weight: `sum(product.shippingConfig.weight * item.quantity)` for all items
   - Calculate package dimensions: `max(length)`, `max(width)`, `max(height)` across all items
   - Add `weight` and `dimensions` fields to `orderPayload` (before line 495)
   - Write shipping snapshot to order document using existing Sanity schema structure

2. **Update order schema validation** (`fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx`):
   - Add validation rule to `weight` field (line 398-404): warn if undefined when `status === 'paid'`
   - Add validation rule to `dimensions` field (line 406-412): warn if undefined when `status === 'paid'`
   - Change `hidden: true` to `hidden: false` for both fields (make visible to ops)
   - Keep `readOnly: true` (prevent manual edits, enforce programmatic-only writes)

3. **Harden fulfillment function** (`fas-sanity/netlify/functions/fulfillOrder.ts`):
   - Remove hardcoded fallback values from `buildParcel()` function (lines 64-69)
   - Throw error if `order.weight` is null/undefined: `"Order missing weight - cannot create shipment"`
   - Throw error if `order.dimensions` is null/undefined: `"Order missing dimensions - cannot create shipment"`
   - Return HTTP 400 with actionable error message directing ops to check product catalog

**Codex is NOT authorized to:**

- Change product schema (`product.ts`) - shipping config fields are correct
- Modify Stripe catalog sync - package_dimensions are correctly synced
- Add new shipping abstractions or aggregation layers
- Modify EasyPost API integration beyond input validation

---

## 6. Decision Classification

**Decision Status:** ACCEPTED — enforcement required

**Reason:**

The diagnostic confirms that webhook handler omits shipping data snapshot during order creation, forcing fulfillment function to fall back to hardcoded defaults. The required order-level fields exist in schema but are never populated. The mapping gap is precise and bounded:

- **Source:** Product catalog (`shippingConfig.weight`, `shippingConfig.dimensions`)
- **Target:** Order snapshot (`order.weight`, `order.dimensions`)
- **Gap:** Webhook does not resolve product shipping configs or write to order fields
- **Impact:** EasyPost always receives 10×8×4 inches, 1 lb regardless of actual product specifications

The fix requires exactly three file changes with no architectural redesign:
1. Webhook resolves and snapshots shipping data from products to order (data flow)
2. Order schema validation warns when shipping fields are missing (data integrity)
3. Fulfillment function rejects orders without shipping data (enforcement)

This is a data mapping error, not a design flaw. Product and order schemas are correct. The enforcement pattern (snapshot at creation, validate before fulfillment) is standard.

No additional data is required. All information needed to implement the fix is present in this diagnosis.

---

## CLAUDE DIAGNOSTIC COMPLETION

**Purpose:**
- Identify exact field-level mapping errors for fulfillment

**New Findings Introduced:**
- NO

**Solutions Implemented:**
- NO

**Ready for Codex Enforcement:**
- YES

**Timestamp (UTC):**
- 2025-12-29T08:00:00Z

---

**END OF DIAGNOSIS**
