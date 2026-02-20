# FAS Unified Checkout Implementation
## Stripe Elements + Live Shippo Rates on Same Form

**Goal**: Customer sees shipping options AND payment form on the same page, with live rate updates as they type their address.

---

## Architecture (Corrected)

### Data Flow
```
1. Customer adds to cart (Medusa cart API)
2. Customer goes to /checkout
3. Customer enters shipping address
   ↓ (debounced onChange - 500ms)
4. Fetch Shippo rates via Medusa
   ↓ (display 4 UPS options)
5. Customer selects shipping option
   ↓ (cart updates with shipping line item)
6. Display total: $5,999.99 + $25.00 shipping = $6,024.99
   ↓
7. Customer enters payment (Stripe Elements)
8. Confirm payment → Medusa creates order
   ↓
9. Webhook → Sync order to Sanity
10. Sanity Studio: Fulfillment team sees new order
```

### Key Components

**1. Medusa Cart** (handles cart state)
**2. Shippo Plugin** (gets UPS rates)
**3. Stripe Elements** (embedded payment form)
**4. Sanity Webhook Subscriber** (receives completed orders)

---

## Implementation

### Step 1: Checkout Page Structure

**File**: `fas-cms-fresh/src/pages/checkout.astro`

```astro
---
import CheckoutForm from '../components/CheckoutForm'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY)
---

<html>
<head>
  <title>Checkout - FAS Motorsports</title>
</head>
<body>
  <main>
    <h1>Checkout</h1>

    {/* React Island for checkout form */}
    <CheckoutForm client:only="react" stripe={stripePromise} />
  </main>
</body>
</html>
```

---

### Step 2: Unified Checkout Form Component

**File**: `fas-cms-fresh/src/components/CheckoutForm.tsx`

```typescript
import { useState, useEffect } from 'react'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import type { Stripe } from '@stripe/stripe-js'

interface ShippingOption {
  id: string
  name: string          // "UPS Ground"
  amount: number        // 1250 (cents)
  currency: string      // "usd"
  delivery_days: string // "5-7"
  shippo_rate_id: string
}

export default function CheckoutForm({ stripe }: { stripe: Promise<Stripe | null> }) {
  return (
    <Elements stripe={stripe}>
      <CheckoutFormInner />
    </Elements>
  )
}

function CheckoutFormInner() {
  const stripe = useStripe()
  const elements = useElements()

  const [cartId] = useState(() => getOrCreateCartId())
  const [cart, setCart] = useState(null)

  // Shipping state
  const [shippingAddress, setShippingAddress] = useState({
    first_name: '',
    last_name: '',
    address_1: '',
    city: '',
    province: '',
    postal_code: '',
    country_code: 'US'
  })

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [selectedShipping, setSelectedShipping] = useState<string | null>(null)
  const [loadingRates, setLoadingRates] = useState(false)

  // Payment state
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  // Load cart
  useEffect(() => {
    loadCart()
  }, [])

  // Fetch shipping rates when address changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAddressComplete(shippingAddress)) {
        fetchShippingRates()
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [shippingAddress])

  // Load Medusa cart
  async function loadCart() {
    const response = await fetch(`${MEDUSA_URL}/store/carts/${cartId}`)
    const data = await response.json()
    setCart(data.cart)
  }

  // Fetch Shippo rates via Medusa
  async function fetchShippingRates() {
    setLoadingRates(true)

    try {
      // 1. Update cart with shipping address
      await fetch(`${MEDUSA_URL}/store/carts/${cartId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipping_address: shippingAddress })
      })

      // 2. Fetch shipping options (Medusa calls Shippo)
      const response = await fetch(`${MEDUSA_URL}/store/shipping-options/${cartId}`)
      const data = await response.json()

      // 3. Filter to UPS only (should already be filtered server-side)
      const upsOptions = data.shipping_options.filter(opt =>
        opt.data?.carrier === 'UPS'
      )

      setShippingOptions(upsOptions)

      // Auto-select cheapest option
      if (upsOptions.length > 0) {
        setSelectedShipping(upsOptions[0].id)
        await selectShippingOption(upsOptions[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch shipping rates:', error)
      alert('Could not load shipping rates. Please check your address.')
    } finally {
      setLoadingRates(false)
    }
  }

  // Select shipping option
  async function selectShippingOption(optionId: string) {
    try {
      // Add shipping method to cart
      const response = await fetch(`${MEDUSA_URL}/store/carts/${cartId}/shipping-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: optionId })
      })

      const data = await response.json()
      setCart(data.cart) // Cart now includes shipping cost

      // Create/update payment intent with new total
      await createPaymentIntent(data.cart.total)
    } catch (error) {
      console.error('Failed to select shipping:', error)
    }
  }

  // Create Stripe Payment Intent
  async function createPaymentIntent(amount: number) {
    try {
      const response = await fetch(`${MEDUSA_URL}/store/carts/${cartId}/payment-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_id: 'stripe'
        })
      })

      const data = await response.json()

      // Medusa returns client_secret for Stripe Elements
      setClientSecret(data.cart.payment_session.data.client_secret)
    } catch (error) {
      console.error('Failed to create payment intent:', error)
    }
  }

  // Handle payment submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!stripe || !elements || !clientSecret) return

    setProcessing(true)

    try {
      // Confirm payment with Stripe
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order/confirmation`,
          payment_method_data: {
            billing_details: {
              name: `${shippingAddress.first_name} ${shippingAddress.last_name}`,
              address: {
                line1: shippingAddress.address_1,
                city: shippingAddress.city,
                state: shippingAddress.province,
                postal_code: shippingAddress.postal_code,
                country: shippingAddress.country_code
              }
            }
          }
        },
        redirect: 'if_required' // Stay on page if no 3DS
      })

      if (error) {
        alert(error.message)
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Complete Medusa order
        await fetch(`${MEDUSA_URL}/store/carts/${cartId}/complete`, {
          method: 'POST'
        })

        // Redirect to confirmation
        window.location.href = '/order/confirmation'
      }
    } catch (error) {
      console.error('Payment failed:', error)
      alert('Payment failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      {/* Cart Summary */}
      <section className="cart-summary">
        <h2>Order Summary</h2>
        {cart && (
          <>
            <div className="line-items">
              {cart.items.map(item => (
                <div key={item.id} className="line-item">
                  <span>{item.title}</span>
                  <span>${(item.unit_price / 100).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="totals">
              <div>
                <span>Subtotal</span>
                <span>${(cart.subtotal / 100).toFixed(2)}</span>
              </div>

              {cart.shipping_total > 0 && (
                <div>
                  <span>Shipping</span>
                  <span>${(cart.shipping_total / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="total">
                <span>Total</span>
                <span>${(cart.total / 100).toFixed(2)}</span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Shipping Address */}
      <section className="shipping-section">
        <h2>Shipping Address</h2>

        <div className="form-grid">
          <input
            type="text"
            placeholder="First Name"
            value={shippingAddress.first_name}
            onChange={e => setShippingAddress({ ...shippingAddress, first_name: e.target.value })}
            required
          />

          <input
            type="text"
            placeholder="Last Name"
            value={shippingAddress.last_name}
            onChange={e => setShippingAddress({ ...shippingAddress, last_name: e.target.value })}
            required
          />

          <input
            type="text"
            placeholder="Address"
            value={shippingAddress.address_1}
            onChange={e => setShippingAddress({ ...shippingAddress, address_1: e.target.value })}
            className="full-width"
            required
          />

          <input
            type="text"
            placeholder="City"
            value={shippingAddress.city}
            onChange={e => setShippingAddress({ ...shippingAddress, city: e.target.value })}
            required
          />

          <input
            type="text"
            placeholder="State"
            value={shippingAddress.province}
            onChange={e => setShippingAddress({ ...shippingAddress, province: e.target.value })}
            required
          />

          <input
            type="text"
            placeholder="ZIP Code"
            value={shippingAddress.postal_code}
            onChange={e => setShippingAddress({ ...shippingAddress, postal_code: e.target.value })}
            required
          />
        </div>
      </section>

      {/* Shipping Options */}
      <section className="shipping-options">
        <h2>Shipping Method</h2>

        {loadingRates && <p>Loading shipping rates...</p>}

        {shippingOptions.length > 0 && (
          <div className="shipping-options-list">
            {shippingOptions.map(option => (
              <label key={option.id} className="shipping-option">
                <input
                  type="radio"
                  name="shipping"
                  value={option.id}
                  checked={selectedShipping === option.id}
                  onChange={e => {
                    setSelectedShipping(option.id)
                    selectShippingOption(option.id)
                  }}
                />
                <div className="option-details">
                  <strong>{option.name}</strong>
                  <span className="delivery-time">{option.delivery_days} business days</span>
                </div>
                <span className="option-price">
                  ${(option.amount / 100).toFixed(2)}
                </span>
              </label>
            ))}
          </div>
        )}

        {!loadingRates && shippingOptions.length === 0 && isAddressComplete(shippingAddress) && (
          <p className="error">No shipping options available for this address.</p>
        )}
      </section>

      {/* Payment */}
      <section className="payment-section">
        <h2>Payment</h2>

        {clientSecret && (
          <PaymentElement />
        )}

        {!clientSecret && selectedShipping && (
          <p>Initializing payment...</p>
        )}
      </section>

      {/* Submit */}
      <button
        type="submit"
        disabled={!stripe || processing || !selectedShipping}
        className="checkout-button"
      >
        {processing ? 'Processing...' : `Pay $${cart ? (cart.total / 100).toFixed(2) : '0.00'}`}
      </button>
    </form>
  )
}

// Utility functions
function getOrCreateCartId(): string {
  let cartId = getCookie('cart_id')
  if (!cartId) {
    // Create new cart
    // (This should be done server-side in a real implementation)
    cartId = createNewCart()
    setCookie('cart_id', cartId, 7) // 7 days
  }
  return cartId
}

function isAddressComplete(address: any): boolean {
  return !!(
    address.address_1 &&
    address.city &&
    address.province &&
    address.postal_code
  )
}
```

---

### Step 3: Medusa Shippo Configuration

**File**: `fas-medusa/medusa-config.js`

```typescript
module.exports = {
  projectConfig: {
    // ... existing config
  },
  plugins: [
    // ... existing plugins
    {
      resolve: 'medusa-fulfillment-shippo',
      options: {
        api_key: process.env.SHIPPO_API_TOKEN,

        // UPS carrier account
        carrier_accounts: {
          ups: process.env.SHIPPO_UPS_ACCOUNT_ID
        },

        // Only show UPS rates
        account_object_ids: [process.env.SHIPPO_UPS_ACCOUNT_ID],

        // Warehouse address (ship from)
        from_address: {
          name: 'FAS Motorsports',
          company: 'First American Supercross',
          street1: process.env.WAREHOUSE_ADDRESS_LINE1,
          city: process.env.WAREHOUSE_CITY,
          state: process.env.WAREHOUSE_STATE,
          zip: process.env.WAREHOUSE_ZIP,
          country: 'US',
          phone: process.env.WAREHOUSE_PHONE
        },

        // Units
        weight_unit: 'lb',
        distance_unit: 'in',

        // Service levels (filter to these 4 only)
        service_levels: [
          'ups_ground',
          'ups_3_day_select',
          'ups_2nd_day_air',
          'ups_next_day_air'
        ]
      }
    }
  ]
}
```

---

### Step 4: Medusa → Sanity Webhook Sync

**File**: `fas-medusa/src/subscribers/sync-order-to-sanity.ts`

```typescript
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { createClient } from '@sanity/client'

const sanity = createClient({
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET!,
  token: process.env.SANITY_API_TOKEN!,
  apiVersion: '2024-01-01',
  useCdn: false
})

/**
 * Sync completed Medusa orders to Sanity for fulfillment workflow.
 * This runs AFTER payment completes and order is created in Medusa.
 */
export default async function syncOrderToSanity({
  event,
  container
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve('logger')
  const orderService = container.resolve('orderService')

  const orderId = event.data.id

  try {
    // Get full order details from Medusa
    const order = await orderService.retrieve(orderId, {
      relations: [
        'items',
        'items.variant',
        'items.variant.product',
        'shipping_address',
        'billing_address',
        'shipping_methods',
        'payments',
        'customer'
      ]
    })

    // Check if already synced (idempotency)
    const existing = await sanity.fetch(
      `*[_type == "order" && medusaOrderId == $orderId][0]`,
      { orderId: order.id }
    )

    if (existing) {
      logger.info(`Order ${orderId} already synced to Sanity`)
      return
    }

    // Extract shipping details (including Shippo rate ID)
    const shippingMethod = order.shipping_methods[0]
    const shippoRateId = shippingMethod?.data?.shippo_rate_id

    // Create order in Sanity
    const sanityOrder = await sanity.create({
      _type: 'order',
      medusaOrderId: order.id,
      orderNumber: order.display_id,

      // Customer info
      customerEmail: order.email,
      customerPhone: order.shipping_address.phone,
      customer: order.customer ? {
        _type: 'reference',
        _ref: `customer-${order.customer.id}` // Link to Sanity customer if exists
      } : undefined,

      // Cart items
      cart: order.items.map(item => ({
        _type: 'orderCartItem',
        _key: item.id,
        productName: item.title,
        variantTitle: item.variant.title,
        quantity: item.quantity,
        unitPrice: item.unit_price / 100,
        total: item.total / 100,
        medusaVariantId: item.variant.id,
        medusaProductId: item.variant.product.id
      })),

      // Shipping address
      shippingAddress: {
        _type: 'shippingAddress',
        name: `${order.shipping_address.first_name} ${order.shipping_address.last_name}`,
        phone: order.shipping_address.phone,
        email: order.email,
        addressLine1: order.shipping_address.address_1,
        addressLine2: order.shipping_address.address_2,
        city: order.shipping_address.city,
        state: order.shipping_address.province,
        postalCode: order.shipping_address.postal_code,
        country: order.shipping_address.country_code
      },

      // Shipping details (CRITICAL: includes Shippo rate ID for label purchase)
      shippingDetails: {
        _type: 'object',
        carrier: 'UPS',
        serviceName: shippingMethod?.name || 'UPS Ground',
        amount: shippingMethod?.price / 100,
        shippoRateId: shippoRateId, // ← Used later for manual label purchase
        estimatedDeliveryDays: shippingMethod?.data?.delivery_days
      },

      // Payment info
      paymentStatus: order.payment_status,
      stripePaymentIntentId: order.payments[0]?.data?.id,

      // Totals
      subtotal: order.subtotal / 100,
      shippingTotal: order.shipping_total / 100,
      taxTotal: order.tax_total / 100,
      total: order.total / 100,

      // Order status
      status: 'pending', // Sanity workflow status
      fulfillmentStatus: 'unfulfilled',

      // Timestamps
      placedAt: order.created_at,
      createdAt: new Date().toISOString()
    })

    logger.info(`✓ Order ${order.display_id} synced to Sanity (${sanityOrder._id})`)

  } catch (error) {
    logger.error(`Failed to sync order ${orderId} to Sanity:`, error)
    // Don't throw - order is still valid in Medusa even if Sanity sync fails
  }
}

export const config: SubscriberConfig = {
  event: 'order.placed',
  context: {
    subscriberId: 'sync-order-to-sanity'
  }
}
```

---

### Step 5: Sanity Studio Fulfillment Workflow

**Unchanged** - Your existing manual workflow continues:

1. Order appears in Sanity Studio
2. Staff prints packing slip
3. Staff clicks "Purchase Label" → Netlify Function → Shippo (uses `shippoRateId`)
4. Label purchased, tracking number saved
5. Staff marks order fulfilled
6. Tracking email sent to customer

**File**: `fas-sanity/netlify/functions/manual-fulfill-order.ts` (UNCHANGED)

```typescript
// This function already exists - no changes needed!
// It uses order.shippingDetails.shippoRateId to purchase label
```

---

## Product Data (76 Products - Simple!)

Looking at your screenshot, the "2.7L Redeye Supercharger" has:
- Base price: $5,999.99
- Optional upgrades (checkboxes):
  - Upgraded Ceramic Race Bearings: +$48.00
  - Full Ceramic High Temp Coating: +$5.00
  - Lid Ceramic High Temp Coating: +$2.00
  - Blower Case Banner Porting: +$5.00
  - Dominator Race Elites: +$16.35
  - Core Exchange Program: +$50.00
  - Supercharger Shipping Box: +$1.50

**In Medusa, this is just**:
- 1 product: "2.7L Redeye Supercharger"
- 1 variant: Base ($5,999.99)
- Product options (add-ons stored as metadata or cart item options)

**Migration**:
```typescript
// Sanity → Medusa product sync
const product = await medusa.admin.products.create({
  title: '2.7L Redeye Supercharger Race Ported Core',
  handle: '27l-redeye-supercharger',
  description: 'Take your Hellcat to the next level...',

  variants: [{
    title: 'Default',
    prices: [{ amount: 599999, currency_code: 'usd' }], // $5,999.99 in cents

    // Shipping dimensions (for Shippo)
    weight: 65, // lbs
    length: 24,
    width: 20,
    height: 18,

    // Store add-ons as metadata
    metadata: {
      available_upgrades: JSON.stringify([
        { name: 'Upgraded Ceramic Race Bearings', price: 4800 },
        { name: 'Full Ceramic High Temp Coating', price: 500 },
        // ... etc
      ])
    }
  }],

  // Product metadata
  metadata: {
    sanity_id: '_id_from_sanity',
    category: 'Porting',
    subcategory: 'Supercharger Packages',
    filter: '2.7L'
  }
})
```

**76 products × 5 minutes each = 6-8 hours total migration** ✅

---

## Revised Timeline

| Phase | Duration | Complexity |
|-------|----------|------------|
| **1. Unified Checkout UI** | 1 week | Medium |
| **2. Medusa Shippo Setup** | 2 days | Low |
| **3. Stripe Elements Integration** | 3 days | Medium |
| **4. Medusa → Sanity Sync** | 2 days | Low |
| **5. Product Migration** | 1 day | Low (76 products) |
| **6. Testing** | 1 week | High |
| **Total** | **3-4 weeks** | **Much simpler!** |

---

## Next Steps

1. **Install Medusa Shippo plugin**:
   ```bash
   cd fas-medusa
   npm install medusa-fulfillment-shippo
   ```

2. **Configure Shippo** in `medusa-config.js`

3. **Build checkout form** in Astro (React Island)

4. **Add Medusa subscriber** to sync orders to Sanity

5. **Test end-to-end** with test mode Stripe + Shippo

Want me to implement any specific part of this?
