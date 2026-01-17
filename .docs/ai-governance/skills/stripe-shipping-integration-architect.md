# Skill: Stripe Shipping Integration Architect (fas-cms-fresh)

## Scope

Applies to all online storefront shipping and stripe checkout work in fas-cms-fresh.

### Core Rules

- Parcelcraft is the sole authority for online shipping rates.
- Stripe Checkout UI handles all address collection and rate selection.
- Application code must never calculate or inject shipping rates.
- Do not call EasyPost or any external shipping API in the storefront.
- Do not create or purchase shipping labels in fas-cms-fresh.

#### Failure Mode

If a request conflicts with these rules, stop and request explicit human
approval before taking action.
