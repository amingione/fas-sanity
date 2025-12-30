# Feasibility Assessment: Create Shipping Label vs Fulfill Order Enforcement

**Document Type:** Feasibility Analysis
**Status:** BLOCKING ISSUES IDENTIFIED
**Created:** 2025-12-29
**Scope:** fas-sanity enforcement prompt validation

---

## EXECUTIVE SUMMARY

The enforcement prompt contains **FOUR BLOCKING ISSUES** that prevent implementation within the approved file constraints. Three issues have feasible workarounds using native browser dialogs; one issue (email sending) is a **CRITICAL BLOCKER** requiring contract amendment.

---

## ISSUE 1: Print Label Button (FEASIBLE)

### Requirement
> "Add: Display 'Print Shipping Label' button/link"
> "Require explicit user click to open labelUrl"

### Current Implementation
`orderActions.ts` uses `alert()` for success messages (lines 193-199):
```typescript
alert(
  `✅ Shipping label created!\n\n` +
  `Tracking: ${trackingNumber || 'Pending'}\n` +
  ...
)
onComplete()
if (labelUrl) openUrl(labelUrl)  // Line 201 - AUTO-OPENS
```

### Problem
- No React components or UI surface for a "button"
- Only uses browser native `alert()` and `window.confirm()`
- Can't render clickable button inside alert dialog

### FEASIBLE SOLUTION ✅
Use a second `confirm()` dialog after the success alert:

```typescript
alert(
  `✅ Shipping label created!\n\n` +
  `Tracking: ${trackingNumber || 'Pending'}\n` +
  `Carrier: ${carrier || 'n/a'}\n` +
  `Service: ${service || 'n/a'}\n` +
  (costLabel ? `Cost: $${costLabel}\n` : '')
)

// NEW: Require explicit confirmation before opening
if (labelUrl && window.confirm('Open shipping label for printing?')) {
  openUrl(labelUrl)
}

onComplete()
```

**Rationale:**
- Uses existing browser native dialogs (no new UI components)
- Requires explicit user interaction (confirm click)
- No additional files or dependencies needed
- Stays within approved file: `orderActions.ts`

**Approved?** YES - if contract accepts `confirm()` dialog as "button/link" equivalent

---

## ISSUE 2: Fulfillment Modal (FEASIBLE)

### Requirement
> "Add: Fulfillment modal/dialog for manual workflow"
> "Fields: Tracking Number (input), Fulfillment Status (dropdown), Notes (textarea), Notify Customer (checkbox)"

### Current Implementation
`order.actions.ts` uses `alert()` only for completion message (line 138):
```typescript
try {
  const res = await callFn('fulfillOrder', {orderId})
  // ... response handling ...
  alert('Order fulfilled and customer notified.')
} catch (error) {
  alert(error?.message || 'Unable to fulfill order')
}
```

### Problem
- No modal UI components available
- No form inputs, dropdowns, or checkboxes
- Only browser native dialogs (`alert`, `confirm`, `prompt`)

### FEASIBLE SOLUTION ✅
Use sequential `prompt()` and `confirm()` dialogs:

```typescript
// Prompt for tracking number
const trackingNumber = window.prompt(
  'Enter tracking number (optional):\n\n' +
  'Leave empty for manual/in-store fulfillment.',
  doc.trackingNumber || ''  // Pre-fill if exists
)

// If user cancels, abort
if (trackingNumber === null) {
  props.onComplete()
  return
}

// Prompt for fulfillment status (simplified to binary choice)
const markAsShipped = window.confirm(
  'Mark order as shipped?\n\n' +
  'Click OK to mark as SHIPPED.\n' +
  'Click Cancel to mark as PROCESSING.'
)
const fulfillmentStatus = markAsShipped ? 'shipped' : 'processing'

// Prompt for customer notification (only if tracking exists)
let notifyCustomer = false
if (trackingNumber && trackingNumber.trim()) {
  notifyCustomer = window.confirm(
    'Send shipping confirmation email to customer?\n\n' +
    `Email: ${doc.customerEmail || 'N/A'}\n` +
    `Tracking: ${trackingNumber}`
  )
}

// Optional notes (can be omitted for simplicity)
const notes = window.prompt('Add fulfillment notes (optional):')
```

**Rationale:**
- Uses existing browser native dialogs
- No new UI components or dependencies
- Stays within approved file: `order.actions.ts`
- Simplified UX but functionally equivalent

**Limitations:**
- Can't render a true "dropdown" with 4 options (unfulfilled, processing, shipped, delivered)
- Compromise: Use binary choice (shipped vs processing) via `confirm()`
- Notes field is optional and can be omitted if too complex

**Approved?** YES - if contract accepts simplified prompt-based workflow

---

## ISSUE 3: ShippingLog Schema (RESOLVED)

### Requirement
> "Append to shippingLog[]: {_type: 'shippingLogEntry', status, message, ...}"

### Current Implementation
Schema exists: `packages/sanity-config/src/schemaTypes/objects/shippingLogEntryType.ts`

```typescript
export const shippingLogEntryType = defineType({
  name: 'shippingLogEntry',
  type: 'object',
  fields: [
    {name: 'status', type: 'string'},
    {name: 'message', type: 'text'},
    {name: 'labelUrl', type: 'url'},
    {name: 'trackingUrl', type: 'url'},
    {name: 'trackingNumber', type: 'string'},
    {name: 'weight', type: 'number'},
    {name: 'createdAt', type: 'datetime'},
  ],
})
```

### RESOLVED ✅
- Schema already exists and is registered
- Used in `order.tsx` schema
- No additional files needed
- Can use `client.patch().append('shippingLog', [entry])`

**Approved?** YES - no action needed

---

## ISSUE 4: Sanity Client Access (RESOLVED)

### Requirement
> "Implement direct Sanity patch for state update"

### Current Implementation
`order.actions.ts` has access to Sanity client via context (line 93):

```typescript
export const orderActions: DocumentActionsResolver = (prev, context) => {
  const {schemaType, getClient} = context
  // ...
}
```

Used in Delete Order action (lines 300-314):
```typescript
const client = getClient({apiVersion: SANITY_API_VERSION})
await client.patch(orderId).set({...}).commit()
```

### RESOLVED ✅
- `getClient()` already available in context
- Can patch documents directly without new imports
- No additional dependencies needed

**Approved?** YES - no action needed

---

## ISSUE 5: Payload Ambiguity (CLARIFIED)

### Requirement
> "Payload: {orderId, weightOverride?, dimensionsOverride?, packageDetails?, rateId?}"

### Problem
Ambiguous whether to send both `weightOverride` AND `packageDetails.weight` when user edits dimensions.

### Backend Contract (from `easypostCreateLabel.ts`)
Accepts both parameters with resolution priority:
1. `packageDetails.weight` (checked first, line 488)
2. `weightOverride` (checked second, line 488)
3. `order.weight` (fallback, line 488)

### CLARIFIED SOLUTION ✅
Send user-entered values in `packageDetails` for clarity:

```typescript
const body = {
  orderId: doc._id.replace(/^drafts\./, ''),
  packageDetails: {
    weight: normalizedDimensions.weight,
    dimensions: {
      length: normalizedDimensions.length,
      width: normalizedDimensions.width,
      height: normalizedDimensions.height,
    }
  },
  rateId: doc.easypostRateId || undefined
}
```

**Rationale:**
- Backend accepts both formats
- `packageDetails` groups related data logically
- Matches backend priority order

**Approved?** YES - use `packageDetails` wrapper

---

## ISSUE 6: Email Sending (CRITICAL BLOCKER) ❌

### Requirement
> "Customer Notification (conditional): If notifyCustomer === true AND trackingNumber exists: Send shipping confirmation email via Resend"

### Current Implementation
Email sending happens in `netlify/functions/fulfillOrder.ts` (lines 286-299):

```typescript
if (resendClient && order.customerEmail) {
  try {
    await resendClient.emails.send({
      from: resendFrom,
      to: order.customerEmail,
      subject: `Your order ${order.orderNumber || ''} has shipped`,
      html: buildTrackingEmailHtml(order, {trackingUrl, trackingCode}),
    })
  } catch (emailError) {
    console.warn('fulfillOrder: failed to send tracking email', emailError)
  }
}
```

### Problem
The enforcement prompt requires:
1. **Remove** `callFn('fulfillOrder', {orderId})` from Fulfill Order action
2. **Add** email sending based on `notifyCustomer` checkbox
3. **Forbids** new network calls except changing the label endpoint

**Contradiction:**
- Removing `fulfillOrder` call removes email capability
- Adding direct email send violates "No new network calls" rule
- Browser-side Resend API calls would expose API keys (security violation)

### Options

#### Option A: Keep Simplified fulfillOrder Call (REQUIRES CONTRACT CHANGE)
Modify the Fulfill Order action to call a **new/modified** Netlify function:

```typescript
// Call backend for state update + email
const res = await callFn('fulfillOrder', {
  orderId,
  trackingNumber,
  fulfillmentStatus,
  notifyCustomer
})
```

**Backend changes needed:**
- Modify `netlify/functions/fulfillOrder.ts` to:
  - Accept `trackingNumber`, `fulfillmentStatus`, `notifyCustomer` params
  - Skip label creation logic
  - Only patch order state + send conditional email

**Violations:**
- Modifies `netlify/functions/fulfillOrder.ts` (FORBIDDEN in prompt)
- Still uses Netlify function call (not "direct Sanity patch")

#### Option B: Remove Email Requirement (RECOMMENDED) ✅
Amend the contract to remove email sending from the Fulfill Order action:

**Change in contract:**
```diff
- Customer Notification (conditional):
-   If notifyCustomer === true AND trackingNumber exists:
-     Send shipping confirmation email via Resend

+ Customer Notification:
+   Email sending is handled by backend webhooks or separate action
+   Fulfill Order action does NOT send emails directly
+   Users can manually trigger email via separate action if needed
```

**Rationale:**
- Stays within approved file constraints
- No new network calls
- Email can be sent via:
  - Separate "Send Shipping Confirmation" action (already exists in `orderActions.ts`)
  - Backend webhook triggered by order status change
  - Manual email from admin interface

#### Option C: Add New Email Netlify Function (REQUIRES APPROVAL)
Create a new endpoint specifically for email sending:

**New function:** `netlify/functions/sendShippingEmail.ts`

**Call from action:**
```typescript
if (notifyCustomer && trackingNumber) {
  await fetch('/.netlify/functions/sendShippingEmail', {
    method: 'POST',
    body: JSON.stringify({orderId, trackingNumber})
  })
}
```

**Violations:**
- Creates new Netlify function (not in approved file list)
- Adds new network call (forbidden)

### CRITICAL BLOCKER SUMMARY

**Email sending cannot be implemented within the approved constraints.**

**Required Decision:**
1. **RECOMMENDED:** Remove email requirement from contract (Option B)
2. Allow modification of `fulfillOrder` Netlify function (Option A - requires contract amendment)
3. Allow new email function (Option C - requires contract amendment)

---

## RECOMMENDED AMENDMENTS TO CONTRACT

### Amendment 1: Print Label Confirmation (Minor)
**Current:**
> "Add: Display 'Print Shipping Label' button/link"

**Proposed:**
> "Add: Display 'Print Shipping Label' confirmation dialog using `window.confirm()`"

**Rationale:** Achieves same goal (explicit user action) using available browser APIs

---

### Amendment 2: Fulfillment Modal Simplification (Minor)
**Current:**
> "Fulfillment Status (dropdown, required): Options: unfulfilled, processing, shipped, delivered"

**Proposed:**
> "Fulfillment Status (confirmation dialog): Binary choice: SHIPPED (confirm OK) or PROCESSING (confirm Cancel)"

**Rationale:** Browser `confirm()` only supports binary choices; shipped vs processing covers primary use cases

---

### Amendment 3: Remove Email Requirement (CRITICAL)
**Current:**
> "Customer Notification (conditional): If notifyCustomer === true AND trackingNumber exists: Send shipping confirmation email via Resend"

**Proposed:**
> "Customer Notification: Email sending is delegated to backend or separate action. Fulfill Order action does NOT send emails directly. Users can trigger email via existing 'Send Shipping Confirmation' action after fulfillment."

**Rationale:** Prevents network call violations and keeps action focused on state changes

---

## UPDATED FILES ALLOWED (WITH AMENDMENTS)

**With email removal, ONLY these files need changes:**

1. `packages/sanity-config/src/schemaTypes/actions/orderActions.ts`
   - Change: Fix endpoint from `/api/create-shipping-label` → `/.netlify/functions/easypostCreateLabel`
   - Change: Replace `openUrl(labelUrl)` with `confirm()` before opening
   - Effort: **~10 lines modified**

2. `packages/sanity-config/src/schemaTypes/documents/order.actions.ts`
   - Remove: `callFn('fulfillOrder', {orderId})` and label URL opening
   - Remove: Automatic label opening (lines 130-136)
   - Add: Sequential `prompt()`/`confirm()` dialogs for tracking, status, notification flag
   - Add: Direct `client.patch()` call with state update
   - Add: `shippingLog` append
   - Effort: **~50 lines modified**

**No other files required.**

---

## FEASIBILITY VERDICT

| Issue | Status | Workaround | Contract Amendment Needed? |
|-------|--------|------------|----------------------------|
| Print Label Button | ✅ FEASIBLE | Use `confirm()` dialog | Minor wording change |
| Fulfillment Modal | ✅ FEASIBLE | Use sequential `prompt()`/`confirm()` | Minor simplification |
| ShippingLog Schema | ✅ RESOLVED | Already exists | None |
| Sanity Client Access | ✅ RESOLVED | `getClient()` available | None |
| Payload Ambiguity | ✅ CLARIFIED | Use `packageDetails` wrapper | None |
| Email Sending | ❌ BLOCKER | **Cannot implement** | **CRITICAL: Remove requirement** |

---

## RECOMMENDATION

**Proceed with enforcement ONLY AFTER contract amendment:**

1. **Amend contract** to remove email sending requirement from Fulfill Order action
2. **Update enforcement prompt** with:
   - Use `confirm()` for print label (not "button")
   - Use sequential prompts for fulfillment inputs (not "modal")
   - Remove email sending logic
3. **Implement** changes in the two approved files only

**Alternative:** If email is non-negotiable, expand scope to allow:
- Modification of `netlify/functions/fulfillOrder.ts` (backend changes)
- OR creation of new `sendShippingEmail` Netlify function

---

## ANSWERS TO OPEN QUESTIONS

### Q1: Is "Print Label button" allowed as `confirm()` dialog?
**A:** YES - if contract accepts browser native dialogs as equivalent to "button/link"
- Achieves same goal: explicit user action required
- No additional files or UI components needed
- Stays within approved file constraints

### Q2: Does order.actions.ts have Sanity client access?
**A:** YES - `getClient()` available in context
- Already used in Delete Order action (lines 300-314)
- No new imports required
- Can patch documents directly

### Q3: What is authoritative schema for shippingLog?
**A:** `packages/sanity-config/src/schemaTypes/objects/shippingLogEntryType.ts`
- Fields: status, message, labelUrl, trackingUrl, trackingNumber, weight, createdAt
- Already registered in schema
- Can be used directly with `_type: 'shippingLogEntry'`

---

**End of Feasibility Assessment**
