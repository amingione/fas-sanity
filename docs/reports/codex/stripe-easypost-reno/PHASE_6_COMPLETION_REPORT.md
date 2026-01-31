# Phase 6 Completion Report - End-to-End Regression (Green Board)

Date: 2025-02-14
Scope: Checkout + shipping rates, order persistence, Studio shipping, mobile, end-to-end flow

## Verification Results

Task 6.1 - Checkout + shipping rates (storefront)
- Script: `fas-cms-fresh/scripts/create-test-checkout-with-shipping.ts` -> PASS (session created)
  - Session ID: `cs_live_a1APMdLL0brhqRI3HuPcnhy0P1mDPwdIWTxIlqmckV0EBeGsfYjNS6DgU1`
  - URL generated for manual checkout
- Manual checkout rate selection -> PARTIAL (session provided)
- Script `check-shipping-transit-times.ts` -> FAIL (no shipping_cost found)
  - Session ID: `cs_live_b1a11PB3W4dROvIuD4yznH1gFnnKyY4De22zBIxcD8ZCJSN33FaG72CvLc`

Task 6.2 - Order creation + persistence
- Script: `fas-sanity/scripts/stripe-maintenance/test-webhook.js` -> PASS (handler executed, duplicate event ignored, event logged)
- Field persistence review -> NOT RUN (requires Sanity order inspection)

Task 6.3 - Studio internal shipping workflows
- Manual Studio tests -> NOT RUN

Task 6.4 - Mobile checkout
- Playwright/mobile viewport tests -> NOT RUN

Task 6.5 - End-to-end workflow
- Full flow (checkout -> order -> label -> tracking update) -> NOT RUN

## Blockers / Exceptions
- Manual steps required for checkout completion, shipping rate selection, and Studio validation.
- Mobile and full end-to-end tests not executed.
- Embedded checkout required `onShippingDetailsChange` when `permissions.update_shipping_details=server_only`; handler added in `fas-cms-fresh/src/components/checkout/EmbeddedCheckout.tsx` (retest needed).
- Shipping cost not attached to session yet; rate selection may not have completed or session may be incomplete.

## Recommendations
- Complete manual checkout using the generated session URL and verify shipping rates render.
- Run `fas-cms-fresh/scripts/check-shipping-transit-times.ts <session_id>` after selecting a rate.
- Validate order creation in Sanity for the completed session.
- Complete Studio shipping label flow and confirm EasyPost webhook updates.
- Run mobile checkout verification via Playwright or manual devices.
