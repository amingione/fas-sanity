# Shipping Provider Boundaries (Authoritative)

## Purpose
Define and enforce a hard, repo-level contract that separates online checkout
shipping from internal/admin shipping. This is an architecture boundary and must
not be crossed without explicit human approval.

## Scope
- fas-cms-fresh: online storefront (customer-facing checkout)
- fas-sanity: internal/admin tooling (in-store, invoicing, fulfillment)

## Provider Responsibilities

### fas-cms-fresh (Online Storefront)
- Provider: Parcelcraft (Stripe-native app)
- Uses Stripe Checkout only
- Address collection and rate selection occur inside Stripe Checkout UI
- Parcelcraft computes live rates inside Stripe based on product/package data
- No pre-checkout shipping rate pages

Must not:
- Call EasyPost
- Calculate shipping rates outside Stripe Checkout
- Inject fixed or placeholder rates (including $0.00) in production
- Request rates from fas-sanity
- Create or purchase shipping labels

### fas-sanity (Internal/Admin/In-Store)
- Provider: EasyPost only
- Fetches live rates when creating invoices or preparing shipments
- Presents multiple carrier services (ground, 2nd day, next day/express)
- Allows staff to select a rate and purchase a label manually
- Stores shipment metadata for internal tracking

Must not:
- Create Stripe Checkout sessions
- Configure Stripe Checkout shipping options
- Reference Parcelcraft
- Influence online checkout shipping

## Non-Overlapping Flows
- Parcelcraft = online checkout only
- EasyPost = internal/admin shipping only
- Both may calculate live rates, but never for the same flow

## Enforcement Rules (Critical)
- If a request violates these boundaries, stop and request explicit human
  approval before taking action.
- Silent substitutions are forbidden.
- Mixing providers is forbidden.
- If uncertain, take no action and ask for clarification.
