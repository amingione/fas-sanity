# TypeScript Error Governance Audit (Read-Only)

Source of truth: `npx tsc --noEmit`.

## 1) AutoMapper & Schema Inference

Errors:
- `packages/sanity-config/src/autoMapper/core/mappingEngine.ts:52` TS2304 Cannot find name `SchemaIndex`.
- `packages/sanity-config/src/autoMapper/core/mappingEngine.ts:64` TS7006 Parameter `result` implicitly has an `any` type.
- `packages/sanity-config/src/autoMapper/core/mappingEngine.ts:72` TS7006 Parameter `target` implicitly has an `any` type.
- `packages/sanity-config/src/autoMapper/core/mappingEngine.ts:78` TS7006 Parameter `tv` implicitly has an `any` type.
- `packages/sanity-config/src/autoMapper/nlp/commandParser.ts:76` TS2339 Property `field` does not exist on type `never`.
- `packages/sanity-config/src/autoMapper/nlp/commandParser.ts:85` TS2339 Property `field` does not exist on type `never`.
- `packages/sanity-config/src/autoMapper/nlp/commandParser.ts:113` TS2339 Property `field` does not exist on type `never`.

Expected source of missing type/property:
- `SchemaIndex` is defined and exported in `packages/sanity-config/src/autoMapper/types.ts`.
- `SchemaIndex.search` returns `SchemaSearchResult` with a `field` property in `packages/sanity-config/src/autoMapper/types.ts`.

Observed actual source (or absence):
- `packages/sanity-config/src/autoMapper/core/mappingEngine.ts` imports from `../types` but does not import `SchemaIndex` while using it in the constructor.
- `packages/sanity-config/src/autoMapper/nlp/commandParser.ts` uses `sourceCandidate.field` and `explicitTarget` from the result of `SchemaIndex.search`, but the compiler reports `sourceCandidate` as `never` at the use sites.

Logic executes in all cases:
- `generateMappingFromCommand` in `packages/sanity-config/src/autoMapper/nlp/commandParser.ts` returns early when `parseCommand` fails or when no source candidate is found; mapping suggestions execute only when both are present.

Queries exclude valid states:
- UNKNOWN (no query logic observed in the listed files).

UI fallbacks mask missing data:
- UNKNOWN (no UI rendering in the listed files).

Known unknowns:
- UNKNOWN whether the missing `SchemaIndex` name resolution is due to a missing import or an upstream type export issue.
- UNKNOWN why `sourceCandidate` is inferred as `never` in `commandParser.ts` despite local return types.
- UNKNOWN whether TypeScript configuration or path mapping affects `SchemaIndex` visibility in this compilation context.

## 2) Sanity Schema Definitions vs Usage

Errors:
- `packages/sanity-config/src/autoMapper/core/schemaScanner.ts:157` TS2339 Property `fields` does not exist on type `SchemaTypeDefinition`.
- `packages/sanity-config/src/autoMapper/core/schemaScanner.ts:158` TS2339 Property `fields` does not exist on type `SchemaTypeDefinition`.
- `packages/sanity-config/src/autoMapper/core/schemaScanner.ts:158` TS7006 Parameter `field` implicitly has an `any` type.
- `packages/sanity-config/src/autoMapper/core/schemaScanner.ts:235` TS2339 Property `fields` does not exist on type `SchemaTypeDefinition`.
- `packages/sanity-config/src/autoMapper/core/schemaScanner.ts:236` TS2339 Property `fields` does not exist on type `SchemaTypeDefinition`.
- `packages/sanity-config/src/autoMapper/core/schemaScanner.ts:262` TS2339 Property `fields` does not exist on type `SchemaTypeDefinition`.
- `packages/sanity-config/src/schemaTypes/documents/integrationPack.ts:51` TS2345 Field definition missing required `name` property for `defineField`.
- `packages/sanity-config/src/schemaTypes/documents/workspace.ts:60` TS2345 Field definition missing required `name` property for `defineField`.
- `packages/sanity-config/src/schemaTypes/documentActions/linkVendorToCustomerAction.tsx:97` TS2345 `SanityDocumentStub<CustomerDoc>` requires `_id`, but the `client.create` payload omits it.

Expected source of missing type/property:
- `SchemaTypeDefinition` is imported from `sanity` in `packages/sanity-config/src/autoMapper/core/schemaScanner.ts`; `fields` are expected on document and object schema definitions.
- `defineField` usage in Sanity schemas expects each field definition to include a `name` property (as required by `sanity` field typings).
- `SanityDocumentStub<CustomerDoc>` is the typed input for `client.create` in `packages/sanity-config/src/schemaTypes/documentActions/linkVendorToCustomerAction.tsx`.

Observed actual source (or absence):
- `packages/sanity-config/src/autoMapper/core/schemaScanner.ts` accesses `.fields` on `SchemaTypeDefinition` without type narrowing; the union includes types (e.g., `StringDefinition`) without `fields`.
- `packages/sanity-config/src/schemaTypes/documents/integrationPack.ts` defines an object in an array `of` list without a `name`.
- `packages/sanity-config/src/schemaTypes/documents/workspace.ts` defines an object in an array `of` list without a `name`.
- `packages/sanity-config/src/schemaTypes/documentActions/linkVendorToCustomerAction.tsx` calls `client.create<CustomerDoc>` with an object missing `_id`.

Logic executes in all cases:
- `SchemaScanner.scan` filters to document types and skips entries without `fields` at runtime; schema traversal only executes when fields are present.

Queries exclude valid states:
- UNKNOWN (no query logic observed in the listed files).

UI fallbacks mask missing data:
- UNKNOWN (no UI rendering in the listed files).

Known unknowns:
- UNKNOWN whether schema types are generated or manually maintained in this repository.
- UNKNOWN whether `CustomerDoc` is intended to allow `_id` omission during creation in the current Sanity client version.
- UNKNOWN whether the Sanity type definitions used here are aligned to the Studio runtime version.

## 3) Studio UI Component Contracts

Errors:
- `packages/sanity-config/src/components/hotspots/ProductTooltip.tsx:72` TS18046 `node.props` is of type `unknown`.
- `packages/sanity-config/src/components/media/ShipmentStatusIcon.tsx:65` TS2769 `style` prop is not assignable to `IntrinsicAttributes` for the icon component.
- `packages/sanity-config/src/components/StripeAnalyticsWidget.tsx:201` TS2322 `tone` prop does not exist on the `Text` component props.
- `packages/sanity-config/src/components/studio/documentTables/RecoveredCartBadge.tsx:15` TS2322 `icon` prop does not exist on `Badge` component props.
- `packages/sanity-config/src/shims/react-refractor-shim.tsx:43` TS2503 Cannot find namespace `JSX`.
- `packages/sanity-config/src/structure/discountsStructure.ts:19` TS2554 Expected 0 arguments, but got 1.
- `packages/sanity-config/src/structure/discountsStructure.ts:22` TS2554 Expected 0 arguments, but got 1.
- `packages/sanity-config/src/structure/discountsStructure.ts:25` TS2554 Expected 0 arguments, but got 1.
- `packages/sanity-config/src/schemaTypes/documentActions/generateVendorNumberAction.ts:10` TS2339 Property `getClient` does not exist on type `DocumentActionProps`.
- `src/components/shop/ProductTypeBadge.tsx:33` TS2322 `align` prop does not exist on `Inline` component props.

Expected source of missing type/property:
- `@sanity/ui` component prop types for `Text`, `Badge`, `Inline`, and `Box`.
- `@sanity/icons` component props for icon components used in `ShipmentStatusIcon`.
- `sanity/desk` `StructureBuilder` typings for `S.component` usage.
- React typings for `ReactNode` and the `JSX` namespace.
- `sanity` `DocumentActionProps` typing for Studio document actions.

Observed actual source (or absence):
- `ProductTooltip` treats `node` as `ReactNode`; `React.isValidElement` narrows to `ReactElement<unknown>` so `props` is `unknown`.
- `ShipmentStatusIcon` passes a `style` prop to an icon component typed without DOM props.
- `StripeAnalyticsWidget` passes a `tone` prop to `Text`.
- `RecoveredCartBadge` passes an `icon` prop to `Badge`.
- `react-refractor-shim.tsx` asserts a return type using `JSX.Element` without a visible `JSX` namespace in scope.
- `discountsStructure.ts` calls `S.component(DiscountsListX)` while the type signature expects zero arguments for `component`.
- `generateVendorNumberAction.ts` destructures `getClient` from `DocumentActionProps`, which is not in the type.
- `ProductTypeBadge` passes `align` to `Inline`.

Logic executes in all cases:
- `ProductTooltip` renders fallback text when `renderPreview` output is null or the product reference is missing.
- `StripeAnalyticsWidget` renders a fallback card when `metrics.recentOrders` is empty.

Queries exclude valid states:
- UNKNOWN (no query logic observed in the listed files).

UI fallbacks mask missing data:
- `packages/sanity-config/src/components/hotspots/ProductTooltip.tsx` shows `Preview unavailable` when the preview node is null.
- `packages/sanity-config/src/components/StripeAnalyticsWidget.tsx` shows `No recent completed orders` when the recent list is empty.
- `packages/sanity-config/src/components/media/ShipmentStatusIcon.tsx` defaults to `Pending` status when no status is provided.

Known unknowns:
- UNKNOWN whether the installed `@sanity/ui` and `@sanity/icons` versions match the prop usage in these components.
- UNKNOWN whether the `sanity/desk` `StructureBuilder` typings reflect the runtime version used by the Studio.
- UNKNOWN whether the project TypeScript configuration is expected to provide a global `JSX` namespace for the shim.

## 4) Domain Document Type Drift

Errors:
- `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx:382` TS2339 Property `carrier` does not exist on type `InvoiceDocument`.
- `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx:385` TS2339 Property `carrier` does not exist on type `OrderShippingLike`.
- `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx:387` TS2339 Property `carrier` does not exist on type `OrderShippingLike`.
- `packages/sanity-config/src/components/studio/OrderShippingView.tsx:422` TS2339 Property `carrier` does not exist on type `OrderDocument`.
- `packages/sanity-config/src/components/studio/OrderShippingView.tsx:428` TS2339 Property `service` does not exist on type `OrderDocument`.
- `packages/sanity-config/src/components/studio/OrderShippingView.tsx:445` TS2339 Property `estimatedDeliveryDate` does not exist on type `OrderDocument`.
- `packages/sanity-config/src/components/studio/OrderShippingView.tsx:446` TS2339 Property `estimatedDeliveryDate` does not exist on type `OrderDocument`.
- `packages/sanity-config/src/components/studio/OrderShippingView.tsx:502` TS2339 Property `carrier` does not exist on type `OrderDocument`.
- `packages/sanity-config/src/components/studio/OrderShippingView.tsx:503` TS2339 Property `service` does not exist on type `OrderDocument`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:90` TS2339 Property `weight` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:90` TS2339 Property `weight` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:91` TS2339 Property `weight` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:94` TS2339 Property `length` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:94` TS2339 Property `length` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:95` TS2339 Property `length` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:98` TS2339 Property `width` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:98` TS2339 Property `width` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:99` TS2339 Property `width` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:102` TS2339 Property `height` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:102` TS2339 Property `height` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:103` TS2339 Property `height` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:148` TS2339 Property `city` does not exist on type `{}`.
- `packages/sanity-config/src/schemaTypes/actions/orderActions.ts:148` TS2339 Property `state` does not exist on type `{}`.
- `packages/sanity-config/src/views/orderView.tsx:200` TS2322 Type `"date"` is not assignable to type `OrderViewFieldType`.
- `src/pages/api/webhooks/stripe-order.ts:61` TS2353 Object literal may only specify known properties; `_type` does not exist in type `OrderCartItem`.
- `src/pages/api/webhooks/stripe-order.ts:74` TS2353 Object literal may only specify known properties; `_type` does not exist in type `OrderCartItem`.
- `src/pages/api/webhooks/stripe-order.ts:120` TS2353 Object literal may only specify known properties; `_type` does not exist in type `OrderCartItem`.

Expected source of missing type/property:
- The order schema defines `carrier`, `service`, and `estimatedDeliveryDate` in `packages/sanity-config/src/schemaTypes/documents/order.tsx`.
- Order document types in `packages/sanity-config/src/types/order.ts` include `carrier`, `service`, `estimatedDeliveryDate`, and `packageDimensions`.
- `OrderCartItem` is defined in `packages/sanity-config/src/types/order.ts` and does not include an `_type` property.
- `OrderViewFieldType` is defined in `packages/sanity-config/src/types/order.ts` and does not include `date`.

Observed actual source (or absence):
- `OrderShippingView` defines a local `OrderDocument` type without `carrier`, `service`, or `estimatedDeliveryDate`.
- `InvoiceVisualEditor` defines a local `InvoiceDocument` and `OrderShippingLike` without `carrier` on the document or nested order-like types.
- `orderActions.ts` uses `doc.packageDimensions` and `doc.shippingAddress` but the `DocumentActionComponent` `doc` type resolves to `{}` in this file.
- `stripe-order.ts` constructs `OrderCartItem` values with `_type: 'orderCartItem'`, which is not part of the `OrderCartItem` type definition.
- `orderView.tsx` uses `type: 'date'` in the view configuration, which is not part of `OrderViewFieldType`.

Logic executes in all cases:
- `OrderShippingView` renders values by falling back to `order.fulfillment` and `"—"` when specific fields are missing.
- `InvoiceVisualEditor` normalizes shipping data by pulling from `doc`, `orderRef`, and `order`, and defaults `shippingCarrier` to an empty string when no source values exist.
- `CreateShippingLabelAction` in `orderActions.ts` attempts to derive package dimensions from `doc.packageDimensions` and falls back to prompt defaults when data is missing.

Queries exclude valid states:
- UNKNOWN (no query logic observed in the listed files).

UI fallbacks mask missing data:
- `packages/sanity-config/src/components/studio/OrderShippingView.tsx` displays `"—"` when carrier/service/delivery data is missing.
- `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx` returns empty strings when shipping carrier values are missing after normalization.

Known unknowns:
- UNKNOWN whether the local `OrderDocument` and `InvoiceDocument` types are intended to mirror generated schema types.
- UNKNOWN whether `orderRef` is expected to be resolved with order fields at runtime or remain as a reference only.
- UNKNOWN whether `_type` is required for cart items at runtime despite being absent in `OrderCartItem` typing.

## 5) Stripe SDK & API Versioning

Errors:
- `packages/sanity-config/src/utils/generateSKU.ts:64` TS2322 Type `"2024-06-20"` is not assignable to type `"2025-08-27.basil"`.
- `scripts/inspect-checkout-session.ts:26` TS2322 Type `"2024-06-20"` is not assignable to type `"2025-08-27.basil"`.
- `scripts/setup-military-discount.ts:9` TS2322 Type `"2024-06-20"` is not assignable to type `"2025-08-27.basil"`.
- `src/lib/militaryVerification.ts:56` TS2322 Type `"2024-06-20"` is not assignable to type `"2025-08-27.basil"`.
- `src/lib/militaryVerification.ts:297` TS18047 `promoCode.expires_at` is possibly `null`.
- `src/lib/militaryVerification.ts:304` TS2345 Argument of type `number | null` is not assignable to parameter of type `number`.
- `src/pages/api/webhooks/stripe-order.ts:173` TS2339 Property `shipping_details` does not exist on type `Session`.
- `src/pages/api/webhooks/stripe-order.ts:175` TS2339 Property `shipping_details` does not exist on type `Session`.
- `src/pages/api/webhooks/stripe-order.ts:178` TS2339 Property `shipping_details` does not exist on type `Session`.
- `src/pages/api/webhooks/stripe-order.ts:179` TS2339 Property `shipping_details` does not exist on type `Session`.
- `src/pages/api/webhooks/stripe-order.ts:180` TS2339 Property `shipping_details` does not exist on type `Session`.
- `src/pages/api/webhooks/stripe-order.ts:181` TS2339 Property `shipping_details` does not exist on type `Session`.
- `src/pages/api/webhooks/stripe-order.ts:182` TS2339 Property `shipping_details` does not exist on type `Session`.
- `src/pages/api/webhooks/stripe-order.ts:183` TS2339 Property `shipping_details` does not exist on type `Session`.

Expected source of missing type/property:
- Stripe SDK typings define an `apiVersion` literal union for `new Stripe(...)` options.
- Stripe SDK typings for `Stripe.Checkout.Session` and `Stripe.PromotionCode` define `shipping_details` and `expires_at` behavior for the configured API version.

Observed actual source (or absence):
- `generateSKU.ts`, `inspect-checkout-session.ts`, `setup-military-discount.ts`, and `militaryVerification.ts` instantiate Stripe with `apiVersion: '2024-06-20'` while the type expects `"2025-08-27.basil"`.
- `militaryVerification.ts` uses `promoCode.expires_at` as a number without a null guard.
- `stripe-order.ts` reads `session.shipping_details`, but the type for `Stripe.Checkout.Session` in the current typings does not include that property.

Logic executes in all cases:
- `stripe-order.ts` builds a shipping address object only when `session.shipping_details` is truthy; no alternative path is used when it is missing.
- `militaryVerification.ts` uses `promoCode.expires_at` to compute dates and email payloads without a runtime null check.

Queries exclude valid states:
- UNKNOWN (no query logic observed in the listed files).

UI fallbacks mask missing data:
- UNKNOWN (no UI rendering in the listed files).

Known unknowns:
- UNKNOWN which Stripe API version is intended for this codebase at runtime.
- UNKNOWN whether `shipping_details` is present in runtime `Stripe.Checkout.Session` objects for the configured API version.
- UNKNOWN whether `promoCode.expires_at` can be null in the runtime scenarios exercised here.

## 6) Scripts & Migration Typing Assumptions

Errors:
- `scripts/fix-order-number-format.ts:93` TS2322 Type `string | undefined` is not assignable to type `string`.
- `scripts/fix-order-number-format.ts:94` TS2322 Type `string | undefined` is not assignable to type `string`.
- `scripts/fix-order-number-format.ts:95` TS2322 Type `string | undefined` is not assignable to type `string`.
- `scripts/migrateProductShipping.ts:239` TS2322 Type `{ length?: number | null | undefined; width?: number | null | undefined; height?: number | null | undefined; } | null` is not assignable to type `{ length: number; width: number; height: number; } | null`.
- `scripts/migrateProductShipping.ts:242` TS2322 Type `boolean | null` is not assignable to type `boolean`.
- `scripts/migrateProductShipping.ts:243` TS2322 Type `boolean | null` is not assignable to type `boolean`.
- `scripts/migrateProductShipping.ts:244` TS2322 Type `boolean | null` is not assignable to type `boolean`.

Expected source of missing type/property:
- `pickUnique` in `scripts/fix-order-number-format.ts` expects `string[]` candidates.
- `NormalizedShippingConfig` in `scripts/migrateProductShipping.ts` requires `dimensions` with non-null `length`, `width`, and `height`, and booleans for `requiresShipping`, `freeShippingEligible`, and `separateShipment`.

Observed actual source (or absence):
- `scripts/fix-order-number-format.ts` passes `doc.orderNumber`, `slugCurrent`, and `doc.stripeSessionId || undefined` to `pickUnique`, producing `string | undefined` values.
- `scripts/migrateProductShipping.ts` assigns `dimensions` from `existing.dimensions` which is typed with optional/nullable fields; boolean values can be `null` from `existing`.

Logic executes in all cases:
- `scripts/fix-order-number-format.ts` loops through batches and skips documents when no candidate is found or when the candidate matches the existing order number.
- `scripts/migrateProductShipping.ts` skips processing when no products match the GROQ query and logs completion after processing.

Queries exclude valid states:
- `scripts/fix-order-number-format.ts` selects only orders whose `orderNumber` does not match `FAS-[0-9]{6}`.
- `scripts/migrateProductShipping.ts` selects only products where specific `shippingConfig` fields are undefined.

UI fallbacks mask missing data:
- UNKNOWN (no UI rendering in the listed files).

Known unknowns:
- UNKNOWN whether `pickUnique` is intended to accept optional candidates in script usage.
- UNKNOWN whether `NormalizedShippingConfig` is intended to allow nullable booleans and partial dimensions during migration.

## 7) API Routes & External SDK Boundaries

Errors:
- `scripts/sync-gmc-status.ts:82` TS2339 Property `productIssues` does not exist on type `Schema$Product`.
- `scripts/sync-gmc-status.ts:82` TS7006 Parameter `issue` implicitly has an `any` type.
- `scripts/sync-gmc-status.ts:88` TS2339 Property `destinationStatuses` does not exist on type `Schema$Product`.
- `scripts/sync-gmc-status.ts:89` TS7006 Parameter `dest` implicitly has an `any` type.
- `src/pages/api/create-shipping-label.ts:197` TS2576 Property `buy` does not exist on type `Shipment` (suggests static `Shipment.buy`).
- `src/pages/api/merge-label-packing-slip.ts:59` TS2345 `Buffer` is not assignable to `BodyInit`.

Expected source of missing type/property:
- `googleapis` `content` API product types in `scripts/sync-gmc-status.ts`.
- `@easypost/api` `Shipment` type in `src/pages/api/create-shipping-label.ts` (via `netlify/lib/easypostClient.ts`).
- Fetch `Response` `BodyInit` type in `src/pages/api/merge-label-packing-slip.ts`.

Observed actual source (or absence):
- `scripts/sync-gmc-status.ts` reads `productIssues` and `destinationStatuses` from `Schema$Product`, but these properties are not defined in the types.
- `create-shipping-label.ts` calls `shipment.buy(...)` on an instance returned by `Shipment.create`, but the type does not include an instance `buy` method.
- `merge-label-packing-slip.ts` passes a `Buffer` from `mergePdfBuffers` to `new Response(...)`.

Logic executes in all cases:
- `sync-gmc-status.ts` iterates through products and computes approval/issue status even when `productIssues` and `destinationStatuses` are absent (empty arrays are used).
- `create-shipping-label.ts` proceeds to `shipment.buy(...)` after selecting a rate and throws if none are available.

Queries exclude valid states:
- UNKNOWN (no query logic observed in the listed files).

UI fallbacks mask missing data:
- UNKNOWN (no UI rendering in the listed files).

Known unknowns:
- UNKNOWN whether `productIssues` and `destinationStatuses` exist in the runtime Google Content API responses for the API version used.
- UNKNOWN whether the EasyPost SDK version used at runtime exposes an instance `Shipment.buy` method.
- UNKNOWN whether `Response` in the target runtime accepts a `Buffer` payload without type adjustments.
