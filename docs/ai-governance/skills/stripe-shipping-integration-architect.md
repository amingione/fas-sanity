CODEX TASK — ENFORCE & TEST STRIPE PAYMENT + SHIPPO SHIPPING (AUTHORITATIVE, SINGLE SOURCE)
READ FIRST — NON-NEGOTIABLE
You MUST follow and enforce: docs/ai-governance/skills/stripe-shipping-integration-architect.md

This governed skill contract is the single source of truth for all Stripe, Shippo, checkout, and fulfillment behavior.
If any requested change conflicts with the contract, STOP and request explicit approval. Silent substitutions are forbidden.

OBJECTIVE
Create a deterministic, regression-proof test + reference implementation that proves the checkout and shipping flow works exactly as designed:

- Medusa is the commerce engine (canonical system of record)
- Stripe handles payment only via Medusa (via Stripe integration plugin)
- Shippo provides live carrier shipping rates requested by Medusa via Shippo integration plugin
- Storefront (fas-cms-fresh) must NOT calculate, define, or directly call shipping APIs
- Sanity is content/metadata only—no transactional shipping data
- No direct Stripe or Shippo calls from fas-cms-fresh or Sanity
- Shipment creation and label purchase happen post-checkout via Medusa fulfillment APIs

SCOPE (WHAT TO BUILD)
You will add tests and fixtures only (no product logic redesign):

Checkout API contract test
Validates Medusa checkout + Shippo integration behavior end-to-end
Negative guard tests
Prove forbidden behaviors (direct API calls from storefront, transactional data in Sanity) cannot reappear
Minimal reference payload
Canonical example input for checkout from storefront
Documentation note
Brief explanation of architecture and guarantees
REQUIRED FLOW (AUTHORITATIVE)
The flow you must enforce and test is:

Storefront (fas-cms-fresh)

Sends normalized cart + customer info to Medusa checkout API
MUST NOT:
Call Stripe directly
Call Shippo directly
Calculate shipping rates or options
Create shipments

Medusa (Commerce Engine)

Receives checkout request with:
cart items (product IDs, quantities, prices)
customer info (name, email, address)
Calls Shippo API plugin to fetch live shipping rates for customer address
Creates Stripe Payment Intent via Stripe plugin:
amount: subtotal + shipping cost
currency: specified currency
Accepts customer selection of shipping method before final payment
Charges customer for product + selected shipping cost via Stripe
On successful payment:
Creates Order record
Stores selected shippo_rate_id + carrier/service/cost metadata
Does NOT immediately create shipment or purchase label

Shippo (Shipping Provider)

Returns live carrier rates in response to Medusa rate request
Receives shipment creation requests from Medusa ONLY (post-checkout fulfillment)
Generates tracking numbers and labels when requested

Webhook (Medusa Fulfillment Flow)

After payment completes and order is created in Medusa
Operators or fulfillment system triggers shipment creation
Medusa calls Shippo to create shipment + purchase label
Shippo returns tracking number
Medusa stores tracking number in Order

Sanity (Content Layer)

Stores product descriptions, images, SEO metadata
NO order tracking, payment, shipping rate, or shipment data
NO transactional logic
TESTS TO IMPLEMENT (MANDATORY)

1. Happy-path integration test — Medusa checkout with Shippo rates
   Create a test that:

Sends checkout request to Medusa API with cart + customer address
Asserts:
Medusa calls Shippo API to fetch live shipping rates
Shippo mock returns multiple carrier rate options
Medusa includes shipping rates in checkout response
Medusa creates Stripe Payment Intent with correct total (subtotal + shipping)
Customer selects one shipping rate
Medusa creates Order with shippo_rate_id + carrier/service/cost metadata
No shipment is created during checkout
No label is purchased during checkout 2) Guard test — NO direct Stripe calls from storefront
Fail the test if:

fas-cms-fresh calls stripe.createPaymentIntent
fas-cms-fresh calls stripe.charges.create 3) Guard test — NO direct Shippo calls from storefront or Sanity
Fail the test if:

fas-cms-fresh calls shippo.rates.create
fas-cms-fresh calls shippo.parcels.create
Sanity webhook calls Shippo API
Any shipment creation happens during checkout phase 4) Guard test — NO shipping calculation in Sanity
Fail the test if:

Sanity stores order cart items with pricing/weight/dimensions
Sanity stores transactional shipping rate data
Sanity modifies shipping selections
Sanity calls fulfillment APIs
CANONICAL INPUT PAYLOAD (REFERENCE)
Use this as the golden example in tests and docs:

Storefront sends to Medusa checkout:
{
"cartId": "cart_test_123",
"customer": {
"email": "test@example.com",
"firstName": "John",
"lastName": "Doe",
"phone": "+1234567890"
},
"shippingAddress": {
"addressLine1": "123 Main St",
"city": "Portland",
"province": "OR",
"postalCode": "97214",
"countryCode": "US"
},
"cartItems": [
{
"productId": "medusa_prod_123",
"variantId": "medusa_variant_456",
"title": "6\" Axel-Back Exhaust",
"price": 899.99,
"quantity": 1,
"weight": 15.5,
"dimensions": {"length": 24, "width": 8, "height": 6}
}
]
}

Medusa calls Shippo API:
{
"parcels": [{"length": 24, "width": 8, "height": 6, "weight": 15.5, "distanceUnit": "in", "massUnit": "lb"}],
"addressTo": {"name": "John Doe", "street1": "123 Main St", "city": "Portland", "state": "OR", "zip": "97214", "country": "US"}
}

Medusa returns checkout with rates:
{
"shippingRates": [
{"shippoRateId": "rate_123", "carrier": "UPS", "service": "Ground", "cost": 15.00, "estimatedDays": 5},
{"shippoRateId": "rate_124", "carrier": "FedEx", "service": "2Day", "cost": 25.00, "estimatedDays": 2}
],
"paymentIntent": {"id": "pi_123", "amount": 939.99, "status": "requires_action"}
}
ACCEPTANCE CRITERIA (ALL REQUIRED)
All tests pass
Medusa calls Shippo API and receives live carrier rates
Stripe is called only from Medusa (never directly from fas-cms-fresh)
Shippo is called only from Medusa (never from storefront or Sanity)
Storefront sends normalized cart + address to Medusa (NO shipping calculations)
Sanity stores content and order metadata ONLY (NO transactional shipping data, NO rates, NO shipment IDs pre-fulfillment)
Selected shipping rate is stored in Medusa Order with shippo_rate_id + carrier/service/cost
No shipment or label is created during checkout (shipment creation is post-checkout fulfillment only)
Governance contract is respected exactly
OUTPUT REQUIRED
Files created/modified (Medusa tests, fixtures, minimal docs note)
Test names and locations
Confirmation that storefront, Sanity, and Medusa responsibilities are enforced precisely
Confirmation that Shippo is accessed only via Medusa
Confirmation that Stripe is accessed only via Medusa
Confirmation that governance rules were enforced verbatim
FINAL INSTRUCTION
Implement only what is required to enforce and test the approved Medusa + Stripe + Shippo architecture.

Medusa is the single system of record for commerce (products, cart, orders, fulfillment).
Stripe handles payment only—accessed via Medusa plugin.
Shippo handles shipping rates and labels only—accessed via Medusa plugin.
Sanity is content only—transactional data lives in Medusa only.
fas-cms-fresh is UI only—no direct Stripe or Shippo calls.

Do not redesign. Do not optimize. Do not “improve.”

If any ambiguity exists, STOP and ask for approval.
