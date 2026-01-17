CODEX TASK — ENFORCE & TEST STRIPE CHECKOUT + PARCELCRAFT DYNAMIC SHIPPING (AUTHORITATIVE, SINGLE SOURCE)
READ FIRST — NON-NEGOTIABLE
You MUST follow and enforce: docs/ai-governance/skills/stripe-shipping-integration-architect.md

This governed skill contract is the single source of truth for all Stripe, Parcelcraft, EasyPost, checkout, and fulfillment behavior.
If any requested change conflicts with the contract, STOP and request explicit approval. Silent substitutions are forbidden.

OBJECTIVE
Create a deterministic, regression-proof test + reference implementation that proves the storefront checkout flow works exactly as designed:

- Stripe Checkout is canonical for payment + checkout-time shipping selection
- Parcelcraft (Stripe app) injects live carrier rates inside Stripe Checkout
- Storefront must NOT calculate, define, or override shipping options
- No shipment creation or label purchase during checkout
- EasyPost is used only in Sanity for manual post-checkout label creation/printing
- Webhook must persist the customer-selected Stripe shipping rate details into Sanity

SCOPE (WHAT TO BUILD)
You will add tests and fixtures only (no product logic redesign):

Checkout API contract test
Validates stripe.createCheckoutSession behavior end-to-end
Negative guard tests
Prove forbidden behaviors cannot reappear
Minimal reference payload
Canonical example input for checkout
Documentation note
Brief explanation of guarantees (no duplication of governance rules)
REQUIRED FLOW (AUTHORITATIVE)
The flow you must enforce and test is:

Storefront (fas-cms-fresh)

Normalized cart
Customer info (name, email)
Stripe Checkout collects shipping + billing address
Customer selects ONE live Parcelcraft-injected rate inside Stripe Checkout

Server behavior

Creates Stripe Checkout Session with:
mode: 'payment'
line_items from cart
shipping_address_collection enabled
NO shipping_options and NO shipping_rate_data (Parcelcraft injects rates)
MUST NOT:
Calculate shipping
Define shipping options
Create Stripe Shipping Rate objects
Create invoices
Create shipments
Buy labels

Stripe Checkout

Displays live Parcelcraft-injected shipping options after address entry
Charges the customer-selected shipping cost as part of payment

Webhook

Retrieves the completed Checkout Session and expands shipping_cost.shipping_rate
Persists order + selected shipping rate details into Sanity
NO shipment creation and NO label purchase
TESTS TO IMPLEMENT (MANDATORY)

1. Happy-path unit/integration test
   Create a test that:

Calls stripe.createCheckoutSession with a valid payload
Asserts:
Session created
Checkout Session includes shipping_address_collection
On webhook ingestion, shipping_cost.shipping_rate is retrieved/expanded
Persisted order contains stripeShippingRateId + carrier/service/cost fields (if provided)
No shipment_id, tracking_number, or ship_date exists pre-fulfillment 2) Guard test — NO manual shipping options
Fail the test if:

shipping_options is passed to stripe.checkout.sessions.create
shipping_rate_data is passed to stripe.checkout.sessions.create
stripe.shippingRates.create is called 3) Guard test — NO invoices
Fail the test if:

stripe.invoices.create is called
Checkout session includes invoice_creation 4) Guard test — NO EasyPost during checkout
Fail the test if:

Any EasyPost shipment, rate, or label API is invoked during checkout or webhook ingestion
Any shipment_id metadata is present pre-fulfillment
CANONICAL INPUT PAYLOAD (REFERENCE)
Use this as the golden example in tests and docs:

{
"cartId": "cart_test_123",
"customerEmail": "test@example.com",
"cart": [
{
"productId": "sanity_product_1",
"title": "6\" Axel-Back Exhaust",
"price": 899.99,
"quantity": 1,
"sku": "FAS-AXL-6"
}
]
}
ACCEPTANCE CRITERIA (ALL REQUIRED)
All tests pass
Forbidden APIs are never called
No manual shipping options (shipping_options/shipping_rate_data) exist
No shipment or label is created during checkout
Selected Stripe shipping rate is persisted into Sanity (stripeShippingRateId + carrier/service/cost when available)
Governance contract is respected exactly
OUTPUT REQUIRED
Files created/modified (tests, fixtures, minimal docs note)
Test names and locations
Confirmation that no runtime logic was redesigned
Confirmation that governance rules were enforced verbatim
FINAL INSTRUCTION
Implement only what is required to enforce and test the approved architecture.

Do not redesign. Do not optimize. Do not “improve.”

If any ambiguity exists, STOP and ask for approval.
