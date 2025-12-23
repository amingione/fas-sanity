# Schema Alignment Fix

**Version:** 1.0.0  
**Date:** 2025-12-23  
**Purpose:** Fix critical schema misalignments between fas-cms-fresh and fas-sanity

---

## Overview

This document contains the complete fix for schema misalignments discovered in the audit.

**Issues Fixed:**

1. ✅ Cart item type mismatch (`cartLine` → `orderCartItem`)
2. ✅ Customer reference fields (`customer`/`userId` → `customerRef`/`customerName`/`customerEmail`)
3. ✅ Shipping address source (billing → shipping)
4. ✅ Missing required fields (orderType, billingAddress, amountDiscount, etc.)
5. ✅ Stripe metadata keys (userId → customer_id, etc.)
6. ✅ Cart metadata format (compact → full object)
7. ✅ Product metadata (add options/upgrades)
8. ✅ API version alignment
9. ✅ Totals calculation consistency

---

## Files to Modify

1. `fas-cms-fresh/src/pages/api/checkout.ts`
2. `fas-cms-fresh/src/pages/api/webhooks.ts`
3. `fas-sanity/schemas/order.tsx` (minor update)

---

## Change 1: fas-cms-fresh/src/pages/api/checkout.ts

### Update Stripe API Version

**FIND:**

```typescript
const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20'
})
REPLACE WITH:

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20'
})
Update Metadata Keys
FIND:

metadata: {
  userId: session?.userId,
  userEmail: session?.userEmail,
  site: 'fas-cms-fresh',
  cart: JSON.stringify(cart.map(i => ({ n: i.productName, q: i.quantity, p: i.price })))
}
REPLACE WITH:

metadata: {
  customer_id: session?.userId || '',
  customer_email: session?.userEmail || '',
  order_type: 'retail', // TODO: Set to 'wholesale' for vendor customers
  cart_data: JSON.stringify(cart.map(item => ({
    productId: item.productId,
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    price: item.price,
    unitPrice: item.unitPrice || item.price,
    options: item.options,
    upgrades: item.upgrades,
    imageUrl: item.imageUrl
  })))
}
Add Options/Upgrades to Line Item Metadata
FIND:

metadata: {
  sanity_product_id: item.productId,
  sku: item.sku
}
REPLACE WITH:

metadata: {
  sanity_product_id: item.productId || '',
  sku: item.sku || '',
  options: item.options || '',
  upgrades: JSON.stringify(item.upgrades || [])
}
Add Cart Validation
ADD at the start of the POST handler (after parsing JSON):

// Validate cart
if (!cart || !Array.isArray(cart) || cart.length === 0) {
  return new Response(
    JSON.stringify({ error: 'Cart is empty or invalid' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  )
}
Add Error Handling
WRAP the entire checkout session creation in try/catch:

try {
  const checkoutSession = await stripe.checkout.sessions.create({
    // ... existing code
  })

  return new Response(
    JSON.stringify({ url: checkoutSession.url }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )

} catch (error) {
  console.error('Checkout creation error:', error)

  if (error instanceof Stripe.errors.StripeError) {
    return new Response(
      JSON.stringify({
        error: 'Payment processing failed',
        message: error.message
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ error: 'Failed to create checkout session' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  )
}
Change 2: fas-cms-fresh/src/pages/api/webhooks.ts
Update API Versions
FIND:

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil'
})
REPLACE WITH:

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20'
})
FIND:

const sanityClient = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID!,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET!,
  token: import.meta.env.SANITY_API_TOKEN!,
  apiVersion: '2023-06-07',
  useCdn: false
})
REPLACE WITH:

const sanityClient = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID!,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET!,
  token: import.meta.env.SANITY_API_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false
})
Replace Order Creation Function
ADD this function after the POST handler (or replace existing createOrderFromSession):

async function createOrderFromSession(session: Stripe.Checkout.Session) {
  const lineItems = session.line_items?.data || []

  // Map line items to cart format
  const cart = lineItems.map(item => {
    const product = item.price?.product as Stripe.Product
    const metadata = product?.metadata || {}

    let upgrades: string[] = []
    try {
      upgrades = metadata.upgrades ? JSON.parse(metadata.upgrades) : []
    } catch (e) {
      console.warn('Failed to parse upgrades:', metadata.upgrades)
    }

    return {
      _type: 'orderCartItem', // ✅ CRITICAL: Must be orderCartItem, not cartLine
      _key: generateKey(),
      productId: metadata.sanity_product_id || null,
      productName: item.description || product?.name || 'Unknown Product',
      sku: metadata.sku || null,
      quantity: item.quantity || 1,
      price: (item.amount_total || 0) / 100,
      unitPrice: (item.price?.unit_amount || 0) / 100,
      options: metadata.options || null,
      upgrades: upgrades,
      imageUrl: product?.images?.[0] || null
    }
  })

  // ✅ CRITICAL: Use shipping_details.address, NOT customer_details.address
  const shippingDetails = session.shipping_details
  const shippingAddress = shippingDetails?.address ? {
    name: shippingDetails.name || '',
    phone: session.customer_details?.phone || '',
    email: session.customer_details?.email || '',
    addressLine1: shippingDetails.address.line1 || '',
    addressLine2: shippingDetails.address.line2 || '',
    city: shippingDetails.address.city || '',
    state: shippingDetails.address.state || '',
    postalCode: shippingDetails.address.postal_code || '',
    country: shippingDetails.address.country || ''
  } : undefined

  const customerDetails = session.customer_details
  const billingAddress = customerDetails?.address ? {
    name: customerDetails.name || '',
    phone: customerDetails.phone || '',
    email: customerDetails.email || '',
    addressLine1: customerDetails.address.line1 || '',
    addressLine2: customerDetails.address.line2 || '',
    city: customerDetails.address.city || '',
    state: customerDetails.address.state || '',
    postalCode: customerDetails.address.postal_code || '',
    country: customerDetails.address.country || ''
  } : undefined

  // ✅ CRITICAL: Use total_details for all amounts
  const amountSubtotal = (session.amount_subtotal || 0) / 100
  const amountTax = (session.total_details?.amount_tax || 0) / 100
  const amountShipping = (session.total_details?.amount_shipping || 0) / 100
  const amountDiscount = (session.total_details?.amount_discount || 0) / 100
  const totalAmount = (session.amount_total || 0) / 100

  const orderNumber = `FAS-${Date.now().toString().slice(-6)}`

  // ✅ CRITICAL: Use exact field names from schema
  const order = await sanityClient.create({
    _type: 'order',
    orderNumber: orderNumber,
    createdAt: new Date().toISOString(),
    status: 'paid',
    orderType: session.metadata?.order_type || 'retail',
    paymentStatus: session.payment_status || 'paid',

    // ✅ CRITICAL: customerRef (reference), customerName, customerEmail
    customerRef: session.metadata?.customer_id ? {
      _type: 'reference',
      _ref: session.metadata.customer_id
    } : undefined,
    customerName: customerDetails?.name || '',
    customerEmail: customerDetails?.email || '',

    cart: cart,

    // ✅ CRITICAL: All amount fields required
    amountSubtotal: amountSubtotal,
    amountTax: amountTax,
    amountShipping: amountShipping,
    amountDiscount: amountDiscount,
    totalAmount: totalAmount,

    shippingAddress: shippingAddress,
    billingAddress: billingAddress,

    currency: session.currency || 'usd',
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent as string || null,
    paymentIntentId: session.payment_intent as string || null,

    // ✅ CRITICAL: stripeSummary must be an object
    stripeSummary: {
      data: JSON.stringify(session),
      amountDiscount: amountDiscount,
      paymentCaptured: session.payment_status === 'paid',
      paymentCapturedAt: session.payment_status === 'paid' ? new Date().toISOString() : undefined,
      webhookNotified: true
    }
  })

  console.log('✅ Order created:', order._id, orderNumber)
  return order
}

function generateKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
Update checkout.session.completed Case
FIND:

case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session
  // ... existing order creation code
}
REPLACE WITH:

case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session

  const fullSession = await stripe.checkout.sessions.retrieve(
    session.id,
    { expand: ['line_items.data.price.product'] }
  )

  await createOrderFromSession(fullSession)
  break
}
Add Refund Handler (Optional but Recommended)
ADD this case to the switch statement:

case 'charge.refunded': {
  const charge = event.data.object as Stripe.Charge
  const paymentIntentId = charge.payment_intent as string

  if (paymentIntentId) {
    const orders = await sanityClient.fetch(
      `*[_type == "order" && stripePaymentIntentId == $paymentIntentId]`,
      { paymentIntentId }
    )

    if (orders.length > 0) {
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
    }
  }
  break
}
Change 3: fas-sanity/schemas/order.tsx
Update orderType Options
FIND:

{
  name: 'orderType',
  type: 'string',
  options: {
    list: [
      { title: 'Online', value: 'online' },
      { title: 'In-Store', value: 'in-store' },
      { title: 'Phone', value: 'phone' }
    ]
  },
  group: 'overview'
}
REPLACE WITH:

{
  name: 'orderType',
  type: 'string',
  options: {
    list: [
      { title: 'Online', value: 'online' },
      { title: 'Retail', value: 'retail' },
      { title: 'Wholesale', value: 'wholesale' },
      { title: 'In-Store', value: 'in-store' },
      { title: 'Phone', value: 'phone' }
    ]
  },
  group: 'overview'
}
Testing Checklist
Before Deploying
 Environment variables set correctly
 Stripe webhook endpoint configured
 Test with Stripe CLI: stripe listen --forward-to localhost:4321/api/webhooks
Test Flow
Create Test Order

Add items to cart
Proceed to checkout
Use Stripe test card: 4242 4242 4242 4242
Verify Order in Sanity

 Order appears in Sanity Studio
 orderNumber is set (e.g., FAS-123456)
 customerName and customerEmail populated
 customerRef links to customer (if logged in)
 orderType is set (e.g., retail)
 cart items have _type: 'orderCartItem'
 shippingAddress has correct shipping address
 billingAddress has correct billing address
 All amount fields populated
 stripePaymentIntentId is set
 stripeSummary has data
Verify Totals Match

Stripe Dashboard Total = Sanity totalAmount
Stripe Subtotal = Sanity amountSubtotal
Stripe Tax = Sanity amountTax
Stripe Shipping = Sanity amountShipping
Test with Discount Code

 Apply promo code in checkout
 Verify amountDiscount is populated
 Verify totalAmount reflects discount
Test Refund

 Refund order in Stripe Dashboard
 Verify order status changes to refunded
 Verify amountRefunded is set
Regression Testing
 Load existing orders (should still display)
 Verify old orders don't break
 Check that cart items display correctly
Rollback Plan
If issues occur:

Quick Rollback (Git)
git revert HEAD
git push
Manual Rollback
Revert checkout.ts:

Change metadata back to userId, userEmail, site
Remove options and upgrades from line item metadata
Change API version back to 2024-06-20
Revert webhooks.ts:

Change _type: 'orderCartItem' back to _type: 'cartLine'
Change customerRef back to customer
Remove new fields
Change API versions back
Summary
What Changed
Component	Before	After
Cart item type	cartLine	orderCartItem ✅
Customer field	customer	customerRef ✅
Customer name	Missing	customerName ✅
Order type	Not set	retail/wholesale ✅
Billing address	Missing	Full object ✅
Shipping source	Billing address	Shipping address ✅
Discount amount	Missing	amountDiscount ✅
Payment intent	paymentIntentId only	Both fields ✅
Stripe summary	Missing	Rich object ✅
Metadata keys	userId, userEmail	customer_id, customer_email ✅
Product metadata	sku only	sku, options, upgrades ✅
API versions	Mixed	Aligned to 2024-11-20 ✅
End of Schema Alignment Fix v1.0.0 EOF
```
