# Guard: No EasyPost shipping integrations in Storefront (fas-cms-fresh)

## Intent

The storefront must use Parcelcraft inside Stripe Checkout. EasyPost usage or
any external rate calculation is forbidden in fas-cms-fresh.

## Fail Conditions

- Any import of `@easypost/api` or EasyPost SDK usage
- Any EasyPost rate or shipment creation logic
- Any shipping rate calculation outside Stripe Checkout
- Any fixed or placeholder `$0.00` shipping in production
- Any attempt to request rates from fas-sanity

## Detection Patterns (Examples)

Use these checks to fail fast in CI or manual review:

- `@easypost/api`
- `easypost` or `EasyPost`
- `createShippingLabel`
- `getShippingRates`
- `shipping_rate_data`
- `shipping_options`
- `amount_shipping: 0` or `free shipping`

## Required Behavior

- Stripe Checkout handles address collection and live rate selection.
- Parcelcraft computes rates inside Stripe only.
