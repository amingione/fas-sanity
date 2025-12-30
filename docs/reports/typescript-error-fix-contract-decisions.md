# TypeScript Error Fix - Claude Decision Contract

**Generated:** 2025-12-30
**Task ID:** typescript-error-fix
**Total Errors:** 80
**Affected Files:** 28
**Governance Pipeline:** Gemini (Audit) → Claude (Decision) → Codex (Execute) → Guards (Validate)

---

## Executive Summary

This contract provides authoritative decisions for fixing 80 TypeScript errors across 7 domains. All decisions follow the minimal change philosophy: fix only what's broken, preserve existing behavior, respect schema-first development, and make no unnecessary refactoring.

**Command Source of Truth:** `npx tsc --noEmit`

---

## Domain 1: AutoMapper & Schema Inference

### Root Cause Analysis
- Missing import for `SchemaIndex` type in `mappingEngine.ts`
- Implicit `any` types on function parameters in multiple files
- Type inference collapsing to `never` in `commandParser.ts`

### Decisions

#### D1.1: Import Missing SchemaIndex Type
**File:** `packages/sanity-config/src/autoMapper/core/mappingEngine.ts:52`
**Decision:** Add `SchemaIndex` to the existing import from `../types`
**Rationale:** `SchemaIndex` is defined in `types.ts` and is used in constructor parameter
**Implementation:**
```typescript
// Line 1-7 (update)
import {
  ConfidenceBreakdown,
  MappingCandidate,
  MappingSuggestion,
  MappingConfidence,
  SourceField,
  SchemaIndex,  // ADD THIS
} from '../types'
```

#### D1.2: Add Explicit Types to Arrow Function Parameters
**File:** `packages/sanity-config/src/autoMapper/core/mappingEngine.ts`
**Lines:** 64, 72, 78
**Decision:** Add explicit type annotations for all parameters currently inferred as `any`
**Rationale:** TypeScript cannot infer types in these contexts; explicit annotation required
**Implementation:**
```typescript
// Line 64
.map((result: SchemaSearchResult) => result.field) ||

// Line 72
.map((target: SanitySchemaField) => {

// Line 78
...targetVariants.map((tv: string) => similarity(variant, tv))
```

#### D1.3: Type `sourceCandidate` to Allow Property Access
**File:** `packages/sanity-config/src/autoMapper/nlp/commandParser.ts`
**Lines:** 76, 85, 113
**Decision:** Add explicit type annotation for `sourceCandidate` variable
**Rationale:** Without explicit type, TypeScript infers `never` when best is null
**Implementation:**
```typescript
// Line 40-46 (update the function signature and return type)
const findClosestSource = (name: string, sourceFields: SourceField[]): {field: SourceField; score: number} | null => {
  let best: {field: SourceField; score: number} | null = null
  sourceFields.forEach((field) => {
    const score = similarity(name, field.name)
    if (!best || score > best.score) best = {field, score}
  })
  return best
}
```

**Note:** This makes the return type explicit, which allows TypeScript to properly type `sourceCandidate` on line 71.

#### D1.4: Add Explicit Type for Parameter in schemaScanner
**File:** `packages/sanity-config/src/autoMapper/core/schemaScanner.ts:158`
**Decision:** Add explicit type annotation for `field` parameter
**Implementation:**
```typescript
// Line 158
.forEach((field: any) => {
```
**Rationale:** The field definition comes from runtime schema types which are dynamic; `any` is appropriate here for schema traversal

---

## Domain 2: Sanity Schema Definitions vs Usage

### Root Cause Analysis
- Incorrectly assuming `fields` property exists on all `SchemaTypeDefinition` types
- Accessing properties on untyped empty object `{}`
- Missing `_id` in document creation
- Missing `name` property on object field definitions
- Passing arguments to zero-argument functions

### Decisions

#### D2.1: Type Guard for Schema Fields Access
**Files:** `packages/sanity-config/src/autoMapper/core/schemaScanner.ts`
**Lines:** 157-158, 235-236, 262
**Decision:** Add type guard to check for `fields` property before accessing
**Rationale:** Not all SchemaTypeDefinition types have `fields` (e.g., StringDefinition doesn't)
**Implementation:**
```typescript
// Line 154-167 (update)
this.schemaTypes
  .filter((type) => (type as any).type === 'document')
  .forEach((docType) => {
    // Type guard: only process if fields exist
    if (!('fields' in docType) || !docType.fields) return
    docType.fields.forEach((field: any) => {
      const discovered = this.walkField(field as any, {
        documentType: docType.name,
        parentPath: [],
        depth: 0,
        parentType: docType.name,
      })
      fields.push(...discovered)
    })
  })

// Line 233-258 (update - add type guard)
fieldDef.of.forEach((ofDef: any, index: number) => {
  const typeDef = this.resolveType(ofDef)
  // Type guard for typeDef.fields
  if (typeDef && 'fields' in typeDef && typeDef.fields) {
    typeDef.fields.forEach((child: any) => {
      collected.push(
        ...this.walkField(child, {
          documentType: context.documentType,
          parentPath: [...context.parentPath, `${resolvedName}[${index}]`],
          depth: nextDepth,
          parentType: typeDef.name || 'arrayItem',
        }),
      )
    })
  } else if ('fields' in ofDef && ofDef.fields) {  // Type guard for ofDef.fields
    ofDef.fields.forEach((child: any) => {
      collected.push(
        ...this.walkField(child, {
          documentType: context.documentType,
          parentPath: [...context.parentPath, `${resolvedName}[${index}]`],
          depth: nextDepth,
          parentType: ofDef.name || 'arrayItem',
        }),
      )
    })
  }
})

// Line 261-277 (update - add type guard)
const resolvedType = this.resolveType(fieldDef)
const nestedFields = (resolvedType && 'fields' in resolvedType && resolvedType.fields) ||
                     ('fields' in fieldDef && fieldDef.fields)
if (nestedFields && Array.isArray(nestedFields)) {
  // ... rest of code
}
```

#### D2.2: Type Package Dimensions Object
**File:** `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:87`
**Decision:** Add type annotation for `packageDimensions` variable
**Rationale:** TypeScript needs to know the shape of the object to allow property access
**Implementation:**
```typescript
// Line 87
const packageDimensions: {
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
} = doc.packageDimensions || {}
```

#### D2.3: Remove getClient Usage (API Change)
**File:** `packages/sanity-config/src/schemaTypes/documentActions/generateVendorNumberAction.ts:10`
**Decision:** Use the correct DocumentActionProps API - no `getClient` property exists
**Rationale:** Sanity's DocumentActionProps doesn't have `getClient` - need to import client separately
**Implementation:**
```typescript
// Top of file - add import
import {getClient} from '../../utils/sanityClient'

// Line 7-12 (update)
export const generateVendorNumberAction = (
  props: DocumentActionProps,
): DocumentActionDescription | null => {
  const {draft, published, id} = props
  const hasNumber = Boolean((draft as any)?.vendorNumber || (published as any)?.vendorNumber)

  // Remove the getClient check - line 12 deleted

  if (hasNumber) {
    // ... rest of code
  }

  // Line 25 (update)
  const client = getClient({apiVersion: API_VERSION})

  // ... rest of code
}
```

**CRITICAL:** Create `packages/sanity-config/src/utils/sanityClient.ts` if it doesn't exist:
```typescript
import {createClient} from '@sanity/client'

export const getClient = (options: {apiVersion: string}) =>
  createClient({
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || '',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
    apiVersion: options.apiVersion,
    useCdn: false,
    token: process.env.SANITY_API_TOKEN,
  })
```

#### D2.4: Add Missing _id to Customer Creation
**File:** `packages/sanity-config/src/schemaTypes/documentActions/linkVendorToCustomerAction.tsx:97`
**Decision:** Add `_id` field to customer creation payload
**Rationale:** Sanity requires `_id` for document creation via `client.create()`
**Implementation:**
```typescript
// Line 97 (update)
const newCustomer = await client.create<CustomerDoc>({
  _type: 'customer',
  _id: `customer-${Date.now()}`,  // ADD THIS LINE
  email: vendor.email,
  firstName: vendor.firstName,
  lastName: vendor.lastName,
  name: vendor.name,
  roles: ['customer'],
  customerType: 'wholesale',
})
```

#### D2.5: Add name Property to Object Fields
**Files:**
- `packages/sanity-config/src/schemaTypes/documents/integrationPack.ts:51`
- `packages/sanity-config/src/schemaTypes/documents/workspace.ts:60`

**Decision:** Add required `name` property to defineField calls for object types
**Rationale:** Sanity's defineField requires `name` for all field definitions
**Implementation:**
```typescript
// integrationPack.ts line 51
defineField({
  name: 'credentials',  // ADD THIS
  type: 'object',
  fields: [
    {
      name: 'apiKey',
      type: 'string',
      title: 'API Key',
    },
  ],
})

// workspace.ts line 60
defineField({
  name: 'owner',  // ADD THIS
  type: 'object',
  fields: [
    {
      name: 'email',
      type: 'email',
      title: 'Email',
      validation: (Rule) => Rule.required(),
    },
    // ... other fields
  ],
})
```

#### D2.6: Remove Arguments from Zero-Parameter Functions
**File:** `packages/sanity-config/src/structure/discountsStructure.ts`
**Lines:** 19, 22, 25
**Decision:** Remove the `S` argument from `.child()` calls
**Rationale:** The function signature expects zero arguments
**Implementation:**
```typescript
// Lines 19, 22, 25 (update all three)
.child(documentTypeListItem('activeDiscount').title('Active Discounts'))

.child(documentTypeListItem('scheduledDiscount').title('Scheduled Discounts'))

.child(documentTypeListItem('expiredDiscount').title('Expired Discounts'))
```

---

## Domain 3: Studio UI Component Contracts

### Root Cause Analysis
- `node.props` typed as `unknown` in React element cloning
- Invalid props passed to Sanity UI components
- Missing JSX namespace in shim file

### Decisions

#### D3.1: Type Assert React Element Props
**File:** `packages/sanity-config/src/components/hotspots/ProductTooltip.tsx:72`
**Decision:** Add type assertion for `node.props`
**Rationale:** TypeScript needs assurance that React elements have props object
**Implementation:**
```typescript
// Line 71-76 (update)
if (React.isValidElement(node)) {
  const children = (node.props as any).children
  if (!children) return node
  const nextChildren = React.Children.map(children, (child) => emphasizePreviewLabels(child))
  return React.cloneElement(node, undefined, nextChildren)
}
```

#### D3.2: Remove Invalid Icon Props from UI Components
**Files:**
- `packages/sanity-config/src/components/media/ShipmentStatusIcon.tsx:65`
- `packages/sanity-config/src/components/StripeAnalyticsWidget.tsx:201`
- `packages/sanity-config/src/components/studio/documentTables/RecoveredCartBadge.tsx:15`
- `src/components/shop/ProductTypeBadge.tsx:33`

**Decision:** Remove props that don't exist on Sanity UI components
**Rationale:** These components don't accept these props; they cause type errors
**Implementation:**
```typescript
// ShipmentStatusIcon.tsx line 65 - REMOVE the style prop entirely
<InTransitIcon />

// StripeAnalyticsWidget.tsx line 201 - REMOVE tone prop
<Text size={2} weight="semibold">
  {value}
</Text>

// RecoveredCartBadge.tsx line 15 - REMOVE icon prop, use children instead
<Badge tone="positive" mode="outline">
  <CheckmarkCircleIcon style={{marginRight: 4}} />
  Recovered
</Badge>

// ProductTypeBadge.tsx line 33 - REMOVE align prop
<Inline space={2}>
  <Badge tone={tone}>{label}</Badge>
  {tooltipContent && <HelpCircleIcon />}
</Inline>
```

#### D3.3: Add JSX Namespace to React Shim
**File:** `packages/sanity-config/src/shims/react-refractor-shim.tsx:43`
**Decision:** Import JSX namespace from React
**Rationale:** TypeScript requires JSX namespace for JSX syntax support
**Implementation:**
```typescript
// Top of file - add to imports (line 1)
import React from 'react'

// OR add triple-slash directive at very top
/// <reference types="react" />
```

---

## Domain 4: Domain Document Type Drift

### Root Cause Analysis
- `InvoiceDocument` and `OrderDocument` types missing properties used in code
- Properties accessed that don't exist in type definitions

### Decisions

#### D4.1: Add Missing Properties to OrderDocument Type
**File:** Find and update `OrderDocument` type definition (likely in `packages/sanity-config/src/types` or similar)
**Missing Properties:** `carrier`, `service`, `estimatedDeliveryDate`
**Decision:** Add optional properties to OrderDocument type
**Rationale:** These properties are accessed in code and should be part of type contract
**Implementation:**
```typescript
// In OrderDocument type definition
export interface OrderDocument {
  // ... existing properties
  carrier?: string
  service?: string
  estimatedDeliveryDate?: string
  // ... other properties
}
```

**If OrderDocument type doesn't exist as interface, it needs to be extracted from schema and created as a type.**

#### D4.2: Add Missing Properties to InvoiceDocument Type
**File:** Find and update `InvoiceDocument` type definition
**Missing Properties:** `carrier`
**Decision:** Add optional `carrier` property to InvoiceDocument type
**Implementation:**
```typescript
// In InvoiceDocument type definition
export interface InvoiceDocument {
  // ... existing properties
  carrier?: string
  // ... other properties
}
```

**UNKNOWN:** The exact location of these type definitions needs to be verified. If they don't exist, they must be created based on the Sanity schemas.

---

## Domain 5: Stripe SDK & API Versioning

### Root Cause Analysis
- Mismatch between Stripe API version string and SDK types
- Possibly null values used where numbers expected
- Missing `shipping_details` property on Session type

### Decisions

#### D5.1: Update Stripe API Version to Match SDK
**Files:**
- `packages/sanity-config/src/utils/generateSKU.ts:64`
- `scripts/inspect-checkout-session.ts:26`
- `scripts/setup-military-discount.ts:9`
- `src/lib/militaryVerification.ts:56`

**Decision:** Update apiVersion to `'2025-08-27.basil'` (or latest stable)
**Rationale:** SDK expects specific API version format
**Implementation:**
```typescript
// In ALL affected files, update the apiVersion line
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
})
```

**CRITICAL:** Verify latest stable Stripe API version before deployment. If `2025-08-27.basil` is not suitable, use the latest version from Stripe SDK types.

#### D5.2: Handle Nullable expires_at Property
**File:** `src/lib/militaryVerification.ts:297,304`
**Decision:** Add null check before using `expires_at`
**Rationale:** Stripe's `expires_at` can be null; must handle both cases
**Implementation:**
```typescript
// Line 297 (update)
if (promoCode.expires_at && promoCode.expires_at < Math.floor(Date.now() / 1000)) {
  throw new Error('Promo code has expired')
}

// Line 304 (update)
expires_at: promoCode.expires_at || undefined,
```

#### D5.3: Type Cast or Add Missing shipping_details
**File:** `src/pages/api/webhooks/stripe-order.ts`
**Lines:** 173, 175, 178-183
**Decision:** Type cast session to include shipping_details
**Rationale:** Stripe types may be outdated; shipping_details exists at runtime
**Implementation:**
```typescript
// At the top of the function where session is used, add type extension
interface SessionWithShipping extends Stripe.Checkout.Session {
  shipping_details?: {
    name?: string
    address?: {
      line1?: string
      line2?: string | null
      city?: string
      state?: string
      postal_code?: string
      country?: string
    }
  }
}

// Then cast the session
const sessionWithShipping = session as SessionWithShipping

// Use sessionWithShipping.shipping_details instead of session.shipping_details
```

---

## Domain 6: Scripts & Migration Typing Assumptions

### Root Cause Analysis
- Assigning nullable types to non-nullable variables
- Implicit `any` parameters in Google Merchant Center integration

### Decisions

#### D6.1: Add Type Guards for Nullable String Assignments
**File:** `scripts/fix-order-number-format.ts`
**Lines:** 93, 94, 95
**Decision:** Add fallback values for potentially undefined properties
**Rationale:** Code expects string but gets string | undefined
**Implementation:**
```typescript
// Lines 93-95 (update)
customerName: order.customerName || 'Unknown',
customerEmail: order.customerEmail || '',
orderType: order.orderType || 'online',
```

#### D6.2: Add Null Coalescing for Dimensions
**File:** `scripts/migrateProductShipping.ts:239`
**Decision:** Transform nullable dimensions to required format with defaults
**Implementation:**
```typescript
// Line 239 (update)
dimensions: dimensions && dimensions.length && dimensions.width && dimensions.height
  ? {
      length: dimensions.length,
      width: dimensions.width,
      height: dimensions.height,
    }
  : null,
```

#### D6.3: Add Fallback for Nullable Booleans
**File:** `scripts/migrateProductShipping.ts`
**Lines:** 242, 243, 244
**Decision:** Coalesce null to false
**Implementation:**
```typescript
// Lines 242-244 (update)
freeShipping: product.freeShipping ?? false,
oversized: product.oversized ?? false,
hazardous: product.hazardous ?? false,
```

#### D6.4: Add Explicit Types for Google Merchant Center Parameters
**File:** `scripts/sync-gmc-status.ts:82,88,89`
**Decision:** Add explicit `any` type for GMC SDK parameters
**Rationale:** Google Merchant Center SDK types are incomplete/unstable
**Implementation:**
```typescript
// Line 82 (update)
const issues = (gmcProduct as any).productIssues?.map((issue: any) => ({

// Line 88-89 (update)
const destinationStatuses = (gmcProduct as any).destinationStatuses?.map(
  (dest: any) => ({
```

---

## Domain 7: API Routes & External SDK Boundaries

### Root Cause Analysis
- Accessing non-existent properties on external SDK objects
- Instance method call for static method
- Type mismatches with fetch API
- Missing `_type` on OrderCartItem

### Decisions

#### D7.1: Use Static Method for EasyPost Shipment.buy
**File:** `src/pages/api/create-shipping-label.ts:197`
**Decision:** Change instance method call to static method
**Rationale:** EasyPost SDK error message explicitly states this is a static method
**Implementation:**
```typescript
// Line 197 (update)
const purchasedShipment = await Shipment.buy(shipment.id, {
  rate: {id: rateId},
})
```

**Note:** May need to import Shipment class: `import {Shipment} from '@easypost/api'`

#### D7.2: Convert Buffer to ArrayBuffer for Fetch
**File:** `src/pages/api/merge-label-packing-slip.ts:59`
**Decision:** Convert Buffer to Uint8Array for fetch compatibility
**Implementation:**
```typescript
// Line 59 (update)
body: new Uint8Array(pdfBuffer),
```

#### D7.3: Add _type to OrderCartItem Type Definition
**File:** Find `OrderCartItem` type definition
**Decision:** Add `_type` as required field
**Rationale:** Sanity requires `_type` on all objects; schema defines it
**Implementation:**
```typescript
// In OrderCartItem type definition (likely in types file)
export interface OrderCartItem {
  _type: 'orderCartItem'  // ADD THIS
  _key: string
  productId: string
  productName: string
  sku: string
  quantity: number
  price: number
  unitPrice: number
  options?: string
  upgrades?: string[]
  imageUrl?: string
}
```

**Affected locations using this:**
- `src/pages/api/webhooks/stripe-order.ts:61,74,120`

---

## Cross-Domain Decisions

### CD1: Unknown OrderViewFieldType Issue
**File:** `packages/sanity-config/src/views/orderView.tsx:200`
**Error:** `Type '"date"' is not assignable to type 'OrderViewFieldType | undefined'`
**Decision:** DEFER to Codex investigation
**Rationale:** Need to examine OrderViewFieldType definition to determine if 'date' should be added or if field type should change
**Action Required:** Codex must examine `OrderViewFieldType` and determine correct approach

---

## Implementation Priorities

### Phase 1: Critical Blockers (Must Fix First)
1. D1.1 - Add SchemaIndex import
2. D5.1 - Update Stripe API versions (affects multiple domains)
3. D2.3 - Fix getClient usage (breaking change)
4. D7.3 - Add _type to OrderCartItem

### Phase 2: Type Safety Core
1. All Domain 1 decisions (D1.2-D1.4)
2. All Domain 2 decisions (D2.1, D2.2, D2.4-D2.6)
3. D4.1, D4.2 - Add missing document properties

### Phase 3: Component & UI Fixes
1. All Domain 3 decisions (D3.1-D3.3)
2. D6.1-D6.3 - Script nullable handling

### Phase 4: External SDK Integration
1. D5.2, D5.3 - Stripe nullable handling
2. D6.4 - GMC typing
3. D7.1, D7.2 - EasyPost and fetch fixes

---

## Validation Criteria

After implementation, the following MUST be true:
- `npx tsc --noEmit` produces ZERO errors
- All existing functionality remains unchanged
- No new schema fields added without explicit approval
- Sanity Studio loads without errors
- No runtime regressions introduced

---

## Unknown Remainders (Requiring Codex Investigation)

1. **Exact location of OrderDocument and InvoiceDocument type definitions** - Codex must locate and update
2. **OrderViewFieldType definition** - Must examine to resolve CD1
3. **Verification of sanityClient.ts utility** - Confirm if exists or needs creation for D2.3

---

## Codex Execution Constraints

1. **NO refactoring** - Only fix stated errors
2. **NO schema changes** - Only update TypeScript types to match existing schemas
3. **NO new features** - Only correct type mismatches
4. **Preserve all existing behavior** - Changes must be type-only where possible
5. **Test after each domain** - Verify tsc output decreases as expected

---

**End of Decision Contract**
