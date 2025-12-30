# Contract Decisions: Separate Create Shipping Label vs Fulfill Order Behavior

**Document Type:** Authoritative Contract Decisions
**Status:** BINDING
**Scope:** fas-sanity ONLY
**Created:** 2025-12-29
**Authority:** Decision Authority for Codex Implementation

---

## EXECUTIVE SUMMARY

The "Create Shipping Label" and "Fulfill Order" document actions in fas-sanity are incorrectly coupled.

**Root Cause:** "Create Shipping Label" makes an invalid fetch call to `/api/create-shipping-label` which does not exist on the deployed Sanity Studio domain (`fassanity.fasmotorsports.com`), causing 404 failures. Meanwhile, "Fulfill Order" creates a shipping label, opens it automatically, and marks the order as fulfilled—combining three distinct responsibilities that should be separated.

**Why Separation Is Required:** Shipping label creation is a preparatory logistics step (generate, review, store metadata) that must not automatically trigger fulfillment state changes. Order fulfillment is a distinct business workflow (mark shipped, notify customer, update status) that should not automatically create labels or assume EasyPost integration. These are orthogonal concerns that must operate independently.

---

## DECISIONS

### SCHEMA CHANGES

**REJECTED**

The order schema already contains all required fields for shipping label storage and fulfillment tracking:

- `shippingLabelUrl`, `shippingLabelFile`, `trackingNumber`, `trackingUrl`
- `shippingStatus` (object), `shippingLog` (array)
- `labelPurchased` (boolean flag)
- `fulfillment.status`

No schema changes are required. All existing fields remain unchanged.

---

### LOGIC CHANGES

**APPROVED**

#### Create Shipping Label Behavior

**File:** `packages/sanity-config/src/schemaTypes/actions/orderActions.ts`

**Current Broken Path:**

- Calls `POST /api/create-shipping-label` (does not exist)
- Returns 404 on deployed Studio

**Authoritative Backend Function:**

- `netlify/functions/easypostCreateLabel.ts` → exported function `createEasyPostLabel(options)`
- This function is already deployed as a Netlify Function accessible at `/.netlify/functions/easypostCreateLabel`

**Exact Logic Path (APPROVED):**

1. **Precondition Checks:**
   - Order must be saved (`doc._id` exists)
   - Shipping address must exist (`doc.shippingAddress` populated)
   - Label must NOT already be purchased (`!doc.labelPurchased`)

2. **Shipment Data Sourcing:**
   - **Derived from order:** `doc.packageDimensions` (weight, length, width, height)
   - **User-editable inputs (if missing):** Prompt user with defaults: `weight: 2, length: 10, width: 8, height: 4`
   - **Carrier/Service:** Use `doc.carrier`, `doc.service`, `doc.easypostRateId` if available; otherwise backend selects lowest rate

3. **User Confirmation:**
   - Display confirmation dialog showing:
     - Order number
     - Customer name
     - Shipping address (city, state)
     - Selected carrier/service
     - Warning: "This will charge your EasyPost account."

4. **Backend Invocation:**
   - **Endpoint:** `/.netlify/functions/easypostCreateLabel`
   - **Method:** POST
   - **Payload:**
     ```typescript
     {
       orderId: string,              // Sanity order _id (without drafts. prefix)
       invoiceId?: string,           // Optional
       rateId?: string,              // From doc.easypostRateId if available
       weightOverride?: number,      // User-entered weight (lbs)
       dimensionsOverride?: {        // User-entered dimensions (inches)
         length: number,
         width: number,
         height: number
       },
       packageDetails?: {            // Combined override
         weight: number,
         dimensions: {length, width, height}
       }
     }
     ```
   - **Authority:** `netlify/functions/easypostCreateLabel.ts` function `createEasyPostLabel()`

5. **Response Handling:**
   - **Success Response Fields (from backend):**
     - `trackingNumber`: string
     - `labelUrl`: string (Sanity asset URL or EasyPost URL)
     - `carrier`: string
     - `service`: string
     - `cost`: number
   - **Display alert:**

     ```
     ✅ Shipping label created!

     Tracking: [trackingNumber]
     Carrier: [carrier]
     Service: [service]
     Cost: $[cost]
     ```

   - **Print Label Confirmation (using browser confirm dialog):**
     - After success alert, display `window.confirm()`: "Open shipping label for printing?"
     - If user clicks OK, open `labelUrl` in new window/tab
     - If user clicks Cancel, do nothing
     - Do NOT automatically open label—user must explicitly confirm

6. **Order Persistence (handled by backend):**
   - Backend (`createEasyPostLabel()`) already patches the order with:
     - `shippingLabelUrl`, `shippingLabelFile`, `trackingNumber`, `trackingUrl`
     - `shippingStatus` object
     - Appends to `shippingLog[]`
     - Sets `labelPurchasedFrom`, `labelCreatedAt`, `labelCost`
     - Sets `easyPostShipmentId`, `easyPostTrackerId`

**MUST NOT:**

- Automatically mark order as fulfilled
- Modify `fulfillment.status` field
- Modify `status` field (leave as `paid`)
- Set `shippedAt` timestamp
- Send customer notifications
- Open label URL automatically (require explicit user action)

---

#### Fulfill Order Behavior

**File:** `packages/sanity-config/src/schemaTypes/documents/order.actions.ts`

**Current Excessive Path:**

- Calls Netlify function `fulfillOrder`
- Backend creates label, patches order, sends email
- Frontend opens label URL automatically (lines 130-136)

**Exact Logic Path (APPROVED):**

1. **Precondition Checks:**
   - Order status must be `paid` (in `FULFILLABLE_STATUSES`)
   - Order must be published (`doc._id` without drafts. prefix)

2. **Fulfillment Dialog (using browser prompts/confirms):**
   - **Sequential prompts for manual fulfillment workflow:**
     - **Tracking Number:** `window.prompt()` with optional input
       - Message: "Enter tracking number (optional):\n\nLeave empty for manual/in-store fulfillment."
       - Pre-fill with `doc.trackingNumber` if exists
       - If user cancels, abort fulfillment
     - **Fulfillment Status:** `window.confirm()` for binary choice
       - Message: "Mark order as shipped?\n\nClick OK to mark as SHIPPED.\nClick Cancel to mark as PROCESSING."
       - Result: OK → 'shipped', Cancel → 'processing'
     - **Notes (optional):** `window.prompt()` for optional notes
       - Can be omitted for simplicity
   - **Allow fulfillment without tracking:**
     - User can leave tracking number empty for manual/in-store pickups

3. **Backend Invocation:**
   - **REMOVED:** Do NOT call `fulfillOrder` Netlify function for label creation
   - **NEW:** Perform direct Sanity client patch using `getClient()`
   - **No external API calls** - all changes made via Sanity client only

4. **Order State Update:**
   - Patch order document:
     ```typescript
     {
       status: 'fulfilled',                    // Update order lifecycle
       'fulfillment.status': fulfillmentStatus, // Update fulfillment sub-state
       shippedAt: new Date().toISOString(),    // Timestamp
       trackingNumber: trackingNumber || existing, // Use provided or keep existing
       fulfillmentNotes: notes || undefined
     }
     ```
   - Append to `shippingLog[]`:
     ```typescript
     {
       _type: 'shippingLogEntry',
       status: 'fulfilled',
       message: 'Order marked as fulfilled by [user]',
       trackingNumber: trackingNumber || undefined,
       createdAt: timestamp
     }
     ```

5. **Customer Notification:**
   - **REMOVED:** Email sending is NOT handled by this action
   - **Rationale:** Keeps action focused on state changes only
   - **Alternative:** Users can manually trigger email via existing "Send Shipping Confirmation" action (already in `orderActions.ts`)

6. **Response Handling:**
   - Display alert: "Order marked as fulfilled."
   - Call `onComplete()` to refresh document view

**MUST NOT:**

- Automatically create shipping labels
- Call EasyPost API for label generation
- Assume EasyPost integration is available
- Fail or block fulfillment if tracking number is missing
- Automatically open label URLs
- Require label creation before fulfillment
- Send customer emails (delegated to separate action or backend)

---

### Backend Invocation Rules

**Create Shipping Label:**

- **Endpoint:** `/.netlify/functions/easypostCreateLabel`
- **Authority:** `netlify/functions/easypostCreateLabel.ts` → `createEasyPostLabel()`
- **Input Contract (from audit + code):**
  - `orderId` (required): Sanity order \_id
  - `weightOverride` (optional): User-entered weight in lbs (number)
  - `dimensionsOverride` (optional): `{length, width, height}` in inches
  - `rateId` (optional): EasyPost rate ID if pre-selected
- **Output Contract (from code lines 402-423):**
  - `success`: boolean
  - `trackingNumber`: string
  - `labelUrl`: string (Sanity asset URL)
  - `carrier`: string
  - `service`: string
  - `cost`: number
  - `labelCreatedAt`: ISO timestamp
- **Persistence:** Backend handles all order patching (lines 689-741)

**Fulfill Order:**

- **Current Netlify Function:** `netlify/functions/fulfillOrder.ts` (NOT USED - removed from action)
- **New Approach:** Direct Sanity client patch using `getClient()` from action context
- **Rationale:** Fulfillment is a simple state change, not a label-creation or email-sending workflow
- **No Backend API Call:** All changes performed client-side via Sanity client
- **Implementation:**
  - Use `context.getClient({apiVersion: SANITY_API_VERSION})` to get client
  - Patch order document directly with status, timestamp, tracking, notes
  - Append entry to `shippingLog` array
  - No network calls except Sanity mutation

---

### QUERY / DESK STRUCTURE CHANGES

**REJECTED**

No changes to Sanity Desk structure or GROQ queries are required. The document actions remain accessible in the same location within the order document action menu.

---

### DATA INTEGRITY RULES

**Explicit Invariants (MUST HOLD):**

1. **Label Purchase Flag:**
   - `labelPurchased` is set by backend when `shippingLabelUrl` is persisted
   - "Create Shipping Label" action is disabled if `labelPurchased === true`
   - Users cannot purchase duplicate labels for the same order

2. **Fulfillment Independence:**
   - Orders CAN be fulfilled without shipping labels (manual/in-store workflows)
   - Orders CAN have labels created without fulfillment (prepare-then-fulfill workflow)
   - `fulfillment.status` and `shippingLabelUrl` are independent fields

3. **Tracking Number Authority:**
   - EasyPost-generated tracking numbers are authoritative (from label creation)
   - Manual tracking numbers are allowed (user-entered during fulfillment)
   - Existing tracking numbers MUST NOT be overwritten unless explicitly changed

4. **Order Status Lifecycle:**
   - `status: 'paid'` → Label creation does NOT change status
   - `status: 'paid'` → Fulfillment changes to `status: 'fulfilled'`
   - `status: 'fulfilled'` → Label creation is still allowed (retroactive label purchase)

5. **Shipping Log Integrity:**
   - Each label creation appends one `shippingLogEntry` with `status: 'label_created'`
   - Each fulfillment appends one `shippingLogEntry` with `status: 'fulfilled'`
   - Log entries are immutable (never deleted or modified)

6. **Email Notification Rules:**
   - Label creation: NO customer emails
   - Fulfillment: Email ONLY if tracking number exists AND `notifyCustomer === true`

---

### FORBIDDEN CHANGES

**Codex is NOT ALLOWED to:**

1. **Add New Schema Fields:**
   - Do NOT add `labelPurchased` (already exists)
   - Do NOT add `fulfillmentMethod`, `fulfillmentType`, or similar
   - Do NOT add top-level `workflowStatus` (wholesale uses `wholesaleDetails.workflowStatus`)

2. **Modify Existing Field Types:**
   - Do NOT change `shippingStatus` from object to string
   - Do NOT change `shippingLog` from array to object
   - Do NOT rename `labelPurchased` to `labelCreated`

3. **Change Backend Function Signatures:**
   - Do NOT modify `createEasyPostLabel()` input/output contracts
   - Do NOT add required parameters to existing functions
   - Do NOT remove existing metadata fields from EasyPost payloads

4. **Couple Label and Fulfillment:**
   - Do NOT require label creation before fulfillment
   - Do NOT automatically trigger fulfillment after label creation
   - Do NOT fail fulfillment if EasyPost is unavailable

5. **Break Existing Integrations:**
   - Do NOT change EasyPost webhook handling
   - Do NOT modify `shippingLogEntry` type definition
   - Do NOT alter `fulfillment.status` enum values

6. **Introduce Provider-Specific UI:**
   - Do NOT add "EasyPost Settings" section to order form
   - Do NOT expose EasyPost shipment IDs in action labels
   - Do NOT hardcode carrier names in fulfillment dropdown

---

### ROLLBACK SAFETY

**Why This Change Cannot Affect Unrelated Behavior:**

1. **Isolated Action Files:**
   - Changes are confined to:
     - `packages/sanity-config/src/schemaTypes/actions/orderActions.ts` (Create Shipping Label)
     - `packages/sanity-config/src/schemaTypes/documents/order.actions.ts` (Fulfill Order)
   - No changes to other document actions (Generate Packing Slip, Cancel Order, Refund Order, View Invoice, Delete Order)

2. **Backward-Compatible Field Usage:**
   - Both actions read/write existing schema fields
   - No new fields introduced
   - Existing orders with labels/fulfillment remain valid

3. **Backend Function Stability:**
   - `createEasyPostLabel()` is already in production use
   - Changing frontend invocation from `/api/*` to `/.netlify/functions/*` does not alter backend logic
   - `fulfillOrder` Netlify function can remain deployed for backward compatibility if needed

4. **Independent Workflows:**
   - Label creation workflow does not depend on fulfillment state
   - Fulfillment workflow does not depend on label existence
   - Either action can be skipped without breaking the other

5. **No Database Migrations Required:**
   - Schema fields already exist
   - No data transformation needed
   - Existing orders work with new logic

6. **Gradual Rollout Support:**
   - "Create Shipping Label" fix can deploy independently
   - "Fulfill Order" changes can deploy independently
   - No coupling between deployment order

**Rollback Path:**

- Revert action file changes → restore original behavior
- No Sanity migrations to undo
- No data cleanup required

---

## ALIGNMENT TO EASYPOST FUNCTION

### Authoritative Backend Function

**File:** `netlify/functions/easypostCreateLabel.ts`
**Function:** `createEasyPostLabel(options: CreateEasyPostLabelOptions)`
**Lines:** 452-811

### Input Contract (Exact Fields)

**Required:**

- `orderId: string` — Sanity order document ID (without `drafts.` prefix)

**Optional (User-Editable or Derived):**

- `invoiceId?: string` — Optional invoice reference
- `rateId?: string` — EasyPost rate ID if pre-selected
- `selectedRate?: {id?: string}` — Alternative rate selection
- `weightOverride?: WeightInput` — User-entered weight (lbs or ounces)
- `dimensionsOverride?: DimensionsInput` — User-entered dimensions (inches)
- `packageDetails?: {weight?: WeightInput; dimensions?: DimensionsInput}` — Combined override
- `reference?: string` — Custom reference (defaults to orderNumber)

**Not User-Editable (Derived from Order):**

- `shipTo?: EasyPostAddress` — Derived from `order.shippingAddress`
- `shipFrom?: EasyPostAddress` — Derived from env vars + `getEasyPostFromAddress()`

### Field Resolution Logic (from code)

**Weight Sourcing (lines 486-492):**

1. Check `packageDetails.weight`
2. Else check `weightOverride`
3. Else check `order.weight`
4. Else calculate from `order.cart` items (function `calculatePackageDetails`, lines 49-105)
5. Fallback: `DEFAULT_PACKAGE_WEIGHT_LBS` env var (default: 5 lbs)

**Dimensions Sourcing (lines 489-496):**

1. Check `packageDetails.dimensions`
2. Else check `dimensionsOverride`
3. Else check `order.dimensions`
4. Else calculate from `order.cart` items (function `calculatePackageDetails`)
5. Fallback: `{length: 12, width: 12, height: 8}` (lines 51-53)

**Rate Selection (lines 557-570):**

1. Check `rateId` parameter
2. Else check `selectedRate.id`
3. Else check `packageDetails.rateId`
4. Else use lowest-cost rate from EasyPost response (sorted by amount)

### Response Fields (Exact Contract)

**Type:** `EasyPostLabelResult` (lines 402-423)

**Fields Returned:**

- `success: boolean` — Always `true` on success
- `provider: 'easypost'` — Literal string
- `shipmentId: string` — EasyPost shipment ID
- `trackerId?: string` — EasyPost tracker ID
- `labelUrl?: string` — Sanity asset URL (persisted PDF) or EasyPost URL
- `labelAssetUrl?: string` — Sanity asset URL (if persisted)
- `labelAssetId?: string` — Sanity asset document ID
- `providerLabelUrl?: string` — Original EasyPost PDF URL
- `packingSlipUrl?: string` — EasyPost packing slip URL
- `qrCodeUrl?: string` — EasyPost label QR code URL
- `trackingNumber?: string` — Carrier tracking number
- `trackingUrl?: string` — Public tracking URL
- `cost?: number` — Label cost (USD, 2 decimal places)
- `rate?: number` — Same as `cost`
- `currency?: string` — Currency code (default: "USD")
- `status?: string` — EasyPost status (e.g., "label_created")
- `carrier?: string` — Carrier name (e.g., "USPS", "FedEx")
- `service?: string` — Service level (e.g., "Priority", "Ground")
- `labelCreatedAt?: string` — ISO timestamp
- `labelCost?: number` — Same as `cost`

### Order Persistence (Handled by Backend)

**Lines 689-741:** Backend automatically patches the order document with:

```typescript
{
  shippingLabelUrl: labelUrl,
  shippingLabelFile: {_type: 'file', asset: {_ref: assetId}},
  trackingNumber: trackingCode,
  trackingUrl: trackingUrl,
  shippingStatus: {
    carrier: string,
    service: string,
    labelUrl: string,
    trackingCode: string,
    trackingUrl: string,
    status: 'label_created',
    cost: number,
    currency: string,
    lastEventAt: ISO timestamp
  },
  easyPostShipmentId: string,
  easyPostTrackerId: string,
  labelCreatedAt: ISO timestamp,
  labelCost: number,
  labelPurchasedFrom: carrier name,
  'fulfillment.status': 'label_created',
  carrier: carrier name,
  service: service name,
  shippedAt: ISO timestamp (label creation time),
  easypostRateId: rate ID (if available),
  deliveryDays: number (if available),
  estimatedDeliveryDate: YYYY-MM-DD (if available),
  packingSlipUrl: string (if available),
  qrCodeUrl: string (if available)
}
```

**Append to `shippingLog[]`:**

```typescript
{
  _type: 'shippingLogEntry',
  status: 'label_created',
  message: 'Label generated via EasyPost ([carrier] – [service])',
  labelUrl: string,
  trackingNumber: string,
  trackingUrl: string,
  weight: number (lbs, 2 decimals),
  createdAt: ISO timestamp
}
```

### Forbidden Actions (Per Audit)

**Codex MUST NOT:**

- Invent new EasyPost parameters not in `CreateEasyPostLabelOptions` type
- Redesign the `createEasyPostLabel()` function interface
- Assume defaults not documented in code (lines 56, 94-95, 99-103)
- Delegate payload construction to frontend (backend handles transformation)
- Modify field names in response payload (exact match to `EasyPostLabelResult` type)

---

## READY FOR CODEX ENFORCEMENT

This document is the authoritative contract for Codex implementation. All decisions are binding and must be implemented exactly as specified. No deviations, additions, or "improvements" beyond this contract are permitted.

**Implementation Order:**

1. Fix "Create Shipping Label" endpoint invocation (change to Netlify function)
2. Separate "Fulfill Order" from label creation logic
3. Add fulfillment modal with manual tracking entry
4. Test both actions independently

**Success Criteria:**

- "Create Shipping Label" successfully calls `/.netlify/functions/easypostCreateLabel`
- Label creation does NOT change order status or send emails
- "Fulfill Order" allows fulfillment without requiring labels
- Both actions can be performed independently in any order

---

**End of Contract Decisions**
