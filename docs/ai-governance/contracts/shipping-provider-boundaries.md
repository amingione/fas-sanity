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
- Shipping rates are fetched from Medusa (`/store/shipping-options`) which uses Shippo rates
- No pre-checkout shipping rate pages

Must not:
- Create or purchase shipping labels
- Compute checkout totals outside Medusa
- Call internal/admin fulfillment workflows

### fas-sanity (Internal/Admin/In-Store)
- Provider: Shippo only
- Fetches live rates when creating invoices or preparing shipments
- Presents multiple carrier services (ground, 2nd day, next day/express)
- Allows staff to select a rate and purchase a label manually
- Stores shipment metadata for internal tracking

Must not:
- Influence online checkout shipping

## Non-Overlapping Flows
- Shippo is used in both systems, but never for the same flow
- Checkout rates live in Medusa (Shippo rates sync)
- Admin shipping lives in Sanity Studio workflows

## Enforcement Rules (Critical)
- If a request violates these boundaries, stop and request explicit human
  approval before taking action.
- Silent substitutions are forbidden.
- Mixing flows is forbidden.
- If uncertain, take no action and ask for clarification.
