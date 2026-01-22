<!-- CODEX_ENFORCEMENT_HEADER: BEGIN
contract_id: checkout-shipping-authority
contract_version: 2.0.0
enforcement: hard-fail
scope:
  repos:
    - fas-cms-fresh
    - fas-sanity
  concerns:
    - stripe_checkout_session_creation
    - dynamic_shipping_injection
    - webhook_shipping_persistence
invariants:
  - "Exactly one Stripe Checkout Session creation path exists across the system."
  - "Customers choose live shipping rates inside Stripe Checkout after entering address."
  - "Application must not define static shipping options."
forbidden_code_patterns:
  - "shipping_options"
  - "shipping_rate_data"
  - "fixed_amount"
  - "stripe.checkout.sessions.update(.*shipping_options"
required_code_patterns:
  - "shipping_address_collection"
  - "permissions.update_shipping_details"
  - "ui_mode:\\s*['\\\"]embedded['\\\"]"
  - "shipping_cost.shipping_rate"
required_webhook_behavior:
  - "On checkout completion, retrieve the Checkout Session and expand shipping_cost.shipping_rate, then persist carrier/service/cost and EasyPost identifiers."
codex_instructions:
  - "Reject any patch that introduces forbidden_code_patterns."
  - "If multiple checkout creators exist, stop and ask user which one is canonical; do not 'merge' flows."
  - "Do not add fallback shipping or manual shipping calculation under any circumstances."
CODEX_ENFORCEMENT_HEADER: END -->

# Checkout + Shipping Authority Contract

## EasyPost × Stripe Dynamic Checkout Shipping

**Version:** 2.0.0  
**Status:** ACTIVE — ENFORCEMENT REQUIRED  
**Authority:** Commerce Architecture

---

## PURPOSE

This contract defines the single, authoritative architecture for checkout and shipping behavior.

It exists to prevent:

- multiple checkout paths
- conflicting shipping models
- AI drift
- silent Stripe overrides
- broken EasyPost rate injection
- inconsistent customer checkout experiences

This contract supersedes:

- legacy checkout implementations
- experimental checkout code
- partial shipping logic
- undocumented assumptions

Non-compliance is a defect.

---

## CANONICAL CUSTOMER EXPERIENCE (MANDATORY)

The customer experience MUST be:

1. Customer proceeds to checkout
2. Stripe Embedded Checkout loads (Stripe-hosted UI)
3. Customer enters shipping address
4. Live carrier shipping rates appear automatically
5. Customer selects preferred shipping option
6. Customer completes payment
7. Selected shipping method is persisted to the order

At no time may the application:

- calculate shipping rates on the client
- display shipping outside Stripe Checkout
- require a secondary shipping step
- override Stripe’s shipping UI

---

## SHIPPING OWNERSHIP MODEL

Stripe owns shipping selection UI.

EasyPost supplies shipping rates via the Stripe shipping rates webhook.

The application does NOT participate in rate calculation outside the EasyPost webhook.

---

## STRICT ROLE SEPARATION

### Application Responsibilities

The application MAY:

- create a Stripe Checkout Session
- enable shipping address collection
- provide a shipping rates webhook for Stripe
- receive Stripe webhook events
- persist selected shipping data
- display shipping details post-checkout

The application MUST NOT:

- define static shipping options
- calculate shipping rates client-side
- inject fixed or placeholder rates
- override selected shipping after checkout

---

### Stripe Responsibilities

Stripe is responsible for:

- detecting shipping address changes
- triggering shipping rate recalculation
- rendering shipping UI
- enforcing customer selection
- attaching the selected shipping rate to the session

---

### EasyPost Responsibilities

EasyPost is responsible for:

- returning live carrier rates to the shipping rates webhook
- providing shipment and rate identifiers
- enabling downstream fulfillment data

---

## CHECKOUT SESSION CREATION RULES

### REQUIRED

All Checkout Sessions MUST:

- use Stripe Checkout (embedded UI)
- enable shipping_address_collection
- set permissions.update_shipping_details to server_only
- NOT define shipping_options
- NOT calculate shipping server-side
- allow Stripe to request rates via webhook

### FORBIDDEN (HARD FAIL)

A Checkout Session MUST NEVER include:

- shipping_options
- shipping_rate_data
- fixed_amount shipping
- custom carrier logic
- manual rate tables
- fallback shipping
- server-calculated shipping

---

## SINGLE CHECKOUT AUTHORITY RULE

There MUST be exactly one Checkout Session creation path.

Multiple checkout creators are forbidden.

---

## SHIPPING RATE SELECTION

Shipping rates are selected:

- by the customer
- inside Stripe Checkout
- in real time
- after address entry
- before payment

The selected rate is authoritative and immutable.

---

## WEBHOOK REQUIREMENTS

On checkout completion, the webhook handler MUST:

- retrieve the Checkout Session
- expand shipping_cost.shipping_rate
- persist all relevant shipping fields

Required persisted data includes:

- carrier
- service level
- cost
- currency
- delivery estimate (if provided)
- EasyPost metadata identifiers (easypost_rate_id, easypost_shipment_id)

Failure to persist selected shipping data is a defect.

---

## SANITY DATA CONTRACT

Sanity order documents MUST store:

- selected shipping carrier
- selected shipping service
- shipping cost
- Stripe shipping_rate ID
- EasyPost identifiers (if present)

Sanity MUST NOT:

- recalculate shipping
- replace customer selection
- infer shipping method
- apply defaults

The checkout-selected rate is final.

---

## FULFILLMENT RULE

Fulfillment MUST use the shipping method selected by the customer.

Substitution, optimization, or recomputation is forbidden.

---

## ERROR HANDLING

If shipping rates do not appear at checkout:

- checkout is invalid
- payment must not proceed
- issue must be corrected at configuration level

Fallback shipping is not allowed.

---

## PROHIBITED PATTERNS

The following are permanently forbidden:

- dual checkout flows
- shipping calculation endpoints outside the EasyPost webhook
- shipping preview pages
- metadata-based shipping selection
- post-checkout shipping choice
- hardcoded shipping prices

---

## ENFORCEMENT

AI agents MUST:

- treat this document as authoritative
- reject violating code
- halt execution on contradiction
- request clarification instead of guessing

---

## CHANGE CONTROL

Any change requires:

1. Contract update
2. Explicit approval
3. Version bump
4. Migration plan if applicable

---

## FINAL SUMMARY

- Customers choose shipping at checkout
- Stripe renders shipping UI
- EasyPost supplies live rates via webhook
- Application does not define static rates
- One checkout path exists
- Selected shipping is final
- Sanity stores, never alters

Violation of this contract is a blocking defect.
