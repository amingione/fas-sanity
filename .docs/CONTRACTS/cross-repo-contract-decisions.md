# Cross-Repo Contract Decisions (fas-sanity ⇄ fas-cms-fresh)

## Executive Summary

This document translates the cross-repo audit findings into explicit, enforceable schema and API contracts. All decisions map directly to blocking issues and confusing patterns identified in the audit reports.

**Critical Finding:** fas-cms-fresh assumes schemas and fields that do not exist in fas-sanity, creating data integrity failures across vendor auth, promotions, invoices, quotes, and order workflows.

**Decision Philosophy:** Sanity schemas are the canonical contract. All fas-cms-fresh code must align to schemas. Schema changes are approved ONLY when the audit confirms fas-cms-fresh functionality is intentional and required.

---

## BLOCKING ISSUES: Contract Decisions

### 1. Missing `promotion` Schema

**Audit Finding:** fas-cms-fresh reads `promotion` documents via multiple endpoints (`src/server/sanity/promotions.ts`, `src/lib/storefrontQueries.ts`, `src/pages/api/promotions/active.ts`, etc.), but no `promotion` schema exists in fas-sanity.

**DECISION:** **SCHEMA CHANGE APPROVED.**

**Source of Truth:**
- **Canonical**: Sanity `promotion` document (NEW)
- **Authority**: Storefront/admin (NOT Stripe)
- **Scope**: Public promotional campaigns (cart-level, site-wide, product-specific)

**Contract:**
| Aspect | Decision |
|--------|----------|
| Document type | `promotion` |
| Read access | Public (storefront queries allowed) |
| Write access | Admin only (Studio + admin API) |
| Stripe relationship | Independent - promotions are NOT Stripe coupons |

**Required Schema Fields (from fas-cms-fresh usage):**
- `_id`, `_type`, `slug` (type: 'slug', required; accessed via `slug.current`)
- `active` boolean (required for `src/pages/api/promotions/active.ts`)
- `code` string (optional promo code for validation)
- `discountType` enum: 'percentage' | 'fixed_amount'
- `discountValue` number
- `validFrom` datetime
- `validUntil` datetime
- `conditions` object (minimum order, product restrictions)

**Relationship to Existing Discount Model:**
- **Customer Coupons (Stripe)**: `customer.discounts[]` - account-level, reusable, Stripe-synced
- **Promotions (NEW)**: `promotion` docs - campaign-level, site-wide, admin-created
- **NO MIGRATION**: These are separate discount models serving different purposes

**Read/Write Direction:**
- **Reads**: fas-cms-fresh storefront → Sanity (public queries)
- **Writes**: Sanity Studio → Sanity dataset (admin-created)
- **Validation**: Applied in fas-cms-fresh checkout flow (`src/pages/api/checkout.ts`)

**Forbidden Mutations:**
- ❌ fas-cms-fresh CANNOT create `promotion` documents (admin-only)
- ❌ Promotions CANNOT sync to Stripe (different systems)
- ❌ Promotions CANNOT be embedded in `customer.discounts[]` (different types)

**Ready for Codex:** Create `promotion.ts` schema in `packages/sanity-config/src/schemaTypes/documents/` with fields matching fas-cms-fresh query expectations.

---

### 2. Missing `vendorAuthToken` Schema

**Audit Finding:** fas-cms-fresh creates and reads `vendorAuthToken` documents for vendor invitation and password reset flows (`src/server/vendor-portal/service.ts`), but no schema exists in fas-sanity.

**DECISION:** **SCHEMA CHANGE APPROVED.**

**Source of Truth:**
- **Canonical**: Sanity `vendorAuthToken` document (NEW)
- **Authority**: Vendor portal service (fas-cms-fresh)
- **Lifecycle**: Temporary (expires after use or timeout)

**Contract:**
| Aspect | Decision |
|--------|----------|
| Document type | `vendorAuthToken` |
| Read access | Server-side only (vendor portal service) |
| Write access | Server-side only (token generation) |
| Visibility | Hidden in Studio (system document) |

**REVISED CONTRACT (ALIGN TO CODE):**

Required Schema Fields (authoritative):
- `_id`, `_type`
- `vendor` (reference to `vendor`)
- `tokenHash` (string, required, indexed)
- `tokenType` enum: 'invitation' | 'password-reset'
- `expiresAt` (datetime)
- `usedAt` (datetime, nullable)
- `createdAt` (datetime)

Removed / Not Required:
- `email`
- token enum values 'invite' | 'reset'

Rules:
- Server-only read/write
- Hidden in Studio
- Immutable after creation except `usedAt`

**Read/Write Direction:**
- **Writes**: fas-cms-fresh vendor service → Sanity (token creation)
- **Reads**: fas-cms-fresh vendor service → Sanity (token validation)
- **Cleanup**: Expired tokens should be auto-deleted (cron job or document action)

**Allowed Mutations:**
- ✅ Create token on vendor invite/reset request
- ✅ Mark token as used (`usedAt` timestamp)
- ✅ Delete token after use or expiration

**Forbidden Mutations:**
- ❌ Tokens CANNOT be edited after creation (security)
- ❌ Tokens CANNOT be reused after `usedAt` is set
- ❌ Studio operators CANNOT manually create tokens (server-only)

**Ready for Codex:** Create `vendorAuthToken.ts` schema in `packages/sanity-config/src/schemaTypes/documents/` marked as `hidden: true` with server-only access.

---

### 3. Missing `vendor.userSub` Field

**Audit Finding:** Vendor session lookup expects `vendor.userSub` field (`src/server/sanity-client.ts` `getVendorBySub` function), but the vendor schema does not define this field.

**DECISION:** **SCHEMA CHANGE APPROVED.**

**Source of Truth:**
- **Canonical**: `vendor.userSub` (NEW field in existing vendor schema)
- **Authority**: Auth provider (JWT sub claim)
- **Purpose**: Link vendor document to auth session

**Contract:**
| Field | Type | Editability | Sync Direction |
|-------|------|-------------|----------------|
| `vendor.userSub` | string | Read-only | Auth provider → Sanity |

**Read/Write Direction:**
- **Write**: fas-cms-fresh auth flow → Sanity (on vendor signup/link)
- **Read**: fas-cms-fresh session middleware → Sanity (vendor lookup by JWT sub)
- **Validation**: Must be unique per vendor

**Allowed Mutations:**
- ✅ Set `userSub` on vendor creation (one-time)
- ✅ Update `userSub` if auth provider ID changes (rare)

**Forbidden Mutations:**
- ❌ `userSub` CANNOT be edited in Studio (system-managed)
- ❌ `userSub` CANNOT be null for vendors with portal access

**Field Placement:**
Add to `vendor.portalAccess` object:
```typescript
portalAccess: {
  enabled: boolean,
  email: string (read-only, synced from customer.email),
  userSub: string (NEW - read-only, auth provider ID),
  passwordHash: string (hidden),
  lastLogin: datetime (read-only)
}
```

**QUERY ALIGNMENT:**
fas-cms-fresh MUST query `vendor.portalAccess.userSub`.
Do NOT add a top-level `vendor.userSub`.

**Ready for Codex:** Add `userSub` field to `vendor.portalAccess` object in `packages/sanity-config/src/schemaTypes/documents/vendor.ts`, marked `readOnly: true` and `hidden: true`.

---

### 4. Missing Vendor Reference in Invoice Schema

**Audit Finding:** Vendor portal invoice queries use `references($vendorId)` filter (`src/server/vendor-portal/data.ts`, `src/pages/api/vendor/invoices/[id].ts`), but the invoice schema defines no vendor reference field.

**DECISION:** **NO SCHEMA CHANGE.** Align code to existing architecture.

**Source of Truth:**
- **Canonical**: `invoice.customer` reference (existing)
- **Vendor Lookup**: Via `vendor.customerRef` → `customer` (existing pattern)

**Rationale:**
Per the vendor-wholesale architecture decisions (previous deliverable), vendors are linked to customers via `vendor.customerRef`. Invoices are already linked to customers via `invoice.customer` reference. Adding a separate `invoice.vendor` reference would:
1. Duplicate the vendor→customer→invoice relationship
2. Create two sources of truth for vendor-invoice linking
3. Violate the established vendor→customer pattern

**Correct Query Pattern:**
Instead of `references($vendorId)`, fas-cms-fresh MUST:
1. Resolve vendor → customer: `vendor.customerRef._ref`
2. Query invoices by customer: `*[_type == "invoice" && customer._ref == $customerId]`

**Contract:**
| Entity | Reference Path | Query Method |
|--------|---------------|--------------|
| Vendor → Customer | `vendor.customerRef` | Direct reference |
| Invoice → Customer | `invoice.customer` | Direct reference |
| Vendor → Invoice | `vendor.customerRef → invoice.customer` | Two-step resolution |

**Allowed Queries:**
- ✅ Get customer from vendor: `*[_id == $vendorId][0].customerRef`
- ✅ Get invoices for customer: `*[_type == "invoice" && customer._ref == $customerId]`
- ✅ Combined: `*[_type == "invoice" && customer._ref == ^.^.customerRef._ref]`

**Forbidden Patterns:**
- ❌ Adding `invoice.vendor` reference field (creates duplication)
- ❌ Using `references($vendorId)` on invoices (vendor is not directly referenced)
- ❌ Querying invoices without resolving vendor→customer first

**Ready for Codex:** Refactor `src/server/vendor-portal/data.ts` and `src/pages/api/vendor/invoices/[id].ts` to resolve `vendor.customerRef` BEFORE querying invoices.

---

### 5. Wholesale Order `customerRef` Constraint Violation

**Audit Finding:** Wholesale orders link to vendors by reusing `order.customerRef` (`src/pages/api/vendor/orders/[id].ts`), but the order schema constrains `customerRef` to `customer` documents only: `to: [{type: 'customer'}]`.

**DECISION:** **NO SCHEMA CHANGE.** Align code to existing architecture.

**Source of Truth:**
- **Canonical**: `order.customerRef` → `customer` (existing)
- **Wholesale Orders**: Vendor creates order, but `customerRef` points to vendor's linked customer account

**Rationale:**
Per vendor-wholesale architecture decisions, vendors ARE customers with `roles: ['vendor']`. The correct pattern is:
1. Vendor document has `vendor.customerRef` → customer
2. Wholesale order has `order.customerRef` → same customer
3. Customer document has `roles: ['vendor']` or `customerType: 'vendor'`

**Contract:**
| Order Type | `order.customerRef` | Customer Role | Pricing |
|------------|-------------------|---------------|---------|
| Retail | → customer (role: 'customer') | 'customer' | Retail |
| Wholesale | → customer (role: 'vendor') | 'vendor' | Wholesale |

**Correct Wholesale Order Creation Flow:**
1. Vendor logs into portal
2. Portal resolves `vendor.customerRef` → customer ID
3. Order created with `customerRef` = customer ID (NOT vendor ID)
4. Order pricing uses customer's vendor pricing tier

**Allowed Mutations:**
- ✅ Set `order.customerRef` to vendor's linked customer
- ✅ Validate customer has 'vendor' role for wholesale pricing
- ✅ Query vendor orders: `*[_type == "order" && customerRef._ref == $customerId]`

**Forbidden Patterns:**
- ❌ Changing `order.customerRef` schema to allow vendor references (breaks architecture)
- ❌ Adding separate `order.vendorRef` field (duplicates relationship)
- ❌ Creating orders with `customerRef` pointing directly to vendor document

**Ready for Codex:** Refactor wholesale order creation in fas-cms-fresh to:
1. Resolve `vendor.customerRef` first
2. Use customer ID for `order.customerRef`
3. Validate customer has 'vendor' role
4. Apply wholesale pricing based on customer's vendor tier

---

### 6. Order Status Value Mismatch

**Audit Finding:** `src/pages/api/save-order.ts` writes `status: 'pending'` and `paymentStatus: 'pending'`, but the order schema status enum omits 'pending', which can make orders invisible in Studio lists.

**DECISION:** **SCHEMA CHANGE APPROVED.**

**Source of Truth:**
- **Canonical**: Order schema status enums (EXTEND to include 'pending')
- **Write Authority**: fas-cms-fresh order creation

**Contract:**

**Current Schema Status Values (order.tsx):**
```typescript
status: 'unfulfilled' | 'processing' | 'fulfilled' | 'cancelled'
paymentStatus: 'unpaid' | 'paid' | 'partially_refunded' | 'refunded'
```

**Required Addition:**
```typescript
status: 'pending' | 'unfulfilled' | 'processing' | 'fulfilled' | 'cancelled'
paymentStatus: 'pending' | 'unpaid' | 'paid' | 'partially_refunded' | 'refunded'
```

**Status Lifecycle:**
1. **pending**: Order created, payment not yet confirmed (initial state from `save-order.ts`)
2. **unfulfilled**: Payment confirmed, awaiting fulfillment
3. **processing**: Fulfillment in progress
4. **fulfilled**: Shipped/completed
5. **cancelled**: Order cancelled

**Payment Status Lifecycle:**
1. **pending**: Payment initiated, not confirmed
2. **unpaid**: Payment required but not received
3. **paid**: Payment confirmed
4. **partially_refunded**: Partial refund issued
5. **refunded**: Full refund issued

**Read/Write Direction:**
- **Write**: fas-cms-fresh → Sanity (order creation with 'pending')
- **Update**: Stripe webhooks → Sanity (pending → paid)
- **Update**: Fulfillment flow → Sanity (unfulfilled → processing → fulfilled)

**Allowed Transitions:**
- ✅ pending → unfulfilled (payment confirmed)
- ✅ pending → cancelled (payment failed)
- ✅ unfulfilled → processing (fulfillment started)
- ✅ processing → fulfilled (shipment created)

**Forbidden Transitions:**
- ❌ fulfilled → pending (cannot revert completed orders)
- ❌ Skipping 'pending' state on order creation (must start with pending)

**Ready for Codex:** Add 'pending' to both `status` and `paymentStatus` enums in `packages/sanity-config/src/schemaTypes/documents/order.tsx`.

---

## CONFUSING / RISKY PATTERNS: Contract Decisions

### 7. Discount Views Are Derived Lists (Not Document Lists)

**Audit Finding:** `discountsList.tsx` presents as a document list but queries embedded `customer.discounts[]` objects, not standalone documents.

**DECISION:** **NO SCHEMA CHANGE.** UX labeling correction required (already completed in previous deliverable).

**Source of Truth:**
- **Canonical**: `customer.discounts[]` array of `customerDiscount` objects
- **Authority**: Stripe (synced via webhooks)
- **Display**: Aggregate view in Studio (NOT document type list)

**Contract:**
| Aspect | Decision |
|--------|----------|
| Document type | NONE - embedded objects only |
| Studio view | Custom aggregate list (already implemented) |
| Editing | Via CustomerDiscountsInput component → Stripe API |

**Correct UX Pattern (from previous decision):**
- Label: "Customer Coupons (Stripe)" (NOT "Discounts & Coupons")
- Behavior: Click navigates to parent customer document
- Creation: Via Netlify function → Stripe → webhook sync

**Ready for Codex:** UX corrections already specified in previous deliverable (discount surfacing decisions).

---

### 8. Two Discount Models Without Shared Contract

**Audit Finding:** Stripe customer discounts (`customer.discounts[]`) and storefront promotions (`promotion` docs) coexist without shared contract.

**DECISION:** **SEPARATE MODELS APPROVED.** No unification required.

**Source of Truth:**
- **Customer Coupons**: Stripe → Sanity `customer.discounts[]`
- **Promotions**: Sanity `promotion` documents (NEW, see Decision #1)

**Contract Separation:**

| Model | Scope | Storage | Authority | Use Case |
|-------|-------|---------|-----------|----------|
| Customer Coupons | Account-level | `customer.discounts[]` | Stripe | Recurring discounts for specific customers |
| Promotions | Campaign-level | `promotion` documents | Admin/Studio | Site-wide sales, seasonal campaigns |

**Why Separate Models Are Correct:**
1. **Different lifecycles**: Customer coupons are tied to Stripe customer accounts; promotions are independent campaigns
2. **Different authorities**: Stripe owns customer coupons; Studio owns promotions
3. **Different validation**: Customer coupons validate against Stripe API; promotions validate in checkout logic
4. **Different reusability**: Customer coupons are tied to one customer; promotions can apply to all customers

**Allowed Patterns:**
- ✅ Customer has Stripe coupon applied at checkout
- ✅ Storefront promotion applied to cart
- ✅ Both can exist on same order (if business logic allows)

**Forbidden Patterns:**
- ❌ Syncing promotions to Stripe (different systems)
- ❌ Storing Stripe coupons as promotion documents (wrong model)
- ❌ Creating unified "discount" document type (architecturally incorrect)

**Ready for Codex:** No action required - separation is intentional and correct.

---

### 9. `vendorMessage` Deprecated But Still Used

**Audit Finding:** `vendorMessage` schema is marked deprecated but still used by vendor portal messaging (`src/pages/api/vendor/messages/*`).

**DECISION:** **UNDEPRECATE SCHEMA.** Align schema to active usage.

**Source of Truth:**
- **Canonical**: Sanity `vendorMessage` document (KEEP)
- **Authority**: Vendor portal (fas-cms-fresh)
- **Lifecycle**: Active messaging system

**Contract:**
| Aspect | Decision |
|--------|----------|
| Document type | `vendorMessage` |
| Read access | Vendor portal (authenticated) |
| Write access | Vendor portal + admin |
| Deprecation status | REMOVE deprecation notice |

**Rationale:**
The schema was previously flagged for deprecation in the vendor-wholesale audit, but the cross-repo audit confirms fas-cms-fresh actively uses this for vendor communication. Deprecation was premature.

Action:
- Remove deprecation notice ONLY.
- Keep existing fields and behavior as used by fas-cms-fresh.
- No field renames or restructuring.

**Allowed Mutations:**
- ✅ Create messages from vendor portal
- ✅ Mark messages as read
- ✅ Admin replies to vendor messages

**Forbidden Mutations:**
- ❌ Deleting messages (archive instead)
- ❌ Editing message content after send (immutable)

**Ready for Codex:** Remove deprecation notice from `packages/sanity-config/src/schemaTypes/documents/vendorMessage.ts` and validate schema matches fas-cms-fresh API expectations.

---

### 10. Order Patches Without Field Allowlist

**Audit Finding:** `src/pages/api/orders/[id].ts` allows customer order patches with no field allowlist, risking overwrites of Stripe-synced or read-only fields.

**DECISION:** **NO SCHEMA CHANGE.** Add server-side validation allowlist.

**Source of Truth:**
- **Order Fields**: Schema defines authority per field (Stripe, EasyPost, or customer)
- **Patch Authority**: Only customer-editable fields may be patched

**Contract - Field Authority:**

| Field | Authority | Customer Editable | Validation |
|-------|-----------|-------------------|------------|
| `shippingAddress.*` | Customer | ✅ Yes | Address validation |
| `billingAddress.*` | Customer | ✅ Yes | Address validation |
| `phone` | Customer | ✅ Yes | Phone format |
| `email` | Customer | ✅ Yes | Email format |
| `notes` | Customer | ✅ Yes | Text |
| `status` | Admin/Fulfillment | ❌ No | Enum validation |
| `paymentStatus` | Stripe | ❌ No | Webhook-only |
| `stripePaymentIntentId` | Stripe | ❌ No | Webhook-only |
| `trackingNumber` | EasyPost | ❌ No | Webhook-only |
| `shippingCarrier` | EasyPost | ❌ No | Webhook-only |
| `total` | Stripe | ❌ No | Webhook-only |

**Required Allowlist (Server-Side):**
```typescript
const CUSTOMER_EDITABLE_FIELDS = [
  'shippingAddress',
  'billingAddress',
  'phone',
  'email',
  'notes'
]
```

**Patch Validation Logic:**
1. Receive patch request from customer
2. Extract field keys from patch
3. Reject if any field NOT in allowlist
4. Validate field formats (address, email, phone)
5. Apply patch

**Allowed Mutations:**
- ✅ Customer updates shipping address before fulfillment
- ✅ Customer adds order notes
- ✅ Customer corrects email/phone

**Forbidden Mutations:**
- ❌ Customer changes payment status
- ❌ Customer edits total amount
- ❌ Customer sets tracking number
- ❌ Customer changes order status

**Ready for Codex:** Add field allowlist validation to `src/pages/api/orders/[id].ts` before applying patches. Reject patches containing non-editable fields.

---

### 11. EasyPost Webhook Writes Undefined Schema Fields

**Audit Finding:** `netlify/functions/easypostWebhook.ts` writes `shippingStatus` and `shippingLog` on orders, but the order schema does not define these fields, making them invisible in Studio.

**DECISION:** **SCHEMA CHANGE APPROVED.**

**Source of Truth:**
- **Canonical**: Order schema (EXTEND with EasyPost fields)
- **Authority**: EasyPost (via webhooks)

**Required Schema Fields:**

| Field | Type | Authority | Editability | Display |
|-------|------|-----------|-------------|---------|
| `shippingStatus` | string enum | EasyPost webhook | Read-only | Visible in fulfillment group |
| `shippingLog` | array of objects | EasyPost webhook | Read-only | Visible in fulfillment group |

**`shippingStatus` Enum Values (from EasyPost):**
- `pre_transit`: Label created, not yet picked up
- `in_transit`: Package in carrier's possession
- `out_for_delivery`: Out for delivery
- `delivered`: Successfully delivered
- `returned`: Returned to sender
- `failure`: Delivery failed
- `unknown`: Status unknown

**`shippingLog` Object Structure:**
```typescript
{
  _type: 'shippingLogEntry',
  status: string,
  message: string,
  datetime: string (ISO 8601),
  location: string (optional),
  carrier: string
}
```

**Read/Write Direction:**
- **Write**: EasyPost webhook → Sanity (status updates)
- **Read**: Studio + fas-cms-fresh → Sanity (order details)
- **Validation**: EasyPost-authoritative (no manual edits)

**Allowed Mutations:**
- ✅ EasyPost webhook writes `shippingStatus`
- ✅ EasyPost webhook appends to `shippingLog`
- ✅ Studio displays shipping timeline

**Forbidden Mutations:**
- ❌ Manual editing of `shippingStatus` in Studio (webhook-only)
- ❌ Manual editing of `shippingLog` entries (immutable)
- ❌ Deleting shipping log entries (audit trail)

**Field Placement:**
Add to order schema in "Fulfillment" group alongside `trackingNumber`, `shippingCarrier`, etc.

**Ready for Codex:** Add `shippingStatus` (enum) and `shippingLog` (array) fields to `packages/sanity-config/src/schemaTypes/documents/order.tsx` in fulfillment group, marked `readOnly: true`.

**CLARIFICATION:**
Use the existing `shippingLogEntryType` as canonical.
Do NOT introduce a new inline object shape.
Decision intent is semantic alignment, not structural replacement.

---

### 12. Multiple Quote Document Types with Mismatched Paths

**Audit Finding:** Quotes use `quote`, `quoteRequest`, and `buildQuote` document types with mismatched read/write paths (`src/pages/api/get-user-quotes.ts` reads `quote`, but writes create `buildQuote` and `quoteRequest`).

**DECISION:** **NO SCHEMA CHANGE.** Align code to schema hierarchy.

**Source of Truth:**
- **Customer-Facing Quote**: `buildQuote` document (canonical)
- **Admin Quote Request**: `quoteRequest` document (internal workflow)
- **Legacy/Deprecated**: `quote` document (if exists, migrate away)

**Contract - Quote Type Hierarchy:**

| Document Type | Purpose | Created By | Read By |
|--------------|---------|------------|---------|
| `quoteRequest` | Customer requests quote | Customer (fas-cms-fresh) | Admin (Studio) |
| `buildQuote` | Admin builds quote from request | Admin (Studio or API) | Customer (fas-cms-fresh) |
| `quote` | Legacy (DEPRECATED) | N/A | Should not be used |

**Correct Data Flow:**
1. Customer submits quote request → creates `quoteRequest` document
2. Admin reviews request in Studio
3. Admin creates `buildQuote` document (may reference `quoteRequest`)
4. Customer views `buildQuote` via fas-cms-fresh

**Query Correction:**
- **Current (WRONG)**: `*[_type == "quote" && ...]`
- **Correct**: `*[_type == "buildQuote" && ...]`

**Allowed Mutations:**
- ✅ Customer creates `quoteRequest`
- ✅ Admin creates `buildQuote` from request
- ✅ Admin updates `buildQuote` before customer accepts

**Forbidden Patterns:**
- ❌ Creating `quote` documents (use `buildQuote`)
- ❌ Querying `quote` type (query `buildQuote`)
- ❌ Customer directly creating `buildQuote` (must go through request)

**Ready for Codex:**
1. Update `src/pages/api/get-user-quotes.ts` to query `buildQuote` instead of `quote`
2. Verify `src/pages/api/save-quote.ts` creates `buildQuote`
3. If `quote` schema exists, mark as deprecated and plan migration

---

### 13. Vendor Profile Endpoints Use Undefined Schema Fields

**Audit Finding:** `src/pages/api/vendor/settings/profile.ts` reads/writes top-level `name` and `email` fields not defined in vendor schema, causing edits to appear unsaved in Studio.

**DECISION:** **NO SCHEMA CHANGE.** Align code to existing schema fields.

**Source of Truth:**
- **Vendor Name**: `vendor.companyName` (existing schema field)
- **Vendor Email**: `vendor.portalAccess.email` (synced from `customer.email` - read-only)
- **Contact Email**: `vendor.primaryContact.email` (existing schema field - editable)

**Contract - Vendor Identity Fields:**

| API Field | Schema Field | Editability | Authority |
|-----------|--------------|-------------|-----------|
| `name` (WRONG) | `companyName` | Editable | Vendor/Admin |
| `email` (WRONG) | `portalAccess.email` | Read-only | Synced from customer.email |
| `contactEmail` | `primaryContact.email` | Editable | Vendor/Admin |

**Per Vendor-Wholesale Architecture Decisions:**
- `customer.email` is canonical for auth/login
- `vendor.portalAccess.email` mirrors `customer.email` (read-only)
- `vendor.primaryContact.email` is independent business contact (editable)

**Correct API Mapping:**
```typescript
// WRONG (current):
{ name: vendor.name, email: vendor.email }

// CORRECT:
{
  companyName: vendor.companyName,
  loginEmail: vendor.portalAccess.email, // read-only
  contactEmail: vendor.primaryContact.email // editable
}
```

**Allowed Mutations:**
- ✅ Update `vendor.companyName`
- ✅ Update `vendor.primaryContact.email` (business contact)
- ✅ Read `vendor.portalAccess.email` (login email)

**Forbidden Mutations:**
- ❌ Writing to `vendor.portalAccess.email` (read-only, synced from customer)
- ❌ Using non-schema fields `vendor.name` or `vendor.email`
- ❌ Bypassing customer.email for login email changes

**Ready for Codex:** Refactor `src/pages/api/vendor/settings/profile.ts` to:
1. Map `companyName` instead of `name`
2. Return `portalAccess.email` as read-only `loginEmail`
3. Map `primaryContact.email` as editable `contactEmail`
4. Remove references to undefined `vendor.name` and `vendor.email`

---

## Cross-Cutting Validation Rules

### Field Authority Matrix

| Authority | Fields | Mutation Rules |
|-----------|--------|----------------|
| **Stripe** | `customer.stripeCustomerId`, `order.stripePaymentIntentId`, `order.total`, `order.paymentStatus`, `customer.discounts[]` | Webhook-only writes, read-only in Studio and fas-cms-fresh |
| **EasyPost** | `order.trackingNumber`, `order.shippingCarrier`, `order.shippingStatus`, `order.shippingLog` | Webhook-only writes, read-only in Studio and fas-cms-fresh |
| **Customer** | `customer.email`, `customer.firstName`, `customer.phone`, `order.shippingAddress`, `order.billingAddress` | Editable in fas-cms-fresh with validation, visible in Studio |
| **Admin** | `vendor.status`, `order.status` (fulfillment), `promotion.*` | Editable in Studio and admin APIs, read-only for customers |
| **System** | `vendor.portalAccess.email`, `vendor.portalAccess.userSub`, `customer.name` (computed) | Auto-computed or synced, read-only everywhere |

### Cross-Repo Sync Direction

```
Stripe → fas-sanity webhooks → Sanity dataset → fas-cms-fresh queries
EasyPost → fas-sanity webhooks → Sanity dataset → fas-cms-fresh queries
fas-cms-fresh writes → Sanity dataset → fas-sanity Studio display
fas-sanity Studio edits → Sanity dataset → fas-cms-fresh queries
```

**Critical Rule:** fas-cms-fresh NEVER bypasses Sanity schemas. All mutations must validate against schema contracts.

---

## Ready for Codex Enforcement

### SCHEMA CHANGES REQUIRED

**✅ APPROVED SCHEMA CHANGES:**

1. **Create `promotion.ts` schema** in `packages/sanity-config/src/schemaTypes/documents/`
   - Fields: slug, active, code, discountType, discountValue, validFrom, validUntil, conditions
   - Read access: Public (storefront)
   - Write access: Admin only

2. **Create `vendorAuthToken.ts` schema** in `packages/sanity-config/src/schemaTypes/documents/`
   - Fields: token, vendorId, email, type, expiresAt, usedAt, createdAt
   - Visibility: Hidden in Studio (system document)
   - Access: Server-side only

3. **Add `vendor.portalAccess.userSub` field** in `vendor.ts`
   - Type: string
   - Read-only: true
   - Hidden: true
   - Authority: Auth provider (JWT sub)

4. **Add 'pending' to order status enums** in `order.tsx`
   - `status`: Add 'pending' as first value
   - `paymentStatus`: Add 'pending' as first value

5. **Add EasyPost fields to order schema** in `order.tsx`
   - `shippingStatus`: string enum (EasyPost statuses)
   - `shippingLog`: array of shippingLogEntry objects
   - Group: Fulfillment
   - Read-only: true

6. **Remove deprecation from `vendorMessage.ts`**
   - Validate fields match fas-cms-fresh usage

### CODE CHANGES REQUIRED (fas-cms-fresh)

**✅ ALIGNMENT TO SCHEMAS:**

1. **Invoice Queries** (`src/server/vendor-portal/data.ts`, `src/pages/api/vendor/invoices/[id].ts`)
   - Remove `references($vendorId)` pattern
   - Implement two-step: vendor.customerRef → invoice.customer

2. **Wholesale Order Creation** (vendor order endpoints)
   - Resolve `vendor.customerRef` first
   - Use customer ID for `order.customerRef` (not vendor ID)
   - Validate customer has 'vendor' role

3. **Order Patches** (`src/pages/api/orders/[id].ts`)
   - Add field allowlist: `['shippingAddress', 'billingAddress', 'phone', 'email', 'notes']`
   - Reject patches with non-editable fields

4. **Quote Queries** (`src/pages/api/get-user-quotes.ts`)
   - Change query from `_type == "quote"` to `_type == "buildQuote"`
   - Verify write endpoints create `buildQuote`

5. **Vendor Profile API** (`src/pages/api/vendor/settings/profile.ts`)
   - Map `companyName` instead of `name`
   - Return `portalAccess.email` as read-only `loginEmail`
   - Map `primaryContact.email` as editable `contactEmail`

### VALIDATION ENFORCEMENT

**Server-Side Validation Rules:**

1. **Field Authority Validation**: Reject mutations to Stripe/EasyPost-authoritative fields from non-webhook sources
2. **Reference Integrity**: Validate `vendor.customerRef` points to customer with 'vendor' role
3. **Email Sync**: Enforce `vendor.portalAccess.email ← customer.email` on customer email changes
4. **Status Transitions**: Validate order status transitions follow allowed lifecycle
5. **Schema Conformance**: Reject writes using undefined schema fields

---

## Blocking vs Non-Blocking Classification

### 🔴 BLOCKING (Must Fix Before Production)

1. Missing `promotion` schema - storefront promotion features broken
2. Missing `vendorAuthToken` schema - vendor invites/resets broken
3. Missing `vendor.userSub` - vendor session lookup broken
4. Invoice vendor queries - vendor portal invoice retrieval broken
5. Wholesale order `customerRef` - vendor orders may be miscategorized
6. Order 'pending' status - new orders invisible in Studio

### 🟡 HIGH PRIORITY (Data Integrity Risk)

7. Order patch allowlist - risk of customer overwriting system fields
8. EasyPost schema fields - shipping status invisible in Studio
9. Vendor profile field mapping - vendor edits appear unsaved

### 🟢 MEDIUM PRIORITY (UX Confusion)

10. Discount view labeling - already addressed in previous deliverable
11. Quote document type alignment - customer queries may return empty
12. `vendorMessage` deprecation - remove incorrect deprecation notice

### ⚪ LOW PRIORITY (Architectural Clarity)

13. Two discount models - intentional separation, no action needed

---

## Summary

**Total Decisions:** 13 blocking/risky patterns resolved

**Schema Changes Approved:** 5
- New documents: `promotion`, `vendorAuthToken`
- New fields: `vendor.portalAccess.userSub`, `order.shippingStatus`, `order.shippingLog`
- Enum updates: `order.status` (add 'pending'), `order.paymentStatus` (add 'pending')
- Undeprecate: `vendorMessage`

**Code Alignment Required:** 5 fas-cms-fresh refactors
- Invoice vendor queries (two-step resolution)
- Wholesale order creation (use customer ref)
- Order patch allowlist (field validation)
- Quote query type (buildQuote instead of quote)
- Vendor profile API (schema field mapping)

**No Changes Required:** 3 patterns confirmed correct
- Discount views as aggregate lists (UX correction only)
- Separate discount models (intentional design)
- Vendor→customer→invoice pattern (existing architecture)

All decisions are explicit, enforceable, and ready for Codex implementation.

## Enforcement Clarifications (Authoritative)

- When schema and code disagree for internal auth artifacts, ALIGN SCHEMA TO CODE.
- Do not relocate fields that are intentionally namespaced (e.g., `portalAccess.*`).
- Prefer Sanity native types (e.g., `slug`) when fas-cms-fresh queries expect them.
- Existing canonical types (e.g., `shippingLogEntryType`) must not be replaced.
- Deprecation flags must reflect actual usage; remove incorrect deprecations.
