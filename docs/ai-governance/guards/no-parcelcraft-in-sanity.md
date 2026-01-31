# Guard: No Legacy provider in Sanity (fas-sanity) shipping functions

## Intent

fas-sanity must use EasyPost for internal/admin shipping workflows. Stripe
Checkout and Legacy provider are strictly storefront-only.

## Fail Conditions

- Any Legacy provider reference in fas-sanity shipping functions
- Any Stripe Checkout session creation
- Any Stripe Checkout shipping configuration
- Any use of `shipping_options` or `shipping_rate_data` in Stripe calls

## Detection Patterns (Examples)

Use these checks to fail fast in CI or manual review:

- `Legacy provider`
- `stripe.checkout.sessions.create`
- `shipping_options`
- `shipping_rate_data`
- `checkout.sessions`

## Required Behavior

- EasyPost provides live rates for internal/admin shipments.
- Staff selects a rate and purchases labels manually.
