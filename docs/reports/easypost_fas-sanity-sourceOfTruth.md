# EasyPost Source of Truth Audit (fas-sanity)

## Scope
Audit of EasyPost shipping workflows (rates, labels, tracking) inside `fas-sanity` with focus on the Netlify functions, Sanity Studio actions/components, and schema alignment.

## Tests Run
- `pnpm test -- __tests__/create-shipping-label.idempotent.test.ts __tests__/create-shipping-label.source.test.ts __tests__/shipping-quote-key.test.ts`
  - Result: All tests passed (vitest also ran additional suites due to config).
  - Note: `create-shipping-label.source` logged the expected guard warning.

## Issues + Required Fixes

### Critical: Schema Mismatches (fields written that do not exist)
- `netlify/functions/easypostCreateLabel.ts` writes `fulfillmentStatus`, `labelPurchasedFrom`, and `qrCodeUrl` but these fields are not defined in `packages/sanity-config/src/schemaTypes/documents/order.tsx`.
- `netlify/functions/easypostWebhook.ts` also writes `fulfillmentStatus` to orders even though it is not in the schema.
- `netlify/functions/create-shipping-label.ts` writes `fulfillmentStatus` as well.

Impact: Schema-first rules are violated, and these writes are dropped by Sanity or produce inconsistent data. Decide whether to remove writes or add schema fields (requires explicit approval).

### Multiple Competing Label-Creation Endpoints
- `netlify/functions/easypostCreateLabel.ts` (current, most complete)
- `netlify/functions/create-shipping-label.ts` (older, uses `_easypost` + WAREHOUSE_* envs)
- `src/pages/api/create-shipping-label.ts` (Astro API route; used in tests)

Problems:
- Each endpoint expects different payload shapes, uses different source addresses, and writes different fields (some set `labelPurchased`, some do not).
- Studio actions mostly call `easypostCreateLabel`, but tests cover `src/pages/api/create-shipping-label.ts`, which suggests stale or parallel behavior.

### Multiple Competing Rate Endpoints (Inconsistent Payloads + Responses)
- `netlify/functions/getEasyPostRates.ts` (ship_to/ship_from + package_details)
- `netlify/functions/easypostGetRates.ts` (address + parcel; hardcoded from address)
- `netlify/functions/getShippingQuoteBySkus.ts` (cart + destination; caches in Sanity)

Problems:
- Studio components point to different endpoints with different request/response formats.
- `packages/sanity-config/src/components/wizard/steps/StepRates.tsx` expects `rate.id`, but `netlify/functions/easypostGetRates.ts` returns `rateId`.
- `packages/sanity-config/src/components/wizard/steps/StepRates.tsx` sends `address.street1`, but `netlify/functions/easypostGetRates.ts` only reads `street` (not `street1`). This breaks wizard rate loading.
- `packages/sanity-config/src/schemaTypes/documentActions/getShippingRates.tsx` calls `/api/easypost/get-rates`, which does not exist.
- `packages/sanity-config/src/schemaTypes/documents/shippingOption.ts` expects `getEasyPostRates` to return an array directly; it actually returns `{rates: []}`.

### Wizard Prefill Uses Wrong Order Fields
- `packages/sanity-config/src/components/wizard/CreateLabelWizard.tsx` expects `order.shippingAddress.street1` and `order.weightLbs/lengthIn/etc`, but the order schema uses `shippingAddress.addressLine1` and `weight`/`dimensions` objects.

Impact: The wizard starts with blank/incorrect values, forcing manual entry and raising error risk.

### Shipping Label UI: Selected Rate Is Ignored
- `packages/sanity-config/src/schemaTypes/documents/shippingLabel.tsx` requires `serviceSelection`, but `GenerateAndPrintPanel` does not pass the selection (rate id) to `easypostCreateLabel`.

Impact: The UI suggests the user’s selection will be used, but labels are purchased using the lowest rate instead.

### Hardcoded / Inconsistent Ship-From Addresses
- `netlify/functions/easypostGetRates.ts` uses a hardcoded FAS address.
- `netlify/functions/create-shipping-label.ts` uses `_easypost.getWarehouseAddress()` with WAREHOUSE_* env vars.
- `netlify/lib/ship-from.ts` uses SHIP_FROM_* env vars (used by `easypostCreateLabel` + `getEasyPostRates`).
- `packages/sanity-config/src/schemaTypes/documents/shippingOption.ts` hardcodes a San Francisco address.

Impact: Rates/labels may be quoted or purchased against different origin addresses depending on workflow.

### Address Validation Bug
- `netlify/functions/easypostCreateLabel.ts` has `assertAddress` that *requires* `street2`. This should be optional and currently blocks valid addresses.

### EasyPost Rate ID Storage Is Unreliable
- `netlify/lib/fulfillmentFromMetadata.ts` stores `easypostRateId` using `serviceCode` or `carrierId` (not `rate_` ids).
- `src/pages/api/webhooks/stripe-order.ts` stores `easypostRateId` using Stripe shipping rate ids.

Impact: `easypostCreateLabel` may not find the preferred rate id and falls back to the lowest rate, even when a specific rate was selected during checkout.

### Label Purchase State Is Inconsistent
- `netlify/functions/easypostCreateLabel.ts` does not set `labelPurchased` or `labelPurchasedAt`.
- `src/pages/api/create-shipping-label.ts` *does* set `labelPurchased` and related fields.

Impact: Actions that rely on `labelPurchased` (e.g., `packages/sanity-config/src/schemaTypes/actions/orderActions.ts`) can allow double-purchases when labels are created via the Netlify function.

### UI Compliance Gaps (Sanity UI Policy)
Non-compliant UI elements using plain HTML + inline styles:
- `packages/sanity-config/src/schemaTypes/documents/shippingLabelComponents.tsx`
- `packages/sanity-config/src/components/EasyPostServiceInput.tsx`
- `packages/sanity-config/src/schemaTypes/documents/shippingOption.ts`
- Document actions using `window.alert/prompt/confirm` for label creation:
  - `packages/sanity-config/src/schemaTypes/actions/orderActions.ts`
  - `packages/sanity-config/src/schemaTypes/documentActions/invoiceActions.ts`
  - `packages/sanity-config/src/schemaTypes/documentActions/purchaseOrderLabel.tsx`

Impact: UI is inconsistent with repo standards and provides uneven UX.

### Error Handling Gaps
- `packages/sanity-config/src/schemaTypes/documentActions/purchaseOrderLabel.tsx` does not check `response.ok` before using JSON payload, and expects `estimatedDelivery` (not returned by `easypostCreateLabel`).

## Recommended Fix Plan (Phased)

### Phase 1: Define the Canonical EasyPost Workflow (Source of Truth)
- Choose a single label-create endpoint and a single rates endpoint (recommend `netlify/functions/easypostCreateLabel.ts` + `netlify/functions/getEasyPostRates.ts`).
- Deprecate or remove `netlify/functions/create-shipping-label.ts` and `src/pages/api/create-shipping-label.ts` (or turn them into thin wrappers that call the canonical function).
- Update tests to cover the canonical endpoints only.

### Phase 2: Align Data Model + Schema
- Remove writes to non-schema fields (`fulfillmentStatus`, `labelPurchasedFrom`, `qrCodeUrl`) or add schema fields **only if** a schema change is approved.
- Ensure label creation consistently sets `labelPurchased`, `labelPurchasedAt`, and related fields if those are required for guarding UI actions.
- Clarify the expected storage for EasyPost rate IDs vs service codes; store actual `rate_` ids in `easypostRateId` and store `serviceCode` separately if needed.

### Phase 3: Unify Rate Quote Payloads + Responses
- Normalize rate responses to a single shape (`rateId`, `carrier`, `service`, `amount`, `deliveryDays`, etc.) and update all UI consumers accordingly.
- Fix Wizard rate loading:
  - Accept `street1`/`addressLine1` and `postalCode` in `easypostGetRates` (or switch Wizard to `getEasyPostRates`).
  - Make the wizard expect `rateId` instead of `id`, or include both.
- Fix `getShippingRatesAction` to call a real endpoint.
- Fix `shippingOption` rate loader to read `data.rates` and remove hardcoded ship-from.

### Phase 4: Fix Address + Origin Source of Truth
- Use `netlify/lib/ship-from.ts` for all origin addresses (rates + labels + wizard).
- Remove hardcoded addresses in `netlify/functions/easypostGetRates.ts` and `shippingOption`.
- Fix `assertAddress` so `street2` is optional.

### Phase 5: UI Workflow Cleanup (Sanity UI Compliance)
- Replace HTML `<select>`, `<input>`, and inline styles with @sanity/ui components (Select, TextInput, Stack, Card, etc.).
- Replace `alert/prompt/confirm` flows with @sanity/ui dialogs or modal steps.
- Ensure rate selection UI actually passes the selected rate id into `easypostCreateLabel`.

### Phase 6: Testing + Validation
- Add tests for:
  - `easypostCreateLabel` payload guards, rate selection, and schema-safe patching.
  - `getEasyPostRates` response shape and address validation.
  - Wizard end-to-end rate selection → label creation flow.
- Run `pnpm test` to confirm no regressions.

## Notes
- If any schema change is required, obtain explicit approval with "SCHEMA CHANGE APPROVED" before modifying `packages/sanity-config/src/schemaTypes/documents/order.tsx`.
