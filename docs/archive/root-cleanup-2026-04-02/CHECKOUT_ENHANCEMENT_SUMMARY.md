# Copilot Instructions for fas-cms-fresh

## 🚨 Architecture Authority Notice

This project follows a **Medusa-first commerce architecture**.

- **Medusa** is the single source of truth for all commerce data and logic:
  products, variants, pricing, inventory, cart, checkout, orders, shipping.
- **Sanity** is content-only: descriptions, images, SEO, marketing copy.
- **Stripe and Shippo are accessed exclusively via Medusa.**
- **fas-cms-fresh is UI + API consumer only.**

If any instruction, comment, or legacy code path conflicts with this rule,  
**this notice overrides it.**

## 🏗️ Architecture Overview

### Source of Truth by Responsibility

| Concern                                | System              |
| -------------------------------------- | ------------------- |
| Products, variants, pricing, inventory | Medusa              |
| Cart, checkout, orders, shipping       | Medusa              |
| Payments                               | Stripe (via Medusa) |
| Shipping labels & live rates           | Shippo (via Medusa) |
| Content, images, SEO, marketing pages  | Sanity              |
| Storefront UI                          | fas-cms-fresh       |

### Required Data Flow

Sanity (content only)  
→ Medusa (commerce engine)  
→ fas-cms-fresh (UI)  
→ Medusa checkout  
→ Stripe payment  
→ Shippo shipping

## In-Flight Systems (Open for Changes)

- `src/pages/api/medusa/*`: Active integration layer with Medusa backend.
- `src/pages/api/stripe/*`: **LEGACY – DO NOT EXTEND**. Stripe is accessed only through Medusa now.
- `src/pages/api/shipping/*`: **LEGACY – DO NOT EXTEND**. Shippo is accessed only through Medusa now.

> Note: Any references to “Sanity order schema” or “Sanity checkout logic” are deprecated and must not be expanded or maintained. All commerce logic and state belong to Medusa.

## Protected Areas

### Backend & Logic

- Any logic that computes prices, shipping, taxes, or order state outside Medusa

- Order validation and state transitions must only be handled by Medusa.

### Frontend

- Direct calls to Stripe or Shippo APIs are prohibited; always use Medusa APIs.
- Commerce data mutations must go through Medusa endpoints.

## Governance & Safety Rules

- Medusa is authoritative for all commerce data and validation
- Sanity is authoritative for content only

- No split-commerce logic is allowed; all pricing, inventory, and order state must come from Medusa.

- Legacy code paths that bypass Medusa must be removed or isolated and not extended.

## Testing & Validation

- Use the existing test suites under `tests/` to ensure compliance with Medusa-first architecture.

- Validate that no direct commerce mutations occur outside Medusa integration layers.

## Workflows & Automation

- CI workflows verify that no new legacy Stripe or shipping API usage is introduced.

- Pull requests touching commerce logic require explicit approval from Medusa architecture leads.

## Directory Structure & Responsibilities

- `src/pages/api/medusa/*`: Medusa API proxy and integration endpoints.
- `src/pages/api/stripe/*`: Legacy Stripe endpoints, read-only, no new features.
- `src/pages/api/shipping/*`: Legacy shipping endpoints, read-only, no new features.
- `src/components/*`: React components consuming Medusa and Sanity data.
- `src/lib/*`: Utility functions, API clients for Medusa and Sanity.
- `src/sanity/*`: Content schemas and queries; no commerce logic allowed.
