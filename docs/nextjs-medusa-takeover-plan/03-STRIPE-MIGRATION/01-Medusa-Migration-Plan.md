# FAS E-Commerce Migration Plan
## Medusa as Source of Truth + Stripe Elements + Unified Checkout

**Migration Goal**: Transform from Stripe-hosted checkout with fragmented shipping flow to Medusa-powered, single-page checkout with Stripe Elements and real-time Shippo rates.

---

## Executive Summary

### Current State Issues
1. **Split responsibility**: Products in both Sanity AND Medusa (sync hell)
2. **Hosted checkout**: User leaves your site, limited control
3. **Fragmented shipping**: Rate selection happens separately from payment
4. **Manual processes**: Heavy reliance on Netlify Functions for business logic

### Target State Benefits
1. **Single source of truth**: Medusa owns all product/cart/order data
2. **Embedded checkout**: Stripe Elements keeps user on your site
3. **Unified UX**: Shipping + payment on same form, real-time rate updates
4. **Native flows**: Medusa workflows handle fulfillment automatically

### Migration Complexity: **HIGH** ⚠️
- **Estimated timeline**: 6-8 weeks full-time
- **Risk level**: High (impacts revenue-critical checkout flow)
- **Recommended approach**: Phased rollout with feature flags

---

## Phase 0: Current State Analysis

### Current Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    ASTRO STOREFRONT                         │
│  Browse (Sanity) → Cart (local) → Stripe Checkout (hosted) │
└─────────────────────────────────────────────────────────────┘
                        │              │
                        ▼              ▼
            ┌───────────────┐  ┌─────────────┐
            │    SANITY     │  │   STRIPE    │
            │  - Products   │  │  - Checkout │
            │  - Orders     │  │  - Webhooks │
            └───────────────┘  └─────────────┘
                        │              │
                        ▼              ▼
            ┌───────────────┐  ┌─────────────┐
            │    MEDUSA     │  │   SHIPPO    │
            │  - Catalog    │  │  - Labels   │
            │  - Cart (?)   │  │  (manual)   │
            └───────────────┘  └─────────────┘
```

**Problems**:
- Product data duplicated (Sanity ↔ Medusa sync)
- Orders created in Sanity (via Netlify Function), not Medusa
- Shipping rate selection happens before or after checkout (not during)
- No single cart state—split between local storage and Medusa

### Current Checkout Flow
1. User adds to cart (local state)
2. User enters address
3. **Separate step**: Get shipping rates from Shippo (via Netlify Function)
4. User selects rate
5. **Redirect**: Stripe Checkout hosted page
6. User enters payment
7. **Webhook**: Create order in Sanity
8. **Manual**: Purchase label from Sanity Studio

**Pain Points**:
- 🔴 Checkout abandonment at redirect
- 🔴 Shipping rates not visible during payment
- 🔴 Can't update shipping if address changes during checkout
- 🔴 Complex webhook logic to reconstruct order

---

## Phase 1: Target Architecture

### Target State
```
┌───────────────────────────────────────────────────────────────────┐
│                    ASTRO STOREFRONT                               │
│  Browse → Add to Cart → UNIFIED CHECKOUT (same page)             │
│           [Address] [Shipping Options] [Payment]                  │
└───────────────────────────────────────────────────────────────────┘
                        │
                        ▼
            ┌─────────────────────────────┐
            │         MEDUSA 2.x          │
            │  - Products (source truth)  │
            │  - Cart Management          │
            │  - Order Creation           │
            │  - Fulfillment Workflows    │
            └─────────────────────────────┘
                │           │           │
                ▼           ▼           ▼
        ┌──────────┐  ┌──────────┐  ┌─────────┐
        │  STRIPE  │  │  SHIPPO  │  │ SANITY  │
        │ Elements │  │  Rates   │  │  CMS    │
        │ (embed)  │  │  Labels  │  │  Only   │
        └──────────┘  └──────────┘  └─────────┘
```

**Key Changes**:
1. **Medusa owns everything**: Products, carts, orders, fulfillment
2. **Stripe Elements**: Embedded payment form on your checkout page
3. **Real-time Shippo**: Rates update as user types address
4. **Sanity demoted**: Content-only (blog, pages, marketing)

### Target Checkout Flow
```typescript
// Single-page checkout with live updates
1. User enters shipping address
   ↓ (onChange debounced)
2. Fetch Shippo rates via Medusa API
   ↓ (display immediately)
3. User selects shipping option
   ↓ (cart updates with shipping line item)
4. Display total: Products + Shipping + Tax
   ↓
5. User enters payment (Stripe Elements)
   ↓ (client-side confirmation)
6. Medusa creates order (with payment intent)
   ↓ (webhook confirms)
7. Medusa triggers fulfillment workflow
   ↓ (auto-purchase Shippo label)
8. Order complete ✓
```

**Benefits**:
- ✅ No redirect—user stays on your site
- ✅ Live shipping rate updates
- ✅ Single source of truth (Medusa)
- ✅ Automatic fulfillment workflows
- ✅ Real-time inventory management

---

## Phase 2: Migration Strategy

### Phased Rollout (Recommended)

#### **Phase 2A: Foundation (Weeks 1-2)**
**Goal**: Medusa becomes product source of truth

**Tasks**:
1. Audit Medusa product catalog completeness
2. Migrate missing products from Sanity → Medusa
3. Update Astro storefront to fetch from Medusa API (not Sanity)
4. Add feature flag: `USE_MEDUSA_CATALOG=true`
5. Test product browsing end-to-end
6. **Rollback plan**: Flip feature flag to false

**Deliverables**:
- All products in Medusa with complete data
- Astro components reading from Medusa API
- No Sanity product dependencies

**Validation**:
- [ ] All product pages load correctly
- [ ] Product search works
- [ ] Filters and collections work
- [ ] Product images display
- [ ] Variants and options load

---

#### **Phase 2B: Cart Migration (Weeks 2-3)**
**Goal**: Replace local cart state with Medusa cart

**Current**: Cart is localStorage + session state
**Target**: Medusa cart API with server-side persistence

**Implementation**:
```typescript
// Old: localStorage cart
const cart = JSON.parse(localStorage.getItem('cart'))

// New: Medusa cart
const cart = await medusa.carts.retrieve(cartId)
await medusa.carts.lineItems.create(cartId, {
  variant_id: variantId,
  quantity: 1
})
```

**Tasks**:
1. Create Medusa cart on first product add
2. Store `cart_id` in cookie (not localStorage—needs server access)
3. Migrate all cart operations to Medusa API:
   - Add item
   - Update quantity
   - Remove item
   - Apply discount codes
4. Add feature flag: `USE_MEDUSA_CART=true`
5. **Rollback plan**: Revert to localStorage cart

**Edge Cases**:
- Session expiry (cart recovery)
- Guest vs. authenticated users
- Cart merging after login

---

#### **Phase 2C: Stripe Elements Integration (Weeks 3-4)**
**Goal**: Replace hosted checkout with embedded Stripe Elements

**Current**: Redirect to `checkout.stripe.com`
**Target**: Embedded payment form on `/checkout`

**Implementation**:
```typescript
// 1. Create Payment Intent server-side (Medusa)
const paymentIntent = await medusa.paymentCollections.create({
  cart_id: cartId,
  amount: cart.total
})

// 2. Client-side: Mount Stripe Elements
const stripe = await loadStripe(publishableKey)
const elements = stripe.elements({
  clientSecret: paymentIntent.client_secret
})

const paymentElement = elements.create('payment')
paymentElement.mount('#payment-element')

// 3. Confirm payment
const { error } = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: 'https://yoursite.com/order/confirmation'
  }
})
```

**Tasks**:
1. Install `@stripe/stripe-js` and `@stripe/react-stripe-js`
2. Create checkout page with payment form
3. Implement payment confirmation flow
4. Handle 3D Secure / SCA redirects
5. Add loading states and error handling
6. Feature flag: `USE_STRIPE_ELEMENTS=true` (side-by-side with old flow)

**Testing**:
- [ ] US cards (Visa, MC, Amex)
- [ ] International cards
- [ ] 3D Secure cards
- [ ] Declined cards
- [ ] Network errors

---

#### **Phase 2D: Unified Shippo Integration (Weeks 4-5)**
**Goal**: Real-time shipping rates on checkout form

**Critical Change**: Shippo integration moves FROM Netlify Functions TO Medusa fulfillment provider

**Medusa Shippo Setup**:
```typescript
// medusa-config.js
module.exports = {
  plugins: [
    {
      resolve: 'medusa-fulfillment-shippo',
      options: {
        api_key: process.env.SHIPPO_API_TOKEN,
        carrier_accounts: {
          ups: process.env.SHIPPO_UPS_ACCOUNT_ID
        },
        // Default warehouse address
        from_address: {
          name: 'FAS Warehouse',
          street1: '123 Race St',
          city: 'Phoenix',
          state: 'AZ',
          zip: '85001',
          country: 'US'
        }
      }
    }
  ]
}
```

**Checkout Page Flow**:
```typescript
// 1. User enters address (debounced onChange)
const handleAddressChange = debounce(async (address) => {
  // Update Medusa cart with shipping address
  await medusa.carts.update(cartId, {
    shipping_address: address
  })

  // Fetch shipping options (Medusa calls Shippo)
  const { shipping_options } = await medusa.shippingOptions.listCartOptions(cartId)

  // Display options:
  // - UPS Ground: $12.50 (5-7 days)
  // - UPS 3-Day Select: $25.00 (3 days)
  // - UPS 2nd Day Air: $35.00 (2 days)
  // - UPS Next Day Air: $65.00 (1 day)

  setShippingOptions(shipping_options)
}, 500)

// 2. User selects option
const handleShippingSelect = async (optionId) => {
  await medusa.carts.addShippingMethod(cartId, {
    option_id: optionId
  })

  // Cart total updates automatically
  const updatedCart = await medusa.carts.retrieve(cartId)
  setCart(updatedCart) // Now includes shipping cost
}
```

**UPS Service Level Mapping**:
```typescript
// In Shippo plugin config or custom logic
const UPS_SERVICE_CODES = {
  'ups_ground': 'UPS Ground',
  'ups_3_day_select': 'UPS 3-Day Select',
  'ups_2nd_day_air': 'UPS 2nd Day Air',
  'ups_next_day_air': 'UPS Next Day Air'
}

// Filter Shippo rates to show ONLY UPS
const upsRates = shippoRates.filter(rate =>
  rate.provider === 'UPS' &&
  Object.keys(UPS_SERVICE_CODES).includes(rate.servicelevel.token)
)
```

**Tasks**:
1. Install `medusa-fulfillment-shippo` plugin
2. Configure Shippo API key and UPS carrier account
3. Create API endpoint: `GET /store/shipping-options/:cart_id`
4. Add address autocomplete/validation on checkout form
5. Implement live rate updates (debounced)
6. Display shipping options with prices and delivery times
7. Handle "no rates available" edge case
8. Feature flag: `USE_LIVE_SHIPPING_RATES=true`

**Edge Cases**:
- Invalid address (no rates returned)
- Hawaii/Alaska (different rates)
- PO Boxes (UPS restrictions)
- Address autocomplete failures

---

#### **Phase 2E: Order Flow Migration (Weeks 5-6)**
**Goal**: Orders created in Medusa (not Sanity)

**Current**: Stripe webhook → Netlify Function → Sanity order
**Target**: Medusa creates order → Optionally sync to Sanity for visibility

**Implementation**:
```typescript
// Medusa side: Order completion
// This happens automatically when payment succeeds
medusa.orders.create({
  cart_id: cartId,
  // Order now has:
  // - All line items
  // - Shipping address
  // - Shipping method (with Shippo rate ID)
  // - Payment details
  // - Customer info
})

// Optional: Sync to Sanity for fulfillment team visibility
// (Medusa webhook → Netlify Function → Sanity)
export default async function medusaOrderCreated({ event, container }) {
  const order = event.data

  await sanityClient.create({
    _type: 'order',
    medusaOrderId: order.id,
    orderNumber: order.display_id,
    customerEmail: order.email,
    total: order.total,
    status: order.status,
    // ... sync relevant fields for fulfillment team
  })
}
```

**Tasks**:
1. Remove Stripe webhook order creation logic
2. Implement Medusa webhook subscriber (optional Sanity sync)
3. Update Sanity Studio to query Medusa API for orders (if needed)
4. Migrate existing orders? (decision: historical data vs. clean slate)
5. Feature flag: `USE_MEDUSA_ORDERS=true`

**Decision Point**: Do you still need Sanity for order management?

**Option A**: Medusa only
- ✅ Single source of truth
- ✅ Built-in Medusa Admin
- ❌ Team needs to learn new interface

**Option B**: Read-only Sanity sync
- ✅ Familiar interface for fulfillment team
- ✅ Custom dashboards in Sanity Studio
- ❌ Sync complexity
- ❌ Potential data drift

**Recommendation**: Try Medusa Admin first. If team pushes back, add read-only sync.

---

#### **Phase 2F: Fulfillment Automation (Weeks 6-7)**
**Goal**: Automatic label purchase (no manual Sanity button)

**Current**: Manual button click in Sanity Studio → Netlify Function → Shippo
**Target**: Medusa fulfillment workflow triggers automatically

**Medusa Fulfillment Flow**:
```typescript
// Subscriber: Auto-create fulfillment when order placed
export default async function autoCreateFulfillment({ event, container }) {
  const order = event.data

  // Create fulfillment (this purchases Shippo label automatically)
  await container.resolve('fulfillmentService').createFulfillment(
    order.id,
    order.items.map(item => ({
      item_id: item.id,
      quantity: item.quantity
    })),
    {
      // Medusa-Shippo plugin uses the shipping method's rate ID
      // to purchase the correct label
    }
  )
}

// Subscriber config
export const config = {
  event: 'order.placed',
  context: { subscriberId: 'auto-fulfillment' }
}
```

**Shippo Label Purchase**:
When `createFulfillment()` is called, the Shippo plugin:
1. Retrieves the Shippo rate ID from the shipping method
2. Creates a Shippo transaction (purchases label)
3. Returns tracking number and label URL
4. Updates fulfillment record in Medusa

**Tasks**:
1. Configure Medusa Shippo plugin for label purchase
2. Add subscriber for auto-fulfillment
3. Test label purchase end-to-end
4. Add Medusa Admin customization to view/print labels
5. Set up email notifications (order shipped with tracking)
6. Feature flag: `AUTO_PURCHASE_LABELS=true`

**Safety Net**: Add manual override in Medusa Admin for failed purchases

---

#### **Phase 2G: Testing & Rollout (Weeks 7-8)**
**Goal**: Validate end-to-end, gradual rollout

**Testing Checklist**:

**End-to-End Happy Path**:
- [ ] Browse products (from Medusa)
- [ ] Add to cart (Medusa cart API)
- [ ] Enter shipping address
- [ ] See live UPS shipping rates (4 options)
- [ ] Select shipping option
- [ ] Enter payment (Stripe Elements)
- [ ] Confirm order
- [ ] Receive confirmation email
- [ ] Order appears in Medusa Admin
- [ ] Shippo label purchased automatically
- [ ] Tracking number sent to customer

**Edge Cases**:
- [ ] Empty cart
- [ ] Invalid address (no shipping rates)
- [ ] Declined payment
- [ ] Network timeout during payment
- [ ] Duplicate order prevention
- [ ] Cart expiry / session recovery

**Load Testing**:
- [ ] 100 concurrent checkouts
- [ ] Shippo rate API response times
- [ ] Stripe payment confirmation latency

**Rollout Strategy**:
1. **Week 7**: Internal team testing (10% traffic)
2. **Week 8**: Beta customers (25% traffic)
3. **Week 9**: Gradual rollout (50% → 75% → 100%)
4. **Rollback trigger**: >5% error rate or checkout abandonment spike

---

## Phase 3: Data Migration

### Product Data Migration
**From**: Sanity product catalog
**To**: Medusa products/variants

**Script**:
```typescript
// scripts/migrate-products-to-medusa.ts
import { createClient } from '@sanity/client'
import Medusa from '@medusajs/medusa-js'

const sanity = createClient({ /* ... */ })
const medusa = new Medusa({ baseUrl: process.env.MEDUSA_URL })

async function migrateProducts() {
  // 1. Fetch all products from Sanity
  const products = await sanity.fetch(`
    *[_type == "product"] {
      _id,
      title,
      slug,
      description,
      price,
      variants,
      images,
      packageDimensions,
      weight,
      categories
    }
  `)

  // 2. For each product, create/update in Medusa
  for (const product of products) {
    const medusaProduct = await medusa.admin.products.create({
      title: product.title,
      handle: product.slug.current,
      description: product.description,
      // Map Sanity fields → Medusa fields
      metadata: {
        sanity_id: product._id, // Keep reference
        package_length: product.packageDimensions?.length,
        package_width: product.packageDimensions?.width,
        package_height: product.packageDimensions?.height
      },
      variants: product.variants.map(v => ({
        title: v.title,
        prices: [{ amount: v.price * 100, currency_code: 'usd' }],
        weight: product.weight,
        // Dimensions needed for Shippo
        length: product.packageDimensions?.length,
        width: product.packageDimensions?.width,
        height: product.packageDimensions?.height
      })),
      images: product.images.map(img => ({ url: img.asset.url }))
    })

    console.log(`✓ Migrated: ${product.title}`)
  }
}
```

**Validation**:
- [ ] Product count matches (Sanity vs. Medusa)
- [ ] All variants migrated
- [ ] Images display correctly
- [ ] Prices match
- [ ] Dimensions present (needed for Shippo)

---

### Order Data (Optional)
**Decision**: Do you need historical orders in Medusa?

**Option A**: Leave old orders in Sanity (read-only archive)
- ✅ No migration complexity
- ✅ No risk to historical data
- ❌ Split reporting (old vs. new)

**Option B**: Migrate recent orders (last 90 days)
- ✅ Unified analytics
- ❌ Complex migration
- ❌ Risk of data corruption

**Recommendation**: Option A. Start fresh with Medusa orders.

---

## Phase 4: UPS Shipping Configuration

### Shippo Setup
1. **Connect UPS carrier account** in Shippo dashboard
2. **Configure service levels**:
   ```json
   {
     "ups_ground": { "name": "UPS Ground", "delivery_days": "5-7" },
     "ups_3_day_select": { "name": "UPS 3-Day Select", "delivery_days": "3" },
     "ups_2nd_day_air": { "name": "UPS 2nd Day Air", "delivery_days": "2" },
     "ups_next_day_air": { "name": "UPS Next Day Air", "delivery_days": "1" }
   }
   ```
3. **Set default warehouse address** (ship-from location)
4. **Enable label auto-purchase** (via Medusa plugin)

### Medusa Shippo Plugin Config
```typescript
// medusa-config.js
{
  resolve: 'medusa-fulfillment-shippo',
  options: {
    api_key: process.env.SHIPPO_API_TOKEN,
    carrier_accounts: {
      ups: process.env.SHIPPO_UPS_ACCOUNT_ID
    },
    // Filter to UPS only
    account_object_ids: [process.env.SHIPPO_UPS_ACCOUNT_ID],
    // Warehouse address
    from_address: {
      name: 'FAS Motorsports',
      company: 'FAS',
      street1: process.env.WAREHOUSE_ADDRESS_LINE1,
      city: process.env.WAREHOUSE_CITY,
      state: process.env.WAREHOUSE_STATE,
      zip: process.env.WAREHOUSE_ZIP,
      country: 'US',
      phone: process.env.WAREHOUSE_PHONE
    },
    // Weight unit (lbs for UPS)
    weight_unit: 'lb',
    distance_unit: 'in'
  }
}
```

### Rate Calculation Logic
```typescript
// Custom middleware: Filter UPS rates only
medusa.use((req, res, next) => {
  if (req.path.includes('/shipping-options')) {
    // Intercept response, filter to UPS only
    const originalJson = res.json.bind(res)
    res.json = (data) => {
      if (data.shipping_options) {
        data.shipping_options = data.shipping_options.filter(opt =>
          opt.provider_id === 'shippo' &&
          opt.data?.carrier === 'UPS' &&
          ['ups_ground', 'ups_3_day_select', 'ups_2nd_day_air', 'ups_next_day_air']
            .includes(opt.data?.service_code)
        )
      }
      return originalJson(data)
    }
  }
  next()
})
```

---

## Phase 5: Risk Mitigation

### Feature Flags
All major changes behind flags:
```typescript
// .env
USE_MEDUSA_CATALOG=true
USE_MEDUSA_CART=true
USE_STRIPE_ELEMENTS=true
USE_LIVE_SHIPPING_RATES=true
USE_MEDUSA_ORDERS=true
AUTO_PURCHASE_LABELS=false  // Manual until fully tested
```

### Rollback Strategy
**For each phase**:
1. Feature flag OFF → instant rollback
2. Keep old code path active until 100% traffic migrated
3. Monitor error rates and checkout conversion

**Red Flags** (immediate rollback):
- Checkout error rate >2%
- Payment failure rate >1%
- Shipping rate fetch timeout >5s
- Conversion drop >10%

### Monitoring
**Metrics to track**:
- Checkout start → complete conversion rate
- Average time on checkout page
- Shipping rate API response time
- Payment confirmation latency
- Order creation success rate
- Label purchase success rate

**Alerts**:
- Shippo API downtime
- Stripe payment failures spike
- Medusa cart API errors
- Checkout abandonment spike

### Testing Environments
1. **Local dev**: Feature flags ON, test data
2. **Staging**: Mirror production, synthetic orders
3. **Production beta**: 10% traffic, real orders
4. **Production full**: 100% traffic after validation

---

## Phase 6: Deployment Checklist

### Pre-Launch
- [ ] All feature flags tested independently
- [ ] End-to-end checkout test passed
- [ ] UPS shipping rates showing correctly (4 options)
- [ ] Stripe Elements working in all browsers
- [ ] Payment confirmation emails sending
- [ ] Order creation in Medusa verified
- [ ] Label auto-purchase working
- [ ] Tracking emails sending
- [ ] Rollback plan documented
- [ ] Team trained on Medusa Admin

### Launch Day
- [ ] Deploy to production (all flags OFF)
- [ ] Enable `USE_MEDUSA_CATALOG` → validate browsing
- [ ] Enable `USE_MEDUSA_CART` → validate cart operations
- [ ] Enable `USE_STRIPE_ELEMENTS` (10% traffic) → monitor conversions
- [ ] Enable `USE_LIVE_SHIPPING_RATES` (10% traffic) → monitor rate fetches
- [ ] Enable `USE_MEDUSA_ORDERS` (10% traffic) → monitor order creation
- [ ] Gradually increase traffic: 25% → 50% → 75% → 100%
- [ ] Enable `AUTO_PURCHASE_LABELS` after 100% stable

### Post-Launch
- [ ] Monitor for 48 hours
- [ ] Review analytics (conversion rates)
- [ ] Gather customer feedback
- [ ] Fix any issues
- [ ] Remove old code paths (cleanup)
- [ ] Document new architecture

---

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| 2A: Medusa Catalog | 2 weeks | Foundation |
| 2B: Medusa Cart | 1 week | Critical |
| 2C: Stripe Elements | 1 week | Critical |
| 2D: Shippo Integration | 1 week | Critical |
| 2E: Order Migration | 1 week | Major |
| 2F: Auto-Fulfillment | 1 week | Major |
| 2G: Testing & Rollout | 2 weeks | Validation |
| **Total** | **8-10 weeks** | **High complexity** |

---

## Next Steps

1. **Approve this plan** (or request changes)
2. **Set up Medusa instance** (if not already running)
3. **Install Shippo plugin**: `npm install medusa-fulfillment-shippo`
4. **Start Phase 2A**: Migrate products to Medusa
5. **Weekly check-ins**: Review progress, adjust timeline

---

## Questions to Answer Before Starting

1. **Medusa instance**: Do you have Medusa 2.x running? (You mentioned v2.12.6)
2. **Shippo setup**: Is UPS carrier account already connected in Shippo?
3. **Historical orders**: Keep in Sanity only, or migrate to Medusa?
4. **Sanity role**: Content-only, or keep read-only order visibility?
5. **Team bandwidth**: Full-time or part-time on this migration?
6. **Revenue risk tolerance**: Can you afford 10-20% conversion dip during testing?

Let me know your answers and I'll refine the plan!
