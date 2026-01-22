# Shipping Provider Boundaries (Authoritative)

This contract mirrors `docs/ai-governance/contracts/shipping-provider-boundaries.md` and is the
canonical source for repo-level shipping boundaries.

## Purpose
Define and enforce a hard, repo-level contract that separates online checkout
shipping from internal/admin shipping. This is an architecture boundary and must
not be crossed without explicit human approval.

## Scope
- fas-cms-fresh: online storefront (customer-facing checkout)
- fas-sanity: internal/admin tooling (in-store, invoicing, fulfillment)

## Provider Responsibilities

### fas-cms-fresh (Online Storefront)
- Provider: EasyPost (via Stripe shipping rates webhook)
- Uses Stripe Checkout only (embedded UI)
- Address collection and rate selection occur inside Stripe Checkout
- EasyPost rates are calculated server-side in `src/pages/api/stripe/shipping-rates-webhook.ts`
- No pre-checkout shipping rate pages

Must not:
- Create or purchase shipping labels
- Inject static shipping options
- Call internal/admin fulfillment workflows

### fas-sanity (Internal/Admin/In-Store)
- Provider: EasyPost only
- Fetches live rates when creating invoices or preparing shipments
- Presents multiple carrier services (ground, 2nd day, next day/express)
- Allows staff to select a rate and purchase a label manually
- Stores shipment metadata for internal tracking

Must not:
- Create Stripe Checkout sessions
- Configure Stripe Checkout shipping options
- Influence online checkout shipping

## Non-Overlapping Flows
- EasyPost is used in both systems, but never for the same flow
- Checkout rates live in Stripe + storefront webhook
- Admin shipping lives in Sanity Studio workflows

## Deprecated Endpoints
- `stripeShippingRateCalculation` is intentionally disabled (returns 410)
- Shipping rates are calculated exclusively by the Stripe shipping rates webhook

## Enforcement Rules (Critical)
- If a request violates these boundaries, stop and request explicit human
  approval before taking action.
- Silent substitutions are forbidden.
- Mixing flows is forbidden.
- If uncertain, take no action and ask for clarification.
