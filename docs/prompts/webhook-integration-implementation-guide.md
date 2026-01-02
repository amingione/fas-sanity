# Webhook Integration Implementation Guide

**Priority:** CRITICAL
**Estimated Time:** 2-3 weeks
**Prerequisites:** EasyPost API access, Resend webhook access, Stripe Dashboard access

---

## Context

This guide implements the findings from `schema-to-workflow-issues.md` with additional security and scalability requirements from Gemini's review. All implementations must follow **production-grade** patterns: idempotency, signature verification, state machines, and error handling.

---

## Phase 1: Schema Updates (CRITICAL - Do First)

### 1.1 Add Fulfillment State Machine to Order Schema

**File:** `packages/sanity-config/src/schemaTypes/documents/order.tsx`

**Location:** Add to the "fulfillment" group, after existing fulfillment fields

```typescript
defineField({
  name: 'fulfillmentStatus',
  title: 'Fulfillment Status',
  type: 'string',
  options: {
    list: [
      {title: 'Pending', value: 'pending'},
      {title: 'Processing', value: 'processing'},
      {title: 'Creating Label', value: 'creating_label'},
      {title: 'Label Created', value: 'label_created'},
      {title: 'Label Creation Failed', value: 'label_creation_failed'},
      {title: 'Shipped', value: 'shipped'},
      {title: 'Delivered', value: 'delivered'},
      {title: 'Failed', value: 'failed'},
    ],
    layout: 'radio',
  },
  initialValue: 'pending',
  validation: (Rule) => Rule.required(),
  group: 'fulfillment',
}),

defineField({
  name: 'fulfillmentError',
  title: 'Fulfillment Error',
  type: 'text',
  description: 'Error message if label creation or shipment failed',
  readOnly: true,
  hidden: ({document}) => !['label_creation_failed', 'failed'].includes(document?.fulfillmentStatus as string),
  group: 'fulfillment',
}),

defineField({
  name: 'fulfillmentAttempts',
  title: 'Fulfillment Attempts',
  type: 'number',
  description: 'Number of times label creation has been attempted',
  readOnly: true,
  initialValue: 0,
  group: 'fulfillment',
}),
```

### 1.2 Add Document Reference Fields

**Order Schema (`order.tsx`):**

```typescript
// Add to the "technical" group
defineField({
  name: 'sourceInvoice',
  title: 'Source Invoice',
  type: 'reference',
  to: [{type: 'invoice'}],
  description: 'Invoice that generated this order (manual workflow)',
  group: 'technical',
  hidden: true,
}),

defineField({
  name: 'sourceQuote',
  title: 'Source Quote',
  type: 'reference',
  to: [{type: 'quote'}],
  description: 'Quote that generated this order (manual workflow)',
  group: 'technical',
  hidden: true,
}),
```

**Invoice Schema (`invoiceContent.tsx`):**

```typescript
// Add to the "relatedDocs" fieldset
defineField({
  name: 'sourceQuote',
  title: 'Source Quote',
  type: 'reference',
  to: [{type: 'quote'}],
  description: 'Quote that generated this invoice',
  readOnly: true,
  fieldset: 'relatedDocs',
}),

defineField({
  name: 'emailLog',
  title: 'Email Log',
  type: 'reference',
  to: [{type: 'emailLog'}],
  description: 'Email log when invoice was sent',
  readOnly: true,
  fieldset: 'relatedDocs',
}),

defineField({
  name: 'sentAt',
  title: 'Sent At',
  type: 'datetime',
  description: 'When invoice was emailed to customer',
  readOnly: true,
  fieldset: 'relatedDocs',
}),
```

**Quote Schema (`quoteContent.tsx`):**

```typescript
// Add after existing fields (before export)
defineField({
  name: 'generatedInvoice',
  title: 'Generated Invoice',
  type: 'reference',
  to: [{type: 'invoice'}],
  description: 'Invoice created from this quote',
  readOnly: true,
}),

defineField({
  name: 'generatedOrder',
  title: 'Generated Order',
  type: 'reference',
  to: [{type: 'order'}],
  description: 'Order created from this quote',
  readOnly: true,
}),

defineField({
  name: 'acceptedAt',
  title: 'Accepted At',
  type: 'datetime',
  description: 'When customer accepted the quote',
  readOnly: true,
}),
```

### 1.3 Update Stripe Webhook Event Schema for Dead-Letter Queue

**File:** `packages/sanity-config/src/schemaTypes/documents/stripeWebhookEvent.ts`

```typescript
// Add these fields to the existing schema
defineField({
  name: 'processed',
  title: 'Processed',
  type: 'boolean',
  description: 'Whether this event was successfully processed',
  initialValue: false,
}),

defineField({
  name: 'processingStatus',
  title: 'Processing Status',
  type: 'string',
  options: {
    list: [
      {title: 'Pending', value: 'pending'},
      {title: 'Processing', value: 'processing'},
      {title: 'Completed', value: 'completed'},
      {title: 'Failed (Retrying)', value: 'failed_retrying'},
      {title: 'Failed (Permanent)', value: 'failed_permanent'},
    ],
  },
  initialValue: 'pending',
}),

defineField({
  name: 'error',
  title: 'Error',
  type: 'text',
  description: 'Error message if processing failed',
  readOnly: true,
}),

defineField({
  name: 'errorStack',
  title: 'Error Stack',
  type: 'text',
  description: 'Full error stack trace for debugging',
  readOnly: true,
}),

defineField({
  name: 'retryCount',
  title: 'Retry Count',
  type: 'number',
  description: 'Number of processing attempts',
  initialValue: 0,
}),

defineField({
  name: 'lastRetryAt',
  title: 'Last Retry At',
  type: 'datetime',
  description: 'Timestamp of last retry attempt',
  readOnly: true,
}),
```

### 1.4 Create EasyPost Webhook Event Schema (NEW)

**File:** `packages/sanity-config/src/schemaTypes/documents/easypostWebhookEvent.ts`

```typescript
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'easypostWebhookEvent',
  title: 'EasyPost Webhook Event',
  type: 'document',
  fields: [
    defineField({
      name: 'eventId',
      title: 'Event ID',
      type: 'string',
      description: 'EasyPost event ID',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'eventType',
      title: 'Event Type',
      type: 'string',
      description: 'Type of event (tracker.updated, etc.)',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'payload',
      title: 'Payload',
      type: 'text',
      description: 'Full JSON payload from EasyPost',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'processingStatus',
      title: 'Processing Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Processing', value: 'processing'},
          {title: 'Completed', value: 'completed'},
          {title: 'Failed (Retrying)', value: 'failed_retrying'},
          {title: 'Failed (Permanent)', value: 'failed_permanent'},
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'error',
      title: 'Error',
      type: 'text',
      readOnly: true,
    }),
    defineField({
      name: 'retryCount',
      title: 'Retry Count',
      type: 'number',
      initialValue: 0,
    }),
  ],
  preview: {
    select: {
      title: 'eventType',
      subtitle: 'eventId',
      status: 'processingStatus',
    },
    prepare({title, subtitle, status}) {
      return {
        title: title || 'Unknown Event',
        subtitle: `${subtitle} • ${status}`,
      }
    },
  },
})
```

**Add to schema index:** `packages/sanity-config/src/schemaTypes/index.ts`

```typescript
import easypostWebhookEvent from './documents/easypostWebhookEvent'

// In the types array:
easypostWebhookEvent,
```

---

## Phase 2: Update Existing Stripe Webhook (CRITICAL)

### 2.1 Add Event Logging and Error Handling

**File:** `fas-cms-fresh/netlify/functions/stripe-webhook.ts`

**Add at the beginning of the handler function (after signature verification):**

```typescript
export const handler: Handler = async (event) => {
  try {
    const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) return json(500, { error: 'Missing STRIPE_WEBHOOK_SECRET' });
    if (!sig) return json(400, { error: 'Missing stripe-signature' });
    if (!event.body) return json(400, { error: 'Missing request body' });

    let evt: Stripe.Event;
    try {
      evt = stripe.webhooks.constructEvent(event.body, sig as string, secret);
    } catch (err: any) {
      console.error('[stripe-webhook] signature verification failed', err?.message || err);
      return json(400, { error: 'Invalid signature' });
    }

    // ✅ NEW: Log webhook event to Sanity for audit trail and dead-letter queue
    const eventLogId = await sanity.create({
      _type: 'stripeWebhookEvent',
      eventId: evt.id,
      eventType: evt.type,
      createdAt: new Date(evt.created * 1000).toISOString(),
      payload: JSON.stringify(evt),
      processingStatus: 'processing',
      retryCount: 0,
    }).then(doc => doc._id);

    try {
      // ... existing event handling logic

      // ✅ NEW: Mark event as completed
      await sanity.patch(eventLogId).set({
        processingStatus: 'completed',
      }).commit();

    } catch (processingError: any) {
      // ✅ NEW: Mark event as failed and log error
      const retryCount = await sanity.fetch(
        `*[_id == $id][0].retryCount`,
        { id: eventLogId }
      ) || 0;

      const newRetryCount = retryCount + 1;
      const maxRetries = 3;
      const isFinalFailure = newRetryCount >= maxRetries;

      await sanity.patch(eventLogId).set({
        processingStatus: isFinalFailure ? 'failed_permanent' : 'failed_retrying',
        error: processingError.message,
        errorStack: processingError.stack,
        retryCount: newRetryCount,
        lastRetryAt: new Date().toISOString(),
      }).commit();

      console.error('[stripe-webhook] processing failed', {
        eventId: evt.id,
        eventType: evt.type,
        error: processingError.message,
        retryCount: newRetryCount,
        isFinalFailure,
      });

      // Return 500 to trigger Stripe retry (unless final failure)
      if (!isFinalFailure) {
        return json(500, { error: 'Processing failed, will retry' });
      }

      // Final failure: return 200 to stop Stripe retries
      return json(200, {
        error: 'Processing failed permanently after max retries',
        eventLogId,
      });
    }

    return json(200, { received: true });
  } catch (e: any) {
    console.error('[stripe-webhook] unhandled error', e?.message || e);
    return json(500, { error: 'Server error' });
  }
};
```

### 2.2 Update Order/Invoice Creation to Include References

**In the `checkout.session.completed` handler, after creating invoice:**

```typescript
// Existing invoice creation
const invoiceDoc = await sanity.create({
  _type: 'invoice',
  order: orderId ? { _type: 'reference', _ref: orderId } : undefined,
  stripeSessionId: session.id,
  // ... rest of invoice fields
});

const invoiceId = invoiceDoc._id;

// ✅ NEW: Update order with invoice reference (bidirectional link)
if (orderId && invoiceId) {
  await sanity.patch(orderId).set({
    sourceInvoice: { _type: 'reference', _ref: invoiceId },
  }).commit();
}
```

---

## Phase 3: Implement EasyPost Integration (CRITICAL)

### 3.1 Create Shared EasyPost Client

**File:** `fas-cms-fresh/netlify/functions/_easypost.ts`

```typescript
import EasyPost from '@easypost/api';
import crypto from 'crypto';

const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY;
const EASYPOST_WEBHOOK_SECRET = process.env.EASYPOST_WEBHOOK_SECRET;

if (!EASYPOST_API_KEY) {
  throw new Error('Missing EASYPOST_API_KEY environment variable');
}

export const easypost = new EasyPost(EASYPOST_API_KEY);

/**
 * Verify EasyPost webhook signature
 * @see https://www.easypost.com/docs/api#webhooks
 */
export function verifyEasyPostSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature || !EASYPOST_WEBHOOK_SECRET) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', EASYPOST_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

/**
 * Get warehouse address (from env or default)
 */
export function getWarehouseAddress() {
  return {
    company: process.env.WAREHOUSE_COMPANY || 'FAS Motorsports',
    street1: process.env.WAREHOUSE_STREET1 || '123 Main St',
    street2: process.env.WAREHOUSE_STREET2 || '',
    city: process.env.WAREHOUSE_CITY || 'Phoenix',
    state: process.env.WAREHOUSE_STATE || 'AZ',
    zip: process.env.WAREHOUSE_ZIP || '85001',
    country: 'US',
    phone: process.env.WAREHOUSE_PHONE || '555-555-5555',
  };
}
```

### 3.2 Create Shipping Label Generation Function

**File:** `fas-cms-fresh/netlify/functions/create-shipping-label.ts`

```typescript
import type { Handler } from '@netlify/functions';
import { easypost, getWarehouseAddress } from './_easypost';
import { sanity } from './_sanity';
import { z } from 'zod';

const requestSchema = z.object({
  orderId: z.string().min(1),
  serviceLevel: z.enum(['cheapest', 'fastest', 'ground', 'priority']).optional(),
});

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  try {
    // Validate request
    const body = JSON.parse(event.body || '{}');
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return json(400, { error: 'Invalid request', details: validation.error.format() });
    }

    const { orderId, serviceLevel = 'cheapest' } = validation.data;

    // 1. Update order status to "creating_label"
    await sanity.patch(orderId).set({
      fulfillmentStatus: 'creating_label',
      fulfillmentAttempts: (await sanity.fetch(`*[_id == $id][0].fulfillmentAttempts`, { id: orderId }) || 0) + 1,
    }).commit();

    try {
      // 2. Fetch order data
      const order = await sanity.fetch(`*[_id == $id][0]{
        weight,
        dimensions,
        shippingAddress,
        cart,
        customerEmail,
        orderNumber
      }`, { id: orderId });

      if (!order) {
        throw new Error('Order not found');
      }

      // Validate required fields
      if (!order.shippingAddress?.addressLine1) {
        throw new Error('Missing shipping address');
      }

      if (!order.weight?.value || !order.dimensions?.length) {
        throw new Error('Missing package weight or dimensions');
      }

      // 3. Create EasyPost shipment
      const shipment = await easypost.Shipment.create({
        to_address: {
          name: order.shippingAddress.name || 'Customer',
          street1: order.shippingAddress.addressLine1,
          street2: order.shippingAddress.addressLine2 || '',
          city: order.shippingAddress.city || '',
          state: order.shippingAddress.state || '',
          zip: order.shippingAddress.postalCode || '',
          country: order.shippingAddress.country || 'US',
          phone: order.shippingAddress.phone || '',
          email: order.customerEmail || '',
        },
        from_address: getWarehouseAddress(),
        parcel: {
          weight: order.weight.value,
          length: order.dimensions.length,
          width: order.dimensions.width,
          height: order.dimensions.height,
        },
        reference: order.orderNumber || orderId,
      });

      // 4. Select and purchase rate
      let selectedRate = null;

      if (serviceLevel === 'cheapest') {
        selectedRate = shipment.lowestRate();
      } else if (serviceLevel === 'fastest') {
        // Find fastest delivery (lowest delivery_days)
        selectedRate = shipment.rates?.reduce((fastest, rate) => {
          const fastestDays = fastest?.delivery_days || 999;
          const rateDays = rate?.delivery_days || 999;
          return rateDays < fastestDays ? rate : fastest;
        });
      } else {
        // Filter by service level keywords
        const serviceLowerCase = serviceLevel.toLowerCase();
        selectedRate = shipment.rates?.find(rate =>
          rate.service?.toLowerCase().includes(serviceLowerCase)
        ) || shipment.lowestRate();
      }

      if (!selectedRate) {
        throw new Error('No shipping rates available for this address');
      }

      // Purchase the label
      const purchasedShipment = await shipment.buy(selectedRate);

      // 5. Update order with shipping info
      await sanity.patch(orderId).set({
        trackingNumber: purchasedShipment.tracking_code || '',
        trackingUrl: purchasedShipment.tracker?.public_url || '',
        carrier: selectedRate.carrier || '',
        service: selectedRate.service || '',
        shippingLabelUrl: purchasedShipment.postage_label?.label_url || '',
        easyPostShipmentId: purchasedShipment.id || '',
        fulfillmentStatus: 'label_created',
        fulfillmentError: null,
        labelCreatedAt: new Date().toISOString(),
      }).commit();

      // 6. Create shippingLabel document
      await sanity.create({
        _type: 'shippingLabel',
        order: { _type: 'reference', _ref: orderId },
        trackingNumber: purchasedShipment.tracking_code || '',
        carrier: selectedRate.carrier || '',
        service: selectedRate.service || '',
        labelUrl: purchasedShipment.postage_label?.label_url || '',
        shipmentId: purchasedShipment.id || '',
        rate: selectedRate.rate ? parseFloat(selectedRate.rate) : 0,
        createdAt: new Date().toISOString(),
      });

      return json(200, {
        success: true,
        trackingNumber: purchasedShipment.tracking_code,
        trackingUrl: purchasedShipment.tracker?.public_url,
        labelUrl: purchasedShipment.postage_label?.label_url,
      });

    } catch (shipmentError: any) {
      // Update order with error status
      await sanity.patch(orderId).set({
        fulfillmentStatus: 'label_creation_failed',
        fulfillmentError: shipmentError.message,
      }).commit();

      throw shipmentError;
    }

  } catch (error: any) {
    console.error('[create-shipping-label] error', error);
    return json(500, { error: error.message || 'Failed to create shipping label' });
  }
};
```

### 3.3 Create EasyPost Webhook Handler

**File:** `fas-cms-fresh/netlify/functions/easypost-webhook.ts`

```typescript
import type { Handler } from '@netlify/functions';
import { verifyEasyPostSignature } from './_easypost';
import { sanity } from './_sanity';

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

export const handler: Handler = async (event) => {
  try {
    const signature = event.headers['x-easypost-signature'] || event.headers['X-EasyPost-Signature'];
    const rawBody = event.body || '';

    // ✅ CRITICAL: Verify webhook signature
    if (!verifyEasyPostSignature(rawBody, signature)) {
      console.error('[easypost-webhook] Invalid signature');
      return json(401, { error: 'Invalid signature' });
    }

    const webhookEvent = JSON.parse(rawBody);

    // ✅ Log event for audit trail
    const eventLogId = await sanity.create({
      _type: 'easypostWebhookEvent',
      eventId: webhookEvent.id || `event-${Date.now()}`,
      eventType: webhookEvent.description || 'unknown',
      createdAt: new Date().toISOString(),
      payload: JSON.stringify(webhookEvent),
      processingStatus: 'processing',
      retryCount: 0,
    }).then(doc => doc._id);

    try {
      switch (webhookEvent.description) {
        case 'tracker.updated': {
          const tracker = webhookEvent.result;

          if (!tracker?.tracking_code) {
            console.warn('[easypost-webhook] tracker.updated missing tracking_code');
            break;
          }

          // Find order by tracking number
          const order = await sanity.fetch(
            `*[_type == "order" && trackingNumber == $tracking][0]{_id}`,
            { tracking: tracker.tracking_code }
          );

          if (!order?._id) {
            console.warn('[easypost-webhook] No order found for tracking:', tracker.tracking_code);
            // ✅ Log as orphan event but don't fail
            await sanity.patch(eventLogId).set({
              processingStatus: 'completed',
              error: `No order found for tracking: ${tracker.tracking_code}`,
            }).commit();
            break;
          }

          // ✅ Idempotent update (won't duplicate if event replayed)
          await sanity.patch(order._id).set({
            trackingStatus: tracker.status || 'unknown',
            trackingUpdatedAt: new Date().toISOString(),
            trackingHistory: tracker.tracking_details || [],
          }).commit();

          // Update fulfillmentStatus based on tracking status
          if (tracker.status === 'delivered') {
            await sanity.patch(order._id).set({
              fulfillmentStatus: 'delivered',
            }).commit();
          }

          break;
        }

        case 'tracker.created':
          // No action needed, just log
          console.log('[easypost-webhook] tracker.created:', webhookEvent.result?.tracking_code);
          break;

        case 'shipment.failed':
          // Log shipment failure
          console.error('[easypost-webhook] shipment.failed:', webhookEvent.result);
          // Could update order status here
          break;

        default:
          console.log('[easypost-webhook] Unhandled event:', webhookEvent.description);
      }

      // Mark event as completed
      await sanity.patch(eventLogId).set({
        processingStatus: 'completed',
      }).commit();

      return json(200, { received: true });

    } catch (processingError: any) {
      // ✅ Failed event handling with retry logic
      const retryCount = await sanity.fetch(
        `*[_id == $id][0].retryCount`,
        { id: eventLogId }
      ) || 0;

      const newRetryCount = retryCount + 1;
      const maxRetries = 3;
      const isFinalFailure = newRetryCount >= maxRetries;

      await sanity.patch(eventLogId).set({
        processingStatus: isFinalFailure ? 'failed_permanent' : 'failed_retrying',
        error: processingError.message,
        retryCount: newRetryCount,
      }).commit();

      console.error('[easypost-webhook] processing failed', {
        eventType: webhookEvent.description,
        error: processingError.message,
        retryCount: newRetryCount,
        isFinalFailure,
      });

      // Return 500 for retry (unless final failure)
      return json(isFinalFailure ? 200 : 500, {
        error: isFinalFailure ? 'Failed permanently' : 'Processing failed, will retry',
      });
    }

  } catch (error: any) {
    console.error('[easypost-webhook] unhandled error', error);
    return json(500, { error: 'Server error' });
  }
};
```

---

## Phase 4: Implement Resend Email Webhook (HIGH PRIORITY)

### 4.1 Create Resend Webhook Handler

**File:** `fas-cms-fresh/netlify/functions/resend-webhook.ts`

```typescript
import type { Handler } from '@netlify/functions';
import { sanity } from './_sanity';
import crypto from 'crypto';

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

const json = (statusCode: number, body: any) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

/**
 * Verify Resend webhook signature
 * @see https://resend.com/docs/webhooks#verify-signature
 */
function verifyResendSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !RESEND_WEBHOOK_SECRET) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', RESEND_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

export const handler: Handler = async (event) => {
  try {
    const signature = event.headers['resend-signature'] || event.headers['Resend-Signature'];
    const rawBody = event.body || '';

    // ✅ CRITICAL: Verify signature
    if (!verifyResendSignature(rawBody, signature)) {
      console.error('[resend-webhook] Invalid signature');
      return json(401, { error: 'Invalid signature' });
    }

    const webhookEvent = JSON.parse(rawBody);

    // Extract emailLogId from tags
    const emailLogId = webhookEvent.data?.tags?.emailLogId;

    if (!emailLogId) {
      console.warn('[resend-webhook] No emailLogId in webhook event');
      return json(200, { received: true, note: 'No emailLogId tag' });
    }

    // ✅ Idempotent updates - use setIfMissing where appropriate
    switch (webhookEvent.type) {
      case 'email.sent':
        await sanity.patch(emailLogId).set({
          status: 'sent',
          emailServiceId: webhookEvent.data?.email_id,
        }).setIfMissing({
          sentAt: webhookEvent.created_at || new Date().toISOString(),
        }).commit();
        break;

      case 'email.delivered':
        await sanity.patch(emailLogId).set({
          status: 'delivered',
        }).setIfMissing({
          deliveredAt: webhookEvent.created_at || new Date().toISOString(),
        }).commit();
        break;

      case 'email.opened':
        // ✅ Idempotent: only set if not already set
        await sanity.patch(emailLogId).set({
          status: 'opened',
        }).setIfMissing({
          openedAt: webhookEvent.created_at || new Date().toISOString(),
        }).commit();
        break;

      case 'email.clicked':
        // ✅ Append to clickEvents array (idempotency handled by Sanity)
        await sanity.patch(emailLogId).set({
          status: 'clicked',
        }).setIfMissing({
          clickedAt: webhookEvent.created_at || new Date().toISOString(),
        }).append('clickEvents', [{
          _type: 'click',
          url: webhookEvent.data?.click?.link || '',
          timestamp: webhookEvent.created_at || new Date().toISOString(),
        }]).commit();
        break;

      case 'email.bounced':
        await sanity.patch(emailLogId).set({
          status: 'bounced',
          error: webhookEvent.data?.bounce?.message || 'Email bounced',
        }).commit();
        break;

      case 'email.complained':
        await sanity.patch(emailLogId).set({
          status: 'failed',
          error: 'Recipient marked as spam',
        }).commit();
        break;

      default:
        console.log('[resend-webhook] Unhandled event type:', webhookEvent.type);
    }

    return json(200, { received: true });

  } catch (error: any) {
    console.error('[resend-webhook] error', error);
    return json(500, { error: error.message || 'Server error' });
  }
};
```

### 4.2 Update Email Sending Function to Include emailLogId

**File:** `fas-cms-fresh/netlify/functions/_resend.ts`

**Update the `sendEmail` function:**

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  emailLogId?: string; // ✅ NEW
}

export async function sendEmail({
  to,
  subject,
  html,
  from = 'FAS Motorsports <noreply@fasmotorsports.com>',
  emailLogId,
}: SendEmailOptions) {
  // ✅ NEW: Create email log in Sanity BEFORE sending
  let logId = emailLogId;

  if (!logId) {
    const emailLog = await sanity.create({
      _type: 'emailLog',
      to: Array.isArray(to) ? to[0] : to,
      subject,
      status: 'queued',
    });
    logId = emailLog._id;
  }

  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
      tags: logId ? [{ name: 'emailLogId', value: logId }] : undefined,
    });

    // Update log with emailServiceId
    if (logId && result.data?.id) {
      await sanity.patch(logId).set({
        emailServiceId: result.data.id,
        status: 'sent',
        sentAt: new Date().toISOString(),
      }).commit();
    }

    return { success: true, emailLogId: logId, messageId: result.data?.id };

  } catch (error: any) {
    // Update log with error
    if (logId) {
      await sanity.patch(logId).set({
        status: 'failed',
        error: error.message,
      }).commit();
    }
    throw error;
  }
}
```

---

## Phase 5: Operational Tasks (CRITICAL)

### 5.1 Delete Duplicate Stripe Webhook File

**Action:** Delete `fas-cms-fresh/src/pages/api/webhooks.ts`

**Reason:** This is a duplicate of `netlify/functions/stripe-webhook.ts` and causes confusion.

### 5.2 Update Stripe Dashboard Webhook Endpoint

**CRITICAL:** This must be done BEFORE deleting the file.

**Steps:**

1. Log into [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to **Developers → Webhooks**
3. Find the old webhook endpoint (likely pointing to `/api/webhooks`)
4. Click **Delete** on the old endpoint
5. Verify the Netlify webhook endpoint exists:
   - URL: `https://fasmotorsports.com/.netlify/functions/stripe-webhook`
   - Events: Select all checkout, invoice, charge, and payment_intent events
   - Status: Enabled

### 5.3 Configure EasyPost Webhook

**Steps:**

1. Log into [EasyPost Dashboard](https://www.easypost.com/account/webhooks)
2. Click **Create Webhook**
3. URL: `https://fasmotorsports.com/.netlify/functions/easypost-webhook`
4. Events to subscribe:
   - `tracker.created`
   - `tracker.updated`
   - `shipment.failed`
5. Copy the **Webhook Secret** and add to env vars: `EASYPOST_WEBHOOK_SECRET`

### 5.4 Configure Resend Webhook

**Steps:**

1. Log into [Resend Dashboard](https://resend.com/webhooks)
2. Click **Add Webhook**
3. URL: `https://fasmotorsports.com/.netlify/functions/resend-webhook`
4. Events to subscribe:
   - `email.sent`
   - `email.delivered`
   - `email.opened`
   - `email.clicked`
   - `email.bounced`
   - `email.complained`
5. Copy the **Webhook Secret** and add to env vars: `RESEND_WEBHOOK_SECRET`

---

## Phase 6: Environment Variables

### 6.1 Add to `.env.local` (fas-cms-fresh)

```bash
# EasyPost
EASYPOST_API_KEY=EZAK_xxx
EASYPOST_WEBHOOK_SECRET=whsec_xxx

# Resend
RESEND_WEBHOOK_SECRET=whsec_xxx

# Warehouse Address (for EasyPost)
WAREHOUSE_COMPANY=FAS Motorsports
WAREHOUSE_STREET1=123 Main St
WAREHOUSE_STREET2=
WAREHOUSE_CITY=Phoenix
WAREHOUSE_STATE=AZ
WAREHOUSE_ZIP=85001
WAREHOUSE_PHONE=555-555-5555
```

### 6.2 Add to Netlify Environment Variables

Add all of the above via Netlify Dashboard:

1. Go to Site Settings → Environment Variables
2. Add each variable with the same name and value
3. Deploy scope: All (production + branch deploys)

---

## Phase 7: Testing Procedures

### 7.1 Test Stripe Webhook Event Logging

```bash
# Use Stripe CLI to send test events
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook

# In another terminal
stripe trigger checkout.session.completed
```

**Verify:**

- [ ] New `stripeWebhookEvent` document created in Sanity
- [ ] `processingStatus` = `completed`
- [ ] Order created with correct data
- [ ] Invoice linked to order via `sourceInvoice` reference

### 7.2 Test EasyPost Label Creation

**Via Sanity Studio:**

1. Create a test order with:
   - Valid shipping address
   - Weight: `{value: 2, unit: 'pound'}`
   - Dimensions: `{length: 12, width: 10, height: 8}`
2. Copy the order ID
3. Call the function:

```bash
curl -X POST https://localhost:8888/.netlify/functions/create-shipping-label \
  -H "Content-Type: application/json" \
  -d '{"orderId": "ORDER_ID_HERE", "serviceLevel": "cheapest"}'
```

**Verify:**

- [ ] Order `fulfillmentStatus` changes: `pending` → `creating_label` → `label_created`
- [ ] `trackingNumber`, `carrier`, `service` populated
- [ ] `shippingLabelUrl` contains PDF link
- [ ] New `shippingLabel` document created
- [ ] No `fulfillmentError` present

**Test Error Handling:**

1. Test with invalid address (should fail gracefully)
2. Verify `fulfillmentStatus` = `label_creation_failed`
3. Verify `fulfillmentError` contains error message

### 7.3 Test EasyPost Webhook

**Manual webhook test:**

```bash
curl -X POST https://localhost:8888/.netlify/functions/easypost-webhook \
  -H "Content-Type: application/json" \
  -H "X-EasyPost-Signature: test-signature" \
  -d '{
    "id": "evt_test_123",
    "description": "tracker.updated",
    "result": {
      "tracking_code": "TRACKING_NUMBER_FROM_LABEL",
      "status": "in_transit",
      "tracking_details": []
    }
  }'
```

**Verify:**

- [ ] Order `trackingStatus` updated to `in_transit`
- [ ] `trackingUpdatedAt` timestamp updated
- [ ] `easypostWebhookEvent` document created
- [ ] Event `processingStatus` = `completed`

### 7.4 Test Resend Email Webhook

**Send test email:**

```typescript
// In a test function or Netlify function
await sendEmail({
  to: 'test@example.com',
  subject: 'Test Email',
  html: '<p>Testing webhook integration</p>',
});
```

**Then trigger Resend webhook events manually** via Resend Dashboard

**Verify:**

- [ ] `emailLog` document created with status `queued`
- [ ] After `email.sent` event: status = `sent`
- [ ] After `email.delivered` event: `deliveredAt` timestamp set
- [ ] After `email.opened` event: `openedAt` timestamp set
- [ ] After `email.clicked` event: `clickEvents` array populated

---

## Phase 8: Monitoring & Alerting

### 8.1 Create Dead-Letter Queue Admin Tool

**File:** `packages/sanity-config/src/components/studio/DeadLetterQueueDashboard.tsx`

**Purpose:** Allow admins to view and replay failed webhook events

**Features:**

- List all `failed_permanent` events
- Show error message and stack trace
- "Replay Event" button to reprocess
- Filter by event type and date range

**Implementation:** (Stub for now, full implementation as separate task)

```typescript
// TODO: Build admin UI for dead-letter queue
// - Query: *[_type in ["stripeWebhookEvent", "easypostWebhookEvent"] && processingStatus == "failed_permanent"]
// - Display in table with event type, error, retry count
// - Add "Replay" button that calls a replay function
```

### 8.2 Set Up Error Alerting

**Recommendation:** Use [Sentry](https://sentry.io) or similar

**Steps:**

1. Add Sentry to Netlify functions:

```bash
npm install @sentry/serverless
```

2. Wrap handlers:

```typescript
import * as Sentry from '@sentry/serverless';

Sentry.AWSLambda.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

export const handler = Sentry.AWSLambda.wrapHandler(async (event) => {
  // Your handler logic
});
```

3. Configure alerts for:
   - Webhook signature failures
   - Failed event processing (after retries)
   - EasyPost API errors
   - Resend email failures

---

## Phase 9: Documentation

### 9.1 Update docs/codex.md

Add sections:

- **Webhook Architecture**: Describe idempotency, state machines, dead-letter queue
- **EasyPost Integration**: How label creation works
- **Email Tracking**: How email events flow

### 9.2 Create docs/webhooks.md

Include:

- Webhook URLs for each service
- Event types handled
- Signature verification methods
- Testing procedures
- Monitoring dashboards

### 9.3 Create docs/fulfillment-workflow.md

Document the shipping label workflow:

1. Order placed → `fulfillmentStatus: pending`
2. Admin clicks "Create Label" → `fulfillmentStatus: creating_label`
3. EasyPost API called → Label purchased
4. Order updated → `fulfillmentStatus: label_created`
5. EasyPost webhook → Tracking updates flow in automatically

---

## Success Criteria

### Phase 1-2: Schema & Stripe Updates
- [ ] All schema changes deployed to Sanity Studio
- [ ] Stripe webhook logs events to `stripeWebhookEvent`
- [ ] Failed events marked `failed_permanent` after max retries
- [ ] Order/invoice references populated bidirectionally

### Phase 3: EasyPost Integration
- [ ] `create-shipping-label` function works end-to-end
- [ ] Label creation uses state machine pattern
- [ ] Errors don't result in purchased labels without Sanity record
- [ ] `easypost-webhook` handler processes tracking updates
- [ ] Signature verification prevents unauthorized access
- [ ] Idempotent webhook processing prevents duplicate updates

### Phase 4: Resend Integration
- [ ] `resend-webhook` handler updates email logs
- [ ] Email sending creates logs BEFORE sending
- [ ] Click tracking works (clickEvents array populates)
- [ ] Signature verification prevents unauthorized access

### Phase 5-6: Operations
- [ ] Old webhook file deleted
- [ ] Stripe Dashboard webhook updated
- [ ] EasyPost webhook configured
- [ ] Resend webhook configured
- [ ] All environment variables added to Netlify

### Phase 7: Testing
- [ ] All test procedures pass
- [ ] Error scenarios handled gracefully
- [ ] Retry logic works correctly
- [ ] Dead-letter queue prevents data loss

### Phase 8-9: Monitoring & Docs
- [ ] Error alerting configured
- [ ] Documentation updated
- [ ] Team trained on new workflows

---

## Timeline Estimate

- **Week 1:** Phases 1-2 (Schema updates, Stripe webhook improvements)
- **Week 2:** Phase 3 (EasyPost integration)
- **Week 3:** Phases 4-6 (Resend, operations, env setup)
- **Week 4:** Phases 7-9 (Testing, monitoring, docs)

---

## Rollback Plan

If issues arise:

1. **Revert schema changes:** Deploy previous Sanity Studio version
2. **Disable new webhooks:** In provider dashboards, disable webhook endpoints
3. **Restore old Stripe webhook:** Re-add `src/pages/api/webhooks.ts` temporarily
4. **Monitor logs:** Check Netlify function logs for errors

---

## Security Checklist

Before deploying to production:

- [ ] All webhook handlers verify signatures
- [ ] Environment variables stored securely (not in code)
- [ ] No API keys in client-side code
- [ ] Rate limiting considered (Netlify functions have 10-second timeout)
- [ ] Error messages don't leak sensitive data
- [ ] Dead-letter queue prevents infinite retries
- [ ] Idempotency prevents duplicate operations

---

## Notes for Implementation

1. **Start small:** Implement Phase 1-2 first, test thoroughly, then move to Phase 3
2. **Use feature flags:** Consider wrapping new webhook logic in feature flags
3. **Monitor closely:** Watch error rates and webhook processing times
4. **Document edge cases:** Any weird behavior should be documented
5. **Get team buy-in:** Make sure operations team understands new workflows

---

**End of Implementation Guide**

This document should be treated as a living guide. Update it as implementation progresses and new requirements emerge.
