# Shipping Architecture Lock (Do Not Regress)

## Purpose
This document is a hard guardrail: the storefront must show live carrier rates in Stripe Checkout and charge shipping via Stripe, without duplicate shipments or duplicate label purchases.

## Single Source of Truth
Carrier quoting and shipment creation are owned exclusively by **fas-sanity**:

- Canonical quote endpoint:
  - `/.netlify/functions/getShippingQuoteBySkus`
- Canonical label purchase endpoint:
  - `src/pages/api/create-shipping-label.ts` (fas-sanity)

The storefront (fas-cms-fresh) MUST NOT:
- call EasyPost/Legacy provider directly
- compute “real” shipping via local heuristics for checkout totals
- create shipments or purchase labels

## Required Checkout Properties (Storefront)
When creating Stripe Checkout Sessions, the storefront MUST:
1) Require a validated shipping destination pre-session.
2) Proxy cart + destination to `getShippingQuoteBySkus`.
3) Build `shipping_options` using Stripe `shipping_rate_data` from returned live rates.
4) Attach canonical shipping metadata to the Stripe session:
   - `shipping_quote_key`
   - `shipping_quote_request_id`
   - `shipping_quote_id`
   - `easy_post_shipment_id`
   - `selected_rate_id` (or the selected rate identifier)

## Idempotency Rules (Non-Negotiable)
### Quote Idempotency
A deterministic `quoteKey` is derived from:
- normalized cart (SKU/productId + qty, sorted)
- normalized destination (address/city/state/postal/country)

For the same cart + destination:
- `getShippingQuoteBySkus` MUST reuse the same cached quote/shipment
- MUST NOT create a new carrier shipment

### Webhook Idempotency
Stripe webhooks MUST:
- guard against replay/duplicates (same session should not create multiple orders)
- preserve canonical quote metadata when writing to Sanity orders

### Label Purchase Idempotency
Label purchase MUST:
- reuse stored `easyPostShipmentId`
- short-circuit if the label is already purchased
- never create a new shipment when one exists

## Emergency Behavior
If live quoting is unavailable, the storefront must fail closed (preferred) or use a controlled fallback ONLY if:
- explicitly enabled via an emergency env flag
- the fallback cannot create carrier side effects
- the fallback cannot silently diverge from canonical fulfillment workflows

## Guardrails
Any PR that:
- reintroduces a heuristic shipping calculator as the primary checkout path
- adds direct carrier calls in fas-cms-fresh
- removes quote metadata persistence
must be rejected unless this document is updated with a new approved contract.

Last Verified: 2026-01-10
