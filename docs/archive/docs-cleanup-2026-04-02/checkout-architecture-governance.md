# FAS Checkout Architecture Governance

DOCS_VERSION: v2026.04.01
Status: Canonical

## Canonical Authority

- Primary architecture source: `AGENTS.md`
- Canonical execution tracker: `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md`

If any governance file conflicts with AGENTS.md, AGENTS.md wins.

## 4-Repo Roles

| System | Role |
| --- | --- |
| fas-medusa | Commerce authority (products, pricing, inventory, cart, checkout, orders, shipping, returns/refunds) |
| fas-cms-fresh | Customer storefront UI and API consumer |
| fas-dash | Employee operations UI and API consumer |
| fas-sanity | Content and marketing system only |
| Stripe | Payment processor via Medusa |
| Shippo | Shipping provider via Medusa |

## Runtime Flow (Required)

1. Sanity manages content only.
2. Storefront (fas-cms-fresh) reads and mutates commerce state through Medusa.
3. Medusa calculates totals, validates shipping, and owns checkout invariants.
4. Medusa creates and manages Stripe payment objects.
5. Stripe returns payment outcome to Medusa webhook layer.
6. Medusa creates orders and owns order lifecycle state.
7. Dash consumes Medusa state for fulfillment, reconciliation, and support operations.
8. Shipping labels and tracking are executed through Shippo via Medusa.

## Enforcement

- Medusa is the only commerce authority.
- No direct Stripe or Shippo commerce flows outside Medusa.
- No duplicate pricing, inventory, order, payment, or shipping authority outside Medusa.
- Sanity remains non-transactional.
- fas-cms-fresh and fas-dash must not compute commerce invariants.
