# Translation Layer Specification

**Purpose**: Define type-safe, null-safe utility functions for bidirectional data transformation between Sanity.io CMS and Medusa.js 2.x e-commerce backend.

**Zero-Null Guarantee**: Every utility function in this specification is designed to prevent null propagation through fallback values, validation, and explicit error handling.

---

## Table of Contents

1. [Type Definitions](#type-definitions)
2. [Unit Conversion Utilities](#unit-conversion-utilities)
3. [Canonicalization Utilities](#canonicalization-utilities)
4. [Status Derivation Functions](#status-derivation-functions)
5. [Metadata Extraction Functions](#metadata-extraction-functions)
6. [Validation & Type Guards](#validation--type-guards)
7. [Transform Utilities](#transform-utilities)
8. [Error Handling Specifications](#error-handling-specifications)
9. [Integration Patterns](#integration-patterns)
10. [Usage Examples](#usage-examples)

---

## Type Definitions

### Core Types

```typescript
// Price representation
type CentsPrice = number; // Integer, always in cents (USD minor units)
type DollarsPrice = number; // Decimal, always in dollars (USD major units)

// Weight representation
type GramsWeight = number; // Integer, always in grams
type PoundsWeight = number; // Decimal, always in pounds

// Distance representation
type CentimetersDistance = number; // Decimal, always in centimeters
type InchesDistance = number; // Decimal, always in inches

// Order number formats
type MedusaOrderId = string; // UUID format: "order_01XXXXX"
type MedusaDisplayId = number; // Numeric: 10001, 10002, etc.
type CanonicalOrderNumber = string; // FAS-######: "FAS-010001"
const ORDER_NUMBER_PATTERN = /^FAS-\d{6}$/;

// SKU formats
type CanonicalSKU = string; // XX-XXXX-XXX: "RA-3456-BLK"
const SKU_PATTERN = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z]{3}$/;

// Sanity ID handling
type SanityDocumentId = string; // Raw: "abc123" or "drafts.abc123"
type NormalizedSanityId = string; // Normalized: "abc123" (no "drafts." prefix)
```

### Address Types

```typescript
interface MedusaAddress {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  phone?: string | null;
}

interface SanityAddress {
  fullName?: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}
```

### Status Types

```typescript
type MedusaOrderStatus = "pending" | "completed" | "archived" | "canceled";
type MedusaPaymentStatus = "not_paid" | "awaiting" | "captured" | "canceled" | "refunded" | "partially_refunded";
type MedusaFulfillmentStatus = "not_fulfilled" | "partially_fulfilled" | "fulfilled" | "partially_shipped" | "shipped" | "partially_returned" | "returned" | "canceled" | "requires_action";

type SanityOrderStatus = "pending" | "processing" | "paid" | "shipped" | "delivered" | "cancelled";
type SanityPaymentStatus = "unpaid" | "paid" | "refunded" | "cancelled";
```

### Metadata Types

```typescript
interface ShippingMetadata {
  shipping_weight?: number; // In pounds
  shipping_dimensions?: {
    length?: number; // In inches
    width?: number;
    height?: number;
  };
}

interface ShipmentSnapshot {
  weight: {
    value: number; // Total weight
    unit: "lb" | "oz" | "kg" | "g";
  };
  dimensions: {
    length: number;
    width: number;
    height: number;
    unit: "in" | "cm";
  };
}
```

---

## Unit Conversion Utilities

### Price Conversions

#### `toDollars`

**Purpose**: Convert Medusa cents (integer) to Sanity dollars (decimal).

**Signature**:
```typescript
function toDollars(cents: CentsPrice | null | undefined): DollarsPrice;
```

**Implementation**:
```typescript
function toDollars(cents: CentsPrice | null | undefined): DollarsPrice {
  if (cents == null || !Number.isFinite(cents)) return 0.0;
  return cents / 100;
}
```

**Null Safety**: Returns `0.0` for null/undefined/non-finite inputs.

**Examples**:
```typescript
toDollars(4999)     // => 49.99
toDollars(0)        // => 0.0
toDollars(null)     // => 0.0
toDollars(undefined) // => 0.0
toDollars(NaN)      // => 0.0
```

---

#### `toCents`

**Purpose**: Convert Sanity dollars (decimal) to Medusa cents (integer).

**Signature**:
```typescript
function toCents(dollars: DollarsPrice | null | undefined): CentsPrice;
```

**Implementation**:
```typescript
function toCents(dollars: DollarsPrice | null | undefined): CentsPrice {
  if (dollars == null || !Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}
```

**Null Safety**: Returns `0` for null/undefined/non-finite inputs.

**Examples**:
```typescript
toCents(49.99)      // => 4999
toCents(49.995)     // => 5000 (rounds)
toCents(0)          // => 0
toCents(null)       // => 0
toCents(undefined)  // => 0
```

---

### Weight Conversions

#### `toGrams`

**Purpose**: Convert Sanity pounds (decimal) to Medusa grams (integer).

**Signature**:
```typescript
function toGrams(pounds: PoundsWeight | null | undefined): GramsWeight;
```

**Implementation**:
```typescript
const GRAMS_PER_POUND = 453.592;

function toGrams(pounds: PoundsWeight | null | undefined): GramsWeight {
  if (pounds == null || !Number.isFinite(pounds)) return 0;
  return Math.round(pounds * GRAMS_PER_POUND);
}
```

**Null Safety**: Returns `0` for null/undefined/non-finite inputs.

**Examples**:
```typescript
toGrams(5.5)        // => 2495 (5.5 * 453.592 rounded)
toGrams(1.0)        // => 454
toGrams(0)          // => 0
toGrams(null)       // => 0
```

---

#### `toPounds`

**Purpose**: Convert Medusa grams (integer) to Sanity pounds (decimal).

**Signature**:
```typescript
function toPounds(grams: GramsWeight | null | undefined): PoundsWeight;
```

**Implementation**:
```typescript
const GRAMS_PER_POUND = 453.592;

function toPounds(grams: GramsWeight | null | undefined): PoundsWeight {
  if (grams == null || !Number.isFinite(grams)) return 0.0;
  return grams / GRAMS_PER_POUND;
}
```

**Null Safety**: Returns `0.0` for null/undefined/non-finite inputs.

**Examples**:
```typescript
toPounds(2495)      // => 5.5
toPounds(454)       // => 1.0009
toPounds(0)         // => 0.0
toPounds(null)      // => 0.0
```

---

### Dimension Conversions

#### `toCentimeters`

**Purpose**: Convert Sanity inches (decimal) to Medusa centimeters (decimal).

**Signature**:
```typescript
function toCentimeters(inches: InchesDistance | null | undefined): CentimetersDistance;
```

**Implementation**:
```typescript
const CM_PER_INCH = 2.54;

function toCentimeters(inches: InchesDistance | null | undefined): CentimetersDistance {
  if (inches == null || !Number.isFinite(inches)) return 0.0;
  return inches * CM_PER_INCH;
}
```

**Null Safety**: Returns `0.0` for null/undefined/non-finite inputs.

**Examples**:
```typescript
toCentimeters(12)   // => 30.48
toCentimeters(1)    // => 2.54
toCentimeters(0)    // => 0.0
toCentimeters(null) // => 0.0
```

---

#### `toInches`

**Purpose**: Convert Medusa centimeters (decimal) to Sanity inches (decimal).

**Signature**:
```typescript
function toInches(centimeters: CentimetersDistance | null | undefined): InchesDistance;
```

**Implementation**:
```typescript
const CM_PER_INCH = 2.54;

function toInches(centimeters: CentimetersDistance | null | undefined): InchesDistance {
  if (centimeters == null || !Number.isFinite(centimeters)) return 0.0;
  return centimeters / CM_PER_INCH;
}
```

**Null Safety**: Returns `0.0` for null/undefined/non-finite inputs.

**Examples**:
```typescript
toInches(30.48)     // => 12.0
toInches(2.54)      // => 1.0
toInches(0)         // => 0.0
toInches(null)      // => 0.0
```

---

## Canonicalization Utilities

### Order Number Canonicalization

#### `toCanonicalOrderNumber`

**Purpose**: Convert any order identifier (Medusa display_id, existing FAS number, raw numeric string) to canonical `FAS-######` format.

**Signature**:
```typescript
function toCanonicalOrderNumber(...values: Array<unknown>): CanonicalOrderNumber | undefined;
```

**Implementation**:
```typescript
const ORDER_NUMBER_PATTERN = /^FAS-\d{6}$/;

function toCanonicalOrderNumber(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (value == null) continue;

    const raw = String(value).trim().toUpperCase();

    // If already in canonical format, return as-is
    if (ORDER_NUMBER_PATTERN.test(raw)) {
      return raw;
    }

    // Extract digits and format
    const digits = raw.replace(/\D/g, '');
    if (digits) {
      return `FAS-${digits.slice(-6).padStart(6, '0')}`;
    }
  }
  return undefined;
}
```

**Null Safety**: Accepts multiple fallback values, returns `undefined` only if all inputs are non-numeric.

**Examples**:
```typescript
toCanonicalOrderNumber(10001)              // => "FAS-010001"
toCanonicalOrderNumber("FAS-010001")       // => "FAS-010001"
toCanonicalOrderNumber("10001")            // => "FAS-010001"
toCanonicalOrderNumber("fas-10001")        // => "FAS-010001"
toCanonicalOrderNumber("Order #10001")     // => "FAS-010001"
toCanonicalOrderNumber(null, 10002)        // => "FAS-010002" (fallback)
toCanonicalOrderNumber("abc")              // => undefined
```

---

### SKU Validation

#### `toCanonicalSKU`

**Purpose**: Validate and normalize SKU to canonical `XX-XXXX-XXX` format.

**Signature**:
```typescript
function toCanonicalSKU(sku: string | null | undefined): CanonicalSKU | undefined;
```

**Implementation**:
```typescript
const SKU_PATTERN = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z]{3}$/;

function toCanonicalSKU(sku: string | null | undefined): string | undefined {
  if (!sku) return undefined;

  const normalized = sku.trim().toUpperCase();

  if (SKU_PATTERN.test(normalized)) {
    return normalized;
  }

  return undefined;
}
```

**Null Safety**: Returns `undefined` for invalid/null SKUs.

**Examples**:
```typescript
toCanonicalSKU("ra-3456-blk")     // => "RA-3456-BLK"
toCanonicalSKU("RA-3456-BLK")     // => "RA-3456-BLK"
toCanonicalSKU("  ra-3456-blk  ") // => "RA-3456-BLK"
toCanonicalSKU("invalid")         // => undefined
toCanonicalSKU(null)              // => undefined
```

---

### Sanity ID Normalization

#### `normalizeId`

**Purpose**: Strip `drafts.` prefix from Sanity document IDs.

**Signature**:
```typescript
function normalizeId(value: unknown): NormalizedSanityId | null;
```

**Implementation**:
```typescript
function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.replace(/^drafts\./, "");
}
```

**Null Safety**: Returns `null` for non-string or empty values.

**Examples**:
```typescript
normalizeId("drafts.abc123")  // => "abc123"
normalizeId("abc123")         // => "abc123"
normalizeId("  abc123  ")     // => "abc123"
normalizeId(null)             // => null
normalizeId(123)              // => null
```

---

## Status Derivation Functions

### Order Status Derivation

#### `deriveOrderStatus`

**Purpose**: Map Medusa order/payment/fulfillment statuses to single Sanity order status using priority rules.

**Signature**:
```typescript
function deriveOrderStatus(input: {
  orderStatus?: MedusaOrderStatus | null;
  paymentStatus?: MedusaPaymentStatus | null;
  fulfillmentStatus?: MedusaFulfillmentStatus | null;
}): SanityOrderStatus;
```

**Implementation**:
```typescript
function deriveOrderStatus(input: {
  orderStatus?: MedusaOrderStatus | null;
  paymentStatus?: MedusaPaymentStatus | null;
  fulfillmentStatus?: MedusaFulfillmentStatus | null;
}): SanityOrderStatus {
  const { orderStatus, paymentStatus, fulfillmentStatus } = input;

  // Priority 1: Order canceled
  if (orderStatus === "canceled") {
    return "cancelled";
  }

  // Priority 2: Fulfillment indicates shipped/delivered
  if (fulfillmentStatus === "shipped" || fulfillmentStatus === "partially_shipped") {
    return "shipped";
  }
  if (fulfillmentStatus === "fulfilled") {
    return "delivered";
  }

  // Priority 3: Payment captured = paid
  if (paymentStatus === "captured") {
    return "paid";
  }

  // Priority 4: Payment pending or order completed = processing
  if (paymentStatus === "awaiting" || orderStatus === "completed") {
    return "processing";
  }

  // Default: pending
  return "pending";
}
```

**Null Safety**: Always returns a valid `SanityOrderStatus`, defaults to `"pending"`.

**Examples**:
```typescript
deriveOrderStatus({
  orderStatus: "completed",
  paymentStatus: "captured",
  fulfillmentStatus: "shipped"
}) // => "shipped"

deriveOrderStatus({
  orderStatus: "canceled",
  paymentStatus: "captured",
  fulfillmentStatus: "not_fulfilled"
}) // => "cancelled"

deriveOrderStatus({
  orderStatus: "pending",
  paymentStatus: "captured",
  fulfillmentStatus: "not_fulfilled"
}) // => "paid"

deriveOrderStatus({}) // => "pending"
```

---

### Payment Status Mapping

#### `derivePaymentStatus`

**Purpose**: Map Medusa payment status enums to Sanity payment status enums.

**Signature**:
```typescript
function derivePaymentStatus(medusaStatus: MedusaPaymentStatus | null | undefined): SanityPaymentStatus;
```

**Implementation**:
```typescript
function derivePaymentStatus(medusaStatus: MedusaPaymentStatus | null | undefined): SanityPaymentStatus {
  switch (medusaStatus) {
    case "captured":
      return "paid";

    case "refunded":
    case "partially_refunded":
      return "refunded";

    case "canceled":
      return "cancelled";

    case "not_paid":
    case "awaiting":
    default:
      return "unpaid";
  }
}
```

**Null Safety**: Always returns a valid `SanityPaymentStatus`, defaults to `"unpaid"`.

**Examples**:
```typescript
derivePaymentStatus("captured")           // => "paid"
derivePaymentStatus("refunded")           // => "refunded"
derivePaymentStatus("canceled")           // => "cancelled"
derivePaymentStatus("not_paid")           // => "unpaid"
derivePaymentStatus(null)                 // => "unpaid"
```

---

## Metadata Extraction Functions

### Shipping Metadata Extraction

#### `extractShippingMetadata`

**Purpose**: Extract weight and dimensions from Medusa variant or item metadata with unit conversion.

**Signature**:
```typescript
function extractShippingMetadata(source: {
  variant?: {
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    metadata?: ShippingMetadata | null;
  } | null;
  metadata?: ShippingMetadata | null;
}): {
  weight: PoundsWeight;
  dimensions: {
    length: InchesDistance;
    width: InchesDistance;
    height: InchesDistance;
  };
};
```

**Implementation**:
```typescript
function extractShippingMetadata(source: {
  variant?: {
    weight?: number | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    metadata?: ShippingMetadata | null;
  } | null;
  metadata?: ShippingMetadata | null;
}): {
  weight: PoundsWeight;
  dimensions: {
    length: InchesDistance;
    width: InchesDistance;
    height: InchesDistance;
  };
} {
  const variant = source.variant;
  const metadata = variant?.metadata || source.metadata;

  // Weight: variant.weight (grams) > metadata.shipping_weight (pounds)
  let weightLbs = 0.0;
  if (variant?.weight != null && Number.isFinite(variant.weight)) {
    weightLbs = toPounds(variant.weight);
  } else if (metadata?.shipping_weight != null && Number.isFinite(metadata.shipping_weight)) {
    weightLbs = metadata.shipping_weight;
  }

  // Dimensions: variant fields (cm) > metadata fields (inches)
  let lengthIn = 0.0;
  let widthIn = 0.0;
  let heightIn = 0.0;

  if (variant?.length != null && Number.isFinite(variant.length)) {
    lengthIn = toInches(variant.length);
  } else if (metadata?.shipping_dimensions?.length != null) {
    lengthIn = metadata.shipping_dimensions.length;
  }

  if (variant?.width != null && Number.isFinite(variant.width)) {
    widthIn = toInches(variant.width);
  } else if (metadata?.shipping_dimensions?.width != null) {
    widthIn = metadata.shipping_dimensions.width;
  }

  if (variant?.height != null && Number.isFinite(variant.height)) {
    heightIn = toInches(variant.height);
  } else if (metadata?.shipping_dimensions?.height != null) {
    heightIn = metadata.shipping_dimensions.height;
  }

  return {
    weight: weightLbs,
    dimensions: {
      length: lengthIn,
      width: widthIn,
      height: heightIn,
    },
  };
}
```

**Null Safety**: Returns zero values for missing data, never returns null.

**Priority Fallback Chain**:
1. Weight: `variant.weight` (grams) → `metadata.shipping_weight` (pounds) → `0.0`
2. Dimensions: `variant.length/width/height` (cm) → `metadata.shipping_dimensions.*` (inches) → `0.0`

**Examples**:
```typescript
extractShippingMetadata({
  variant: {
    weight: 2495, // grams
    length: 30.48, // cm
    width: 20.32,
    height: 10.16,
  }
})
// => { weight: 5.5, dimensions: { length: 12, width: 8, height: 4 } }

extractShippingMetadata({
  metadata: {
    shipping_weight: 5.5,
    shipping_dimensions: { length: 12, width: 8, height: 4 }
  }
})
// => { weight: 5.5, dimensions: { length: 12, width: 8, height: 4 } }

extractShippingMetadata({})
// => { weight: 0, dimensions: { length: 0, width: 0, height: 0 } }
```

---

## Validation & Type Guards

### Non-Empty String Validator

#### `asNonEmpty`

**Purpose**: Validate that a string is non-null, non-empty after trimming. Throws if invalid.

**Signature**:
```typescript
function asNonEmpty(name: string, value: string | undefined): string;
```

**Implementation**:
```typescript
function asNonEmpty(name: string, value: string | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    throw new Error(`${name} is required but was empty or null`);
  }
  return trimmed;
}
```

**Error Handling**: Throws descriptive error with field name.

**Examples**:
```typescript
asNonEmpty("SANITY_PROJECT_ID", "abc123")  // => "abc123"
asNonEmpty("SANITY_PROJECT_ID", "  abc  ") // => "abc"
asNonEmpty("SANITY_PROJECT_ID", "")        // => throws Error
asNonEmpty("SANITY_PROJECT_ID", null)      // => throws Error
```

---

### Array Normalizer

#### `asArray`

**Purpose**: Normalize any value to an array (handles null, single values, existing arrays).

**Signature**:
```typescript
function asArray<T>(value: T | T[] | null | undefined): T[];
```

**Implementation**:
```typescript
function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
```

**Null Safety**: Always returns an array, never null.

**Examples**:
```typescript
asArray(null)           // => []
asArray(undefined)      // => []
asArray("abc")          // => ["abc"]
asArray(["a", "b"])     // => ["a", "b"]
asArray(0)              // => [] (falsy)
asArray(false)          // => [] (falsy)
```

---

### Boolean Parser

#### `parseBoolean`

**Purpose**: Parse string to boolean (case-insensitive "true" check).

**Signature**:
```typescript
function parseBoolean(value: string | undefined): boolean;
```

**Implementation**:
```typescript
function parseBoolean(value: string | undefined): boolean {
  return (value || "").trim().toLowerCase() === "true";
}
```

**Null Safety**: Returns `false` for null/undefined/non-"true" values.

**Examples**:
```typescript
parseBoolean("true")    // => true
parseBoolean("TRUE")    // => true
parseBoolean("false")   // => false
parseBoolean("")        // => false
parseBoolean(null)      // => false
```

---

## Transform Utilities

### Shipment Snapshot Computation

#### `computeShipmentSnapshot`

**Purpose**: Aggregate total weight and max dimensions from cart items for Shippo rate calculation.

**Signature**:
```typescript
function computeShipmentSnapshot(
  items: Array<{
    quantity: number;
    variant?: {
      weight?: number | null;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      metadata?: ShippingMetadata | null;
    } | null;
    metadata?: ShippingMetadata | null;
  }>,
  weightUnit: "lb" | "oz" | "kg" | "g" = "lb",
  dimensionUnit: "in" | "cm" = "in"
): ShipmentSnapshot;
```

**Implementation**:
```typescript
function computeShipmentSnapshot(
  items: Array<{
    quantity: number;
    variant?: {
      weight?: number | null;
      length?: number | null;
      width?: number | null;
      height?: number | null;
      metadata?: ShippingMetadata | null;
    } | null;
    metadata?: ShippingMetadata | null;
  }>,
  weightUnit: "lb" | "oz" | "kg" | "g" = "lb",
  dimensionUnit: "in" | "cm" = "in"
): ShipmentSnapshot {
  let totalWeight = 0.0;
  let maxLength = 0.0;
  let maxWidth = 0.0;
  let maxHeight = 0.0;

  for (const item of items) {
    const qty = item.quantity || 1;
    const shipping = extractShippingMetadata(item);

    // Accumulate weight
    totalWeight += shipping.weight * qty;

    // Track max dimensions (assumes items may stack/combine)
    maxLength = Math.max(maxLength, shipping.dimensions.length);
    maxWidth = Math.max(maxWidth, shipping.dimensions.width);
    maxHeight = Math.max(maxHeight, shipping.dimensions.height);
  }

  // Convert to requested units
  let finalWeight = totalWeight;
  if (weightUnit === "oz") finalWeight *= 16;
  if (weightUnit === "kg") finalWeight *= 0.453592;
  if (weightUnit === "g") finalWeight *= 453.592;

  let finalLength = maxLength;
  let finalWidth = maxWidth;
  let finalHeight = maxHeight;
  if (dimensionUnit === "cm") {
    finalLength *= 2.54;
    finalWidth *= 2.54;
    finalHeight *= 2.54;
  }

  return {
    weight: {
      value: finalWeight,
      unit: weightUnit,
    },
    dimensions: {
      length: finalLength,
      width: finalWidth,
      height: finalHeight,
      unit: dimensionUnit,
    },
  };
}
```

**Null Safety**: Uses `extractShippingMetadata` which returns zero for missing data.

**Examples**:
```typescript
computeShipmentSnapshot([
  {
    quantity: 2,
    variant: { weight: 2495, length: 30.48, width: 20.32, height: 10.16 }
  },
  {
    quantity: 1,
    variant: { weight: 1000, length: 15.24, width: 10.16, height: 5.08 }
  }
], "lb", "in")
// => {
//   weight: { value: 13.2, unit: "lb" }, // (5.5*2 + 2.2)
//   dimensions: { length: 12, width: 8, height: 4, unit: "in" } // max of each
// }
```

---

### Address Formatting

#### `formatAddress`

**Purpose**: Convert Medusa address to Sanity address structure.

**Signature**:
```typescript
function formatAddress(medusaAddress: MedusaAddress | null | undefined): SanityAddress | undefined;
```

**Implementation**:
```typescript
function formatAddress(medusaAddress: MedusaAddress | null | undefined): SanityAddress | undefined {
  if (!medusaAddress) return undefined;

  const {
    first_name,
    last_name,
    company,
    address_1,
    address_2,
    city,
    province,
    postal_code,
    country_code,
    phone,
  } = medusaAddress;

  // Required fields: street1, city, state, zip, country
  if (!address_1 || !city || !province || !postal_code || !country_code) {
    return undefined;
  }

  const fullName = [first_name, last_name].filter(Boolean).join(" ").trim() || undefined;

  return {
    fullName,
    company: company || undefined,
    street1: address_1,
    street2: address_2 || undefined,
    city,
    state: province,
    zip: postal_code,
    country: country_code.toUpperCase(),
    phone: phone || undefined,
  };
}
```

**Null Safety**: Returns `undefined` if required fields are missing.

**Examples**:
```typescript
formatAddress({
  first_name: "John",
  last_name: "Doe",
  address_1: "123 Main St",
  city: "Austin",
  province: "TX",
  postal_code: "78701",
  country_code: "us",
})
// => {
//   fullName: "John Doe",
//   street1: "123 Main St",
//   city: "Austin",
//   state: "TX",
//   zip: "78701",
//   country: "US"
// }

formatAddress(null) // => undefined
formatAddress({ address_1: "123 Main" }) // => undefined (missing required fields)
```

---

## Error Handling Specifications

### Error Types

```typescript
class TranslationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TranslationError";
  }
}

class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    public readonly constraint: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
```

### Error Handling Patterns

#### Pattern 1: Silent Fallback (Conversions)

**Use Case**: Unit conversions, status derivation where zero/default is acceptable.

**Implementation**:
```typescript
function toDollars(cents: CentsPrice | null | undefined): DollarsPrice {
  if (cents == null || !Number.isFinite(cents)) {
    // Log warning but return safe default
    console.warn(`[Translation] Invalid cents value: ${cents}, defaulting to 0`);
    return 0.0;
  }
  return cents / 100;
}
```

---

#### Pattern 2: Throw on Critical Failure (Validation)

**Use Case**: Required configuration, critical business logic.

**Implementation**:
```typescript
function asNonEmpty(name: string, value: string | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    throw new ValidationError(
      `${name} is required but was empty`,
      name,
      value,
      "non-empty"
    );
  }
  return trimmed;
}
```

---

#### Pattern 3: Return Undefined (Optional Fields)

**Use Case**: Optional metadata, nullable references.

**Implementation**:
```typescript
function toCanonicalOrderNumber(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    // Try each fallback
    const result = attemptConversion(value);
    if (result) return result;
  }
  // No valid value found
  return undefined;
}
```

---

#### Pattern 4: Collect Errors (Batch Operations)

**Use Case**: Syncing multiple products, validating cart items.

**Implementation**:
```typescript
function validateCartItems(items: unknown[]): {
  valid: ValidatedItem[];
  errors: TranslationError[];
} {
  const valid: ValidatedItem[] = [];
  const errors: TranslationError[] = [];

  for (const item of items) {
    try {
      const validated = validateItem(item);
      valid.push(validated);
    } catch (error) {
      if (error instanceof TranslationError) {
        errors.push(error);
      } else {
        errors.push(new TranslationError(
          String(error),
          "item",
          item,
          { originalError: error }
        ));
      }
    }
  }

  return { valid, errors };
}
```

---

## Integration Patterns

### Pattern 1: Webhook Handler Integration

**Location**: `/fas-medusa/src/api/webhooks/sanity-product-sync/route.ts`

**Usage**: Product sync from Sanity → Medusa

**Integration Points**:
```typescript
// 1. ID normalization
const productIds = collectProductIds(payload);
const normalizedIds = productIds.map(normalizeId).filter(Boolean);

// 2. Validation
const config = {
  sanityConfig: {
    projectId: asNonEmpty("SANITY_PROJECT_ID", process.env.SANITY_PROJECT_ID),
    dataset: asNonEmpty("SANITY_DATASET", process.env.SANITY_DATASET),
    apiToken: asNonEmpty("SANITY_API_TOKEN", process.env.SANITY_API_TOKEN),
  },
  medusaConfig: {
    salesChannelId: asNonEmpty("SANITY_SYNC_SALES_CHANNEL_ID", process.env.SANITY_SYNC_SALES_CHANNEL_ID),
    shippingProfileId: asNonEmpty("SANITY_SYNC_SHIPPING_PROFILE_ID", process.env.SANITY_SYNC_SHIPPING_PROFILE_ID),
  },
};

// 3. Workflow invocation
await syncSingleProductWorkflow(scope).run({
  input: {
    sanityProductId: normalizedId,
    sanityConfig: config.sanityConfig,
    medusaConfig: config.medusaConfig,
  },
});
```

---

### Pattern 2: Workflow Step Integration

**Location**: `/fas-medusa/src/workflows/sync-single-product.ts`

**Usage**: Multi-step product transformation

**Integration Points**:
```typescript
// Step 3: Transform product data
const transformProductDataStep = createStep("transform-product-data", async (input) => {
  const { product, config } = input;

  // Unit conversions
  const priceCents = toCents(product.price);
  const weightGrams = toGrams(product.weight);
  const lengthCm = toCentimeters(product.dimensions?.length);
  const widthCm = toCentimeters(product.dimensions?.width);
  const heightCm = toCentimeters(product.dimensions?.height);

  // SKU validation
  const sku = toCanonicalSKU(product.sku);
  if (!sku) {
    throw new ValidationError("Invalid SKU format", "sku", product.sku, "XX-XXXX-XXX");
  }

  return {
    title: product.title,
    sku,
    prices: [{ amount: priceCents, currency_code: config.currencyCode }],
    weight: weightGrams,
    length: lengthCm,
    width: widthCm,
    height: heightCm,
  };
});
```

---

### Pattern 3: API Endpoint Integration

**Location**: `/fas-cms-fresh/src/pages/api/complete-order.ts`

**Usage**: Order completion and Sanity mirroring

**Integration Points**:
```typescript
// Order number canonicalization
const orderNumber = toCanonicalOrderNumber(
  medusaOrder.display_id,
  medusaOrder.metadata?.order_number,
  medusaOrder.id
);

// Status derivation
const status = deriveOrderStatus({
  orderStatus: medusaOrder.status,
  paymentStatus: medusaOrder.payment_status,
  fulfillmentStatus: medusaOrder.fulfillment_status,
});

const paymentStatus = derivePaymentStatus(medusaOrder.payment_status);

// Shipment snapshot computation
const shipmentSnapshot = computeShipmentSnapshot(
  medusaOrder.items,
  "lb", // Sanity weight unit
  "in"  // Sanity dimension unit
);

// Address formatting
const shippingAddress = formatAddress(medusaOrder.shipping_address);
const billingAddress = formatAddress(medusaOrder.billing_address);

// Cart item transformation
const cartItems = medusaOrder.items.map(item => {
  const shipping = extractShippingMetadata({ variant: item.variant, metadata: item.metadata });

  return {
    title: item.title,
    sku: toCanonicalSKU(item.variant?.sku),
    quantity: item.quantity,
    unitPrice: toDollars(item.unit_price),
    totalPrice: toDollars(item.total),
    weight: shipping.weight,
    dimensions: shipping.dimensions,
  };
});
```

---

### Pattern 4: Background Job Integration

**Location**: `/fas-medusa/src/jobs/webhook-auto-sync.ts` (hypothetical)

**Usage**: Periodic reconciliation

**Integration Points**:
```typescript
async function reconcileProducts(sanityClient, medusaClient) {
  const sanityProducts = await sanityClient.fetch(`*[_type == "product"]`);
  const errors: TranslationError[] = [];

  for (const product of sanityProducts) {
    try {
      const normalizedId = normalizeId(product._id);
      if (!normalizedId) continue;

      const sku = toCanonicalSKU(product.sku);
      if (!sku) {
        errors.push(new ValidationError("Invalid SKU", "sku", product.sku, "XX-XXXX-XXX"));
        continue;
      }

      // Sync to Medusa
      await syncProduct(normalizedId);
    } catch (error) {
      errors.push(new TranslationError(
        `Failed to sync product ${product._id}`,
        "product",
        product,
        { error }
      ));
    }
  }

  return { synced: sanityProducts.length - errors.length, errors };
}
```

---

## Usage Examples

### Example 1: Complete Product Sync Pipeline

```typescript
import { createClient } from "@sanity/client";

async function syncProductFromSanityToMedusa(sanityProductId: string) {
  const sanityClient = createClient({
    projectId: asNonEmpty("SANITY_PROJECT_ID", process.env.SANITY_PROJECT_ID),
    dataset: asNonEmpty("SANITY_DATASET", process.env.SANITY_DATASET),
    apiVersion: "2024-01-01",
    token: asNonEmpty("SANITY_API_TOKEN", process.env.SANITY_API_TOKEN),
  });

  // 1. Fetch from Sanity
  const normalizedId = normalizeId(sanityProductId);
  const product = await sanityClient.fetch(
    `*[_type == "product" && _id == $id][0]`,
    { id: normalizedId }
  );

  if (!product) {
    throw new Error(`Product not found: ${normalizedId}`);
  }

  // 2. Validate required fields
  const sku = toCanonicalSKU(product.sku);
  if (!sku) {
    throw new ValidationError("Invalid SKU format", "sku", product.sku, "XX-XXXX-XXX");
  }

  // 3. Transform data
  const medusaProduct = {
    title: product.title,
    description: product.description,
    handle: product.slug?.current,

    variants: [{
      title: product.variantTitle || "Default",
      sku,
      prices: [{
        amount: toCents(product.price),
        currency_code: "usd",
      }],

      // Physical properties
      weight: toGrams(product.weight),
      length: toCentimeters(product.dimensions?.length),
      width: toCentimeters(product.dimensions?.width),
      height: toCentimeters(product.dimensions?.height),

      // Inventory
      manage_inventory: true,
      inventory_quantity: product.inventory || 0,
    }],

    // Medusa config
    sales_channels: [{ id: process.env.SALES_CHANNEL_ID }],
  };

  // 4. Upsert to Medusa
  const medusaResult = await medusaClient.products.create(medusaProduct);

  // 5. Write medusaProductId back to Sanity
  await sanityClient
    .patch(normalizedId)
    .set({
      medusaProductId: medusaResult.product.id,
      medusaVariantId: medusaResult.product.variants[0].id,
    })
    .commit();

  return {
    sanityId: normalizedId,
    medusaProductId: medusaResult.product.id,
    medusaVariantId: medusaResult.product.variants[0].id,
  };
}
```

---

### Example 2: Complete Order Mirror Pipeline

```typescript
async function mirrorOrderToSanity(medusaOrder: any, paymentIntent: any) {
  const sanityClient = createClient({
    projectId: process.env.SANITY_PROJECT_ID!,
    dataset: process.env.SANITY_DATASET!,
    apiVersion: "2024-01-01",
    token: process.env.SANITY_API_TOKEN!,
  });

  // 1. Check for existing order
  const orderNumber = toCanonicalOrderNumber(
    medusaOrder.display_id,
    medusaOrder.metadata?.order_number
  );

  const existing = await sanityClient.fetch(
    `*[_type == "order" && medusaOrderId == $orderId][0]`,
    { orderId: medusaOrder.id }
  );

  if (existing) {
    return existing.orderNumber;
  }

  // 2. Derive statuses
  const status = deriveOrderStatus({
    orderStatus: medusaOrder.status,
    paymentStatus: medusaOrder.payment_status,
    fulfillmentStatus: medusaOrder.fulfillment_status,
  });

  const paymentStatus = derivePaymentStatus(medusaOrder.payment_status);

  // 3. Format addresses
  const shippingAddress = formatAddress(medusaOrder.shipping_address);
  const billingAddress = formatAddress(medusaOrder.billing_address);

  // 4. Compute shipment snapshot
  const shipmentSnapshot = computeShipmentSnapshot(
    medusaOrder.items,
    "lb",
    "in"
  );

  // 5. Transform cart items
  const cartItems = medusaOrder.items.map((item: any) => {
    const shipping = extractShippingMetadata({
      variant: item.variant,
      metadata: item.metadata,
    });

    return {
      _key: item.id,
      title: item.title,
      sku: toCanonicalSKU(item.variant?.sku) || "UNKNOWN",
      quantity: item.quantity,
      unitPrice: toDollars(item.unit_price),
      totalPrice: toDollars(item.total),
      weight: shipping.weight,
      dimensions: shipping.dimensions,
      thumbnail: item.thumbnail,
    };
  });

  // 6. Create Sanity order document
  const sanityOrder = await sanityClient.create({
    _type: "order",
    medusaOrderId: medusaOrder.id,
    orderNumber,
    status,
    paymentStatus,

    // Financial
    subtotal: toDollars(medusaOrder.subtotal),
    shippingTotal: toDollars(medusaOrder.shipping_total),
    taxTotal: toDollars(medusaOrder.tax_total),
    total: toDollars(medusaOrder.total),

    // Items
    cart: cartItems,

    // Shipping
    shippingAddress,
    billingAddress,
    weight: shipmentSnapshot.weight,
    dimensions: shipmentSnapshot.dimensions,

    // Metadata
    email: medusaOrder.email,
    createdAt: medusaOrder.created_at,
  });

  return sanityOrder.orderNumber;
}
```

---

### Example 3: Validation with Error Collection

```typescript
function validateAndTransformCartItems(items: unknown[]): {
  valid: TransformedCartItem[];
  errors: ValidationError[];
} {
  const valid: TransformedCartItem[] = [];
  const errors: ValidationError[] = [];

  for (const item of items) {
    try {
      // Validate structure
      if (!item || typeof item !== "object") {
        throw new ValidationError("Invalid item structure", "item", item, "object");
      }

      const typedItem = item as any;

      // Validate SKU
      const sku = toCanonicalSKU(typedItem.variant?.sku);
      if (!sku) {
        errors.push(new ValidationError(
          "Invalid SKU format",
          "sku",
          typedItem.variant?.sku,
          "XX-XXXX-XXX"
        ));
        continue;
      }

      // Extract shipping data
      const shipping = extractShippingMetadata({
        variant: typedItem.variant,
        metadata: typedItem.metadata,
      });

      // Validate weight if status requires it
      if (typedItem.status === "paid" && shipping.weight === 0) {
        errors.push(new ValidationError(
          "Weight required for paid orders",
          "weight",
          shipping.weight,
          "> 0"
        ));
        continue;
      }

      // Transform
      valid.push({
        sku,
        title: typedItem.title,
        quantity: typedItem.quantity,
        unitPrice: toDollars(typedItem.unit_price),
        totalPrice: toDollars(typedItem.total),
        weight: shipping.weight,
        dimensions: shipping.dimensions,
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error);
      } else {
        errors.push(new ValidationError(
          String(error),
          "item",
          item,
          "valid cart item"
        ));
      }
    }
  }

  return { valid, errors };
}
```

---

## Summary

This translation layer specification provides:

1. **Type-Safe Conversions**: All unit conversions (price, weight, dimensions) with explicit input/output types
2. **Null-Safe Defaults**: Every function handles null/undefined gracefully with documented fallback behavior
3. **Canonicalization**: Order numbers and SKUs are validated and normalized to consistent formats
4. **Status Derivation**: Priority-based logic maps Medusa's multiple status fields to Sanity's single status
5. **Metadata Extraction**: Fallback chains extract shipping data from variant or metadata sources
6. **Validation Utilities**: Type guards and validators with descriptive error messages
7. **Error Handling**: Four patterns (silent fallback, throw, return undefined, collect errors) for different use cases
8. **Integration Examples**: Real-world usage in webhooks, workflows, API endpoints, and background jobs

**Zero-Null Guarantee**: All functions are designed to prevent null propagation:
- Conversion functions return `0` or `0.0` for invalid inputs
- Status derivation always returns valid enum values
- Extraction functions return complete objects with zero values for missing data
- Validation functions either throw or return `undefined` explicitly
- No function returns `null` as a success value

**Next Steps**:
1. Implement utility library at `/fas-medusa/src/utils/translation.ts`
2. Add comprehensive unit tests for all functions
3. Integrate into existing sync mechanisms (webhooks, workflows, API endpoints)
4. Add logging/monitoring for conversion warnings
5. Document in main README with usage examples
