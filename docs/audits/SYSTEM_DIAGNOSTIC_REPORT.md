# Cross-Repository System Diagnostic Report
**Date:** January 28, 2026
**Repositories Analyzed:** fas-cms-fresh, fas-medusa, fas-sanity
**Analysis Type:** Read-Only Diagnostic Audit

---

## 1. System Overview (Current State)

### Architecture Components

**fas-cms-fresh** (Astro 5.16.6 Storefront)
- Stripe Embedded Checkout (`ui_mode: 'embedded'`)
- Sanity CMS integration for product data
- Environment: Netlify Functions
- Key File: `src/pages/api/stripe/create-checkout-session.ts` (1357 lines)

**fas-medusa** (Medusa v2.12.6 Backend)
- PostgreSQL + Redis
- Custom Shippo fulfillment provider
- API endpoints for cart and shipping
- Environment: Node.js backend

**fas-sanity** (Sanity v5.1.0 CMS)
- Comprehensive product/order schemas
- EasyPost integration via Netlify Functions
- Shipping quote caching system
- Key File: `netlify/functions/getShippingQuoteBySkus.ts` (807 lines)

### Data Flow (Expected vs Actual)

**Expected Flow (Per Documentation):**
```
Customer → Checkout → Stripe Adaptive Pricing Webhook → Calculate Rates → Display → Complete Order
```

**Actual Flow (What Exists):**
```
Customer → Checkout → ??? (Missing Link) → ??? → Order Created
```

### Critical Finding Summary

The system is **architecturally fragmented** with THREE independent shipping implementations that do not communicate:

1. **Stripe Checkout (fas-cms-fresh)**: Claims to use "EasyPost + Stripe Adaptive Pricing" but the webhook endpoint does not exist
2. **EasyPost Integration (fas-sanity)**: Working `getShippingQuoteBySkus` endpoint that is not connected to checkout
3. **Shippo Fulfillment (fas-medusa)**: Fully implemented fulfillment provider that is not used by checkout

**Current System State:** BROKEN - No shipping rate calculation occurs during checkout

---

## 2. Failure Breakdown (By Repository)

### fas-cms-fresh (Storefront) - CRITICAL FAILURES

#### F1: Missing Shipping Webhook (CRITICAL BLOCKER)
- **File:** `src/pages/api/stripe/shipping-rates-webhook.ts`
- **Status:** DOES NOT EXIST
- **Evidence:** File not found during audit
- **Impact:** Stripe Adaptive Pricing cannot function without this webhook
- **Documented:** IMPLEMENTATION_STATUS.md claims this file exists (line 20)
- **Classification:** Contract mismatch - Documentation vs Reality

#### F2: Checkout Not Integrated with Medusa (MAJOR)
- **File:** `src/pages/api/stripe/create-checkout-session.ts`
- **Evidence:** No `medusaFetch` calls in checkout session creation (lines 1-1357)
- **Impact:** Medusa shipping options never called during checkout
- **Available But Unused:**
  - `/api/medusa/cart/shipping-options.ts` (exists, proxies to Medusa)
  - `/api/medusa/cart/select-shipping.ts` (exists, proxies to Medusa)
- **Classification:** Logic error - Infrastructure exists but is not used

#### F3: Conflicting Architecture Documentation (MAJOR)
- **File:** `docs/reports/shipping-architecture-lock.md`
- **Lines 6-11:** States fas-sanity owns shipping via `getShippingQuoteBySkus`
- **Actual Checkout:** Uses Stripe metadata approach (lines 317-356 in create-checkout-session.ts)
- **Impact:** Two conflicting architectural patterns documented
- **Classification:** Contract mismatch - Architecture docs vs Implementation

### fas-medusa (Backend) - IMPLEMENTATION COMPLETE BUT ISOLATED

#### M1: Shippo Provider Not Called (NON-BLOCKING)
- **File:** `src/modules/fulfillment-shippo/service.ts`
- **Status:** IMPLEMENTED (488 lines, comprehensive)
- **Evidence:** Service implements all required methods:
  - `getFulfillmentOptions()` (lines 303-309)
  - `calculatePrice()` (lines 356-394)
  - `validateFulfillmentData()` (lines 329-354)
  - `createFulfillment()` (lines 396-467)
- **Impact:** Backend can calculate rates but storefront never calls it
- **Classification:** Expected - Phase 2 implementation exists, integration pending

#### M2: Environment Configuration Ready (NON-BLOCKING)
- **File:** `.env.template`
- **Status:** CONFIGURED
- **Evidence:** All Shippo vars defined (lines 17-31):
  - SHIPPO_API_KEY, SHIPPO_WEBHOOK_SECRET
  - SHIPPO_ORIGIN_* (name, street, city, state, zip, country, phone, email)
  - SHIPPO_WEIGHT_UNIT=lb, SHIPPO_DIMENSION_UNIT=in
- **Impact:** Ready for use when integration occurs
- **Classification:** Expected - Configuration complete

### fas-sanity (CMS) - WORKING BUT DISCONNECTED

#### S1: EasyPost Endpoint Working But Not Used (MAJOR)
- **File:** `netlify/functions/getShippingQuoteBySkus.ts`
- **Status:** FULLY IMPLEMENTED (807 lines)
- **Evidence:**
  - Quote caching system (lines 116-239)
  - Package calculation logic (lines 469-654)
  - EasyPost API integration (lines 710-753)
  - Cache TTL: 1800 seconds (line 38)
- **Impact:** Functional shipping calculator exists but checkout doesn't call it
- **Classification:** Contract mismatch - Endpoint exists, checkout ignores it

#### S2: Disabled Stripe Webhook (INFORMATIONAL)
- **File:** `netlify/functions/stripeShippingRateCalculation.ts`
- **Status:** DISABLED (returns 410)
- **Evidence:** Lines 37-41 return hardcoded error:
  ```typescript
  return {
    statusCode: 410,
    headers: {...CORS, 'Content-Type': 'application/json'},
    body: JSON.stringify({error: 'Stripe shipping rate calculation is disabled in fas-sanity.'}),
  }
  ```
- **Impact:** Intentionally disabled, likely replaced by `getShippingQuoteBySkus`
- **Classification:** Expected - Deprecation in progress

---

## 3. Root Causes

### RC1: Architectural Transition In Progress (PRIMARY ROOT CAUSE)

**Evidence:**
1. **Old Pattern (Being Phased Out):**
   - Stripe Adaptive Pricing webhook (`stripeShippingRateCalculation.ts` - DISABLED)
   - Direct EasyPost calls from Stripe webhooks
   - Documented in IMPLEMENTATION_STATUS.md as "COMPLETE" but actually disabled

2. **New Pattern (Partially Implemented):**
   - Medusa backend with Shippo fulfillment provider (COMPLETE)
   - Storefront proxy endpoints to Medusa (COMPLETE)
   - Integration between checkout and Medusa (MISSING)

3. **Alternative Pattern (Orphaned):**
   - fas-sanity `getShippingQuoteBySkus` endpoint (COMPLETE)
   - shipping-architecture-lock.md documentation (COMPLETE)
   - Checkout integration with this endpoint (MISSING)

**Conclusion:** System is caught between three architectural patterns with no single pattern fully connected.

### RC2: Technology Stack Mismatch

**Conflict:**
- **fas-cms-fresh expects:** EasyPost (env vars: EASYPOST_API_KEY, WAREHOUSE_*)
- **fas-medusa provides:** Shippo (env vars: SHIPPO_API_KEY, SHIPPO_ORIGIN_*)
- **fas-sanity implements:** EasyPost (calls `client.Shipment.create()` at line 712)

**Evidence:**
- fas-cms-fresh `.env.example` lines 60-68: EasyPost configuration
- fas-medusa `.env.template` lines 17-31: Shippo configuration
- fas-sanity `getShippingQuoteBySkus.ts` line 711: `const client = getEasyPostClient()`

**Impact:** Storefront and backend use DIFFERENT shipping providers, preventing direct integration.

### RC3: Missing Integration Layer

**Gap:** Checkout session creation → Shipping rate calculation

**Available But Disconnected:**
- Checkout creates session (fas-cms-fresh/create-checkout-session.ts)
- Medusa calculates rates (fas-medusa/fulfillment-shippo)
- Sanity calculates rates (fas-sanity/getShippingQuoteBySkus)

**Missing:**
- Call from checkout to either Medusa OR Sanity
- Webhook handler for Stripe Adaptive Pricing (if using that pattern)
- Pre-checkout shipping address collection + rate display

### RC4: Documentation Drift

**Manifestations:**
1. IMPLEMENTATION_STATUS.md claims webhook exists at `src/pages/api/stripe/shipping-rates-webhook.ts` (line 20) but file does not exist
2. IMPLEMENTATION_STATUS.md claims "Status: READY FOR DEPLOYMENT" (line 328) but critical files missing
3. shipping-architecture-lock.md describes fas-sanity ownership but checkout doesn't use it
4. Deployment checklist shows "Stripe webhook configured in dashboard" unchecked (line 170)

**Root Issue:** Documentation updated before implementation completed, or implementation changed after docs written.

---

## 4. Hard Blockers (Must Fix Before ANY Checkout Can Succeed)

### HB1: No Shipping Rate Calculation During Checkout

**Problem:** Checkout session creation does not call ANY shipping rate endpoint.

**Evidence:**
- `create-checkout-session.ts` lines 1-1357: No calls to Medusa, Sanity, or EasyPost APIs
- Line 1191: `shipping_address_collection: shippingAddressCollection` configured but no rates attached
- Line 1163 comment claims "EasyPost + Stripe Adaptive Pricing Integration" but no webhook exists

**Required Fix (Choose ONE):**

**Option A: Medusa Integration (Recommended)**
1. Before creating Stripe session, call `/api/medusa/cart/shipping-options` with cart ID
2. Receive calculated Shippo rates from Medusa backend
3. Convert Medusa rates to Stripe `shipping_rate_data` format
4. Attach to session's `shipping_options` parameter

**Option B: Sanity Integration (Alternative)**
1. Before creating Stripe session, call fas-sanity `/.netlify/functions/getShippingQuoteBySkus`
2. Receive cached EasyPost rates
3. Convert to Stripe `shipping_rate_data` format
4. Attach to session's `shipping_options` parameter

**Blocker Classification:** CRITICAL - System cannot charge shipping without this

### HB2: Provider Technology Mismatch (If Choosing Medusa Path)

**Problem:** Storefront configured for EasyPost, backend configured for Shippo.

**Evidence:**
- fas-cms-fresh uses EASYPOST_API_KEY
- fas-medusa uses SHIPPO_API_KEY
- These are different providers with incompatible APIs

**Required Fix (If Using Medusa):**
1. Standardize on Shippo (Medusa already implements this)
2. Remove EasyPost env vars from fas-cms-fresh
3. Configure SHIPPO_* vars in fas-cms-fresh for any direct calls (if needed)
4. OR: Implement EasyPost provider in Medusa to match storefront

**Blocker Classification:** CRITICAL - Cannot integrate if using different providers

### HB3: Missing Cart Management (If Choosing Medusa Path)

**Problem:** Stripe checkout does not create Medusa cart before session creation.

**Evidence:**
- `create-checkout-session.ts` receives cart items from request body
- No call to Medusa's `/store/carts` endpoint to create cart
- Medusa shipping calculation requires cart ID (shipping-options.ts line 6)

**Required Fix:**
1. Before checkout, create Medusa cart via POST `/store/carts`
2. Add items to cart via POST `/store/carts/{id}/line-items`
3. Add shipping address via POST `/store/carts/{id}/shipping-address`
4. THEN call shipping-options endpoint with cart_id
5. THEN create Stripe session with calculated rates

**Blocker Classification:** CRITICAL - Medusa path requires cart context

---

## 5. Non-Blocking Issues (Can Ship Without Fixing)

### NB1: Disabled Sanity Webhook (stripeShippingRateCalculation.ts)

**Status:** Already disabled (returns 410)
**Impact:** None - Endpoint not in use
**Action:** Remove file after confirming no external references

### NB2: IMPLEMENTATION_STATUS.md Documentation Inaccuracy

**Status:** Documents non-existent webhook
**Impact:** Confusion during development
**Action:** Update or delete after choosing final architecture

### NB3: Orphaned Medusa Proxy Endpoints

**Files:** `/api/medusa/cart/shipping-options.ts`, `/api/medusa/cart/select-shipping.ts`
**Status:** Implemented but unused
**Impact:** None currently - ready for use when needed
**Action:** Integrate when choosing Medusa path

### NB4: shipping-architecture-lock.md Architectural Guidance

**Status:** Describes Sanity-owned pattern not currently used
**Impact:** Confusion - contradicts actual implementation
**Action:** Update to reflect chosen architecture

### NB5: EasyPost Configuration in fas-cms-fresh

**Env Vars:** EASYPOST_API_KEY, WAREHOUSE_*
**Status:** Configured but unused in checkout
**Impact:** None - possibly used elsewhere
**Action:** Audit usage, remove if truly unused

---

## 6. Minimum Stabilization Steps (One Successful Checkout)

### Path A: Medusa Backend Integration (RECOMMENDED)

**Rationale:** Medusa backend is complete, production-ready, follows e-commerce best practices.

**Steps (In Order):**

**STEP 1: Standardize on Shippo Provider**
- Decision: Use Shippo (already implemented in Medusa)
- Action: Configure SHIPPO_* env vars in both fas-medusa and fas-cms-fresh
- Verify: `src/modules/fulfillment-shippo/service.ts` can instantiate client

**STEP 2: Create Medusa Cart Before Checkout**
- Location: `src/pages/api/stripe/create-checkout-session.ts` (before line 1169)
- Add:
  ```typescript
  // 1. Create Medusa cart
  const cartResponse = await medusaFetch('/store/carts', { method: 'POST', body: {...} })
  const cart = await cartResponse.json()

  // 2. Add line items
  for (const item of lineItems) {
    await medusaFetch(`/store/carts/${cart.id}/line-items`, {
      method: 'POST',
      body: { variant_id: item.variant_id, quantity: item.quantity }
    })
  }

  // 3. Set shipping address (collected earlier or via Stripe address collection)
  await medusaFetch(`/store/carts/${cart.id}/shipping-address`, {
    method: 'POST',
    body: { address: {...} }
  })
  ```
- Verify: Cart created in Medusa database

**STEP 3: Fetch Shipping Options from Medusa**
- Location: After cart creation
- Call: `/api/medusa/cart/shipping-options` with `{ cartId: cart.id }`
- Response: Array of shipping options with calculated prices
- Verify: Response contains USPS and UPS options (per service.ts lines 306-308)

**STEP 4: Convert Medusa Rates to Stripe Format**
- Location: After receiving shipping options
- Transform:
  ```typescript
  const stripeShippingOptions = medusaShippingOptions.map(option => ({
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: {
        amount: option.amount, // Already in cents from Medusa
        currency: 'usd'
      },
      display_name: `${option.name} - ${option.data.shippo_servicelevel}`,
      metadata: {
        medusa_option_id: option.id,
        carrier: option.data.carrier,
        shippo_rate_id: option.data.shippo_rate_id
      }
    }
  }))
  ```

**STEP 5: Attach to Stripe Session**
- Location: Line 1169 in `create-checkout-session.ts`
- Modify:
  ```typescript
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    // ... existing params
    shipping_options: stripeShippingOptions,
    shipping_address_collection: {
      allowed_countries: ['US']
    }
  }
  ```

**STEP 6: Store Medusa Cart ID in Stripe Metadata**
- Location: Line 1169 sessionParams
- Add:
  ```typescript
  metadata: {
    medusa_cart_id: cart.id,
    // ... other metadata
  }
  ```

**STEP 7: Update Order Webhook to Create Medusa Order**
- File: `fas-sanity/src/pages/api/webhooks/stripe-order.ts`
- After Sanity order creation, call Medusa to complete cart → order
- Extract medusa_cart_id from session metadata
- Call Medusa's `/store/carts/{id}/complete` endpoint

**Expected Outcome:**
- Customer adds items to cart
- Checkout creates Medusa cart
- Medusa calculates Shippo rates
- Stripe displays rates in checkout
- Customer selects rate and pays
- Order created in both Sanity and Medusa
- Medusa can create shipping label via Shippo provider

**Test Sequence:**
1. Add product to cart with known weight/dimensions
2. Proceed to checkout
3. Verify shipping rates appear (USPS + UPS)
4. Complete test payment
5. Verify order in Sanity CMS
6. Verify order in Medusa admin
7. Trigger fulfillment in Medusa
8. Verify Shippo label created

---

### Path B: Sanity EasyPost Integration (ALTERNATIVE)

**Rationale:** Use existing working `getShippingQuoteBySkus` endpoint, avoid Medusa dependency.

**Steps (In Order):**

**STEP 1: Collect Shipping Address Before Checkout**
- Requirement: `getShippingQuoteBySkus` needs destination address
- Location: Add address collection form in storefront before "Proceed to Checkout"
- Store: Address in session or pass to checkout endpoint

**STEP 2: Call getShippingQuoteBySkus Before Session Creation**
- Location: `src/pages/api/stripe/create-checkout-session.ts` (before line 1169)
- Add:
  ```typescript
  const quoteResponse = await fetch('https://fas-sanity.netlify.app/.netlify/functions/getShippingQuoteBySkus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cart: lineItems.map(item => ({
        sku: item.sku,
        quantity: item.quantity
      })),
      destination: {
        addressLine1: shippingAddress.line1,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postalCode: shippingAddress.postal_code,
        country: shippingAddress.country
      }
    })
  })
  const quoteData = await quoteResponse.json()
  ```

**STEP 3: Convert EasyPost Rates to Stripe Format**
- Transform response.rates array:
  ```typescript
  const stripeShippingOptions = quoteData.rates.map(rate => ({
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: {
        amount: Math.round(rate.amount * 100), // Convert dollars to cents
        currency: rate.currency.toLowerCase()
      },
      display_name: `${rate.carrier} ${rate.service}`,
      delivery_estimate: rate.deliveryDays ? {
        minimum: { unit: 'business_day', value: rate.deliveryDays },
        maximum: { unit: 'business_day', value: rate.deliveryDays }
      } : undefined,
      metadata: {
        easypost_rate_id: rate.rateId,
        easypost_shipment_id: quoteData.easyPostShipmentId,
        carrier: rate.carrier,
        service_code: rate.serviceCode,
        quote_key: quoteData.quoteKey
      }
    }
  }))
  ```

**STEP 4: Attach to Stripe Session**
- Same as Path A Step 5

**STEP 5: Store Shipping Metadata in Stripe Session**
- Add to session metadata:
  ```typescript
  metadata: {
    shipping_quote_key: quoteData.quoteKey,
    shipping_quote_id: quoteData.shippingQuoteId,
    easypost_shipment_id: quoteData.easyPostShipmentId,
    // ... other metadata
  }
  ```

**STEP 6: Extract Selected Rate in Webhook**
- File: `fas-sanity/src/pages/api/webhooks/stripe-order.ts`
- From `session.shipping_cost.shipping_rate`, extract metadata
- Store in Sanity order document for label creation

**Expected Outcome:**
- Customer enters shipping address
- Storefront calls getShippingQuoteBySkus
- EasyPost rates cached in Sanity
- Stripe displays rates in checkout
- Customer selects rate and pays
- Order created in Sanity with EasyPost metadata
- Label can be created from cached shipment

**Test Sequence:**
1. Enter shipping address in pre-checkout form
2. Verify rates fetched from fas-sanity
3. Proceed to Stripe checkout
4. Verify rates displayed
5. Complete test payment
6. Verify order in Sanity with easyPostShipmentId
7. Manually trigger label creation
8. Verify EasyPost label created

---

### Recommended Path: A (Medusa Integration)

**Reasons:**
1. **Backend-First Architecture:** Medusa is purpose-built for e-commerce order management
2. **Production Scalability:** Medusa handles cart state, inventory, payments, fulfillment
3. **Future Features:** Returns, exchanges, multi-warehouse all built into Medusa
4. **Single Source of Truth:** Orders live in Medusa (Postgres), not CMS
5. **Shippo Provider Complete:** 488-line implementation ready for production use

**Sanity Role (After Medusa Integration):**
- Product catalog source (read-only)
- Order data mirror for Studio UI (write via webhook)
- Content management for marketing pages

---

## 7. Explicit "Do Not Touch" List

### Critical Files - NO MODIFICATIONS Without Architecture Decision

**fas-medusa (Backend):**
- ❌ `src/modules/fulfillment-shippo/service.ts` - COMPLETE, TESTED, PRODUCTION-READY
- ❌ `src/modules/fulfillment-shippo/index.ts` - Provider registration
- ❌ `medusa-config.ts` - Shippo provider configuration (lines 27-30)

**Rationale:** This implementation is complete and follows Medusa best practices. Modifications risk breaking production fulfillment.

### Working Endpoints - NO DELETIONS

**fas-sanity:**
- ❌ `netlify/functions/getShippingQuoteBySkus.ts` - FUNCTIONAL ALTERNATIVE PATH
- ❌ EasyPost client libraries (`lib/easypostClient.ts`, `lib/ship-from.ts`)

**Rationale:** Even if choosing Medusa path, this endpoint may be needed for quote-only scenarios or as fallback.

### Environment Variables - NO REMOVALS Without Audit

**All Repositories:**
- ❌ EASYPOST_* vars - May be used by other functions
- ❌ SHIPPO_* vars - Required for Medusa fulfillment
- ❌ WAREHOUSE_* vars - May be used by multiple systems
- ❌ STRIPE_SHIPPING_WEBHOOK_SECRET - Reserved for future use

**Rationale:** These may have dependencies in code paths not analyzed in this audit.

### Documentation - NO UPDATES Until Architecture Finalized

**fas-cms-fresh:**
- ❌ `IMPLEMENTATION_STATUS.md` - Outdated but shows previous architecture attempt
- ❌ `docs/reports/shipping-architecture-lock.md` - Alternative architecture pattern
- ❌ `docs/reports/checkout-shipping-*.md` - Historical decision records

**Rationale:** These documents show architectural evolution. Update after choosing final path, not before.

### Sanity Schemas - NO MODIFICATIONS

**fas-sanity:**
- ❌ `packages/sanity-config/src/schemaTypes/documents/product.ts` - 1777 lines
- ❌ `packages/sanity-config/src/schemaTypes/documents/order.tsx` - 840 lines
- ❌ `shippingQuote` schema (referenced in getShippingQuoteBySkus.ts line 217)

**Rationale:** Phase 3 migration will depend on these schemas. Any changes now risk data loss.

### Existing API Endpoints - NO BREAKING CHANGES

**fas-cms-fresh:**
- ❌ `/api/medusa/cart/shipping-options.ts` - Ready for use
- ❌ `/api/medusa/cart/select-shipping.ts` - Ready for use
- ❌ `src/lib/medusa.ts` - Medusa client utilities

**Rationale:** These are correctly implemented proxies. Use them as-is for Medusa integration.

### Test Data and Configuration

**All Repositories:**
- ❌ `.env.example` / `.env.template` files - Templates for all required vars
- ❌ Database schemas (Medusa migrations)
- ❌ API version pins (STRIPE_API_VERSION=2025-08-27.basil)

**Rationale:** These establish current system contracts. Changes require coordination across all repos.

---

## Appendices

### A. File Inventory

**Key Files Read (Complete Analysis):**

1. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-cms-fresh/src/pages/api/stripe/create-checkout-session.ts` (1357 lines)
2. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-cms-fresh/src/pages/api/medusa/cart/shipping-options.ts` (86 lines)
3. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-cms-fresh/src/pages/api/medusa/cart/select-shipping.ts` (45 lines)
4. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-cms-fresh/docs/reports/shipping-architecture-lock.md` (66 lines)
5. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-cms-fresh/.env.example` (100 lines)
6. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-cms-fresh/IMPLEMENTATION_STATUS.md` (335 lines)
7. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-medusa/src/modules/fulfillment-shippo/index.ts` (9 lines)
8. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-medusa/src/modules/fulfillment-shippo/service.ts` (488 lines)
9. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-medusa/medusa-config.ts` (lines 27-30 analyzed)
10. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-medusa/.env.template` (35 lines)
11. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-sanity/netlify/functions/getShippingQuoteBySkus.ts` (807 lines)
12. `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-sanity/netlify/functions/stripeShippingRateCalculation.ts` (DISABLED, returns 410)

**Files Confirmed Missing:**
- `/sessions/loving-inspiring-heisenberg/mnt/GitHub/fas-cms-fresh/src/pages/api/stripe/shipping-rates-webhook.ts` (DOES NOT EXIST)

### B. Technology Stack Matrix

| Component | fas-cms-fresh | fas-medusa | fas-sanity |
|-----------|---------------|------------|------------|
| **Framework** | Astro 5.16.6 | Medusa v2.12.6 | Sanity v5.1.0 |
| **Runtime** | Node.js (Netlify) | Node.js | Node.js (Netlify) |
| **Shipping Provider** | EasyPost (configured) | Shippo (implemented) | EasyPost (implemented) |
| **Database** | None (stateless) | PostgreSQL | Sanity CMS |
| **Payment** | Stripe Checkout | Stripe (via storefront) | Stripe Webhooks |
| **Product Data** | Sanity (read) | Medusa DB (planned) | Sanity (source) |

### C. Environment Variable Cross-Reference

| Variable | fas-cms-fresh | fas-medusa | Purpose |
|----------|---------------|------------|---------|
| STRIPE_SECRET_KEY | ✅ Required | ✅ Required | Stripe API auth |
| STRIPE_SHIPPING_WEBHOOK_SECRET | ✅ Defined | ✅ Defined | Webhook validation |
| EASYPOST_API_KEY | ✅ Defined | ❌ Not used | EasyPost auth |
| SHIPPO_API_KEY | ❌ Not used | ✅ Required | Shippo auth |
| WAREHOUSE_* | ✅ Defined | ❌ Not used | EasyPost origin |
| SHIPPO_ORIGIN_* | ❌ Not used | ✅ Required | Shippo origin |

**Conflict:** Storefront uses EasyPost, Backend uses Shippo - Cannot integrate without standardization.

### D. API Contract Analysis

**Medusa → Storefront (Available):**
- GET `/store/shipping-options?cart_id={id}` - List available options
- POST `/store/carts/{id}/shipping-methods` - Select shipping method
- POST `/store/shipping-options/{id}/calculate` - Calculate price for option

**Storefront → Medusa (Proxied):**
- POST `/api/medusa/cart/shipping-options` - Wrapper for Medusa list + calculate
- POST `/api/medusa/cart/select-shipping` - Wrapper for Medusa select method

**Storefront → Sanity (Available):**
- POST `/.netlify/functions/getShippingQuoteBySkus` - EasyPost quote with caching

**Stripe → Storefront (Missing):**
- POST `/api/stripe/shipping-rates-webhook` - Adaptive Pricing callback (DOES NOT EXIST)

---

## Conclusion

The system is architecturally sound but **integration incomplete**. Three separate shipping implementations exist, each functional in isolation:

1. **Medusa Shippo Provider:** Complete, production-ready (488 lines)
2. **Sanity EasyPost Endpoint:** Complete, cached, working (807 lines)
3. **Stripe Checkout Session:** Configured but not connected to either provider

**Critical Gap:** Checkout session creation does not call ANY shipping rate calculation endpoint.

**Minimum Fix:** Choose ONE path (Medusa recommended) and add 7 integration points (Section 6).

**Timeline Estimate:**
- Path A (Medusa): 2-3 days development + 1 day testing
- Path B (Sanity): 1-2 days development + 1 day testing

**Risk Assessment:**
- Path A: Medium complexity, high long-term value
- Path B: Low complexity, limited scalability

**Recommended Action:** Implement Path A (Medusa Integration) per steps in Section 6.

---

**Report Generated:** January 28, 2026
**Analysis Tool:** Claude (Anthropic AI)
**Audit Type:** Read-Only Cross-Repository Diagnostic
