# Schema-to-Workflow Issues & Recommendations

**Analysis Date:** 2026-01-01
**Project:** FAS Motorsports Sanity CMS
**Repos Analyzed:** `fas-sanity`, `fas-cms-fresh`

---

## Executive Summary

Comprehensive audit of Sanity schemas, Stripe/EasyPost/Email webhooks, and QuickBooks-style workflow integrations. This document identifies working systems, critical gaps, non-functional webhooks, and provides prioritized recommendations.

---

## 1. Schema Relationship Map

### Expected QuickBooks Flow

```
Customer/Vendor → Quote → Invoice → Order
```

### Current Implementation Status

#### ✅ Working Relationships

| From Schema | To Schema | Field Name    | Type             | Location                 |
| ----------- | --------- | ------------- | ---------------- | ------------------------ |
| Customer    | Order     | `orders`      | Array (embedded) | `customer.ts:254`        |
| Customer    | Invoice   | `invoices`    | Array (embedded) | `customer.ts:260`        |
| Customer    | Quote     | `quotes`      | Array (embedded) | `customer.ts:268`        |
| Vendor      | Customer  | `customerRef` | Reference        | `vendor.ts:748`          |
| Order       | Customer  | `customerRef` | Reference        | `order.tsx:22`           |
| Invoice     | Customer  | `customerRef` | Reference        | `invoiceContent.tsx:121` |
| Invoice     | Order     | `order`       | Reference        | (exists)                 |

#### ❌ Missing Relationships

| From Schema | To Schema | Missing Field      | Impact                                  |
| ----------- | --------- | ------------------ | --------------------------------------- |
| Order       | Invoice   | `invoice`          | Can't find invoice from order           |
| Order       | Quote     | `sourceQuote`      | Can't trace order back to quote         |
| Invoice     | Quote     | `sourceQuote`      | Can't trace invoice back to quote       |
| Quote       | Invoice   | `generatedInvoice` | Can't see which invoice came from quote |
| Quote       | Order     | `generatedOrder`   | No direct quote→order conversion        |

---

## 2. Webhook Implementation Status

### 🟢 Webhooks ACTIVE & Firing

#### Stripe Webhook (`netlify/functions/stripe-webhook.ts`)

**Events Handled:**

- ✅ `checkout.session.completed` - Creates order + invoice + customer
- ✅ `invoice.finalized` - Updates quote status to 'invoiced'
- ✅ `invoice.paid` - Updates quote status to 'paid'
- ✅ `payment_intent.succeeded` - Processes inventory deduction
- ✅ `charge.succeeded` - Processes inventory deduction
- ✅ `charge.refunded` - Releases inventory, marks order cancelled
- ✅ `payment_intent.canceled` - Releases inventory, marks order cancelled

**What It Does Well:**

- ✅ Idempotent (prevents duplicate orders)
- ✅ Inventory management (reserve → deduct → release)
- ✅ Customer creation/update with marketing opt-in
- ✅ Proper Stripe cents → Sanity dollars conversion
- ✅ Email confirmation via Resend
- ✅ Promotion tracking
- ✅ Zod validation

**Known Issues:**

1. **Duplicate Implementation**
   - File: `src/pages/api/webhooks.ts` (Astro route)
   - File: `netlify/functions/stripe-webhook.ts` (Netlify function)
   - Status: Netlify version is authoritative, Astro route is legacy
   - **Action:** Delete `src/pages/api/webhooks.ts`

2. **Stripe Event Logging Missing**
   - Schema: `stripeWebhookEvent.ts` exists
   - Population: ❌ Never written to
   - Impact: No audit trail of webhook calls in Sanity Studio

3. **Incomplete Order Data Population**
   - Field: `order.stripeSummary` exists
   - Population: ❌ Not fully populated with event data
   - Field: `order.shippingLabelUrl` exists
   - Population: ❌ Never set (should come from EasyPost)

### 🔴 Webhooks MISSING (Schema Exists, No Implementation)

#### EasyPost Webhooks (CRITICAL GAP)

**Schemas Defined:**

- `shipment.tsx` - Full shipment tracking schema
- `shippingLabel.tsx` - Label metadata schema
- Order has: `carrier`, `service`, `trackingNumber`, `trackingUrl`

**Missing Webhook Handler:**

- No EasyPost webhook endpoint found
- Expected events:
  - `tracker.created`
  - `tracker.updated`
  - `shipment.failed`
  - `label.purchased`
  - `batch.created`

**Impact:**

- ❌ Tracking numbers never auto-update
- ❌ Shipment status changes require manual entry
- ❌ No automated customer shipping notifications
- ❌ `shippingLabel` documents never created

**Required Implementation:**

```
File: netlify/functions/easypost-webhook.ts
Events:
  - tracker.updated → Update order.trackingStatus
  - label.purchased → Create shippingLabel doc + update order
  - shipment.failed → Update order.fulfillmentStatus
```

#### Email Webhooks (HIGH PRIORITY GAP)

**Schemas Defined:**

- `emailLog.ts` - Full delivery tracking fields
  - `deliveredAt`
  - `openedAt`
  - `clickedAt`
  - `clickEvents[]`
- `emailTemplate.ts` - Template definitions
- `emailAutomation.ts` - Automation rules
- `emailCampaign.ts` - Campaign management

**Missing Webhook Handler:**

- No Resend webhook endpoint found
- Expected events:
  - `email.delivered`
  - `email.opened`
  - `email.clicked`
  - `email.bounced`
  - `email.complained`

**Impact:**

- ❌ Email logs stuck at "sent" status forever
- ❌ No open/click tracking data
- ❌ Can't measure email campaign effectiveness
- ❌ No bounce/complaint handling

**Required Implementation:**

```
File: netlify/functions/resend-webhook.ts
Events:
  - email.delivered → Update emailLog.deliveredAt
  - email.opened → Update emailLog.openedAt
  - email.clicked → Append to emailLog.clickEvents[]
  - email.bounced → Update emailLog.status = 'bounced'
```

#### Cal.com Webhook (LOW PRIORITY)

**File:** `src/pages/api/calcom/webhook.ts`
**Status:** Exists but minimal implementation
**Schema:** `appointment.ts` fully defined
**Gap:** Webhook doesn't create/update appointment documents

---

## 3. Workflow Gaps

### 🔴 CRITICAL: Manual Order Workflow Incomplete

**Current Online Order Flow (WORKING):**

```
Stripe Checkout → stripe-webhook.ts → Order + Invoice + Email ✅
```

**Current Manual Order Flow (BROKEN):**

```
Phone Call / In-Store Visit
       ↓
Quote created in Sanity Studio
       ↓
❌ NO "Accept Quote → Create Order" action
       ↓
Manual invoice creation (quotes-convert-to-invoice function)
       ↓
❌ NO automatic order creation from invoice
       ↓
Must manually create order in Studio
       ↓
❌ No linkage between quote → invoice → order
```

**Required Fix:**

1. Add Sanity Studio document action: "Convert Quote to Order"
2. Create function: `netlify/functions/quote-to-order.ts`
3. Update schemas:

   ```typescript
   // order.tsx
   defineField({
     name: 'sourceQuote',
     type: 'reference',
     to: [{type: 'quote'}],
   })

   // invoice.ts
   defineField({
     name: 'sourceQuote',
     type: 'reference',
     to: [{type: 'quote'}],
   })
   ```

### 🟡 HIGH: Wholesale/Vendor Workflow Disconnected

**Schemas Defined:**

- ✅ `vendor.ts` - Full vendor portal fields
- ✅ `order.wholesaleDetails` - Wholesale-specific order fields
- ✅ Vendor pricing tiers
- ✅ Portal permissions system

**Missing Integration:**

- ❌ No vendor portal order submission endpoint
- ❌ Vendors must email/call to place orders
- ❌ No automated pricing tier application
- ❌ No vendor order confirmation emails

**Required Implementation:**

```
File: netlify/functions/vendor-order-submit.ts
Actions:
  1. Authenticate vendor via portalAccess.userSub
  2. Validate vendor status = 'active'
  3. Apply pricingTier discount
  4. Create order with orderType: 'wholesale'
  5. Set wholesaleDetails.workflowStatus = 'pending_approval'
  6. Send email to vendor contact + operations team
```

### 🟡 HIGH: Shipping Label Workflow Manual-Only

**Current Process:**

1. Order placed → Order created in Sanity
2. Operations manually logs into EasyPost
3. Operations manually creates label
4. Operations manually copies tracking number into Sanity
5. Operations manually updates order status

**Schemas Support Automation:**

- ✅ Order has `weight` and `dimensions` fields
- ✅ `shippingLabel.tsx` schema ready
- ✅ Order has `shippingAddress` properly formatted

**Missing:**

- ❌ No "Create Shipping Label" button in Sanity Studio
- ❌ No EasyPost API integration function
- ❌ No automatic tracking number population

**Required Implementation:**

```
File: netlify/functions/create-shipping-label.ts
Triggered by: Sanity Studio document action on Order
Actions:
  1. Read order.weight + order.dimensions
  2. Call EasyPost API to create shipment
  3. Purchase cheapest rate (or selected rate)
  4. Create shippingLabel document
  5. Update order with trackingNumber, carrier, service
  6. Download label PDF to Sanity asset
  7. Update order.shippingLabelUrl
  8. Send shipping confirmation email to customer
```

### 🟢 NICE-TO-HAVE: Email Automation Undefined

**Schemas Exist But Unused:**

- `emailAutomation.ts` - Trigger rules defined
- `emailCampaign.ts` - Campaign structure defined
- `abandonedCheckout.ts` - Abandoned cart tracking schema

**No Automation Triggers:**

- ❌ Abandoned cart recovery emails (schema exists, no cron job)
- ❌ Service reminder emails (based on vehicle service history)
- ❌ Re-engagement campaigns (based on customer.segment)
- ❌ Post-purchase follow-ups

**Required Implementation:**

```
Files:
  - netlify/functions/abandoned-cart-cron.ts
  - netlify/functions/service-reminder-cron.ts
  - netlify/functions/email-campaign-send.ts

Abandoned Cart Flow:
  1. Cron runs hourly
  2. Query Sanity for abandonedCheckout docs > 1 hour old
  3. Check if customer has emailMarketing.subscribed = true
  4. Send template-based email via Resend
  5. Create emailLog document
  6. Update abandonedCheckout.emailSent = true
```

---

## 4. Schema-Specific Issues

### Order Schema (`order.tsx`)

**✅ Working Fields:**

- Customer reference
- Cart items (proper structure)
- Stripe payment data
- Shipping address
- Modern `weight` and `dimensions` fields (shipmentWeight, packageDimensions types)
- Wholesale workflow support

**❌ Missing Fields:**

```typescript
defineField({
  name: 'sourceInvoice',
  title: 'Source Invoice',
  type: 'reference',
  to: [{type: 'invoice'}],
  description: 'Invoice that generated this order (if from manual workflow)'
}),

defineField({
  name: 'sourceQuote',
  title: 'Source Quote',
  type: 'reference',
  to: [{type: 'quote'}],
  description: 'Quote that generated this order (if from manual workflow)'
}),
```

**❌ Fields Never Populated:**

- `stripeSummary.data` - Should contain full Stripe session JSON
- `shippingLabelUrl` - Should be set by EasyPost webhook
- `easyPostShipmentId` - Should be set when label created

### Invoice Schema (`invoiceContent.tsx`)

**✅ Working Fields:**

- Customer reference
- Order reference (one-way)
- Line items
- Pricing breakdown
- Payment terms

**❌ Missing Fields:**

```typescript
defineField({
  name: 'sourceQuote',
  title: 'Source Quote',
  type: 'reference',
  to: [{type: 'quote'}],
  description: 'Quote that generated this invoice',
  readOnly: true
}),

defineField({
  name: 'emailLogRef',
  title: 'Email Log',
  type: 'reference',
  to: [{type: 'emailLog'}],
  description: 'Email log when invoice was sent',
  readOnly: true
}),
```

**❌ Never Updated After Creation:**

- Created by `stripe-webhook.ts` but never modified
- `invoice-send.ts` function exists but doesn't update invoice doc
- No `sentAt` timestamp field

### Quote Schema (`quoteContent.tsx`)

**✅ Working Features:**

- Customer lookup/creation UI
- Line item management
- Bill To / Ship To addresses
- "Convert to Invoice" button
- Stripe invoice integration (for payment)

**❌ Missing Features:**

- No "Convert to Order" button
- No `generatedInvoice` reference field
- No `generatedOrder` reference field
- Timeline events not automated

**❌ Recommended Fields:**

```typescript
defineField({
  name: 'generatedInvoice',
  title: 'Generated Invoice',
  type: 'reference',
  to: [{type: 'invoice'}],
  description: 'Invoice created from this quote',
  readOnly: true
}),

defineField({
  name: 'generatedOrder',
  title: 'Generated Order',
  type: 'reference',
  to: [{type: 'order'}],
  description: 'Order created from this quote',
  readOnly: true
}),

defineField({
  name: 'acceptedAt',
  title: 'Accepted At',
  type: 'datetime',
  description: 'When customer accepted the quote',
  readOnly: true
}),
```

### Vendor Schema (`vendor.ts`)

**✅ Fully Defined:**

- Portal access (`portalAccess` object with auth, permissions, tokens)
- Customer linking with validation
- Pricing tiers
- Payment terms
- Shipping addresses (multiple)
- Notification preferences

**❌ Not Integrated:**

- Portal order submission (no endpoint)
- Notification preferences defined but never used
- `orders` array embedded but not auto-populated by webhooks
- `quotes` array embedded but not auto-populated

### Customer Schema (`customer.ts`)

**✅ Working:**

- Stripe customer sync
- Marketing opt-in tracking
- Order/invoice/quote summary arrays
- Role-based access (vendor role integration)
- Segment calculation fields (VIP, repeat, at-risk, etc.)

**❌ Not Automated:**

- `segment` field exists but requires manual update (should be cron job)
- `lifetimeValue`, `totalOrders`, `averageOrderValue` fields exist but not auto-calculated
- `daysSinceLastOrder` exists but not auto-calculated

**Required Cron Job:**

```
File: netlify/functions/customer-metrics-cron.ts
Run: Daily at 2am
Actions:
  1. Calculate lifetime metrics from orders
  2. Assign customer segment based on behavior
  3. Update customer documents in batch
```

---

## 5. Data Integrity Issues

### Stripe Cents vs. Sanity Dollars

**✅ Properly Handled:**

- `stripe-webhook.ts` correctly divides all Stripe amounts by 100
- Fields stored in dollars: `amountSubtotal`, `amountTax`, `amountShipping`, `totalAmount`

**⚠️ Watch Out For:**

- Any new Stripe integrations must remember to convert
- Product prices in Stripe are in cents but stored in Sanity as dollars

### Reference Integrity

**❌ Orphan Risk:**

- When customer deleted, references in orders/invoices/quotes break
- No cascade delete logic
- Recommendation: Add validation to prevent customer deletion if referenced

**❌ Circular Reference Risk:**

- Invoice → Order and Order → Invoice could create circular refs
- Current one-way (invoice → order) is safer
- If adding order → invoice, must ensure no circular writes

---

## 6. Prioritized Action Plan

### 🔴 CRITICAL (Do Immediately)

#### 1. Remove Duplicate Stripe Webhook

**File to Delete:** `src/pages/api/webhooks.ts`
**Keep:** `netlify/functions/stripe-webhook.ts`
**Reason:** Avoid confusion and potential double-processing

#### 2. Add Missing Reference Fields to Schemas

**Order Schema:**

```typescript
// Add to order.tsx after customerRef field
defineField({
  name: 'sourceInvoice',
  type: 'reference',
  to: [{type: 'invoice'}],
  group: 'technical',
  hidden: true
}),
defineField({
  name: 'sourceQuote',
  type: 'reference',
  to: [{type: 'quote'}],
  group: 'technical',
  hidden: true
}),
```

**Invoice Schema:**

```typescript
// Add to invoiceContent.tsx
defineField({
  name: 'sourceQuote',
  type: 'reference',
  to: [{type: 'quote'}],
  fieldset: 'relatedDocs'
}),
```

**Quote Schema:**

```typescript
// Add to quoteContent.tsx
defineField({
  name: 'generatedInvoice',
  type: 'reference',
  to: [{type: 'invoice'}],
  readOnly: true
}),
defineField({
  name: 'generatedOrder',
  type: 'reference',
  to: [{type: 'order'}],
  readOnly: true
}),
```

#### 3. Implement EasyPost Integration

**File:** `netlify/functions/create-shipping-label.ts`

```typescript
import EasyPost from '@easypost/api'
import {sanity} from './_sanity'

export const handler = async (event) => {
  const {orderId} = JSON.parse(event.body)

  // 1. Fetch order with weight, dimensions, address
  const order = await sanity.fetch(
    `*[_id == $id][0]{
    weight,
    dimensions,
    shippingAddress,
    cart
  }`,
    {id: orderId},
  )

  // 2. Create EasyPost shipment
  const client = new EasyPost(process.env.EASYPOST_API_KEY)
  const shipment = await client.Shipment.create({
    to_address: {
      name: order.shippingAddress.name,
      street1: order.shippingAddress.addressLine1,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      zip: order.shippingAddress.postalCode,
    },
    from_address: {
      /* warehouse address */
    },
    parcel: {
      weight: order.weight?.value,
      length: order.dimensions?.length,
      width: order.dimensions?.width,
      height: order.dimensions?.height,
    },
  })

  // 3. Buy cheapest rate
  await shipment.buy(shipment.lowestRate())

  // 4. Update order + create shippingLabel doc
  await sanity
    .patch(orderId)
    .set({
      trackingNumber: shipment.tracking_code,
      trackingUrl: shipment.tracker?.public_url,
      carrier: shipment.selected_rate.carrier,
      service: shipment.selected_rate.service,
      shippingLabelUrl: shipment.postage_label.label_url,
      easyPostShipmentId: shipment.id,
    })
    .commit()

  return {statusCode: 200, body: JSON.stringify({success: true})}
}
```

**File:** `netlify/functions/easypost-webhook.ts`

```typescript
export const handler = async (event) => {
  const webhookEvent = JSON.parse(event.body)

  switch (webhookEvent.description) {
    case 'tracker.updated': {
      const tracker = webhookEvent.result

      // Find order by tracking number
      const order = await sanity.fetch(`*[_type == "order" && trackingNumber == $tracking][0]`, {
        tracking: tracker.tracking_code,
      })

      if (order) {
        await sanity
          .patch(order._id)
          .set({
            trackingStatus: tracker.status,
            trackingUpdatedAt: new Date().toISOString(),
            trackingHistory: tracker.tracking_details,
          })
          .commit()
      }
      break
    }
  }

  return {statusCode: 200}
}
```

#### 4. Update Stripe Webhook to Populate References

**Modify:** `netlify/functions/stripe-webhook.ts`

In the `checkout.session.completed` handler, after creating invoice:

```typescript
// After line 772 where invoice is created
const invoiceId = (
  await sanity.create({
    /* invoice payload */
  })
)._id

// Update order with invoice reference
if (orderId && invoiceId) {
  await sanity
    .patch(orderId)
    .set({
      sourceInvoice: {_type: 'reference', _ref: invoiceId},
    })
    .commit()
}
```

### 🟡 HIGH PRIORITY (Do Next Week)

#### 5. Implement Resend Email Webhooks

**File:** `netlify/functions/resend-webhook.ts`

```typescript
export const handler = async (event) => {
  const webhookEvent = JSON.parse(event.body)

  // Verify Resend signature
  // ...

  const emailLogId = webhookEvent.data.tags?.emailLogId
  if (!emailLogId) return {statusCode: 200}

  switch (webhookEvent.type) {
    case 'email.delivered':
      await sanity
        .patch(emailLogId)
        .set({
          status: 'delivered',
          deliveredAt: webhookEvent.created_at,
        })
        .commit()
      break

    case 'email.opened':
      await sanity
        .patch(emailLogId)
        .set({
          status: 'opened',
          openedAt: webhookEvent.created_at,
        })
        .commit()
      break

    case 'email.clicked':
      await sanity
        .patch(emailLogId)
        .set({
          status: 'clicked',
          clickedAt: webhookEvent.created_at,
        })
        .append('clickEvents', [
          {
            _type: 'click',
            url: webhookEvent.data.click.link,
            timestamp: webhookEvent.created_at,
          },
        ])
        .commit()
      break
  }

  return {statusCode: 200}
}
```

**Update:** `netlify/functions/_resend.ts`

Add emailLogId tag when sending:

```typescript
export async function sendEmail({to, subject, html, emailLogId}) {
  return await resend.emails.send({
    from: 'FAS Motorsports <noreply@fasmotorsports.com>',
    to,
    subject,
    html,
    tags: emailLogId ? [{name: 'emailLogId', value: emailLogId}] : undefined,
  })
}
```

#### 6. Vendor Portal Order Integration

**File:** `netlify/functions/vendor-order-submit.ts`

**File:** `netlify/functions/vendor-auth-middleware.ts`

#### 7. Populate Stripe Webhook Event Log

**Modify:** `netlify/functions/stripe-webhook.ts`

At the start of handler:

```typescript
// After signature verification
const eventLogId = await sanity
  .create({
    _type: 'stripeWebhookEvent',
    eventId: evt.id,
    eventType: evt.type,
    createdAt: new Date(evt.created * 1000).toISOString(),
    payload: JSON.stringify(evt),
    processed: false,
  })
  .then((doc) => doc._id)

try {
  // ... existing handler logic

  // At the end
  await sanity.patch(eventLogId).set({processed: true}).commit()
} catch (error) {
  await sanity
    .patch(eventLogId)
    .set({
      processed: false,
      error: error.message,
    })
    .commit()
  throw error
}
```

### 🟢 NICE-TO-HAVE (Do Later)

#### 8. Customer Metrics Automation

**File:** `netlify/functions/customer-metrics-cron.ts`

#### 9. Abandoned Cart Recovery

**File:** `netlify/functions/abandoned-cart-cron.ts`

#### 10. Service Reminder Automation

**File:** `netlify/functions/service-reminder-cron.ts`

#### 11. Quote → Order Direct Conversion

**File:** `netlify/functions/quote-to-order.ts`

**Sanity Studio Action:** `order.actions.ts` - Add "Convert to Order" button

---

## 7. Testing Checklist

After implementing fixes:

### Stripe Webhook Testing

- [ ] Create test checkout session in Stripe
- [ ] Verify order created with correct amounts
- [ ] Verify invoice created and linked to order
- [ ] Verify customer created/updated
- [ ] Verify email sent
- [ ] Verify stripeWebhookEvent log created

### EasyPost Testing

- [ ] Create shipping label from Sanity Studio
- [ ] Verify label PDF downloaded to Sanity
- [ ] Verify tracking number populated
- [ ] Trigger tracker.updated webhook manually
- [ ] Verify order tracking status updates

### Email Webhook Testing

- [ ] Send test email via Resend
- [ ] Trigger delivered webhook
- [ ] Verify emailLog.deliveredAt updated
- [ ] Trigger opened webhook
- [ ] Verify emailLog.openedAt updated
- [ ] Trigger clicked webhook
- [ ] Verify clickEvents array appended

### Manual Order Workflow Testing

- [ ] Create quote in Sanity Studio
- [ ] Convert quote to invoice
- [ ] Verify invoice.sourceQuote populated
- [ ] Convert quote/invoice to order (new feature)
- [ ] Verify order.sourceQuote and order.sourceInvoice populated
- [ ] Verify customer summaries updated

---

## 8. Monitoring & Alerting Recommendations

### Required Monitoring

1. **Webhook Failure Alerts**
   - Stripe webhook signature failures
   - EasyPost API errors
   - Resend email failures
   - Set up Sentry or similar error tracking

2. **Data Integrity Checks**
   - Orders without customer references
   - Invoices without order references
   - Orphaned shipping labels
   - Run weekly via cron job

3. **Business Metrics Dashboards**
   - Order creation rate
   - Email open rates
   - Abandoned cart recovery rate
   - Shipping label creation time

---

## 9. Documentation Updates Needed

After implementing fixes:

1. Update `docs/codex.md` with:
   - New webhook endpoints
   - Schema relationship diagram
   - Manual order workflow steps

2. Create `docs/webhooks.md` with:
   - Webhook URLs for each service
   - Event types handled
   - Signature verification methods
   - Testing procedures

3. Create `docs/workflows.md` with:
   - Online order flow diagram
   - Manual order flow diagram
   - Wholesale order flow diagram
   - Quote → Invoice → Order conversion steps

---

## 10. Environment Variables Required

Add to `.env.local` (fas-cms-fresh):

```bash
# EasyPost
EASYPOST_API_KEY=EZAK_xxx
EASYPOST_WEBHOOK_SECRET=whsec_xxx

# Resend
RESEND_WEBHOOK_SECRET=whsec_xxx

# Vendor Portal
VENDOR_JWT_SECRET=xxx
```

Add to Netlify environment variables:

- All of the above
- Plus existing Stripe, Sanity tokens

---

## Conclusion

This system has solid foundations with Stripe integration working well. The main gaps are:

1. **Missing EasyPost integration** (critical for shipping operations)
2. **No email event tracking** (impacts marketing analytics)
3. **Manual order workflow incomplete** (impacts phone/in-store sales)
4. **Vendor portal not integrated** (impacts wholesale business)

Implementing the critical fixes (sections 1-4 in the action plan) will make the system production-ready for all order types.

---

**Next Steps:**

1. Review this document with the team
2. Prioritize which fixes to implement first
3. Assign tasks to developers
4. Set up testing environment for webhook development
5. Schedule deployment window for schema changes

---

// GEMINI REVIEW //

### Overall Assessment

The initial audit is comprehensive and accurately identifies the critical functional gaps. The recommendations are sound. This review adds a layer of analysis focusing on non-functional requirements: security, scalability, error handling, and operational robustness, which will be critical as the system matures.

### 1. Webhook Architecture & Security Deep Dive

While the audit correctly identifies missing webhooks, the implementation requires careful architectural consideration.

**🔴 CRITICAL: All New Webhooks Must Be Idempotent & Secure**

- **Signature Verification:** The audit mentions this for Resend, but it's a **critical security requirement for all webhook endpoints** (EasyPost, Resend). Without it, the endpoints are vulnerable to request forgery, allowing a malicious actor to create fake orders, update shipping statuses, or exhaust resources. This must be the very first step in each webhook handler.
- **Idempotency:** The Stripe webhook is correctly identified as idempotent. This is not a "nice-to-have"; it is essential. The new EasyPost and Resend webhook handlers **must** be designed to handle the exact same event multiple times without creating duplicate data or side effects. For example, if an `email.delivered` event is received twice for the same `emailLogId`, the `deliveredAt` timestamp should only be set once.
- **Zod Validation:** The Stripe webhook uses Zod. This practice must be replicated for EasyPost and Resend to ensure payload integrity and prevent malformed data from causing runtime errors.

**🟡 HIGH: Webhook Error Handling & Replayability**

- **Dead-Letter Queues:** Services like Stripe will retry failed webhooks for up to 72 hours. If a bug in the Netlify function causes consistent failures, this can lead to a massive backlog of failed events in the source service. The proposed `stripeWebhookEvent` logging is a good start, but it needs a corresponding mechanism.
- **Recommendation:** Implement a "dead-letter" or "manual review" status in the `stripeWebhookEvent` schema. When a function fails after several retries, it should be marked as `failed_permanent`. An admin tool should be built to inspect, edit, and replay these failed events. This prevents data loss.

### 2. Serverless Function Atomicity

The audit proposes several new serverless functions that perform multiple, dependent actions (e.g., call external API, then update multiple Sanity documents).

**🔴 CRITICAL: Lack of Atomic Transactions**

- **The Problem:** In the proposed `create-shipping-label.ts` function, what happens if the `sanity.patch(orderId).set(...)` call (step 4) fails after the `shipment.buy()` call (step 3) has already succeeded? This would result in a purchased shipping label that is not recorded in Sanity, leading to lost money and operational confusion.
- **Recommendation:** Introduce a state machine pattern for multi-step operations.
  - Add a `fulfillmentStatus` field to the `order` schema with states like `pending`, `creating_label`, `label_created`, `label_creation_failed`.
  - The serverless function should first update the order status to `creating_label`.
  - If any subsequent step fails, the status should be updated to `label_creation_failed`, and an error should be logged.
  - This ensures that the system's state is always transparent and allows for safe retries or manual intervention without risking duplicate operations.

### 3. Schema & Data Model Scalability

The audit correctly identifies missing references, but there's a deeper architectural concern.

**🟡 HIGH: Embedded Arrays vs. References**

- **The Problem:** The `customer.ts` schema contains embedded arrays for `orders`, `invoices`, and `quotes`. While convenient for simple queries, this is a significant scalability anti-pattern in document databases. As a customer places more orders, the `customer` document will grow in size, potentially exceeding document size limits and dramatically slowing down any query that needs to read the customer document.
- **Recommendation:** Convert these embedded arrays to document references. The summary data (like `totalOrders` or `lifetimeValue`) should be calculated by the proposed `customer-metrics-cron.ts` job. This keeps documents small and performant.

**🟢 NICE-TO-HAVE: Query Performance**

- **The Problem:** The proposed EasyPost webhook uses the query `*[_type == "order" && trackingNumber == $tracking][0]`. As the number of orders grows into the thousands, this query will become slow as it requires a full table scan.
- **Recommendation:** While Sanity does not support traditional database indexes, this highlights the need to monitor query performance. For high-volume schemas, consider creating a separate, indexed lookup table in a different database (e.g., Postgres, DynamoDB) if performance becomes a bottleneck.

### 4. Code-Level Recommendations

**🟡 HIGH: Robustness in Proposed Code**

- In `create-shipping-label.ts`, the line `await shipment.buy(shipment.lowestRate());` makes a critical assumption that `lowestRate()` will always return a valid rate. This can fail if no couriers are available for an address or if the API returns an error. The code should include `try/catch` blocks and validation to handle cases where no rates are found.
- In the `easypost-webhook.ts`, the query to find an order might return `null`. The code handles this by simply breaking, which is acceptable but should be logged as a potential orphan event for investigation.

### 5. Operational Blind Spots

**🔴 CRITICAL: Decommissioning Legacy Webhook**

- The recommendation to delete `src/pages/api/webhooks.ts` is correct. However, this is insufficient. It is **critical** to also go into the Stripe Dashboard and **delete the webhook endpoint** that points to the old Astro URL. If left active, Stripe will continue to send events to a non-existent endpoint, generating failure notifications and cluttering logs.
