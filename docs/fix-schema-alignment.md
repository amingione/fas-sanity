# Schema Alignment Fix

**Version:** 2.0.0  
**Date:** 2025-12-23  
**Purpose:** Comprehensive fix for all schema misalignments and integration issues between fas-cms-fresh and fas-sanity

---

## Overview

This document contains the complete fix for all schema misalignments, API inconsistencies, and integration issues discovered in the comprehensive audit.

**NOTE:** Local directory is `fas-cms-fresh` (clone of `fas-cms` GitHub repo)

---

## Issues Fixed

### Critical (v1.0.0 - v1.0.2)
1. ✅ Cart item type mismatch (`cartLine` → `orderCartItem`)
2. ✅ Customer reference fields (`customer`/`userId` → `customerRef`/`customerName`/`customerEmail`)
3. ✅ Shipping address source (billing → shipping)
4. ✅ Missing required fields (orderType, billingAddress, amountDiscount, etc.)
5. ✅ Stripe metadata keys (userId → customer_id, etc.)
6. ✅ Cart metadata format (compact → full object)
7. ✅ Product metadata (add options/upgrades)
8. ✅ API version alignment
9. ✅ Totals calculation consistency

### New in v2.0.0
10. ✅ Webhook refund handler bug (embedded in formatOrderDate)
11. ✅ save-order.ts missing required fields
12. ✅ All Stripe API version standardization (2024-11-20)
13. ✅ All Sanity API version standardization (2024-01-01)
14. ✅ Schema field mismatches in queries
15. ✅ Auth field name mismatch (authId → userId)
16. ✅ Email logging for all transactional emails
17. ✅ Shipping metadata capture and usage
18. ✅ EasyPost rate fetching endpoint
19. ✅ EasyPost label creation endpoint
20. ✅ Attribution tracking with UTM parameters

---

## Files Modified

### Critical Fixes
1. `fas-cms-fresh/src/pages/api/checkout.ts`
2. `fas-cms-fresh/src/pages/api/webhooks.ts`
3. `fas-cms-fresh/src/pages/api/orders/save-order.ts`
4. `fas-cms-fresh/src/pages/api/orders/[id].ts`
5. `fas-cms-fresh/src/pages/api/orders/get-user-order.ts`
6. `fas-cms-fresh/src/pages/api/customer/update.ts`
7. `fas-cms-fresh/src/pages/api/vendor/invoices/pay.ts`
8. `fas-cms-fresh/src/lib/sanityClient.ts`
9. `fas-cms-fresh/src/lib/sanityServer.ts`
10. `fas-cms-fresh/src/lib/sanityFetch.ts`
11. `fas-cms-fresh/src/lib/sanity-client.ts`
12. `fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx`

### New Files Created
13. `fas-cms-fresh/src/pages/api/shipping/rates.ts` (NEW)
14. `fas-cms-fresh/src/pages/api/shipping/create-label.ts` (NEW)
15. `fas-cms-fresh/src/pages/api/attribution/track.ts` (NEW)

---

## Change Summary by Priority

### 🔴 CRITICAL FIXES

#### 1. Webhook Refund Handler
- **File:** `fas-cms-fresh/src/pages/api/webhooks.ts`
- **Fix:** Move refund handling from `formatOrderDate` to main switch statement
- **Impact:** Refunds now process correctly

#### 2. Customer Reference Alignment
- **Files:** `webhooks.ts`, `save-order.ts`, `[id].ts`
- **Fix:** Use `customerRef` (reference) instead of `customer` (string)
- **Impact:** Customer linking works consistently

#### 3. Missing Order Fields
- **File:** `save-order.ts`
- **Fix:** Add `orderNumber`, `amountSubtotal`, `amountTax`, `amountShipping`, `paymentStatus`
- **Impact:** Orders have complete data

#### 4. Stripe API Version Standardization
- **Files:** `checkout.ts`, `webhooks.ts`, `save-order.ts`, `pay.ts`
- **Fix:** All use `apiVersion: '2024-11-20'`
- **Impact:** Consistent Stripe behavior

#### 5. Sanity API Version Standardization
- **Files:** All Sanity client configs
- **Fix:** All use `apiVersion: '2024-01-01'`
- **Impact:** Consistent Sanity behavior

---

### 🟡 HIGH PRIORITY FIXES

#### 6. Schema Field Mismatches
- **File:** `get-user-order.ts`
- **Fix:** Remove non-existent fields, use correct field names
- **Impact:** Queries work without errors

#### 7. Auth Field Name
- **File:** `customer/update.ts`
- **Fix:** Use `userId` instead of `authId`
- **Impact:** Customer updates work correctly

#### 8. Email Logging
- **Files:** `webhooks.ts`, `contact.ts`, quote files
- **Fix:** Create `emailLog` documents for all emails
- **Impact:** Email audit trail exists

#### 9. Shipping Metadata
- **Files:** `checkout.ts`, `webhooks.ts`
- **Fix:** Capture and use shipping selection metadata
- **Impact:** Shipping carrier/service fields populated

---

### 🟢 MEDIUM PRIORITY FIXES

#### 10. EasyPost Integration
- **Files:** NEW `shipping/rates.ts`, `shipping/create-label.ts`
- **Fix:** Add missing EasyPost endpoints
- **Impact:** Shipping rates and labels can be created

#### 11. Attribution Tracking
- **Files:** NEW `attribution/track.ts`, updated `webhooks.ts`
- **Fix:** Persist UTM parameters to attribution schema
- **Impact:** Marketing ROI can be measured

---

## Detailed Changes

### CRITICAL FIX 1: Webhook Refund Handler

**File:** `fas-cms-fresh/src/pages/api/webhooks.ts`

**Remove refund handling from `formatOrderDate` function**

**Add to main switch statement:**
```typescript
case 'charge.refunded': {
  const charge = event.data.object as Stripe.Charge
  const paymentIntentId = charge.payment_intent as string
  
  if (!paymentIntentId) {
    console.warn('No payment intent ID in refund charge')
    break
  }
  
  const orders = await sanityClient.fetch(
    `*[_type == "order" && stripePaymentIntentId == $paymentIntentId]`,
    { paymentIntentId }
  )
  
  if (orders.length === 0) {
    console.warn('No order found for payment intent:', paymentIntentId)
    break
  }
  
  const order = orders[0]
  await sanityClient.patch(order._id)
    .set({
      status: 'refunded',
      paymentStatus: 'refunded',
      amountRefunded: charge.amount_refunded / 100,
      lastRefundedAt: new Date().toISOString()
    })
    .commit()
  
  console.log('✅ Order refunded:', order._id)
  break
}
```

CRITICAL FIX 2: Customer Reference Fields
A. webhooks.ts - Order Creation

customerRef: session.metadata?.customer_id ? {
  _type: 'reference',
  _ref: session.metadata.customer_id
} : undefined,
customerName: customerDetails?.name || '',
customerEmail: customerDetails?.email || '',
B. save-order.ts

// CHANGE FROM:
customer: customerId

// CHANGE TO:
customerRef: customerId ? {
  _type: 'reference',
  _ref: customerId
} : undefined,
customerEmail: email || '',
customerName: name || '',
C. [id].ts - Query Fix

// CHANGE FROM:
*[_type == "order" && customer->email == $email]

// CHANGE TO:
*[_type == "order" && customerRef->email == $email]

CRITICAL FIX 3: Missing Order Fields in save-order.ts
const order = await sanityClient.create({
  _type: 'order',
  
  // ✅ ADD REQUIRED FIELDS:
  orderNumber: `FAS-${Date.now().toString().slice(-6)}`,
  createdAt: new Date().toISOString(),
  status: 'pending',
  orderType: 'retail',
  paymentStatus: 'pending',
  
  amountSubtotal: subtotal || 0,
  amountTax: tax || 0,
  amountShipping: shipping || 0,
  amountDiscount: discount || 0,
  totalAmount: total || 0,
  
  customerRef: customerId ? {
    _type: 'reference',
    _ref: customerId
  } : undefined,
  customerEmail: email || '',
  customerName: name || '',
  
  cart: cart,
  currency: 'usd',
  // ... rest
})

CRITICAL FIX 4: Stripe API Versions
Update all files to use 2024-11-20:

// checkout.ts, webhooks.ts, save-order.ts, pay.ts
const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20'
})

CRITICAL FIX 5: Sanity API Versions
Update all Sanity clients to use 2024-01-01:

// All Sanity client configs
const sanityClient = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID!,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET!,
  token: import.meta.env.SANITY_API_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false
})

HIGH PRIORITY FIX 6: Schema Field Mismatches
File: get-user-order.ts

// CORRECT QUERY:
*[_type == "order" && customerRef->email == $email]{
  _id,
  orderNumber,
  status,
  paymentStatus,
  orderType,
  totalAmount,
  amountSubtotal,
  amountTax,
  amountShipping,
  createdAt,
  carrier,
  service,
  trackingNumber,
  trackingUrl,
  shippingAddress,
  billingAddress,
  cart,
  customerName,
  customerEmail
}

HIGH PRIORITY FIX 7: Auth Field Name
File: customer/update.ts

// CHANGE FROM:
authId: session.userId

// CHANGE TO:
userId: session.userId

HIGH PRIORITY FIX 8: Email Logging
A. Order Confirmation (webhooks.ts)

await sanityClient.create({
  _type: 'emailLog',
  to: customerEmail,
  subject: `Order Confirmation - ${orderNumber}`,
  status: 'sent',
  sentAt: new Date().toISOString(),
  emailType: 'order_confirmation',
  relatedOrder: {
    _type: 'reference',
    _ref: order._id
  }
}).catch(err => console.error('Failed to log email:', err))
B. Contact Form (contact.ts)

await sanityClient.create({
  _type: 'emailLog',
  to: email,
  subject: 'Contact Form Submission',
  status: 'sent',
  sentAt: new Date().toISOString(),
  emailType: 'contact_form',
  body: message
}).catch(err => console.error('Failed to log email:', err))

HIGH PRIORITY FIX 9: Shipping Metadata
A. Capture in checkout.ts

metadata: {
  customer_id: userId,
  customer_email: userEmail,
  order_type: orderType,
  cart_data: JSON.stringify(cart),
  
  // ✅ ADD:
  shipping_carrier: selectedCarrier || '',
  shipping_service: selectedService || '',
  easypost_rate_id: selectedRateId || '',
  
  utm_source: utmSource || '',
  utm_medium: utmMedium || '',
  utm_campaign: utmCampaign || ''
}
B. Use in webhooks.ts

carrier: session.metadata?.shipping_carrier || null,
service: session.metadata?.shipping_service || null,
easypostRateId: session.metadata?.easypost_rate_id || null,

MEDIUM PRIORITY FIX 10: EasyPost Endpoints
NEW FILE: fas-cms-fresh/src/pages/api/shipping/rates.ts

import EasyPost from '@easypost/api'
import type { APIRoute } from 'astro'

const easypost = new EasyPost(import.meta.env.EASYPOST_API_KEY!)

export const POST: APIRoute = async ({ request }) => {
  try {
    const { fromAddress, toAddress, parcel } = await request.json()
    
    const shipment = await easypost.Shipment.create({
      from_address: fromAddress,
      to_address: toAddress,
      parcel: parcel
    })
    
    return new Response(
      JSON.stringify({ success: true, rates: shipment.rates, shipmentId: shipment.id }),
      { status: 200 }
    )
  } catch (error) {
    console.error('EasyPost rate fetch error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch shipping rates' }),
      { status: 500 }
    )
  }
}
NEW FILE: fas-cms-fresh/src/pages/api/shipping/create-label.ts

import EasyPost from '@easypost/api'
import { createClient } from '@sanity/client'
import type { APIRoute } from 'astro'

const easypost = new EasyPost(import.meta.env.EASYPOST_API_KEY!)
const sanityClient = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID!,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET!,
  token: import.meta.env.SANITY_API_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false
})

export const POST: APIRoute = async ({ request }) => {
  try {
    const { orderId, shipmentId, rateId } = await request.json()
    
    const shipment = await easypost.Shipment.retrieve(shipmentId)
    await shipment.buy(rateId)
    
    await sanityClient.patch(orderId)
      .set({
        easyPostShipmentId: shipment.id,
        trackingNumber: shipment.tracking_code,
        trackingUrl: shipment.tracker?.public_url,
        shippingLabelUrl: shipment.postage_label?.label_url,
        carrier: shipment.selected_rate?.carrier,
        service: shipment.selected_rate?.service,
        labelCreatedAt: new Date().toISOString()
      })
      .commit()
    
    return new Response(
      JSON.stringify({ success: true, trackingNumber: shipment.tracking_code }),
      { status: 200 }
    )
  } catch (error) {
    console.error('EasyPost label creation error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create shipping label' }),
      { status: 500 }
    )
  }
}

MEDIUM PRIORITY FIX 11: Attribution Tracking
NEW FILE: fas-cms-fresh/src/pages/api/attribution/track.ts

import { createClient } from '@sanity/client'
import type { APIRoute } from 'astro'

const sanityClient = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID!,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET!,
  token: import.meta.env.SANITY_API_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false
})

export const POST: APIRoute = async ({ request }) => {
  try {
    const { orderId, utmParams, sessionId } = await request.json()
    
    const attribution = await sanityClient.create({
      _type: 'attribution',
      order: { _type: 'reference', _ref: orderId },
      sessionId: sessionId || null,
      utmSource: utmParams?.utm_source || null,
      utmMedium: utmParams?.utm_medium || null,
      utmCampaign: utmParams?.utm_campaign || null,
      utmTerm: utmParams?.utm_term || null,
      utmContent: utmParams?.utm_content || null,
      timestamp: new Date().toISOString()
    })
    
    return new Response(
      JSON.stringify({ success: true, attribution }),
      { status: 200 }
    )
  } catch (error) {
    console.error('Attribution tracking error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to track attribution' }),
      { status: 500 }
    )
  }
}
UPDATE: webhooks.ts - Add after order creation:

// Track attribution
if (session.metadata?.utm_source) {
  try {
    await sanityClient.create({
      _type: 'attribution',
      order: { _type: 'reference', _ref: order._id },
      sessionId: session.metadata.session_id || null,
      utmSource: session.metadata.utm_source || null,
      utmMedium: session.metadata.utm_medium || null,
      utmCampaign: session.metadata.utm_campaign || null,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('Failed to track attribution:', err)
  }
}

Testing Checklist
Critical Fixes
 Refund handler in main switch (not in formatOrderDate)
 All order writes use customerRef
 All order queries use customerRef->email
 save-order.ts includes all required fields
 All Stripe clients use 2024-11-20
 All Sanity clients use 2024-01-01
High Priority
 Queries use only schema fields
 customer/update uses userId
 Email logs created for all emails
 Shipping metadata captured and used
Medium Priority
 EasyPost rates endpoint works
 EasyPost label endpoint works
 Attribution tracking works
Rollback Plan
# Quick rollback
git diff > v2-fixes-backup.patch
git reset --hard HEAD

# To reapply
git apply v2-fixes-backup.patch
Version History
v2.0.0 (2025-12-23): Comprehensive fixes for all audit issues
v1.0.2 (2025-12-23): Updated paths for local clone
v1.0.1 (2025-12-23): Corrected order.tsx path
v1.0.0 (2025-12-23): Initial schema alignment fixes
