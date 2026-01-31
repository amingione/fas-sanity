# EasyPost Reversion — 3‑Phase Execution Document

PURPOSE:
This document is intentionally structured for Codex consumption.

It is divided into THREE STRICT PHASES:

PHASE 1 — AUDIT (what exists, what failed, what must not be repeated)
PHASE 2 — PLAN (target architecture and constraints)
PHASE 3 — IMPLEMENT (authorized code changes only)

Codex MUST read and complete phases in order.
Codex MUST NOT skip directly to implementation without validating Phase 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — AUDIT (READ‑ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following describes:

- previously working EasyPost behavior
- known failed attempts
- contradictions currently present in the codebase

NO implementation is allowed in this phase.

### Final flow you used

```
Cart
→ Create Stripe Checkout Session
→ Customer enters address inside Stripe
→ EasyPost generates live rates
→ Customer selects shipping
→ Customer pays
```

No address fields in cart.
No duplicate UI.
Stripe handled address collection.

---

## Why this version existed

You intentionally removed:

- shipping address form in cart
- zip code preview logic
- pre-checkout shipping UI
  Because:
- Stripe already collects address better
- fewer failure points
- cleaner UX
- lower abandonment
  So shipping became **checkout-owned**, not cart-owned.

---

## Step‑by‑step — exactly what happened

### 1️⃣ Cart → create checkout session

Repo: fas-cms-fresh
User clicks **Checkout**.
Frontend sends:

```json
{
  "cartItems": [...],
  "orderId": "ord_123"
}
```

No address included.

---

### 2️⃣ Server creates Stripe Checkout Session

In:

```fas-cms-fresh
/api/stripe/create-checkout-session.ts
```

You created the session with:

```
shipping_address_collection: {
  allowed_countries: ['US'],
}
```

- This forced Stripe to collect address **inside checkout**.
  You did NOT collect address earlier.

---

### 3️⃣ Stripe collects customer address

Inside Stripe UI:

- full shipping address
- validated
- normalized
- country/state verified
  Only after this step does Stripe proceed.

---

### 4️⃣ Address triggers EasyPost rate generation

This is the critical part.

#### What happened behind the scenes:

Stripe emitted:

```
checkout.session.shipping_details
```

This included:

```json
{
  "address": {
    "line1": "...",
    "city": "...",
    "state": "...",
    "postal_code": "...",
    "country": "US"
  }
}
```

At this moment:

- Stripe had address
- customer had not paid yet
- session was still open

---

### 5️⃣ EasyPost rate quotes were generated dynamically

Your backend then:

- used the Stripe-provided address
- constructed an EasyPost shipment
- fetched live rates
- injected those rates into checkout
  Conceptually:

```ts
const shipment = await easypost.Shipment.create({
  from_address,
  to_address: stripeShippingAddress,
  parcel,
})
const rates = shipment.rates
```

These were **true carrier rates**.

---

### 6️⃣ Stripe showed shipping options dynamically

Stripe rendered:

- USPS Priority
- UPS Ground
- Express
- etc.
  **(we are only using FedEx and UPS currently)**
  Customer selected one **inside checkout after address collection inside Stripe checkout BEFORE PAYMENT**.
  **No custom UI.**
  **No cart shipping step.**

---

### 7️⃣ Customer paid

Once shipping selected:

- Stripe finalized total
- customer paid
- session completed

---

### 8️⃣ Webhook finalized shipment purchase

On:

```
checkout.session.completed
```

Backend then:

- took the selected rate
- called EasyPost shipment.buy(rate)
- received label + tracking
- stored in Sanity
  Shipping charge matched exactly what customer paid.

---

## Why this worked technically

Because EasyPost supports:

- rate creation without purchase
- delayed purchase later
- persistent shipment object
- buy-after-selection
  Stripe simply acted as the UI shell.
  EasyPost remained the shipping engine.

---

## Why this is impossible with Legacy provider

Legacy provider:

- does NOT expose rate objects
- does NOT expose shipment objects
- does NOT allow delayed purchase
- only works inside Stripe as a closed app
  So the moment Stripe needs rates:
  → Legacy provider immediately owns them
  → You never see them
  → You can’t store or replay them
  → You can’t control timing
  Which destroys this flow.

---

## The key mental model

### EasyPost + Stripe

```
Stripe = address UI
EasyPost = shipping brain
You = orchestration layer
```

### Legacy provider

```
Stripe = UI + logic
Legacy provider = black box
You = spectator
```

That’s the entire difference.

---

### Facts to note about current state

- PARCELCRAFT NEEDS TO BE REMOVED ENTIRELY FROM THE CODEBASE TO REVERT BACK TO EASYPOST SHIPPING RATE CALCULATION IN STRIPE CHECKOUT IN BOTH REPOS: fas-cms-fresh AND fas-sanity.
- Current codebase has EasyPost integration STARTED.
- Current codebase has no cart-level address collection or shipping UI.
- Current codebase has Legacy provider integration layered on top of EasyPost, but it is inactive.
- Removing Legacy provider code is straightforward and does not affect EasyPost functionality.
  ## MOST IMPORTANT THING TO KNOW DURING THIS PROCESS: - THERE HAS BEEN A NEW WEBHOOK CREATED FOR STRIPE TO HANDLE SHIPPING RATE CALCULATION VIA EASYPOST THROUGH FAS-CMS-FRESH - THIS WEBHOOK NEEDS TO BE CHECKED TO DECIDE IF THIS WEBHOOK SHOULD BE KEPT OR REMOVED BASED ON THE FINAL DECISION REVERSAL PLAN.
  - **_WEBHOOK PATH: [netlify/functions/stripeShippingRateCalculation.ts](https://www.fasmotorsports.com/api/stripe/shipping-rates-webhook)_**

---

## PREVIOUS PLANS (THAT DIDNT FULLY WORK)

cleanup_shipping_integration.sh

```js
#!/bin/bash

# 🗑️ Shipping Integration Cleanup Script

# Removes all Legacy provider code and obsolete files

# Run this from the root of each repository

set -e # Exit on error

echo "🧹 Starting Shipping Integration Cleanup..."
echo ""

# ============================================================================

# FAS-CMS-FRESH CLEANUP

# ============================================================================

if [ -d "fas-cms-fresh" ]; then
cd fas-cms-fresh
echo "📁 Cleaning up fas-cms-fresh repository..."

# -------------------------------------------------------------------------

# 1. DELETE PARCELCRAFT DOCUMENTATION

# -------------------------------------------------------------------------

echo " → Removing Legacy provider documentation..."

files_to_delete=(
"DYNAMIC_SHIPPING_FIX.md"
"DYNAMIC_SHIPPING_FIXES.md"
"FIX_PARCELCRAFT_TRANSIT_TIMES.md"
"SHIPPING_OPTIONS_AUDIT.md"
"STRIPE_PARCELCRAFT_VERIFICATION.md"
"TEST_PARCELCRAFT_TRANSIT_TIMES.md"
"CONFLICT_RESOLUTION_SUMMARY.md"
)

for file in "${files_to_delete[@]}"; do
    if [ -f "$file" ]; then
echo " ✓ Deleting $file"
      rm "$file"
else
echo " ⊘ $file not found (already deleted?)"
fi
done

# -------------------------------------------------------------------------

# 2. DELETE PARCELCRAFT API ENDPOINTS

# -------------------------------------------------------------------------

echo " → Removing Legacy provider API endpoints..."

api_files_to_delete=(
"src/pages/api/stripe/diagnose-shipping-options.ts"
"src/pages/api/stripe/update-shipping-options.ts"
)

for file in "${api_files_to_delete[@]}"; do
    if [ -f "$file" ]; then
echo " ✓ Deleting $file"
      rm "$file"
else
echo " ⊘ $file not found (already deleted?)"
fi
done

# -------------------------------------------------------------------------

# 3. CLEAN UP ENVIRONMENT VARIABLES

# -------------------------------------------------------------------------

echo " → Cleaning up .env files..."

if [ -f ".env" ]; then
echo " ⚠️ Manual step: Remove these variables from .env:"
echo " - STRIPE_USE_DYNAMIC_SHIPPING_RATES"
echo " - SHIPPING_PROVIDER"
fi

if [ -f ".env.example" ]; then
echo " ⚠️ Manual step: Remove these variables from .env.example:"
echo " - STRIPE_USE_DYNAMIC_SHIPPING_RATES"
echo " - SHIPPING_PROVIDER"
fi

echo ""
echo " ✅ fas-cms-fresh cleanup complete!"
cd ..
else
echo "⚠️ fas-cms-fresh directory not found in current location"
fi

echo ""

# ============================================================================

# FAS-SANITY CLEANUP

# ============================================================================

if [ -d "fas-sanity" ]; then
cd fas-sanity
echo "📁 Cleaning up fas-sanity repository..."

# -------------------------------------------------------------------------

# 1. DELETE DUPLICATE NETLIFY FUNCTIONS

# -------------------------------------------------------------------------

echo " → Removing duplicate Netlify functions..."

netlify_files_to_delete=(
"netlify/functions/easypost-webhook.ts"
"netlify/functions/getEasyPostRates.ts"
)

for file in "${netlify_files_to_delete[@]}"; do
    if [ -f "$file" ]; then
echo " ✓ Deleting $file"
      rm "$file"
else
echo " ⊘ $file not found (already deleted?)"
fi
done

# -------------------------------------------------------------------------

# 2. CONSOLIDATE DOCUMENTATION

# -------------------------------------------------------------------------

echo " → Moving documentation to fas-cms-fresh..."
echo " ⚠️ Manual step: Extract content from EASYPOST_DEPLOYMENT.md"
echo " and add to fas-cms-fresh/SHIPPING_INTEGRATION.md"
echo " Then delete EASYPOST_DEPLOYMENT.md"

echo ""
echo " ✅ fas-sanity cleanup complete!"
cd ..
else
echo "⚠️ fas-sanity directory not found in current location"
fi

echo ""
echo "============================================================================"
echo "🎉 CLEANUP COMPLETE!"
echo "============================================================================"
echo ""
echo "📝 MANUAL STEPS REMAINING:"
echo ""
echo "1. fas-cms-fresh/.env:"
echo " - Remove: STRIPE_USE_DYNAMIC_SHIPPING_RATES"
echo " - Remove: SHIPPING_PROVIDER"
echo " - Add: STRIPE_SHIPPING_WEBHOOK_SECRET=whsec_xxxxx"
echo " - Add: SANITY_BASE_URL=https://fassanity.fasmotorsports.com"
echo ""
echo "2. fas-cms-fresh/src/pages/api/stripe/create-checkout-session.ts:"
echo " - Remove Legacy provider-specific code (permissions, placeholder shipping_options)"
echo " - Add cart to metadata"
echo " - Add shipping_address_collection"
echo ""
echo "3. Create fas-cms-fresh/SHIPPING_INTEGRATION.md:"
echo " - Copy content from EASYPOST_STRIPE_INTEGRATION_PLAN.md"
echo " - Add content from fas-sanity/EASYPOST_DEPLOYMENT.md"
echo ""
echo "4. Review changes:"
echo " cd fas-cms-fresh && git status"
echo " cd fas-sanity && git status"
echo ""
echo "5. Commit cleanup:"
echo " git add ."
echo " git commit -m 'chore: remove Legacy provider, consolidate shipping docs'"
echo ""
echo "============================================================================"
echo ""
echo "Next: Follow the Implementation Plan in EASYPOST_STRIPE_INTEGRATION_PLAN.md"
echo ""
```

AUDIT CONCLUSION:

- EasyPost inside Stripe Checkout previously worked.
- Legacy provider cannot support this architecture.
- Multiple partial reversions introduced conflicting logic.
- Codex must not repeat any failed approaches listed above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — PLAN (ARCHITECTURE TARGET)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This phase defines the ONLY acceptable target behavior.

This is NOT code.
This is NOT a how‑to.

It is the authoritative plan Codex must align to.

HARD CONSTRAINTS:

- EasyPost is the ONLY shipping engine.
- Stripe Checkout is the ONLY address collection surface.
- No cart‑level shipping UI may exist.
- No Stripe Adaptive Pricing webhooks may be invented beyond the documented endpoint.
- No Legacy provider code, metadata, env vars, or guards may remain.
- No automatic label purchase during checkout.

### Target State / What needs to be successfully done now

    - Restore EasyPost architecture to regain dynamic rate calculation inside Stripe Checkout.
    - Remove Legacy provider integration entirely.
        - Remove all Legacy provider code, configs, references, ai-governance guards.
    - Ensure no cart-level address collection or shipping UI exists.
    - Ensure Stripe Checkout collects address and calculates rates dynamically via EasyPost.

### Architecture diagrams, data flow diagrams, target state explanations, high-level behavior descriptions

(Move all architecture diagrams, data flow diagrams, and target state explanations here from previous sections.)

#### (Insert all relevant architecture and data flow diagrams here.)

#### (Insert high-level behavior descriptions and "Conclusion" content here.)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3 — IMPLEMENT (AUTHORIZED CHANGES ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Codex may modify code ONLY in this phase.

Codex MUST NOT redesign architecture.
Codex MUST NOT introduce new providers or abstractions.
Codex MUST implement exactly what Phase 2 defines.

# code_changes_guide.md

````markdown
# 🔄 Code Changes: Before & After

**Complete code modifications needed for EasyPost + Stripe Adaptive Pricing integration**

---

## File 1: `fas-cms-fresh/src/pages/api/stripe/create-checkout-session.ts`

### ❌ BEFORE (Remove Legacy provider Code)

```typescript
// OLD CODE - DELETE THIS SECTION
if (shippingRequired) {
  // Legacy provider-specific configuration
  sessionParams.permissions = {
    update_shipping_details: 'server_only' as const,
  }

  // Placeholder shipping option for Legacy provider
  sessionParams.shipping_options = [
    {
      shipping_rate_data: {
        display_name: 'Calculating shipping rates...',
        type: 'fixed_amount' as const,
        fixed_amount: {
          amount: 0,
          currency: 'usd',
        },
      },
    },
  ]
}

// OLD: Environment variable checks
if (import.meta.env.STRIPE_USE_DYNAMIC_SHIPPING_RATES === 'true') {
  // Legacy provider logic
}
```
````

### ✅ AFTER (Add EasyPost Adaptive Pricing Code)

```typescript
// NEW CODE - ADD THIS SECTION
const sessionParams: Stripe.Checkout.SessionCreateParams = {
  payment_method_types: ['card'],
  mode: 'payment',
  line_items: cartLineItems,

  // ✅ Store cart in metadata for webhook access
  metadata: {
    cart: JSON.stringify(
      cartItems.map((item) => ({
        sku: item.sku || item.id,
        quantity: item.quantity,
      })),
    ),
    customerId: customerId || 'guest',
    // ... other metadata fields
  },

  // ✅ Enable shipping address collection for Adaptive Pricing
  shipping_address_collection: {
    allowed_countries: ['US'], // Add more countries as needed: ['US', 'CA', 'GB']
  },

  // ✅ Enable automatic tax calculation
  automatic_tax: {
    enabled: true,
  },

  // ✅ DO NOT SET shipping_options here
  // Stripe will populate dynamically via webhook

  success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${siteUrl}/checkout/cancel`,
}
```

---

## File 2: `fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts`

### ✅ NEW FILE (Create This)

```typescript
/**
 * Stripe Adaptive Pricing Webhook
 * Called by Stripe when customer enters shipping address in checkout
 * Returns real-time EasyPost rates dynamically
 */

import type {APIRoute} from 'astro'
import Stripe from 'stripe'

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
})

interface ShippingAddressInput {
  city?: string
  country?: string
  line1?: string
  line2?: string
  postal_code?: string
  state?: string
}

interface CartItem {
  sku: string
  quantity: number
}

interface EasyPostRate {
  rateId: string
  carrier: string
  service: string
  amount: number
  deliveryDays?: number
  carrierId: string
  serviceCode: string
}

interface EasyPostResponse {
  rates: EasyPostRate[]
  easyPostShipmentId: string
}

export const POST: APIRoute = async ({request}) => {
  try {
    // 1. Verify Stripe signature for security
    const signature = request.headers.get('stripe-signature')
    if (!signature) {
      console.error('Missing Stripe signature')
      return new Response(JSON.stringify({error: 'Missing signature'}), {
        status: 401,
        headers: {'Content-Type': 'application/json'},
      })
    }

    const body = await request.text()
    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        import.meta.env.STRIPE_SHIPPING_WEBHOOK_SECRET,
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return new Response(JSON.stringify({error: 'Invalid signature'}), {
        status: 401,
        headers: {'Content-Type': 'application/json'},
      })
    }

    console.log('Webhook event received:', event.type)

    // 2. Extract shipping address and session details
    const webhookData = event.data.object as any
    const {shipping_address, session_id} = webhookData

    if (!shipping_address || !session_id) {
      console.error('Missing required fields:', {shipping_address, session_id})
      return new Response(
        JSON.stringify({
          error: 'Missing shipping address or session ID',
        }),
        {status: 400, headers: {'Content-Type': 'application/json'}},
      )
    }

    console.log('Processing shipping address:', {
      city: shipping_address.city,
      state: shipping_address.state,
      postal_code: shipping_address.postal_code,
    })

    // 3. Retrieve checkout session to get cart items
    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.retrieve(session_id)
    } catch (err) {
      console.error('Failed to retrieve session:', err)
      return new Response(
        JSON.stringify({
          error: 'Failed to retrieve session',
        }),
        {status: 500, headers: {'Content-Type': 'application/json'}},
      )
    }

    const cartMetadata = session.metadata?.cart
    if (!cartMetadata) {
      console.error('Cart data not found in session metadata')
      return new Response(
        JSON.stringify({
          error: 'Cart data not found in session metadata',
        }),
        {status: 400, headers: {'Content-Type': 'application/json'}},
      )
    }

    let cart: CartItem[]
    try {
      cart = JSON.parse(cartMetadata)
    } catch (err) {
      console.error('Failed to parse cart metadata:', err)
      return new Response(
        JSON.stringify({
          error: 'Invalid cart data format',
        }),
        {status: 400, headers: {'Content-Type': 'application/json'}},
      )
    }

    console.log('Cart items:', cart)

    // 4. Call fas-sanity Netlify function to get EasyPost rates
    const sanityBaseUrl = import.meta.env.SANITY_BASE_URL
    if (!sanityBaseUrl) {
      console.error('SANITY_BASE_URL not configured')
      return new Response(
        JSON.stringify({
          error: 'Configuration error: SANITY_BASE_URL missing',
        }),
        {status: 500, headers: {'Content-Type': 'application/json'}},
      )
    }

    console.log(
      'Calling EasyPost rate function:',
      `${sanityBaseUrl}/.netlify/functions/getShippingQuoteBySkus`,
    )

    const rateResponse = await fetch(`${sanityBaseUrl}/.netlify/functions/getShippingQuoteBySkus`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        cart,
        destination: {
          addressLine1: shipping_address.line1 || '',
          addressLine2: shipping_address.line2 || '',
          city: shipping_address.city || '',
          state: shipping_address.state || '',
          postalCode: shipping_address.postal_code || '',
          country: shipping_address.country || 'US',
        },
      }),
    })

    if (!rateResponse.ok) {
      const errorText = await rateResponse.text()
      console.error('EasyPost rate fetch failed:', {
        status: rateResponse.status,
        error: errorText,
      })
      return new Response(
        JSON.stringify({
          error: 'Failed to calculate shipping rates',
          details: errorText,
        }),
        {status: 500, headers: {'Content-Type': 'application/json'}},
      )
    }

    const rateData: EasyPostResponse = await rateResponse.json()
    console.log('EasyPost rates received:', rateData.rates.length)

    // 5. Transform EasyPost rates to Stripe format
    const shippingRates = rateData.rates.map((rate: EasyPostRate, index: number) => {
      const sanitizedCarrier = rate.carrier.toLowerCase()
      const sanitizedService = rate.service.toLowerCase().replace(/\s+/g, '_')

      return {
        id: `rate_${index}_${sanitizedCarrier}_${sanitizedService}`,
        display_name: `${rate.carrier} ${rate.service}`,
        delivery_estimate: rate.deliveryDays
          ? {
              minimum: {
                unit: 'business_day' as const,
                value: rate.deliveryDays,
              },
              maximum: {
                unit: 'business_day' as const,
                value: rate.deliveryDays + 1,
              },
            }
          : undefined,
        fixed_amount: {
          amount: Math.round(rate.amount * 100), // Convert dollars to cents
          currency: 'usd',
        },
        metadata: {
          easypost_rate_id: rate.rateId,
          easypost_shipment_id: rateData.easyPostShipmentId,
          carrier: rate.carrier,
          service: rate.service,
          carrier_id: rate.carrierId,
          service_code: rate.serviceCode,
        },
      }
    })

    console.log('Formatted shipping rates:', shippingRates.length)

    // 6. Return formatted rates to Stripe
    return new Response(
      JSON.stringify({
        shipping_rates: shippingRates,
      }),
      {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      },
    )
  } catch (error) {
    console.error('Shipping rates webhook error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error calculating shipping rates',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {status: 500, headers: {'Content-Type': 'application/json'}},
    )
  }
}
```

---

## File 3: `fas-sanity/src/pages/api/webhooks/stripe-order.ts`

### ❌ BEFORE (Missing EasyPost metadata)

```typescript
// OLD CODE - Order creation without shipping metadata
const orderData = {
  _type: 'order',
  orderNumber: generateOrderNumber(),
  customer: customerRef,
  lineItems: lineItems,
  totalAmount: session.amount_total / 100,
  status: 'pending',
  createdAt: new Date().toISOString(),

  // Missing shipping details!
}
```

### ✅ AFTER (Add EasyPost metadata extraction)

```typescript
// NEW CODE - Extract shipping metadata from Stripe session
const shippingCost = session.shipping_cost
const shippingRate = session.shipping_rate as Stripe.ShippingRate | null
const shippingMetadata = shippingRate?.metadata || {}

console.log('Shipping metadata from session:', {
  carrier: shippingMetadata.carrier,
  service: shippingMetadata.service,
  rate_id: shippingMetadata.easypost_rate_id,
  shipment_id: shippingMetadata.easypost_shipment_id,
})

const orderData = {
  _type: 'order',
  orderNumber: generateOrderNumber(),
  customer: customerRef,
  lineItems: lineItems,
  totalAmount: session.amount_total / 100,
  status: 'pending',
  createdAt: new Date().toISOString(),

  // ✅ Add complete shipping information
  shipping: {
    // Customer address
    address: {
      addressLine1: session.shipping_details?.address?.line1 || '',
      addressLine2: session.shipping_details?.address?.line2 || '',
      city: session.shipping_details?.address?.city || '',
      state: session.shipping_details?.address?.state || '',
      postalCode: session.shipping_details?.address?.postal_code || '',
      country: session.shipping_details?.address?.country || 'US',
    },

    // Customer name
    name: session.shipping_details?.name || '',

    // Shipping method
    carrier: shippingMetadata.carrier || 'Unknown',
    service: shippingMetadata.service || 'Unknown',

    // EasyPost IDs for label creation
    easyPostRateId: shippingMetadata.easypost_rate_id || '',
    easyPostShipmentId: shippingMetadata.easypost_shipment_id || '',

    // Carrier details
    carrierId: shippingMetadata.carrier_id || '',
    serviceCode: shippingMetadata.service_code || '',

    // Cost
    amount: shippingCost?.amount_total ? shippingCost.amount_total / 100 : 0,

    // Label details (populated after label creation)
    labelUrl: null,
    trackingCode: null,
    trackingUrl: null,
    labelCreatedAt: null,
  },
}

console.log('Creating order with shipping metadata:', orderData.shipping)
```

---

## File 4: `fas-sanity/netlify/functions/easypostCreateLabel.ts`

### ❌ BEFORE (May not use stored metadata)

```typescript
// OLD CODE - Creating new shipment instead of using stored one
export async function createShippingLabel(orderId: string) {
  const order = await fetchOrderFromSanity(orderId)

  // ❌ Creating NEW shipment (wasteful, may have different rates)
  const shipment = await easyPost.Shipment.create({
    to_address: order.shipping.address,
    from_address: warehouseAddress,
    parcel: calculateParcel(order.lineItems),
  })

  // Buy cheapest rate (may not be what customer selected!)
  const label = await shipment.buy(shipment.lowest_rate())
}
```

### ✅ AFTER (Use stored EasyPost IDs)

```typescript
// NEW CODE - Use the shipment and rate customer already selected
export async function createShippingLabel(orderId: string) {
  try {
    // 1. Fetch order from Sanity
    const order = await sanityClient.fetch(
      `*[_type == "order" && _id == $orderId][0]{
        _id,
        orderNumber,
        "shipping": shipping{
          easyPostShipmentId,
          easyPostRateId,
          carrier,
          service,
          address
        }
      }`,
      {orderId},
    )

    if (!order) {
      throw new Error(`Order ${orderId} not found`)
    }

    console.log('Creating label for order:', order.orderNumber)

    // 2. Retrieve the existing EasyPost shipment (already paid for during checkout)
    const shipmentId = order.shipping.easyPostShipmentId
    if (!shipmentId) {
      throw new Error('EasyPost shipment ID not found in order')
    }

    console.log('Retrieving EasyPost shipment:', shipmentId)
    const shipment = await easyPost.Shipment.retrieve(shipmentId)

    // 3. Find the specific rate customer selected
    const rateId = order.shipping.easyPostRateId
    if (!rateId) {
      throw new Error('EasyPost rate ID not found in order')
    }

    console.log('Finding selected rate:', rateId)
    const selectedRate = shipment.rates.find((rate: any) => rate.id === rateId)

    if (!selectedRate) {
      console.error('Rate not found in shipment. Available rates:', shipment.rates)
      throw new Error(`Selected rate ${rateId} not found in shipment ${shipmentId}`)
    }

    console.log('Buying label with rate:', {
      carrier: selectedRate.carrier,
      service: selectedRate.service,
      rate: selectedRate.rate,
    })

    // 4. Purchase the label with the selected rate
    const label = await shipment.buy(selectedRate)

    console.log('Label created successfully:', {
      tracking_code: label.tracking_code,
      label_url: label.postage_label.label_url,
    })

    // 5. Update order with label details
    await sanityClient
      .patch(orderId)
      .set({
        'shipping.labelUrl': label.postage_label.label_url,
        'shipping.trackingCode': label.tracking_code,
        'shipping.trackingUrl': label.tracker?.public_url || null,
        'shipping.labelCreatedAt': new Date().toISOString(),
      })
      .commit()

    console.log('Order updated with label information')

    return {
      success: true,
      labelUrl: label.postage_label.label_url,
      trackingCode: label.tracking_code,
      trackingUrl: label.tracker?.public_url || null,
    }
  } catch (error) {
    console.error('Error creating shipping label:', error)
    throw error
  }
}
```

---

## File 5: Environment Variables

### ❌ BEFORE (.env files)

```bash
# OLD - Remove these
STRIPE_USE_DYNAMIC_SHIPPING_RATES=true
SHIPPING_PROVIDER=legacy provider
```

### ✅ AFTER (.env files)

```bash
# fas-cms-fresh/.env

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_xxxxx  # Or sk_live_xxxxx for production
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_SHIPPING_WEBHOOK_SECRET=whsec_xxxxx  # ✅ NEW: From Stripe Dashboard

# Cross-repo Communication
SANITY_BASE_URL=https://fassanity.fasmotorsports.com  # ✅ NEW: fas-sanity URL
```

```bash
# fas-sanity/.env

# EasyPost Configuration
EASYPOST_API_KEY=EZAK_xxxxx  # Already exists

# Sanity Configuration
SANITY_PROJECT_ID=xxxxx  # Already exists
SANITY_DATASET=production  # Already exists
SANITY_TOKEN=skxxxxx  # Already exists
```

---

## Configuration Summary

### What to DELETE:

1. ❌ All Legacy provider documentation files
2. ❌ `src/pages/api/stripe/diagnose-shipping-options.ts`
3. ❌ `src/pages/api/stripe/update-shipping-options.ts`
4. ❌ `netlify/functions/easypost-webhook.ts` (duplicate)
5. ❌ `netlify/functions/getEasyPostRates.ts` (redundant)
6. ❌ `STRIPE_USE_DYNAMIC_SHIPPING_RATES` env var
7. ❌ `SHIPPING_PROVIDER` env var
8. ❌ Legacy provider code in `create-checkout-session.ts`

### What to CREATE:

1. ✅ `src/pages/api/stripe/shipping-rates-webhook.ts`
2. ✅ `SHIPPING_INTEGRATION.md` (master documentation)
3. ✅ `STRIPE_SHIPPING_WEBHOOK_SECRET` env var
4. ✅ `SANITY_BASE_URL` env var

### What to MODIFY:

1. 🔄 `create-checkout-session.ts` - Add cart metadata, remove Legacy provider code
2. 🔄 `stripe-order.ts` webhook - Extract and store EasyPost metadata
3. 🔄 `easypostCreateLabel.ts` - Use stored shipment/rate IDs

---

## Quick Verification Commands

### Test webhook endpoint (after deployment)

```bash
curl -X POST https://fasmotorsports.com/api/stripe/shipping-rates-webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Should return 401 (missing signature) - this is correct!
```

### Test checkout session creation

```bash
curl -X POST https://fasmotorsports.com/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "cart": [
      {"sku": "TEST-123", "quantity": 1, "priceId": "price_xxxxx"}
    ]
  }'
# Should return session with url
```

### Test EasyPost rate function

```bash
curl -X POST https://fassanity.fasmotorsports.com/.netlify/functions/getShippingQuoteBySkus \
  -H "Content-Type: application/json" \
  -d '{
    "cart": [{"sku": "TEST-123", "quantity": 1}],
    "destination": {
      "addressLine1": "123 Main St",
      "city": "Austin",
      "state": "TX",
      "postalCode": "78701",
      "country": "US"
    }
  }'
# Should return array of rates with carriers and prices
```

---

## Deployment Order

**CRITICAL: Deploy in this exact order to avoid downtime**

1. ✅ Deploy fas-sanity first (backend functions)
2. ✅ Deploy fas-cms-fresh second (frontend + webhook)
3. ✅ Enable Stripe Adaptive Pricing last (after both deploys confirmed)

---

**Next Steps:**

1. Review these code changes
2. Run cleanup script: `bash cleanup_shipping_integration.sh`
3. Make code modifications shown above
4. Follow Implementation Checklist
5. Test thoroughly on staging
6. Deploy to production

For detailed implementation plan, see: `EASYPOST_STRIPE_INTEGRATION_PLAN.md`

````

(Move all file-by-file change sections, BEFORE / AFTER code blocks, environment variable changes, cleanup script, deletion lists, modification lists, verification commands, and testing steps here.)

```markdown
# 🚀 EasyPost + Stripe Adaptive Pricing Integration Plan

**Complete Migration from Legacy provider to EasyPost with Real-Time Dynamic Rates**

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Pre-Integration Cleanup Plan](#pre-integration-cleanup-plan)
3. [Integration Architecture](#integration-architecture)
4. [Implementation Plan](#implementation-plan)
5. [File Structure Changes](#file-structure-changes)
6. [Documentation Consolidation](#documentation-consolidation)
7. [Testing Strategy](#testing-strategy)
8. [Rollback Plan](#rollback-plan)

---

## Overview

### Current State
- **fas-cms-fresh**: Using Legacy provider (static rates only, not working as expected)
- **fas-sanity**: Has working EasyPost integration for label creation
- **Problem**: Rates not appearing dynamically inside Stripe Checkout UI

### Target State
- **Dynamic Real-Time Rates**: EasyPost rates appear inside Stripe Checkout as user types address
- **Single Integration**: EasyPost for both rate calculation AND label creation
- **Clean Codebase**: Remove all Legacy provider code and obsolete functions
- **Consolidated Docs**: Single source of truth for shipping integration

### How It Works
````

User enters address in Stripe Checkout
↓
Stripe calls YOUR webhook endpoint
↓
Webhook calls EasyPost API for rates
↓
Returns rates to Stripe in real-time
↓
User sees live UPS/USPS/FedEx rates
↓
User selects rate and completes payment
↓
Webhook creates EasyPost label post-purchase

````

---

## Pre-Integration Cleanup Plan

### 🗑️ Phase 1: Remove Legacy provider Code

#### fas-cms-fresh Repository

**Files to DELETE:**
```bash
# Legacy provider-specific documentation
rm DYNAMIC_SHIPPING_FIX.md
rm DYNAMIC_SHIPPING_FIXES.md
rm FIX_PARCELCRAFT_TRANSIT_TIMES.md
rm SHIPPING_OPTIONS_AUDIT.md
rm STRIPE_PARCELCRAFT_VERIFICATION.md
rm TEST_PARCELCRAFT_TRANSIT_TIMES.md
````

**API Endpoints to DELETE:**

```bash
# Delete these files completely
rm src/pages/api/stripe/diagnose-shipping-options.ts
rm src/pages/api/stripe/update-shipping-options.ts
```

**API Endpoints to MODIFY:**

`src/pages/api/stripe/create-checkout-session.ts`

- Remove all Legacy provider-specific code
- Remove `shipping_address_collection` configuration (we'll re-add differently)
- Remove `permissions.update_shipping_details`
- Remove placeholder shipping options

**Code to Remove:**

```typescript
// DELETE THIS SECTION
if (shippingRequired) {
  sessionParams.permissions = {
    update_shipping_details: 'server_only' as const,
  }

  sessionParams.shipping_options = [
    {
      shipping_rate_data: {
        display_name: 'Calculating shipping rates...',
        type: 'fixed_amount' as const,
        fixed_amount: {
          amount: 0,
          currency: 'usd',
        },
      },
    },
  ]
}
```

**Environment Variables to REMOVE:**

```bash
# Remove from .env files
STRIPE_USE_DYNAMIC_SHIPPING_RATES
SHIPPING_PROVIDER
```

---

### 🗑️ Phase 2: Remove Duplicate/Obsolete Functions

#### fas-cms-fresh Repository

**Files to DELETE (Old EasyPost remnants):**

```bash
# If these exist from December 23-27 implementation
rm src/pages/api/shipping/rates.ts  # Was deleted on Dec 27
rm src/pages/api/shipping/create-label.ts  # Was deleted on Dec 27
```

**Files to KEEP and MODIFY:**

```bash
# Keep but update
src/pages/api/shipping/quote.ts  # Will be repurposed for webhook
```

#### fas-sanity Repository

**Files to DELETE (Duplicates):**

```bash
# Remove duplicate webhook files
rm netlify/functions/easypost-webhook.ts  # Keep easypostWebhook.ts instead
```

**Files to CONSOLIDATE:**

Current duplicate functions that need review:

- `getEasyPostRates.ts` vs `getShippingQuoteBySkus.ts` - Determine which one to keep
- Both appear to do similar things but may have different purposes

**Decision:**

- **KEEP**: `getShippingQuoteBySkus.ts` - More comprehensive, handles Sanity product data
- **DELETE**: `getEasyPostRates.ts` - Redundant, simpler version
- **REASON**: The quote function already fetches product weights/dimensions from Sanity

---

### 🗑️ Phase 3: Consolidate Documentation

#### Files to DELETE:

```bash
# fas-cms-fresh
rm CONFLICT_RESOLUTION_SUMMARY.md  # Outdated conflict notes
```

#### Files to CONSOLIDATE INTO ONE:

**Create:** `SHIPPING_INTEGRATION.md` (master document)

**Source Material (then delete):**

- fas-sanity: `EASYPOST_DEPLOYMENT.md`
- fas-cms-fresh: (All the Legacy provider docs listed above)

**New Document Structure:**

```markdown
# SHIPPING_INTEGRATION.md

## Architecture Overview

## EasyPost Configuration

## Stripe Adaptive Pricing Setup

## Webhook Implementation

## Label Creation Flow

## Testing & Debugging

## Troubleshooting
```

---

## Integration Architecture

### Components Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     STRIPE CHECKOUT UI                       │
│  ┌────────────────────────────────────────────────────┐    │
│  │ User enters shipping address                        │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────────────┐
        │   Stripe Adaptive Pricing Webhook     │
        │   stripe.com → your-site.com/webhook  │
        └───────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────┐
│              fas-cms-fresh                                 │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  /api/stripe/shipping-rates-webhook                 │ │
│  │  - Receives address from Stripe                     │ │
│  │  - Validates session_id                             │ │
│  │  - Forwards to fas-sanity for rate calculation      │ │
│  └──────────────────┬──────────────────────────────────┘ │
└────────────────────┬┴──────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│              fas-sanity                                     │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  netlify/functions/getShippingQuoteBySkus           │ │
│  │  - Fetches cart items from Sanity                   │ │
│  │  - Gets product weights/dimensions                  │ │
│  │  - Calculates total package specs                   │ │
│  └──────────────────┬───────────────────────────────────┘ │
└────────────────────┬┴───────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────────┐
            │   EasyPost API     │
            │  - Creates shipment │
            │  - Returns rates    │
            └────────┬───────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│  Response Flow Back to Stripe                              │
│  Rates → fas-sanity → fas-cms-fresh → Stripe              │
│                                                             │
│  Stripe displays:                                          │
│  ☐ USPS Priority Mail - $12.50 (2-3 days)                │
│  ☐ UPS Ground - $15.30 (3-5 days)                        │
│  ☐ FedEx 2Day - $22.80 (2 days)                          │
└────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌──────────────┐
│   Customer   │
└──────┬───────┘
       │ Enters address in Stripe Checkout
       ▼
┌──────────────────────────────────────────────┐
│          Stripe Checkout Session              │
│  - Session ID: cs_test_abc123                │
│  - Cart items stored in metadata             │
└──────┬───────────────────────────────────────┘
       │ Triggers webhook when address entered
       ▼
┌──────────────────────────────────────────────┐
│  POST /api/stripe/shipping-rates-webhook     │
│  Body: {                                     │
│    session_id: "cs_test_abc123",            │
│    address: {                               │
│      line1: "123 Main St",                  │
│      city: "Austin",                        │
│      state: "TX",                           │
│      postal_code: "78701"                   │
│    }                                        │
│  }                                          │
└──────┬───────────────────────────────────────┘
       │ Validate & extract cart from session metadata
       ▼
┌──────────────────────────────────────────────┐
│  POST fas-sanity/.netlify/functions/        │
│       getShippingQuoteBySkus                 │
│  Body: {                                     │
│    cart: [                                  │
│      {sku: "ABC123", quantity: 2}          │
│    ],                                       │
│    destination: {address...}                │
│  }                                          │
└──────┬───────────────────────────────────────┘
       │ Query Sanity for product shipping data
       ▼
┌──────────────────────────────────────────────┐
│        Sanity Product Documents              │
│  - Product weights (pounds/ounces)          │
│  - Dimensions (L x W x H)                   │
│  - Shipping class (standard/freight)        │
│  - Install-only flags                       │
└──────┬───────────────────────────────────────┘
       │ Calculate total package specs
       ▼
┌──────────────────────────────────────────────┐
│         Package Calculations                 │
│  - Combined weight: 15.5 lbs                │
│  - Box dimensions: 24"x12"x8"               │
│  - Warehouse address (from address)         │
└──────┬───────────────────────────────────────┘
       │ Call EasyPost API
       ▼
┌──────────────────────────────────────────────┐
│      POST api.easypost.com/v2/shipments     │
│  {                                          │
│    to_address: {customer address},          │
│    from_address: {warehouse},               │
│    parcel: {weight: 248, dimensions...}     │
│  }                                          │
└──────┬───────────────────────────────────────┘
       │ EasyPost returns rates
       ▼
┌──────────────────────────────────────────────┐
│         EasyPost Response                    │
│  rates: [                                   │
│    {                                        │
│      id: "rate_123",                       │
│      carrier: "USPS",                      │
│      service: "Priority",                  │
│      rate: "12.50",                        │
│      delivery_days: 2                      │
│    },                                      │
│    {carrier: "UPS", service: "Ground"...}  │
│  ]                                         │
└──────┬───────────────────────────────────────┘
       │ Format for Stripe
       ▼
┌──────────────────────────────────────────────┐
│    Return to Stripe (required format)        │
│  {                                          │
│    shipping_rates: [                       │
│      {                                     │
│        id: "rate_123_usps",               │
│        display_name: "USPS Priority",     │
│        delivery_estimate: {               │
│          minimum: {unit: "day", value: 2},│
│          maximum: {unit: "day", value: 3} │
│        },                                 │
│        fixed_amount: {                    │
│          amount: 1250,  // cents          │
│          currency: "usd"                  │
│        },                                 │
│        metadata: {                        │
│          easypost_rate_id: "rate_123",   │
│          carrier: "USPS",                │
│          service: "Priority"             │
│        }                                  │
│      }                                    │
│    ]                                      │
│  }                                         │
└──────┬───────────────────────────────────────┘
       │ Stripe displays rates in UI
       ▼
┌──────────────────────────────────────────────┐
│     Customer Selects Rate & Pays            │
└──────┬───────────────────────────────────────┘
       │ checkout.session.completed webhook
       ▼
┌──────────────────────────────────────────────┐
│  POST /api/webhooks/stripe-order            │
│  - Create order in Sanity                   │
│  - Store shipping metadata                  │
│  - Trigger label creation                   │
└──────────────────────────────────────────────┘
```

---

## Implementation Plan

### Step 1: Setup Stripe Adaptive Pricing

**In Stripe Dashboard:**

1. Navigate to: **Settings → Payments → Checkout**
2. Find: **"Dynamic shipping rates"** section
3. Enable: **"Calculate shipping rates dynamically"**
4. Configure webhook endpoint URL:
   ```
   https://fasmotorsports.com/api/stripe/shipping-rates-webhook
   ```
5. Add webhook signature secret to environment variables

**Environment Variables (fas-cms-fresh):**

```bash
# Add to .env
STRIPE_SHIPPING_WEBHOOK_SECRET=whsec_xxxxx  # From Stripe Dashboard
SANITY_BASE_URL=https://fassanity.fasmotorsports.com  # fas-sanity URL
```

---

### Step 2: Create Shipping Rates Webhook Endpoint

**File:** `fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts`

```typescript
/**
 * Stripe Adaptive Pricing Webhook
 * Called by Stripe when customer enters shipping address
 * Returns real-time EasyPost rates dynamically
 */

import type {APIRoute} from 'astro'
import Stripe from 'stripe'

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
})

interface ShippingAddressInput {
  city?: string
  country?: string
  line1?: string
  line2?: string
  postal_code?: string
  state?: string
}

interface CartItem {
  sku: string
  quantity: number
}

export const POST: APIRoute = async ({request}) => {
  try {
    // 1. Verify Stripe signature
    const signature = request.headers.get('stripe-signature')
    if (!signature) {
      return new Response('Missing signature', {status: 401})
    }

    const body = await request.text()
    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        import.meta.env.STRIPE_SHIPPING_WEBHOOK_SECRET,
      )
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return new Response('Invalid signature', {status: 401})
    }

    // 2. Extract shipping address and session details
    const {shipping_address, session_id} = event.data.object as {
      shipping_address: ShippingAddressInput
      session_id: string
    }

    if (!shipping_address || !session_id) {
      return new Response(
        JSON.stringify({
          error: 'Missing shipping address or session ID',
        }),
        {status: 400},
      )
    }

    // 3. Retrieve checkout session to get cart items from metadata
    const session = await stripe.checkout.sessions.retrieve(session_id)

    const cartMetadata = session.metadata?.cart
    if (!cartMetadata) {
      return new Response(
        JSON.stringify({
          error: 'Cart data not found in session metadata',
        }),
        {status: 400},
      )
    }

    const cart: CartItem[] = JSON.parse(cartMetadata)

    // 4. Call fas-sanity Netlify function to get EasyPost rates
    const sanityBaseUrl = import.meta.env.SANITY_BASE_URL
    const response = await fetch(`${sanityBaseUrl}/.netlify/functions/getShippingQuoteBySkus`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        cart,
        destination: {
          addressLine1: shipping_address.line1,
          addressLine2: shipping_address.line2 || '',
          city: shipping_address.city,
          state: shipping_address.state,
          postalCode: shipping_address.postal_code,
          country: shipping_address.country || 'US',
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('EasyPost rate fetch failed:', errorText)
      return new Response(
        JSON.stringify({
          error: 'Failed to calculate shipping rates',
        }),
        {status: 500},
      )
    }

    const rateData = await response.json()

    // 5. Transform EasyPost rates to Stripe format
    const shippingRates = rateData.rates.map((rate: any, index: number) => ({
      id: `rate_${index}_${rate.carrier.toLowerCase()}_${rate.service.toLowerCase().replace(/\s+/g, '_')}`,
      display_name: `${rate.carrier} ${rate.service}`,
      delivery_estimate: rate.deliveryDays
        ? {
            minimum: {unit: 'business_day', value: rate.deliveryDays},
            maximum: {unit: 'business_day', value: rate.deliveryDays + 1},
          }
        : undefined,
      fixed_amount: {
        amount: Math.round(rate.amount * 100), // Convert dollars to cents
        currency: 'usd',
      },
      metadata: {
        easypost_rate_id: rate.rateId,
        easypost_shipment_id: rateData.easyPostShipmentId,
        carrier: rate.carrier,
        service: rate.service,
        carrier_id: rate.carrierId,
        service_code: rate.serviceCode,
      },
    }))

    // 6. Return formatted rates to Stripe
    return new Response(
      JSON.stringify({
        shipping_rates: shippingRates,
      }),
      {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      },
    )
  } catch (error) {
    console.error('Shipping rates webhook error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error calculating shipping rates',
      }),
      {status: 500},
    )
  }
}
```

---

### Step 3: Update Checkout Session Creation

**File:** `fas-cms-fresh/src/pages/api/stripe/create-checkout-session.ts`

**Modifications needed:**

```typescript
// Add cart to session metadata for webhook access
const sessionParams: Stripe.Checkout.SessionCreateParams = {
  // ... existing params ...

  metadata: {
    cart: JSON.stringify(
      cartItems.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
    ),
    // ... other metadata ...
  },

  // Enable shipping address collection for Adaptive Pricing
  shipping_address_collection: {
    allowed_countries: ['US'], // Add more as needed
  },

  // Enable automatic tax calculation
  automatic_tax: {
    enabled: true,
  },

  // DO NOT set shipping_options here - Stripe will populate dynamically
}
```

---

### Step 4: Update Order Creation Webhook

**File:** `fas-sanity/src/pages/api/webhooks/stripe-order.ts`

**Add logic to extract shipping metadata:**

```typescript
// In checkout.session.completed handler
const shippingRate = session.shipping_cost?.shipping_rate
const shippingMetadata = shippingRate?.metadata

const orderData = {
  // ... existing fields ...

  // Add EasyPost shipping metadata
  shipping: {
    carrier: shippingMetadata?.carrier || 'Unknown',
    service: shippingMetadata?.service || 'Unknown',
    easyPostRateId: shippingMetadata?.easypost_rate_id,
    easyPostShipmentId: shippingMetadata?.easypost_shipment_id,
    carrierId: shippingMetadata?.carrier_id,
    serviceCode: shippingMetadata?.service_code,
    amount: session.shipping_cost?.amount_total ? session.shipping_cost.amount_total / 100 : 0,
  },
}
```

---

### Step 5: Verify Label Creation Flow

**File:** `fas-sanity/netlify/functions/easypostCreateLabel.ts`

**Ensure it uses stored metadata:**

```typescript
// Function should receive order document with shipping metadata
export async function createShippingLabel(orderId: string) {
  // 1. Fetch order from Sanity
  const order = await sanityClient.fetch(`*[_type == "order" && _id == $orderId][0]`, {orderId})

  // 2. Use stored EasyPost shipment ID to buy label
  const shipment = await easyPost.Shipment.retrieve(order.shipping.easyPostShipmentId)

  // 3. Buy the specific rate customer selected
  const selectedRate = shipment.rates.find((rate: any) => rate.id === order.shipping.easyPostRateId)

  if (!selectedRate) {
    throw new Error('Selected shipping rate not found')
  }

  // 4. Purchase label
  const label = await shipment.buy(selectedRate)

  // 5. Update order with label details
  await sanityClient
    .patch(orderId)
    .set({
      'shipping.labelUrl': label.postage_label.label_url,
      'shipping.trackingCode': label.tracking_code,
      'shipping.trackingUrl': label.tracker?.public_url,
      'shipping.labelCreatedAt': new Date().toISOString(),
    })
    .commit()

  return label
}
```

---

## File Structure Changes

### fas-cms-fresh Repository

```diff
src/pages/api/
├── stripe/
│   ├── create-checkout-session.ts        # MODIFIED: Add cart metadata, shipping collection
+│   ├── shipping-rates-webhook.ts         # NEW: Adaptive Pricing webhook handler
│   ├── debug-checkout-session.ts         # KEEP: Useful for debugging
-│   ├── diagnose-shipping-options.ts     # DELETE: Legacy provider specific
│   ├── resolve-checkout-session.ts       # KEEP: Useful utility
-│   └── update-shipping-options.ts       # DELETE: Legacy provider specific
│
├── shipping/
│   └── quote.ts                          # REPURPOSE: Make internal-only for direct API calls
│
└── webhooks.ts                           # EXISTS: May need updates

# Root directory cleanup
-DYNAMIC_SHIPPING_FIX.md
-DYNAMIC_SHIPPING_FIXES.md
-FIX_PARCELCRAFT_TRANSIT_TIMES.md
-SHIPPING_OPTIONS_AUDIT.md
-STRIPE_PARCELCRAFT_VERIFICATION.md
-TEST_PARCELCRAFT_TRANSIT_TIMES.md
-CONFLICT_RESOLUTION_SUMMARY.md
+SHIPPING_INTEGRATION.md                  # NEW: Consolidated documentation
```

### fas-sanity Repository

```diff
netlify/functions/
├── easypostCreateLabel.ts                # KEEP: Core label creation
├── getShippingQuoteBySkus.ts            # KEEP: Core rate calculation
-├── getEasyPostRates.ts                  # DELETE: Redundant with getShippingQuoteBySkus
├── easypostWebhook.ts                    # KEEP: Webhook for label events
-├── easypost-webhook.ts                  # DELETE: Duplicate of easypostWebhook.ts
└── _easypost.ts                          # KEEP: Shared EasyPost utilities

src/pages/api/
├── create-shipping-label.ts             # KEEP: API wrapper for label creation
├── webhooks/
│   └── stripe-order.ts                  # MODIFY: Update to handle Adaptive Pricing metadata
└── ...

# Root directory
-EASYPOST_DEPLOYMENT.md                   # CONSOLIDATE: Move content to fas-cms-fresh/SHIPPING_INTEGRATION.md
```

---

## Documentation Consolidation

### Create: `fas-cms-fresh/SHIPPING_INTEGRATION.md`

**Complete master documentation replacing all shipping docs:**

```markdown
# Shipping Integration Documentation

**EasyPost + Stripe Adaptive Pricing**  
Real-time dynamic shipping rates in Stripe Checkout

---

## Table of Contents

1. Architecture Overview
2. Setup Instructions
3. Environment Configuration
4. API Endpoints Reference
5. Webhook Handlers
6. Label Creation Flow
7. Testing & Debugging
8. Troubleshooting Guide
9. FAQ

---

## 1. Architecture Overview

[Move content from EASYPOST_DEPLOYMENT.md]
[Add Adaptive Pricing flow diagrams]
[Explain data flow between repos]

## 2. Setup Instructions

### Stripe Dashboard Configuration

[Step-by-step with screenshots]

### Environment Variables

[Complete list for both repos]

### EasyPost Configuration

[API keys, webhook setup]

## 3. API Endpoints Reference

### Shipping Rates Webhook

- URL: `/api/stripe/shipping-rates-webhook`
- Method: POST
- Called by: Stripe Adaptive Pricing
- Purpose: Return real-time rates

[Full specs for each endpoint]

## 4. Webhook Handlers

[Document all webhooks and their purposes]

## 5. Label Creation Flow

[Step-by-step post-purchase flow]

## 6. Testing & Debugging

### Test Scenarios

1. Single item checkout
2. Multiple items checkout
3. International shipping
4. Heavy/oversized items

### Debug Checklist

[...]

## 7. Troubleshooting Guide

### No rates appearing

- [ ] Check Stripe webhook secret
- [ ] Verify Sanity function is accessible
- [ ] Check EasyPost API key
- [ ] Review cart metadata structure

### Wrong rates showing

[...]

## 8. FAQ

Q: Why use EasyPost instead of Legacy provider?
A: EasyPost provides full API access for custom logic, supports multiple carriers, and gives you control over the entire flow.

[More Q&A]
```

**Delete after consolidation:**

- `fas-sanity/EASYPOST_DEPLOYMENT.md`
- All Legacy provider documentation in fas-cms-fresh
- Any conflict resolution or debugging notes that are now outdated

---

## Testing Strategy

### Phase 1: Unit Tests

**Test:** Webhook endpoint with mock data

```typescript
// Test shipping-rates-webhook.ts
describe('Shipping Rates Webhook', () => {
  it('should validate Stripe signature', async () => {
    // Mock request with invalid signature
    // Expect 401 response
  })

  it('should extract address and session ID', async () => {
    // Mock valid webhook payload
    // Verify address extraction
  })

  it('should call fas-sanity function', async () => {
    // Mock Stripe event
    // Verify fetch to getShippingQuoteBySkus
  })

  it('should format rates for Stripe', async () => {
    // Mock EasyPost response
    // Verify Stripe-compatible output
  })
})
```

### Phase 2: Integration Tests

**Test 1: End-to-End Rate Calculation**

```bash
# 1. Create test checkout session
curl -X POST https://fasmotorsports.com/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "cart": [{"sku": "TEST-SKU-123", "quantity": 1, "priceId": "price_xxx"}],
    "mode": "payment"
  }'

# 2. Open checkout URL in browser
# 3. Enter test shipping address
# 4. Verify rates appear dynamically
# 5. Select rate and complete test payment
# 6. Verify order created in Sanity with correct metadata
```

**Test 2: Label Creation**

```bash
# After test order created
# 1. Manually trigger label creation from Sanity Studio
# 2. Verify label URL generated
# 3. Check tracking number populated
# 4. Verify customer receives tracking email
```

### Phase 3: Load Testing

**Scenario:** 100 concurrent checkouts

```javascript
// Use Artillery or k6 for load testing
export default function () {
  // Simulate 100 users entering addresses simultaneously
  // Measure webhook response times
  // Verify all get rates successfully
}
```

**Success Criteria:**

- 95% of requests complete in < 3 seconds
- No rate calculation failures
- No webhook timeouts

---

## Rollback Plan

### If Integration Fails

**Immediate Rollback Steps:**

1. **Disable Stripe Adaptive Pricing**
   - Go to Stripe Dashboard → Settings → Checkout
   - Disable "Dynamic shipping rates"
   - Temporarily create static shipping rates

2. **Revert Code Changes**

   ```bash
   # fas-cms-fresh
   cd /path/to/fas-cms-fresh
   git revert HEAD~5  # Revert last 5 commits
   git push origin main

   # Redeploy
   netlify deploy --prod
   ```

3. **Restore Static Rates**

   ```bash
   # Create temporary flat rate in Stripe
   stripe shipping_rates create \
     --display_name="Standard Shipping" \
     --type=fixed_amount \
     --fixed_amount[amount]=1500 \
     --fixed_amount[currency]=usd
   ```

4. **Update Checkout Session**
   ```typescript
   // Temporarily hardcode shipping rate
   shipping_options: [
     {
       shipping_rate: 'shr_xxxxx', // Static rate ID
     },
   ]
   ```

### Rollback Timeline

- **0-15 minutes**: Disable Adaptive Pricing, use static rates
- **15-30 minutes**: Revert code if needed
- **30-60 minutes**: Full investigation and fix

---

## Step-by-Step Implementation Checklist

### Week 1: Cleanup & Preparation

- [ ] **Day 1-2**: Execute cleanup plan
  - [ ] Delete Legacy provider documentation files
  - [ ] Remove Legacy provider-specific API endpoints
  - [ ] Delete duplicate EasyPost functions
  - [ ] Remove obsolete environment variables
  - [ ] Create SHIPPING_INTEGRATION.md master doc
  - [ ] Commit cleanup: `git commit -m "chore: remove Legacy provider, consolidate docs"`

- [ ] **Day 3**: Set up Stripe Adaptive Pricing
  - [ ] Enable dynamic rates in Stripe Dashboard
  - [ ] Generate webhook secret
  - [ ] Add webhook endpoint URL
  - [ ] Test webhook signature verification

- [ ] **Day 4-5**: Environment setup
  - [ ] Add STRIPE_SHIPPING_WEBHOOK_SECRET to .env
  - [ ] Verify SANITY_BASE_URL points to fas-sanity
  - [ ] Test connectivity between repos
  - [ ] Update all environment variable documentation

### Week 2: Core Implementation

- [ ] **Day 1-2**: Create webhook endpoint
  - [ ] Implement `shipping-rates-webhook.ts`
  - [ ] Add Stripe signature verification
  - [ ] Add session retrieval logic
  - [ ] Add cart metadata extraction
  - [ ] Add fas-sanity API call
  - [ ] Add rate formatting for Stripe

- [ ] **Day 3**: Update checkout session creation
  - [ ] Add cart to metadata
  - [ ] Add shipping_address_collection
  - [ ] Remove old Legacy provider code
  - [ ] Test session creation

- [ ] **Day 4-5**: Update order webhook
  - [ ] Extract shipping metadata from session
  - [ ] Store EasyPost shipment/rate IDs in order
  - [ ] Test order creation flow
  - [ ] Verify label creation uses stored IDs

### Week 3: Testing & Documentation

- [ ] **Day 1-2**: Unit tests
  - [ ] Test webhook signature validation
  - [ ] Test address extraction
  - [ ] Test rate formatting
  - [ ] Test error handling

- [ ] **Day 3-4**: Integration tests
  - [ ] Test full checkout flow
  - [ ] Test multiple carrier rates
  - [ ] Test international addresses
  - [ ] Test edge cases (PO boxes, military addresses)

- [ ] **Day 5**: Documentation
  - [ ] Complete SHIPPING_INTEGRATION.md
  - [ ] Add code comments
  - [ ] Create troubleshooting guide
  - [ ] Document rollback procedures

### Week 4: Deployment & Monitoring

- [ ] **Day 1**: Staging deployment
  - [ ] Deploy to staging environment
  - [ ] Run full test suite
  - [ ] QA review

- [ ] **Day 2-3**: Production deployment
  - [ ] Deploy fas-sanity changes
  - [ ] Deploy fas-cms-fresh changes
  - [ ] Enable Stripe Adaptive Pricing
  - [ ] Monitor first 50 orders

- [ ] **Day 4-5**: Post-launch
  - [ ] Monitor error rates
  - [ ] Check webhook success rates
  - [ ] Review customer feedback
  - [ ] Performance optimization if needed

---

## Success Metrics

### Technical Metrics

- **Webhook Response Time**: < 2 seconds (p95)
- **Rate Calculation Success Rate**: > 99%
- **Label Creation Success Rate**: > 99.5%
- **Zero manual shipping rate overrides**

### Business Metrics

- **Shipping Revenue Accuracy**: Within 2% of carrier costs
- **Customer Satisfaction**: No complaints about shipping rates
- **Checkout Abandonment**: No increase due to shipping rates
- **International Order Growth**: Track if international rates help expand market

### Monitoring Dashboards

- Stripe Dashboard → Webhooks → shipping-rates-webhook
- Netlify Functions → getShippingQuoteBySkus performance
- Sanity Studio → Order shipping metadata completeness
- Error tracking for webhook failures

---

## Additional Notes

### Why This Approach vs Others

**Option A: Custom Checkout Page with Rates (What You Had)**

- ✅ Full control over UI
- ❌ More frontend code to maintain
- ❌ Extra step for customers
- ❌ Not inside Stripe's trusted checkout

**Option B: Legacy provider (What You Tried)**

- ✅ Easy setup
- ❌ Limited to static rates only
- ❌ No real-time calculation
- ❌ Less control over logic

**Option C: EasyPost + Stripe Adaptive Pricing (This Plan)** ⭐

- ✅ Real-time rates inside Stripe Checkout
- ✅ Full control over rate calculation
- ✅ Multiple carrier support
- ✅ Custom business logic possible
- ✅ Single payment flow
- ❌ More initial setup required (but we're documenting it all!)

---

## Future Enhancements

### Phase 2 Features (Post-Launch)

1. **Rate Shopping Logic**
   - Automatically select cheapest rate for customer
   - Add markup percentage configuration
   - Offer "free shipping" for orders over $X

2. **Advanced Carrier Selection**
   - Filter rates by delivery time
   - Exclude certain carriers for certain products
   - Priority shipping for expedited orders

3. **International Expansion**
   - Add customs information calculation
   - Multi-currency support
   - International carrier integrations

4. **Analytics Dashboard**
   - Track most popular shipping methods
   - Analyze shipping cost vs revenue
   - Identify optimization opportunities

---

## Questions & Support

### Getting Help

- **EasyPost Support**: support@easypost.com
- **Stripe Support**: https://support.stripe.com
- **Internal Team**: [Your team Slack channel]

### Useful Resources

- [Stripe Adaptive Pricing Docs](https://stripe.com/docs/payments/checkout/shipping)
- [EasyPost API Reference](https://www.easypost.com/docs/api)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)

---

**Last Updated**: [Current Date]  
**Version**: 1.0.0  
**Author**: Integration Team  
**Status**: ✅ Ready for Implementation

```

---

## Next Steps

1. **Review this plan** - Discuss with team, identify any gaps
2. **Assign tasks** - Break down implementation across team members
3. **Set timeline** - Confirm 4-week schedule or adjust as needed
4. **Begin Phase 1** - Start with cleanup to ensure clean foundation
5. **Daily standups** - Track progress and blockers
6. **Testing as you go** - Don't wait until end for testing


---

**🎯 End Goal**: Customers see real-time UPS/USPS/FedEx rates inside Stripe Checkout based on their exact shipping address, with automatic label creation after purchase using EasyPost.

**💰 Business Value**: Accurate shipping costs, reduced manual work, better customer experience, support for growth and international expansion.

```

(Non‑authoritative reference — ignore during execution)

````markdown
# 📋 EasyPost + Stripe Integration Quick Checklist

## Phase 1: Cleanup (Week 1, Days 1-2)

### fas-cms-fresh Repository

- [ ] Delete `DYNAMIC_SHIPPING_FIX.md`
- [ ] Delete `DYNAMIC_SHIPPING_FIXES.md`
- [ ] Delete `FIX_PARCELCRAFT_TRANSIT_TIMES.md`
- [ ] Delete `SHIPPING_OPTIONS_AUDIT.md`
- [ ] Delete `STRIPE_PARCELCRAFT_VERIFICATION.md`
- [ ] Delete `TEST_PARCELCRAFT_TRANSIT_TIMES.md`
- [ ] Delete `CONFLICT_RESOLUTION_SUMMARY.md`
- [ ] Delete `src/pages/api/stripe/diagnose-shipping-options.ts`
- [ ] Delete `src/pages/api/stripe/update-shipping-options.ts`
- [ ] Remove `STRIPE_USE_DYNAMIC_SHIPPING_RATES` from `.env`
- [ ] Remove `SHIPPING_PROVIDER` from `.env`
- [ ] Commit cleanup: `git commit -m "chore: remove Legacy provider code and docs"`

### fas-sanity Repository

- [ ] Delete `netlify/functions/easypost-webhook.ts` (keep `easypostWebhook.ts`)
- [ ] Delete `netlify/functions/getEasyPostRates.ts` (keep `getShippingQuoteBySkus.ts`)
- [ ] Extract content from `EASYPOST_DEPLOYMENT.md` to new master doc
- [ ] Delete `EASYPOST_DEPLOYMENT.md` after extraction
- [ ] Commit cleanup: `git commit -m "chore: remove duplicate functions, consolidate docs"`

---

## Phase 2: Stripe Setup (Week 1, Days 3-4)

### Stripe Dashboard Configuration

- [ ] Login to Stripe Dashboard
- [ ] Navigate to **Settings → Payments → Checkout**
- [ ] Enable **"Calculate shipping rates dynamically"**
- [ ] Set webhook URL: `https://fasmotorsports.com/api/stripe/shipping-rates-webhook`
- [ ] Copy webhook signing secret
- [ ] Add to `.env`: `STRIPE_SHIPPING_WEBHOOK_SECRET=whsec_xxxxx`

### Environment Variables (fas-cms-fresh/.env)

- [ ] Add `STRIPE_SHIPPING_WEBHOOK_SECRET=whsec_xxxxx`
- [ ] Add `SANITY_BASE_URL=https://fassanity.fasmotorsports.com`
- [ ] Verify `STRIPE_SECRET_KEY` exists
- [ ] Verify `STRIPE_PUBLISHABLE_KEY` exists

---

## Phase 3: Implementation (Week 2)

### Create New Files

#### fas-cms-fresh

- [ ] Create `src/pages/api/stripe/shipping-rates-webhook.ts`
  - [ ] Implement Stripe signature verification
  - [ ] Extract shipping address from event
  - [ ] Retrieve checkout session
  - [ ] Extract cart from session metadata
  - [ ] Call fas-sanity function
  - [ ] Transform rates to Stripe format
  - [ ] Return shipping_rates array

- [ ] Create `SHIPPING_INTEGRATION.md`
  - [ ] Architecture overview
  - [ ] Setup instructions
  - [ ] API reference
  - [ ] Troubleshooting guide

### Modify Existing Files

#### fas-cms-fresh

- [ ] Update `src/pages/api/stripe/create-checkout-session.ts`
  - [ ] Add cart to metadata: `metadata.cart = JSON.stringify(cartItems)`
  - [ ] Add `shipping_address_collection: { allowed_countries: ['US'] }`
  - [ ] Add `automatic_tax: { enabled: true }`
  - [ ] Remove Legacy provider-specific code:
    - [ ] Remove `permissions.update_shipping_details`
    - [ ] Remove placeholder `shipping_options`
  - [ ] DO NOT set `shipping_options` (Stripe will populate dynamically)

#### fas-sanity

- [ ] Update `src/pages/api/webhooks/stripe-order.ts`
  - [ ] Extract `session.shipping_cost.shipping_rate`
  - [ ] Get `shipping_rate.metadata` (EasyPost data)
  - [ ] Store in order document:
    - [ ] `shipping.carrier`
    - [ ] `shipping.service`
    - [ ] `shipping.easyPostRateId`
    - [ ] `shipping.easyPostShipmentId`
    - [ ] `shipping.amount`

- [ ] Verify `netlify/functions/easypostCreateLabel.ts`
  - [ ] Uses `order.shipping.easyPostShipmentId`
  - [ ] Uses `order.shipping.easyPostRateId`
  - [ ] Buys correct rate from shipment

---

## Phase 4: Testing (Week 3)

### Unit Tests

- [ ] Test webhook signature validation (invalid signature → 401)
- [ ] Test missing session_id → 400
- [ ] Test missing cart metadata → 400
- [ ] Test rate formatting (EasyPost → Stripe format)
- [ ] Test error handling (fas-sanity unreachable)

### Integration Tests

- [ ] Create test checkout session via API
- [ ] Open checkout URL in browser
- [ ] Enter test shipping address (use Stripe test address)
- [ ] Verify rates appear dynamically
- [ ] Verify multiple carriers shown (USPS, UPS, etc.)
- [ ] Select a rate
- [ ] Complete test payment
- [ ] Verify order created in Sanity
- [ ] Verify shipping metadata stored correctly
- [ ] Trigger label creation manually
- [ ] Verify label URL generated
- [ ] Verify tracking code populated

### Load Tests

- [ ] Simulate 50 concurrent address entries
- [ ] Measure webhook response times
- [ ] Target: < 2 seconds (p95)
- [ ] Check error rates (target: < 1%)

---

## Phase 5: Deployment (Week 4, Days 1-3)

### Staging Deployment

- [ ] Deploy fas-sanity to staging
  - [ ] `git push origin develop` (or staging branch)
  - [ ] Verify Netlify deploy succeeds
  - [ ] Test staging URL accessible
- [ ] Deploy fas-cms-fresh to staging
  - [ ] `git push origin develop`
  - [ ] Verify Netlify deploy succeeds
- [ ] Configure staging webhook in Stripe
- [ ] Run full test suite on staging
- [ ] QA review and sign-off

### Production Deployment

- [ ] **Pre-deploy checklist:**
  - [ ] All tests passing
  - [ ] Staging tested successfully
  - [ ] Rollback plan ready
  - [ ] Team notified of deployment

- [ ] **Deploy fas-sanity first:**
  - [ ] `git merge develop` → `main`
  - [ ] `git push origin main`
  - [ ] Monitor Netlify deployment
  - [ ] Test `/netlify/functions/getShippingQuoteBySkus` manually

- [ ] **Deploy fas-cms-fresh second:**
  - [ ] `git merge develop` → `main`
  - [ ] `git push origin main`
  - [ ] Monitor Netlify deployment

- [ ] **Enable Stripe Adaptive Pricing:**
  - [ ] Verify webhook endpoint responds (200 OK)
  - [ ] Enable in Stripe Dashboard
  - [ ] Monitor webhook calls in Stripe Dashboard

- [ ] **Monitor first 10 orders:**
  - [ ] Check webhook success rate
  - [ ] Verify rates appearing correctly
  - [ ] Verify orders created with metadata
  - [ ] Verify labels created successfully

---

## Phase 6: Post-Launch Monitoring (Week 4, Days 4-5)

### Metrics to Track

- [ ] Webhook response time (target: < 2s p95)
- [ ] Rate calculation success rate (target: > 99%)
- [ ] Label creation success rate (target: > 99.5%)
- [ ] Checkout abandonment rate (watch for increases)
- [ ] Customer support tickets about shipping

### Dashboards to Monitor

- [ ] Stripe Dashboard → Webhooks → shipping-rates-webhook
- [ ] Netlify Functions → getShippingQuoteBySkus logs
- [ ] Sanity Studio → Orders → Shipping metadata completeness
- [ ] Error tracking service (Sentry/etc)

### Day 1 After Launch

- [ ] Review first 50 orders
- [ ] Check for any webhook failures
- [ ] Verify all rates calculated correctly
- [ ] Monitor customer feedback

### Week 1 After Launch

- [ ] Analyze shipping rate accuracy vs actual costs
- [ ] Review any edge cases or errors
- [ ] Optimize if needed
- [ ] Document any learnings

---

## Rollback Plan (If Needed)

### Immediate Actions (0-15 minutes)

- [ ] Disable Stripe Adaptive Pricing in Dashboard
- [ ] Create temporary static shipping rate:
  ```bash
  stripe shipping_rates create \
    --display_name="Standard Shipping" \
    --type=fixed_amount \
    --fixed_amount[amount]=1500 \
    --fixed_amount[currency]=usd
  ```
````

- [ ] Update checkout session to use static rate temporarily

### Code Rollback (15-30 minutes if needed)

- [ ] `git revert HEAD~5` in fas-cms-fresh
- [ ] `git push origin main --force-with-lease`
- [ ] Netlify auto-deploys previous version

---

## Success Criteria

### Technical

- ✅ Webhook responds in < 2 seconds (p95)
- ✅ Rate calculation success rate > 99%
- ✅ No manual shipping rate overrides needed
- ✅ Zero duplicate functions in codebase
- ✅ Single source of truth documentation

### Business

- ✅ Customers see accurate real-time rates
- ✅ No increase in checkout abandonment
- ✅ No customer complaints about shipping costs
- ✅ Shipping revenue within 2% of carrier costs

---

## Common Issues & Solutions

### Issue: Rates not appearing in checkout

**Check:**

- [ ] Stripe webhook secret is correct
- [ ] Webhook endpoint returns 200 OK
- [ ] Cart metadata is present in session
- [ ] fas-sanity function is accessible
- [ ] EasyPost API key is valid

### Issue: Wrong rates showing

**Check:**

- [ ] Product weights/dimensions in Sanity are correct
- [ ] Warehouse address is configured
- [ ] EasyPost shipment created successfully
- [ ] Rate formatting is correct (dollars → cents)

### Issue: Label creation fails

**Check:**

- [ ] EasyPost shipment ID stored in order
- [ ] EasyPost rate ID stored in order
- [ ] Rate still valid (not expired)
- [ ] EasyPost account has funds

---

## Quick Commands Reference

### Test webhook locally

```bash
stripe listen --forward-to localhost:3000/api/stripe/shipping-rates-webhook
```

### Create test checkout session

```bash
curl -X POST https://fasmotorsports.com/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"cart": [{"sku": "TEST-123", "quantity": 1}]}'
```

### Check Netlify function logs

```bash
netlify functions:log getShippingQuoteBySkus
```

### View Stripe webhook events

```bash
stripe events list --limit 10
```

---

## Documentation Links

- Main Plan: `EASYPOST_STRIPE_INTEGRATION_PLAN.md`
- Cleanup Script: `cleanup_shipping_integration.sh`
- Stripe Adaptive Pricing: https://stripe.com/docs/payments/checkout/shipping
- EasyPost API: https://www.easypost.com/docs/api

---

## Team Contacts

- **Stripe Support**: https://support.stripe.com
- **EasyPost Support**: support@easypost.com
- **Internal Team**: [Your Slack channel]

---

**Last Updated**: [Date]  
**Version**: 1.0.0  
**Status**: Ready for Execution

IMPLEMENTATION RULE:
If a code change is not explicitly described in Phase 3,
Codex is NOT authorized to invent it.
