# Order Shipping Snapshot Contract

**Version:** 1.0.0
**Status:** SCHEMA CHANGE APPROVED
**Date:** 2025-12-29
**Authority:** fas-sanity Architecture

## Purpose

This contract establishes the authoritative requirements for snapshotting product shipping data onto order documents during checkout. This ensures EasyPost receives accurate package specifications instead of hardcoded defaults.

## Problem Statement

When orders are created via Stripe checkout webhook, product shipping configuration (weight and dimensions) is not copied to the order document. This causes the fulfillment function to fall back to hardcoded defaults (10×8×4 inches, 1 lb), resulting in incorrect shipping rates and labels.

**Source:** [docs/reports/claude-fulfillment-mapping-diagnosis.md](../reports/claude-fulfillment-mapping-diagnosis.md)

## Authoritative Decisions

### 1. Shipping Snapshot Rule 📸

**RULE:** Product shipping data MUST be snapshotted onto order documents at creation time.

**ENFORCEMENT:**

- When webhook creates order from Stripe session, resolve product shipping configs for all cart items
- Calculate aggregate weight (sum of `product.shippingConfig.weight * quantity`)
- Calculate package dimensions (max length/width/height across all items)
- Write `order.weight` and `order.dimensions` to order document before commit

**Affected Fields:**

- Product: `shippingConfig.weight` (lbs), `shippingConfig.dimensions` (inches)
- Order: `weight` (shipmentWeight type), `dimensions` (packageDimensions type)

### 2. Aggregation Rule 🧮

**RULE:** Multi-item orders use cumulative weight and maximum dimensions.

**ENFORCEMENT:**

**Weight Calculation:**

```typescript
totalWeight = sum(item.product.shippingConfig.weight * item.quantity)
// Unit: pounds (lbs)
// Stored as: {value: number, unit: 'pound'} or number
```

**Dimensions Calculation:**

```typescript
packageDimensions = {
  length: max(item.product.shippingConfig.dimensions.length),
  width: max(item.product.shippingConfig.dimensions.width),
  height: max(item.product.shippingConfig.dimensions.height),
}
// Unit: inches
// Logic: Assume items ship in one box, use largest dimension per axis
```

**Edge Cases:**

- If product missing `shippingConfig.weight`: skip that product in sum, log warning
- If product missing `shippingConfig.dimensions`: skip that product in max, log warning
- If NO products have shipping data: use fallback (10×8×4, 1 lb) + log error
- If product `shippingConfig.requiresShipping === false`: exclude from calculations

### 3. Schema Visibility Rule 👁️

**RULE:** Order weight and dimensions fields MUST be visible to operators.

**ENFORCEMENT:**

- Change `order.weight` field from `hidden: true` to `hidden: false`
- Change `order.dimensions` field from `hidden: true` to `hidden: false`
- Keep `readOnly: true` on both fields (prevent manual edits)
- Add description: "Auto-populated from product catalog during checkout"

**Rationale:** Ops need to see snapshotted shipping data to verify accuracy and diagnose fulfillment issues.

### 4. Validation Rule ✅

**RULE:** Orders with status 'paid' SHOULD have shipping data populated.

**ENFORCEMENT:**

- Add validation warning on `order.weight`: if undefined and status === 'paid', warn "Missing weight - fulfillment may use defaults"
- Add validation warning on `order.dimensions`: if undefined and status === 'paid', warn "Missing dimensions - fulfillment may use defaults"
- Warnings (not errors) allow historical orders without data to remain valid
- New orders should populate shipping data and avoid warnings

### 5. Fulfillment Enforcement Rule 🚫

**RULE:** Fulfillment function MUST reject orders without shipping data.

**ENFORCEMENT:**

- Remove hardcoded fallback values from `buildParcel()` function
- If `order.weight` is null/undefined, throw error: "Order missing weight snapshot - check product catalog"
- If `order.dimensions` is null/undefined, throw error: "Order missing dimensions snapshot - check product catalog"
- Return HTTP 400 with actionable message directing ops to verify product shipping configs

**Exception:** Legacy orders (created before this contract) may use fallbacks with logged warning

### 6. Scope 📦

**RULE:** Implementation affects webhook, fulfillment, and order schema only.

**IN SCOPE:**

- ✅ Webhook handler order creation logic
- ✅ Order schema field visibility and validation
- ✅ Fulfillment function parcel building and error handling
- ✅ Product shipping config resolution and aggregation

**OUT OF SCOPE:**

- ❌ Product schema changes (shipping config fields are correct)
- ❌ Stripe catalog sync (package_dimensions are correctly synced)
- ❌ EasyPost API integration (beyond input validation)
- ❌ Shipping rate calculation at checkout (separate concern)
- ❌ Multi-box shipments (future enhancement)

## Implementation Requirements

### Required Changes

#### 1. Webhook Handler - Snapshot Shipping Data

**File:** `fas-cms-fresh/src/pages/api/webhooks.ts`

**Location:** After cart line construction (line 369), before order creation (line 495)

**Required Logic:**

```typescript
// After cartLines construction (line 369)

// Resolve product shipping configs
type ProductShippingConfig = {
  weight?: number | null
  dimensions?: {
    length?: number | null
    width?: number | null
    height?: number | null
  } | null
  requiresShipping?: boolean | null
}

const productIds = cartLines
  .map((item) => item.metadata?.sanity_product_id || item.productId)
  .filter(Boolean)

const productShippingConfigs =
  productIds.length > 0
    ? await sanity.fetch<Record<string, ProductShippingConfig>>(
        `{
        ${productIds
          .map(
            (id) => `"${id}": *[_type == "product" && _id == "${id}"][0]{
          "weight": shippingConfig.weight,
          "dimensions": shippingConfig.dimensions,
          "requiresShipping": shippingConfig.requiresShipping
        }`,
          )
          .join(',\n')}
      }`,
      )
    : {}

// Calculate aggregate weight
let totalWeightLbs = 0
let hasShippingData = false

cartLines.forEach((item) => {
  const productId = item.metadata?.sanity_product_id || item.productId
  const config = productId ? productShippingConfigs[productId] : null

  if (config?.requiresShipping === false) return // Skip non-shipping items

  const weight = typeof config?.weight === 'number' ? config.weight : 0
  const quantity = typeof item.quantity === 'number' ? item.quantity : 1

  if (weight > 0) {
    totalWeightLbs += weight * quantity
    hasShippingData = true
  } else if (productId) {
    console.warn(`[webhook] Product ${productId} missing shipping weight`)
  }
})

// Calculate max dimensions
let maxLength = 0
let maxWidth = 0
let maxHeight = 0

cartLines.forEach((item) => {
  const productId = item.metadata?.sanity_product_id || item.productId
  const config = productId ? productShippingConfigs[productId] : null

  if (config?.requiresShipping === false) return // Skip non-shipping items

  const dims = config?.dimensions
  if (dims) {
    const length = typeof dims.length === 'number' ? dims.length : 0
    const width = typeof dims.width === 'number' ? dims.width : 0
    const height = typeof dims.height === 'number' ? dims.height : 0

    if (length > 0 && width > 0 && height > 0) {
      if (length > maxLength) maxLength = length
      if (width > maxWidth) maxWidth = width
      if (height > maxHeight) maxHeight = height
      hasShippingData = true
    }
  } else if (productId) {
    console.warn(`[webhook] Product ${productId} missing shipping dimensions`)
  }
})

// Build shipping snapshot for order
const orderShippingData: {
  weight?: {value: number; unit: string}
  dimensions?: {length: number; width: number; height: number}
} = {}

if (hasShippingData) {
  if (totalWeightLbs > 0) {
    orderShippingData.weight = {
      value: totalWeightLbs,
      unit: 'pound',
    }
  }

  if (maxLength > 0 && maxWidth > 0 && maxHeight > 0) {
    orderShippingData.dimensions = {
      length: maxLength,
      width: maxWidth,
      height: maxHeight,
    }
  }
} else {
  console.error(
    `[webhook] No shipping data found for order ${sessionDetails.id} - fulfillment will use defaults`,
  )
}

// Add to order payload (before line 495)
const orderPayload: SanityDocumentStub<OrderDocument> = {
  _type: 'order',
  // ... existing fields ...
  weight: orderShippingData.weight,
  dimensions: orderShippingData.dimensions,
  // ... rest of fields ...
}
```

**Validation:**

- Query constructs correct Sanity projection for `shippingConfig`
- Aggregation handles missing data gracefully (skips products, logs warnings)
- Fallback to empty object if NO products have shipping data (logged as error)
- Weight stored as `{value: number, unit: 'pound'}` per order schema
- Dimensions stored as `{length, width, height}` per order schema

#### 2. Order Schema - Visibility and Validation

**File:** `fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx`

**Location:** Lines 398-412 (weight and dimensions fields)

**Required Changes:**

```typescript
// Line 398-404: weight field
defineField({
  name: 'weight',
  title: 'Package Weight',
  type: 'shipmentWeight',
  group: 'fulfillment',
  readOnly: true,
  hidden: false, // Changed from true
  description: 'Auto-populated from product catalog during checkout',
  validation: (Rule) =>
    Rule.custom((value, context) => {
      const status = (context.document as any)?.status
      if (status === 'paid' && !value) {
        return 'Missing weight snapshot - fulfillment may use defaults'
      }
      return true
    }).warning()
}),

// Line 406-412: dimensions field
defineField({
  name: 'dimensions',
  title: 'Package Dimensions',
  type: 'packageDimensions',
  group: 'fulfillment',
  readOnly: true,
  hidden: false, // Changed from true
  description: 'Auto-populated from product catalog during checkout',
  validation: (Rule) =>
    Rule.custom((value, context) => {
      const status = (context.document as any)?.status
      if (status === 'paid' && !value) {
        return 'Missing dimensions snapshot - fulfillment may use defaults'
      }
      return true
    }).warning()
}),
```

**Validation:**

- Fields visible in Sanity Studio fulfillment group
- Read-only prevents manual edits
- Validation warns (not errors) when data missing on paid orders
- Description clarifies auto-population source

#### 3. Fulfillment Function - Enforce Shipping Data

**File:** `fas-sanity/netlify/functions/fulfillOrder.ts`

**Location:** Lines 63-76 (buildParcel function), 131-142 (order query)

**Required Changes:**

```typescript
// Lines 63-76: buildParcel function
function buildParcel(order: OrderDoc) {
  // Enforce shipping data presence
  const dimensions = resolveDimensions(
    order.packageDimensions ?? order.dimensions,
    null, // No fallback - require real data
  )
  const weight = resolveWeight(
    order.weight,
    null, // No fallback - require real data
  )

  // Validate required data exists
  if (!dimensions || dimensions.length <= 0 || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error('Order missing dimensions snapshot - check product catalog shipping config')
  }

  if (!weight || weight.ounces <= 0) {
    throw new Error('Order missing weight snapshot - check product catalog shipping config')
  }

  return {
    length: dimensions.length,
    width: dimensions.width,
    height: dimensions.height,
    weight: Number(weight.ounces.toFixed(2)),
  }
}

// Lines 148-196: Update resolveDimensions to reject null fallback
export function resolveDimensions(
  input: DimensionsInput,
  fallback: DimensionsInput,
): {
  length: number
  width: number
  height: number
} | null {
  const source = input ?? fallback

  // If no source data, return null instead of defaults
  if (!source) return null

  const unit = typeof source?.unit === 'string' ? source.unit.trim().toLowerCase() : 'inch'

  // ... existing parsing logic ...

  // If all dimensions invalid, return null instead of defaults
  if (length <= 0 && width <= 0 && height <= 0) return null

  // Apply minimum dimension enforcement ONLY if source data exists
  if (length <= 0) length = MIN_DIMENSION_INCHES
  if (width <= 0) width = MIN_DIMENSION_INCHES
  if (height <= 0) height = MIN_DIMENSION_INCHES

  return {
    length: Number(length.toFixed(2)),
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
  }
}

// Similar update for resolveWeight (lines 73-146)
export function resolveWeight(
  input: WeightInput,
  fallback: WeightInput,
): {ounces: number; pounds: number} | null {
  const source = input ?? fallback

  // If no source data, return null instead of defaults
  if (!source) return null

  // ... existing parsing logic ...

  // If weight invalid, return null instead of defaults
  if (!Number.isFinite(ounces) || ounces <= 0) return null

  const pounds = ounces / 16
  return {
    ounces: Number(ounces.toFixed(2)),
    pounds: Number(pounds.toFixed(2)),
  }
}
```

**Validation:**

- Remove hardcoded fallback defaults
- Return null when input/fallback are both null
- Throw explicit error in `buildParcel()` when data missing
- Error message directs ops to product catalog
- HTTP 500 response includes actionable error message

**Exception for Legacy Orders:**

```typescript
// In handler function (lines 95-292)
const order = await sanityClient.fetch<OrderDoc | null>(...)

// Check if order has shipping data
const hasShippingData = Boolean(
  (order.weight || order.packageDimensions || order.dimensions)
)

if (!hasShippingData) {
  const createdAt = order.createdAt ? new Date(order.createdAt) : null
  const contractDate = new Date('2025-12-29')
  const isLegacy = createdAt && createdAt < contractDate

  if (isLegacy) {
    console.warn(`[fulfillOrder] Legacy order ${order._id} missing shipping data - using fallback`)
    // Allow legacy orders to use fallbacks in buildParcel
  } else {
    // New orders must have shipping data
    return {
      statusCode: 400,
      headers: {...cors, 'Content-Type': 'application/json'},
      body: JSON.stringify({
        error: 'Order missing shipping data snapshot. Check product catalog shipping configuration.'
      })
    }
  }
}
```

### Data Migration

**No migration required.**

**Rationale:**

- Existing orders without shipping data are considered legacy
- Legacy orders can continue to use fallback values (with logged warning)
- New orders created after contract acceptance will have shipping data
- No need to backfill historical orders

**Future Cleanup (Optional):**

- Script to backfill shipping data on historical paid orders
- Would require resolving original cart items and product configs
- Not required for contract enforcement

## Verification Checklist

Before marking implementation complete, verify:

- [ ] Webhook handler queries product shipping configs after cart construction
- [ ] Weight calculation sums `product.shippingConfig.weight * quantity`
- [ ] Dimensions calculation uses max length/width/height across products
- [ ] `order.weight` and `order.dimensions` written to order payload
- [ ] Order schema fields changed from `hidden: true` to `hidden: false`
- [ ] Order schema fields remain `readOnly: true`
- [ ] Order schema validation warns when shipping data missing on paid orders
- [ ] Fulfillment function throws error when weight missing (not hardcoded fallback)
- [ ] Fulfillment function throws error when dimensions missing (not hardcoded fallback)
- [ ] Legacy orders (created before 2025-12-29) can use fallbacks with warning
- [ ] New test order has weight and dimensions visible in Sanity Studio
- [ ] New test order fulfillment uses actual product dimensions (not 10×8×4)
- [ ] Error messages direct ops to product catalog when shipping data missing

## Testing Strategy

### Unit Tests

**File:** `fas-cms-fresh/src/pages/api/webhooks.test.ts` (create if missing)

**Test Cases:**

1. Single product order with shipping config → weight and dimensions snapshotted
2. Multi-product order → weight summed, dimensions maxed
3. Product missing weight → skipped in calculation, warning logged
4. Product missing dimensions → skipped in calculation, warning logged
5. All products missing shipping config → empty snapshot, error logged
6. Product with `requiresShipping: false` → excluded from calculations

### Integration Tests

**Scenarios:**

1. Create Stripe checkout session → complete payment → verify order has shipping data
2. Fulfill order with shipping data → verify EasyPost receives correct parcel
3. Attempt to fulfill order without shipping data → verify HTTP 400 error
4. Fulfill legacy order (pre-contract) → verify fallback used with warning
5. View order in Sanity Studio → verify weight/dimensions visible in fulfillment group

### Manual Verification

**Steps:**

1. Create product with shipping config: 5 lbs, 12×10×6 inches
2. Complete Stripe checkout for 2 units
3. Verify order document:
   - `weight: {value: 10, unit: 'pound'}`
   - `dimensions: {length: 12, width: 10, height: 6}`
4. Click "Fulfill Order" action in Sanity Studio
5. Verify EasyPost shipment created with 10 lbs, 12×10×6 inches (not defaults)
6. Verify shipping label reflects correct package size

## Rollback Plan

If issues arise:

1. **Immediate:** Revert webhook handler changes (remove shipping snapshot logic)
2. **Fallback:** Fulfillment function reverts to hardcoded defaults
3. **Schema:** Validation rules can remain (warnings only, non-breaking)
4. **Data:** No data migration required, rollback is clean
5. **Investigate:** Review webhook logs for product resolution errors
6. **Fix:** Address root cause in product shipping config resolution logic
7. **Redeploy:** Retry implementation with corrected logic

## Success Metrics

Implementation is successful when:

1. **100% shipping data capture:** All new orders have `weight` and `dimensions` populated
2. **Zero default fallbacks:** No fulfillments use 10×8×4, 1 lb after contract date
3. **Accurate EasyPost rates:** Shipping rates match actual product specifications
4. **Visible to ops:** Weight and dimensions visible in Sanity Studio fulfillment group
5. **Zero fulfillment failures:** No HTTP 400 errors for orders with proper product configs

## References

- **Diagnosis Report:** [docs/reports/claude-fulfillment-mapping-diagnosis.md](../reports/claude-fulfillment-mapping-diagnosis.md)
- **Order Schema:** [packages/sanity-config/src/schemaTypes/documents/order.tsx](../../packages/sanity-config/src/schemaTypes/documents/order.tsx)
- **Product Schema:** [packages/sanity-config/src/schemaTypes/documents/product.ts](../../packages/sanity-config/src/schemaTypes/documents/product.ts)
- **Webhook Handler:** [fas-cms-fresh/src/pages/api/webhooks.ts](../../../fas-cms-fresh/src/pages/api/webhooks.ts)
- **Fulfillment Function:** [netlify/functions/fulfillOrder.ts](../../netlify/functions/fulfillOrder.ts)
- **EasyPost Client:** [netlify/lib/easypostClient.ts](../../netlify/lib/easypostClient.ts)

## Approval

SCHEMA CHANGE APPROVED

This contract is ACCEPTED and ready for Codex enforcement.

Approved By: ambermin
Date: 2025-12-29
Status: ACTIVE

---

**Codex may proceed with implementation. Non-compliance is a defect.**
