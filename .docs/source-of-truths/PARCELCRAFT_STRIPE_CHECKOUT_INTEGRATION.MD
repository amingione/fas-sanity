# ParcelCraft Shipping App Configuration for Stripe Checkout

---

IMPORTANT:
Both Stripe Checkout formats are fully compatible with the ParcelCraft app integration. You can use either:

- **Embedded Checkout**: Where the checkout form appears directly on your website
- **Hosted Checkout**: Where customers are redirected to Stripe's checkout page

## Key Compatibility Points

- **Same Metadata Structure**: Both formats use the same metadata structure for ParcelCraft integration
- **Same Webhook Processing**: ParcelCraft processes the same webhook events for both checkout types
- **Same Configuration**: Your ParcelCraft app settings in the Stripe Dashboard apply to both checkout formats

## Implementation Differences

### For Embedded Checkout:

// Embedded checkout is compatible with ParcelCraft integration.
// Use initEmbeddedCheckout() and mount() on the client side.

### For Hosted Checkout:

```javascript
const session = await stripe.checkout.sessions.create({
  // No ui_mode parameter needed for hosted checkout
  success_url: `${process.env.DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${process.env.DOMAIN}/cancel`,
  // Identical ParcelCraft metadata
  metadata: {
    parcelcraft_create_label: 'true',
    parcelcraft_package_type: 'custom',
    parcelcraft_weight_oz: '32',
    // other ParcelCraft metadata...
  },
  // other checkout parameters...
})

// Client-side: Use redirectToCheckout()
```

## Choose Based On Your Needs

- **Use Embedded Checkout if**: You want to keep customers on your site and control the entire UI experience
- **Use Hosted Checkout if**: You prefer a simpler integration with less frontend code to maintain

The ParcelCraft integration works identically with both checkout types because it operates at the Stripe API level through session metadata and webhooks, not at the UI level.

---

# The actual Stripe mechanism (this is the key insight)

**Here is the real architecture Stripe uses**

Customer types shipping address
↓
Stripe Checkout triggers shipping calculation
↓
Stripe Shipping engine runs
↓
Installed shipping apps (Parcelcraft) respond
↓
Rates injected into Checkout UI
↓
Customer selects one
↓
Selected shipping_rate ID attached to session
↓
Session completes
↓
Webhook fires
↓
shipping_cost.shipping_rate contains selected rate

---

# FINAL CANONICAL MODEL (this is the one)

**This is now locked.**

✔ Customers MUST:
• see live shipping rates
• inside Stripe Checkout UI
• immediately after entering shipping address
• before payment
• choose carrier/service themselves

✔ System MUST:
• NOT calculate shipping manually
• NOT show flat rates
• NOT use fallback shipping
• NOT create a second checkout layer
• NOT run a parallel checkout flow
• NOT override Stripe’s shipping UI

✔ Parcelcraft MUST:
• inject live rates at checkout
• based on address
• using connected carriers
• through Stripe’s app system

---

✔ Checkout
• Stripe hosted Checkout
• One creator only
• No embedded
• No second path
• No shipping_options

✔ Shipping
• Stripe shipping UI
• Parcelcraft app injects live rates
• Customer selects rate at checkout

✔ Server
• Creates session
• Does NOT calculate shipping
• Does NOT touch rates
• Does NOT update shipping

✔ Webhooks
• Expand shipping_cost.shipping_rate
• Persist selected carrier/service/cost
• Store Parcelcraft metadata

✔ Sanity
• Displays chosen shipping
• Uses it for fulfillment
• No guessing
• No recalculation

- This is the only acceptable behavior.

- Anything else is wrong.

- Full stop.

- This matches:
  • your requirement
  • Stripe support
  • Parcelcraft app design
  • real-world ecommerce behavior

---

# ANSWER FROM STRIPE SUPPORT TEAM

## ParcelCraft Shipping Integration with Stripe Checkout

### 1. First, install the ParcelCraft app from Stripe Marketplace [Parcelcraft app link](https://marketplace.stripe.com/apps/parcelcraft-shipping) [✅ THIS HAS BEEN COMPLETED BY AmberMin -- refer to .docs/ai-governance/parcelcraft-stripe-setup/proof-of-parcelcraft-installation for proof]

1. Go to the [ParcelCraft Shipping app page](https://marketplace.stripe.com/apps/parcelcraft-shipping) in the Stripe App Marketplace
2. Click "Install app" and follow the installation prompts
3. Complete the ParcelCraft account setup and connect your carrier accounts

#### 2. Server-side Checkout Session Configuration

```javascript
// server.js (Express server)
const express = require('express')
const app = express()
const stripe = require('stripe')('<your-stripe-secret-key>')
const bodyParser = require('body-parser')

app.use(express.static('public'))
app.use(bodyParser.json())
app.post('/webhook', express.raw({type: 'application/json'}), handleWebhook)

// Create checkout session with ParcelCraft metadata
app.post('/create-checkout-session', async (req, res) => {
  try {
    const {items} = req.body

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map((item) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            description: item.description,
            images: [item.image],
          },
          unit_amount: Math.round(item.price * 100), // convert to cents
        },
        quantity: item.quantity,
      })),
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['US'], // Countries you ship to
      },
      return_url: `${process.env.DOMAIN}/return?session_id={CHECKOUT_SESSION_ID}`,
      // ParcelCraft metadata for shipping integration
      metadata: {
        // Required ParcelCraft fields
        parcelcraft_create_label: 'true', // Tells ParcelCraft to auto-generate a label
        parcelcraft_package_type: 'custom', // or 'letter', 'flat', 'parcel', etc.
        parcelcraft_weight_oz: '32', // example weight in ounces

        // Order information
        order_id: `ORD-${Date.now()}`, // Your internal order reference
        order_items_count: `${items.reduce((sum, item) => sum + item.quantity, 0)}`,
      },
    })

    res.json({clientSecret: session.client_secret})
  } catch (error) {
    console.error('Error creating checkout session:', error)
    res.status(500).json({error: error.message})
  }
})

// Session status endpoint
app.get('/session-status', async (req, res) => {
  const session = await stripe.checkout.sessions.retrieve(req.query.session_id)
  res.json({
    status: session.status,
    customer_email: session.customer_details?.email,
  })
})

// Webhook handler
async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    // ParcelCraft automatically processes this webhook event
    // to generate shipping labels, so no manual API calls needed

    // Your order fulfillment logic
    await fulfillOrder(session)
  }

  res.json({received: true})
}

// Order fulfillment logic
async function fulfillOrder(session) {
  // Here you would update your internal systems,
  // database records, etc.
  console.log('Processing order for session:', session.id)

  // No need to call ParcelCraft directly as it processes
  // the webhooks automatically when properly configured
}

app.listen(4242, () => console.log('Server running on port 4242'))
```

### 3. Client-side Implementation for Embedded Checkout

```javascript
// checkout.js
document.addEventListener('DOMContentLoaded', function () {
  // Initialize Stripe
  const stripe = Stripe(
    'pk_test_51RCVrQP1CiCjkLwl3Gp44xGHCmXl2qwUYU6Cb0zZq2rz525hEX0ucDYvtRf19Ghkq9heFJgDVzhbxJdHnOs6ogYf00QrKH85Vi',
  )
  const checkoutContainer = document.getElementById('checkout-container')
  const errorMessage = document.getElementById('error-message')
  const loading = document.getElementById('loading')

  // Sample cart data
  const cartItems = [
    {
      name: 'Premium T-shirt',
      description: '100% cotton, premium quality',
      price: 24.99,
      quantity: 1,
      image: 'https://your-website.com/images/tshirt.jpg',
      weight: 0.3, // in pounds
    },
    {
      name: 'Hoodie',
      description: 'Warm and comfortable',
      price: 49.99,
      quantity: 1,
      image: 'https://your-website.com/images/hoodie.jpg',
      weight: 1.2, // in pounds
    },
  ]

  // Create and initialize checkout
  async function initialize() {
    try {
      loading.style.display = 'block'

      // Create checkout session
      const response = await fetch('/create-checkout-session', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({items: cartItems}),
      })

      if (!response.ok) {
        throw new Error('Network error. Please try again.')
      }

      const {clientSecret} = await response.json()

      // Initialize embedded checkout
      const checkout = await stripe.initEmbeddedCheckout({
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#5469d4',
          },
        },
      })

      // Mount checkout to DOM
      checkout.mount(checkoutContainer)
      loading.style.display = 'none'
    } catch (error) {
      console.error(error)
      errorMessage.textContent = error.message
      loading.style.display = 'none'
    }
  }

  initialize()
})
```

#### 4. Environment Configuration

```
# .env
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_PUBLISHABLE_KEY=<your-stripe-publishable-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
DOMAIN=<local-host> or your production domain [https://fasmotorsports.com]
```

##### Important Notes About ParcelCraft Integration

1. **No Direct API Calls Required**: Unlike traditional shipping APIs, ParcelCraft works directly with Stripe's webhook system. You simply provide the required metadata in your Checkout Sessions.

2. **Webhook Configuration**: Make sure you have configured webhooks in your Stripe Dashboard to send `checkout.session.completed` events to ParcelCraft.

3. **ParcelCraft Dashboard**: After installing ParcelCraft, you can configure default shipping settings, carrier preferences, and automation rules in the ParcelCraft dashboard within Stripe.

4. **Testing**: To test your implementation, create test checkouts and verify that shipping labels appear in the ParcelCraft section of your Stripe Dashboard after successful payments.

The key to successful ParcelCraft integration is including the proper metadata prefixed with `parcelcraft_` in your Checkout Sessions. The app will automatically process completed sessions and generate shipping labels based on your configuration.

---

# ANSWER FROM SANITY AGENT IN SANITY STUDIO

## Stripe Checkout Compatibility with Parcelcraft

Stripe's embedded checkout and hosted checkout are both compatible with Parcelcraft. Your checkout method doesn't affect Parcelcraft's functionality.

### How Parcelcraft Works

Parcelcraft is a Stripe Dashboard app that integrates with your Stripe account data, not your checkout implementation.

**Integration process:**

- **Accesses Stripe data** - Reads from Payments, Invoices, Customers, and Checkout Sessions after transactions complete
- **Operates in Dashboard** - Installed in your Stripe Dashboard to create shipping labels from payment and customer data
- **Works with completed transactions** - Processes data regardless of checkout method used

#### Checkout Methods

| Method                | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| **Embedded Checkout** | Payment form embedded directly on your website                     |
| **Hosted Checkout**   | Stripe-hosted payment page (customers redirect to Stripe's domain) |

Both methods create the same Stripe objects (PaymentIntents, Customers, Sessions) that Parcelcraft requires. The app doesn't care how payment was collected—only that it can access the resulting Stripe data.

###### Conclusion

Choose whichever checkout method best suits your website's UX. Parcelcraft works with either option.
