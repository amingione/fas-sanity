# Confusing or Risky Patterns (UX + Contract)

- 🟡 Derived discount views present as lists but are not document lists: `packages/sanity-config/src/structure/discountsStructure.ts` + `packages/sanity-config/src/structure/discountsList.tsx` read embedded `customer.discounts[]` objects, not standalone documents.
- 🟡 Two discount models coexist without a shared contract: Stripe customer discounts stored in `customer.discounts[]` (`packages/sanity-config/src/schemaTypes/objects/customerDiscountType.ts`) vs `promotion` documents assumed by fas-cms-fresh (`src/server/sanity/promotions.ts`, `src/lib/storefrontQueries.ts`).
- 🟡 `vendorMessage` is deprecated in schema but still used as the vendor portal messaging system (`packages/sanity-config/src/schemaTypes/documents/vendorMessage.ts`, `src/pages/api/vendor/messages/*`).
- 🟡 Orders can be patched by customers with no field allowlist (`src/pages/api/orders/[id].ts`), which risks overwriting Stripe-synced fields marked read-only in Studio.
- 🟡 EasyPost webhook writes `shippingStatus` and `shippingLog` on orders (`netlify/functions/easypostWebhook.ts`) while the order schema does not define those fields (`packages/sanity-config/src/schemaTypes/documents/order.tsx`), so Studio UX cannot surface them.
- 🟡 Quotes use multiple document types (`quote`, `quoteRequest`, `buildQuote`) with mismatched read/write paths (`src/pages/api/get-user-quotes.ts`, `src/pages/api/save-quote.ts`, `src/pages/api/build-quote.ts`).
- 🟡 Vendor profile endpoints read/write top-level `name`/`email` fields not defined in the vendor schema (`src/pages/api/vendor/settings/profile.ts`, `packages/sanity-config/src/schemaTypes/documents/vendor.ts`), so edits may appear to “not save” in Studio.
