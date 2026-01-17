# Stripe Checkout + Parcelcraft Shipping Test Coverage

These tests enforce the governed checkout architecture described in `docs/ai-governance/skills/stripe-shipping-integration-architect.md`.

- Contract test: `__tests__/stripe.checkout.parcelcraft.contract.test.ts`
- Guard tests: `__tests__/stripe.checkout.parcelcraft.guards.test.ts`
- Canonical request fixture: `tests/fixtures/checkout.canonical.json`

Update the tests and fixture together if the governed contract changes.

