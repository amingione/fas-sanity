# Existing Sync Points: Sanity ↔ Medusa Integration Mechanisms

**Generated:** 2026-02-11
**Purpose:** Document all current integration points, workflows, webhooks, and sync mechanisms between Sanity CMS and Medusa.js
**Scope:** Complete runtime integration inventory across all repositories

---

## Overview

The FAS Motorsports e-commerce system maintains **Medusa.js as the commerce authority** and **Sanity.io as the fulfillment mirror + CMS**. Data flows through multiple sync mechanisms:

1. **Webhooks** (event-driven, real-time)
2. **API Endpoints** (request/response, synchronous)
3. **Workflows** (multi-step, orchestrated)
4. **Background Jobs** (scheduled, reconciliation)

---

## 1. Webhook-Based Sync (Real-Time, Event-Driven)

### 1.1 Sanity Product Sync Webhook → Medusa

**File:** `/fas-medusa/src/api/webhooks/sanity-product-sync/route.ts`
**Direction:** Sanity → Medusa (product upsert)
**Trigger:** Sanity product create/update webhook event
**Verification:** HMAC signature via `SANITY_WEBHOOK_SECRET`
**Idempotency:** Event ID deduplication via PostgreSQL `sanity_product_sync_events` table

**Flow:**
1. Sanity fires webhook on product create/update
2. Medusa endpoint receives webhook payload with signature
3. Signature verified using `x-sanity-signature` header
4. Product IDs collected from payload (supports multiple formats: `_id`, `documentId`, `ids[]`)
5. Operation inferred (`upsert` or `delete`)
6. Event ID generated from headers or payload hash
7. Idempotency check: `sanity_product_sync_events` table (skip if duplicate)
8. For each product ID:
   - Invoke `syncSingleProductWorkflow` with retry logic (default: 3 attempts)
   - Exponential backoff between retries (400ms × attempt number)
   - Record success or failure
9. Failed syncs logged to `sanity_product_sync_dead_letter` table
10. Response includes synced count, failed count, and failure details

**Configuration:**
```typescript
{
  sanityConfig: {
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET,
    apiToken: process.env.SANITY_API_TOKEN,
    apiVersion: process.env.SANITY_API_VERSION || "2024-01-01"
  },
  medusaConfig: {
    salesChannelId: process.env.SANITY_SYNC_SALES_CHANNEL_ID,
    shippingProfileId: process.env.SANITY_SYNC_SHIPPING_PROFILE_ID,
    currencyCode: process.env.SANITY_SYNC_CURRENCY || "usd"
  }
}
```

**Database Tables:**
- `sanity_product_sync_events`: Event log with status tracking (processing/success/partial/failed/ignored)
- `sanity_product_sync_dead_letter`: Failed sync attempts with error details

**Retry Strategy:**
- Default max retries: 3 (configurable via `SANITY_SYNC_WEBHOOK_MAX_RETRIES`)
- Exponential backoff: `attempt × 400ms`
- Dead letter queue for permanent failures

**Delete Behavior:**
- Delete events are **acknowledged but not processed** (upsert-only sync)
- Response: `"Delete event acknowledged. Product sync is upsert-only."`

**Payload Compatibility:**
Supports multiple Sanity webhook payload formats:
- `payload.after` (document mutation)
- `payload.before` (document mutation)
- `payload.current` (document query)
- `payload.result` (document query)
- `payload.ids.created`, `payload.ids.updated`, `payload.ids.deleted` (batch operations)
- `payload.documentId` (single document)

**Response Format:**
```json
{
  "received": true,
  "event_id": "sanity-sync-abc123",
  "operation": "upsert",
  "synced_count": 2,
  "failed_count": 1,
  "synced_product_ids": ["prod_123", "prod_456"],
  "failures": [
    {
      "product_id": "prod_789",
      "error": "Missing required field: sku",
      "attempts": 3
    }
  ]
}
```

---

### 1.2 Shippo Tracking Webhook → Medusa

**File:** `/fas-medusa/src/api/webhooks/shippo/route.ts`
**Direction:** Shippo → Medusa (tracking updates)
**Trigger:** Shippo tracking event (shipment status changes)
**Purpose:** Update order fulfillment status based on carrier tracking events

**Status:** Active (webhook handler exists)
**Note:** Full implementation details require reading `/fas-medusa/src/api/webhooks/shippo/route.ts`

---

## 2. API Endpoint Sync (Request/Response, Synchronous)

### 2.1 Order Completion & Sanity Mirroring

**File:** `/fas-cms-fresh/src/pages/api/complete-order.ts`
**Direction:** Medusa → Sanity (order mirror)
**Trigger:** POST request after Medusa order completion
**Frequency:** Per-order (triggered by checkout completion)

**Flow:**
1. Receive POST request with `medusaOrderId` and `paymentIntentId`
2. Fetch complete Medusa order via Medusa API
3. Fetch Stripe Payment Intent via Stripe API
4. Transform order data using mapping functions:
   - `toCanonicalOrderNumber()` → `FAS-######` format
   - `toDollars()` → cents to dollars conversion
   - `normalizePaymentStatus()` → Sanity payment status enum
   - `deriveOrderStatus()` → Sanity order status (priority-based)
   - `buildSanityAddress()` → Sanity address object (fallback chain)
   - `computeShipmentSnapshot()` → weight/dimensions aggregation
5. Idempotency check: Query Sanity for existing order by `medusaOrderId`
6. Create new Sanity order document with ~65 mapped fields
7. Return formatted order number

**Mapping Coverage:**
- 65+ fields mapped from Medusa order + Stripe Payment Intent
- Financial fields (subtotal, shipping, tax, discount, total)
- Customer fields (name, email, phone)
- Address fields (shipping, billing)
- Shipping method (carrier, service, Shippo rate ID)
- Line items (cart array with price conversion)
- Weight/dimensions snapshot (aggregated from line items)
- Payment tracking (payment intent ID, payment status)
- Fulfillment tracking (ops flags: labelPurchased, packingSlipPrinted)
- Timestamps (createdAt, updatedAt, paidAt)

**Idempotency:**
- Queries existing order by `medusaOrderId` before creation
- Skips creation if order already exists
- Returns existing canonical order number

**Error Handling:**
- Throws error if canonical order number derivation fails
- Logs errors but allows creation to succeed (graceful degradation)

**Fields NOT Populated:**
- `customerRef` (email-based linkage happens elsewhere)
- `shippoRates[]` (full snapshot not persisted, only selected rate)
- `shippoRateEstimatedDays` (metadata extraction incomplete)
- `source`, `authoritative` (rely on schema defaults: `"medusa"`, `false`)
- `orderType` (relies on schema default: `"online"`)

---

### 2.2 Vendor Order Creation

**File:** `/fas-cms-fresh/src/pages/api/vendors/create-order.ts`
**Direction:** Manual → Sanity (wholesale order creation)
**Trigger:** POST request from vendor portal UI
**Purpose:** Create wholesale orders directly in Sanity (non-Medusa workflow)

**Status:** Active (endpoint exists)
**Canonical Order Number Enforcement:** Fixed in Phase 2 (removed non-canonical `WS-${Date.now()}` generator)

---

## 3. Workflow-Based Sync (Multi-Step Orchestration)

### 3.1 Sync Single Product Workflow

**File:** `/fas-medusa/src/workflows/sync-single-product.ts`
**Direction:** Sanity → Medusa (product upsert)
**Trigger:** Invoked by Sanity product sync webhook
**Type:** Medusa Workflow (atomic, with compensation/rollback)

**Steps:**

#### Step 1: Fetch Product from Sanity
**File:** `/fas-medusa/src/workflows/steps/fetch-product-from-sanity.ts`
**Purpose:** Retrieve product document from Sanity API
**Input:** `sanityProductId`, Sanity API config
**Output:** Sanity product document (with all fields)

#### Step 2: Validate Product Data
**File:** `/fas-medusa/src/workflows/steps/validate-product-data.ts`
**Purpose:** Verify required fields for Medusa sync
**Validation Rules:**
- Required fields: `title`, `sku`, `price`
- SKU format: `/^[A-Z]{2}-[A-Z0-9]{4}-[A-Z]{3}$/`
- Price: must be positive number in dollars
- Weight/dimensions: optional but recommended

**Input:** Sanity product document
**Output:** Validated product data

#### Step 3: Transform Product Data
**File:** `/fas-medusa/src/workflows/steps/transform-product-data.ts`
**Purpose:** Convert Sanity product format to Medusa format
**Transformations:**
- Price: dollars → cents (`sanityCents = medusaDollars * 100`)
- Weight: pounds → grams (`medusaGrams = sanityPounds * 453.592`)
- Dimensions: inches → cm (`medusaCm = sanityInches * 2.54`)
- Options: Sanity option arrays → Medusa option/value structure
- Tags: Sanity tag strings → Medusa tag IDs

**Input:** Validated product data, Medusa config
**Output:** `medusaInput` (Medusa-compatible product object)

#### Step 4: Upsert Product in Medusa
**File:** `/fas-medusa/src/workflows/steps/upsert-product-in-medusa.ts`
**Purpose:** Create new or update existing Medusa product + variant
**Logic:**
- If `existingMedusaProductId` exists → **UPDATE** product
- If not → **CREATE** new product
- Always upserts single variant (FAS products are single-variant)

**Input:** `medusaInput`, existing IDs
**Output:** `{ productId, variantId, wasCreated }`

#### Step 5: Sync Product Tags
**File:** `/fas-medusa/src/workflows/steps/sync-product-tags.ts`
**Purpose:** Ensure Medusa tags exist and link to product
**Logic:**
- For each tag in Sanity product: Create tag if not exists
- Link all tags to product

**Input:** `productId`, `tags[]`
**Output:** Synced tag IDs

#### Step 6: Update Sanity Metadata
**File:** `/fas-medusa/src/workflows/steps/update-sanity-metadata.ts`
**Purpose:** Write Medusa IDs back to Sanity product
**Fields Updated:**
- `medusaProductId` → Medusa Product ID
- `medusaVariantId` → Medusa ProductVariant ID

**Input:** `sanityProductId`, Sanity API config, Medusa IDs
**Output:** Updated Sanity document

**Rollback Behavior:**
- If any step fails, all previous steps are compensated
- Created products are deleted
- Tags are restored to original state
- Sanity metadata is restored

**Workflow Output:**
```typescript
{
  success: boolean
  productId: string        // Medusa Product ID
  variantId: string        // Medusa ProductVariant ID
  sanityProductId: string  // Sanity document ID
  wasCreated: boolean      // true if new product, false if updated
}
```

---

## 4. Background Jobs & Scheduled Sync

### 4.1 Webhook Auto-Sync Handler (Mentioned in Phase 2)

**Status:** Implemented (Phase 2 completion)
**Purpose:** Automated webhook event processing
**Details:** Likely refers to the Sanity product sync webhook handler (`/fas-medusa/src/api/webhooks/sanity-product-sync/route.ts`)

---

### 4.2 Daily Reconciliation System (Mentioned in Phase 2)

**Status:** Implemented (Phase 2 completion)
**Purpose:** Daily sync verification and correction
**Scope:** Unknown (requires further investigation)
**Possible Responsibilities:**
- Verify Sanity products have Medusa IDs
- Detect orphaned products (Medusa products without Sanity mirror)
- Retry failed webhook syncs from dead letter queue
- Sync inventory levels
- Reconcile order status mismatches

**Note:** Implementation details require reading relevant background job code.

---

## 5. Manual Sync Processes

### 5.1 Customer Linkage (Email-Based)

**Status:** Post-processing (not automated at order mirror time)
**Purpose:** Link Sanity orders to Sanity customers via email
**Process:**
1. Order created with `customerEmail` but no `customerRef`
2. Separate process queries Sanity customers by email
3. Updates order with `customerRef` to customer document

**Gap:** Not automated in `complete-order.ts` (see pipeline-gaps.md)

---

### 5.2 Shippo Rate Snapshot Preservation

**Status:** Not implemented
**Purpose:** Preserve full Shippo rate array for historical comparison
**Current Behavior:**
- Only selected rate persisted via Payment Intent metadata
- Full `shippoRates[]` array not populated

**Gap:** Historical rate comparison unavailable (see pipeline-gaps.md)

---

## 6. Sync Mechanism Summary

| Mechanism | Direction | Trigger | Frequency | Idempotency | Retry Logic |
|-----------|-----------|---------|-----------|-------------|-------------|
| Sanity Product Sync Webhook | Sanity → Medusa | Product create/update | Real-time | Event ID dedup | 3 retries with backoff |
| Shippo Tracking Webhook | Shippo → Medusa | Tracking event | Real-time | Unknown | Unknown |
| Order Completion API | Medusa → Sanity | Checkout complete | Per-order | medusaOrderId check | None (single attempt) |
| Vendor Order API | Manual → Sanity | Vendor portal submit | Per-order | Unknown | Unknown |
| Sync Single Product Workflow | Sanity → Medusa | Webhook invocation | Real-time | Workflow framework | 3 retries (webhook layer) |
| Daily Reconciliation | Both directions | Scheduled (daily) | Daily | Unknown | Unknown |

---

## 7. Data Flow Diagrams

### 7.1 Product Sync Flow (Sanity → Medusa)

```
┌─────────────────────────────────────────────────────────────────┐
│ Sanity CMS                                                      │
│   Product Created/Updated                                       │
└────────────────┬────────────────────────────────────────────────┘
                 │ Webhook Event (HMAC signed)
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Medusa Webhook Handler                                         │
│   /api/webhooks/sanity-product-sync                            │
│   - Verify signature                                           │
│   - Extract product IDs                                        │
│   - Check idempotency (sanity_product_sync_events table)      │
└────────────────┬────────────────────────────────────────────────┘
                 │ Invoke Workflow
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sync Single Product Workflow                                   │
│   Step 1: Fetch from Sanity API                               │
│   Step 2: Validate required fields                            │
│   Step 3: Transform (dollars→cents, lbs→grams, in→cm)         │
│   Step 4: Upsert in Medusa (create or update)                 │
│   Step 5: Sync tags (create + link)                           │
│   Step 6: Update Sanity metadata (write back IDs)             │
└────────────────┬────────────────────────────────────────────────┘
                 │ Success
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sanity Product Document                                        │
│   medusaProductId: "prod_abc123"                               │
│   medusaVariantId: "variant_xyz789"                            │
└─────────────────────────────────────────────────────────────────┘
```

**Error Path:**
```
Workflow Failure
    │
    ▼
Retry (up to 3 attempts)
    │
    ├─ Success → Update Sanity metadata
    │
    └─ All retries failed
           │
           ▼
       Dead Letter Queue
       (sanity_product_sync_dead_letter table)
```

---

### 7.2 Order Sync Flow (Medusa → Sanity)

```
┌─────────────────────────────────────────────────────────────────┐
│ Storefront Checkout                                            │
│   POST /api/complete-order                                     │
│   { medusaOrderId, paymentIntentId }                           │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Complete Order Handler                                         │
│   /fas-cms-fresh/src/pages/api/complete-order.ts              │
│   - Fetch Medusa order (Medusa API)                           │
│   - Fetch Payment Intent (Stripe API)                         │
│   - Check idempotency (query Sanity by medusaOrderId)         │
└────────────────┬────────────────────────────────────────────────┘
                 │ Transform Data
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Data Transformation                                            │
│   - Order number canonicalization (FAS-######)                │
│   - Price conversion (cents → dollars)                        │
│   - Status derivation (multi-field priority)                  │
│   - Address normalization (fallback chain)                    │
│   - Shipment snapshot (weight/dimensions aggregation)         │
└────────────────┬────────────────────────────────────────────────┘
                 │ Create Document
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sanity Order Document                                          │
│   65+ fields mirrored from Medusa + Stripe                    │
│   Read-only mirror (authoritative: false)                     │
│   Fulfillment UI fields (labelPurchased, packingSlipPrinted)  │
└─────────────────────────────────────────────────────────────────┘
```

**Idempotency:**
```
Check Existing Order
    │
    ├─ Exists → Skip creation, return existing orderNumber
    │
    └─ Not exists → Create new order document
```

---

## 8. Integration Point Configuration

### 8.1 Environment Variables

**Sanity Product Sync Webhook:**
```bash
# Required
SANITY_PROJECT_ID=<project-id>
SANITY_DATASET=<dataset-name>
SANITY_API_TOKEN=<api-token>

# Optional
SANITY_API_VERSION=2024-01-01  # default
SANITY_WEBHOOK_SECRET=<hmac-secret>
SANITY_WEBHOOK_VERIFY=true  # enable signature verification
SANITY_SYNC_WEBHOOK_MAX_RETRIES=3  # default
SANITY_SYNC_SALES_CHANNEL_ID=<sales-channel-id>
SANITY_SYNC_SHIPPING_PROFILE_ID=<shipping-profile-id>
SANITY_SYNC_CURRENCY=usd  # default
```

**Order Completion Sync:**
```bash
# Required
MEDUSA_API_URL=<medusa-backend-url>
STRIPE_SECRET_KEY=<stripe-secret>
SANITY_PROJECT_ID=<project-id>
SANITY_DATASET=<dataset-name>
SANITY_API_TOKEN=<api-token>

# Optional
SHIPPO_WEIGHT_UNIT=lb  # default pound
```

---

## 9. Sync Failure Handling

### 9.1 Product Sync Failures

**Detection:**
- Workflow step exceptions
- Validation errors (missing required fields, invalid SKU format)
- API errors (Sanity API timeout, Medusa API 500)

**Response:**
1. Retry workflow (up to 3 attempts with exponential backoff)
2. Log to `sanity_product_sync_dead_letter` table
3. Return failure details in webhook response
4. Dead letter queue available for manual retry or investigation

**Dead Letter Schema:**
```sql
CREATE TABLE sanity_product_sync_dead_letter (
  id bigserial PRIMARY KEY,
  event_id text NOT NULL,
  product_id text NOT NULL,
  attempts integer NOT NULL,
  last_error text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

### 9.2 Order Sync Failures

**Detection:**
- Canonical order number derivation failure
- Sanity API create failure

**Response:**
- Throws error (no retry logic)
- Error logged but order completion may still succeed in Medusa
- Manual intervention required

**Risk:** Order exists in Medusa but not in Sanity (orphaned order)

---

## 10. Sync Monitoring & Observability

### 10.1 Product Sync Event Log

**Table:** `sanity_product_sync_events`
**Purpose:** Track all webhook events and their processing status

**Schema:**
```sql
CREATE TABLE sanity_product_sync_events (
  event_id text PRIMARY KEY,
  operation text NOT NULL,          -- 'upsert' or 'delete'
  status text NOT NULL DEFAULT 'processing',  -- 'processing', 'success', 'partial', 'failed', 'ignored'
  product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb,
  synced_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  errors jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
```

**Query Examples:**
```sql
-- Find all failed sync events
SELECT * FROM sanity_product_sync_events WHERE status = 'failed';

-- Find all partial successes (some products synced, some failed)
SELECT * FROM sanity_product_sync_events WHERE status = 'partial';

-- Find recent sync events
SELECT * FROM sanity_product_sync_events
ORDER BY created_at DESC LIMIT 100;
```

---

### 10.2 Dead Letter Queue

**Table:** `sanity_product_sync_dead_letter`
**Purpose:** Track permanently failed product sync attempts

**Query Examples:**
```sql
-- Find all failed syncs for a specific product
SELECT * FROM sanity_product_sync_dead_letter
WHERE product_id = 'prod_abc123';

-- Find most common failure reasons
SELECT last_error, COUNT(*) as count
FROM sanity_product_sync_dead_letter
GROUP BY last_error
ORDER BY count DESC;

-- Find products that have failed multiple times
SELECT product_id, COUNT(*) as failure_count, MAX(last_error) as last_error
FROM sanity_product_sync_dead_letter
GROUP BY product_id
HAVING COUNT(*) > 1
ORDER BY failure_count DESC;
```

---

## 11. Integration Gaps & Missing Sync Points

### 11.1 Customer Sync (No Automated Mechanism)

**Current State:** Manual linkage via email
**Gap:** No webhook or API endpoint for Medusa Customer → Sanity Customer sync
**Impact:** Customer profiles not automatically created/updated in Sanity

**Workaround:** Post-processing script to link orders to customers by email

---

### 11.2 Order Status Updates (No Reverse Sync)

**Current State:** One-way sync (Medusa → Sanity)
**Gap:** Sanity order status changes do NOT sync back to Medusa
**Impact:** Manual ops annotations (opsFlags, opsNotes) stay in Sanity only

**Rationale:** Medusa is authoritative; Sanity is read-only mirror + ops UI

---

### 11.3 Inventory Sync (Unknown Status)

**Current State:** Unknown
**Gap:** No documented sync mechanism for Medusa inventory → Sanity `product.inventory.quantity`
**Impact:** Sanity product inventory may be stale

**Requires Investigation:** Check for background job or webhook

---

### 11.4 Full Shippo Rates Snapshot (Not Persisted)

**Current State:** Only selected rate persisted
**Gap:** Full `shippoRates[]` array not populated in Sanity order
**Impact:** Historical rate comparison unavailable

**Recommendation:** Persist all rates from Shippo quote API to `order.shippoRates[]`

---

## 12. Sync Performance Characteristics

### 12.1 Product Sync

**Latency:**
- Webhook delivery: <1 second (Sanity guarantee)
- Workflow execution: 2-5 seconds (typical)
- Total: 3-6 seconds (product create/update → Medusa sync)

**Throughput:**
- Batch webhook: Supports multiple product IDs per event
- Sequential processing: One product at a time within event
- Dead letter queue prevents blocking on failures

---

### 12.2 Order Sync

**Latency:**
- API request: Synchronous (blocking)
- Medusa API fetch: 500ms-1s
- Stripe API fetch: 200ms-500ms
- Sanity create: 300ms-800ms
- Total: 1-2.5 seconds (order complete → Sanity mirror)

**Throughput:**
- Per-order sync (not batched)
- No retry logic (single attempt)

---

## 13. Future Sync Enhancements

### 13.1 Recommended Additions

1. **Customer Sync Webhook**
   - Medusa Customer → Sanity Customer
   - Auto-create/update customer records
   - Eliminate manual email linkage

2. **Inventory Level Sync**
   - Medusa inventory updates → Sanity product
   - Real-time inventory accuracy in CMS

3. **Order Status Update Reconciliation**
   - Daily job to sync Medusa order status changes back to Sanity
   - Catch missed webhook events

4. **Full Shippo Rates Persistence**
   - Persist all rates (not just selected) to `order.shippoRates[]`
   - Enable historical rate analysis

5. **Webhook Replay Utility**
   - CLI tool to replay failed events from dead letter queue
   - Manual retry without re-triggering Sanity webhook

---

**END OF EXISTING SYNC POINTS DOCUMENTATION**
