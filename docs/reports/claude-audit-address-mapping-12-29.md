# Address Mapping Audit (Shipping + Billing)

## 1. Executive Summary
- Address shapes diverge across core documents: orders use `addressLine1`, customers use `street`, vendors use `street`/`zip`, invoices use `address_line1`, and abandoned checkouts use `line1` (see schema files).
- UI components assume inconsistent field names (e.g., `ShippingQuoteDialog` expects `shippingAddress.street1`, `CreateLabelWizard` expects `order.shippingAddress.street1`) while schemas store `street` or `addressLine1`, causing empty or missing prefill.
- Backfill utilities can write non-canonical address shapes into order documents (e.g., `scripts/backfill-fulfillment-package.ts` assigns `stripeSummary.shippingAddress` which uses `line1`/`line2`, not `addressLine1`), resulting in nulls where the UI expects values.
- Multiple normalization layers exist (`AddressAutocompleteInput`, `customerSnapshot`, `stripeSummary`, packing slip generation), but they are not centralized; inconsistent mappings lead to silent field drops.
- Invoice address schema (`billTo`/`shipTo`) is snake_case and differs from order/customer shapes; downstream PDF/label tooling normalizes it ad hoc.
- The canonical shipping address type exists (`shippingAddressType`), but some documents (order) inline the shape instead of reusing it, increasing drift risk.
- Shipping + billing address data is duplicated in several places (order, customer, invoice, vendor) without explicit contracts or unified mapping rules.

## 2. Canonical Address Contract (Proposed)
**Recommendation:** Use a single canonical internal shape for all stored Sanity documents (shipping + billing) and normalize external formats (Stripe, EasyPost) at the edges.

**Canonical shape (internal, camelCase):**
```
{
  name?: string
  email?: string
  phone?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}
```

**Storage approach:**
- **Embedded object** for addresses in documents (order, customer, vendor, invoice) to avoid reference churn and simplify writes from webhooks/backfills.
- **Normalization layer** required at all ingress/egress points (Stripe, EasyPost) to map snake_case and provider field names into this canonical object.

## 3. Inventory of Address Fields (Current Reality)
| Document/Type | Field path(s) | Shape (fields) | Source of truth |
|---|---|---|---|
| Order (document) | `shippingAddress` | `name, phone, email, addressLine1, addressLine2, city, state, postalCode, country` | Stripe checkout webhook + backfills | 
| Order (document) | `billingAddress` (hidden) | same as above | Stripe charge billing_details | 
| Customer (document) | `shippingAddress`, `billingAddress` | `name, street, city, state, postalCode, country` | customerSnapshot + manual entry | 
| Customer (document) | `addresses[]` | `label, street, city, state, zip, country` | customerSnapshot + manual entry | 
| Vendor (document) | `businessAddress`, `shippingAddress`, `shippingAddresses[]` | `street, address2, city, state, zip, country` | vendor application + manual entry | 
| Invoice (document) | `billTo`, `shipTo` | `name, email, phone, address_line1, address_line2, city_locality, state_province, postal_code, country_code` | manual invoice editor + backfills | 
| Abandoned Checkout (document) | `shippingAddress` | `name, line1, line2, city, state, postalCode, country` | Stripe session | 
| Shipping Label (document) | `ship_from`, `ship_to` | `address_line1, address_line2, city_locality, state_province, postal_code, country_code` | EasyPost | 
| Freight Quote (document) | `destination` | `shippingAddress` type | manual/ops | 
| Shipping Settings (singleton) | `senderAddress` | `street1, street2, city, state, zip, country` | ops | 
| Shipping Option Customer Address (object) | `address_line1, city_locality, state_province, postal_code, country_code` | EasyPost | 

## 4. Mismatch & Breakpoint Findings

### Schema mismatches
**Finding A1: Order vs Customer address field names diverge (addressLine1 vs street).**
- **Expected:** shared canonical shape across order/customer billing/shipping.
- **Actual:** order uses `addressLine1`; customer uses `street` (`customerBillingAddressType`).
- **Files:** `packages/sanity-config/src/schemaTypes/documents/order.tsx` (shippingAddress fields), `packages/sanity-config/src/schemaTypes/objects/customerBillingAddressType.ts`.
- **Impact:** cross-document mappings require manual normalization; components expecting one shape can silently lose data.

**Finding A2: Invoice address uses snake_case fields, separate from order/customer.**
- **Expected:** invoice addresses normalized to canonical shape or stored in consistent representation.
- **Actual:** `billTo`/`shipTo` use `address_line1`, `city_locality`, etc.
- **Files:** `packages/sanity-config/src/schemaTypes/objects/billToType.ts`, `packages/sanity-config/src/schemaTypes/objects/shipToType.ts`, `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx`.
- **Impact:** downstream consumers must translate each time; some consumers treat invoice addresses as order-style and miss fields.

**Finding A3: Abandoned checkout shippingAddress uses `line1/line2` while order uses `addressLine1/2`.**
- **Expected:** abandoned checkout snapshot matches order shipping schema.
- **Actual:** fields are `line1/line2`.
- **Files:** `packages/sanity-config/src/schemaTypes/documents/abandonedCheckout.ts`.
- **Impact:** any pipeline that reuses abandoned checkout data for orders requires translation.

**Finding A4: Vendor addresses use `zip` and `street` while customer uses `postalCode` and order uses `addressLine1`.**
- **Expected:** consistent address field set or mapped normalization.
- **Actual:** vendor uses `zip` and `street` across multiple fields.
- **Files:** `packages/sanity-config/src/schemaTypes/documents/vendor.ts`.
- **Impact:** vendor-to-invoice or vendor-to-shipping integrations must map; inconsistent field names risk missing postal codes.

### GROQ projection mismatches
**Finding B1: ShippingQuoteDialog expects `shippingAddress.street1` but customer schema uses `street`.**
- **Expected:** UI reads `shippingAddress.street` (or canonical field).
- **Actual:** UI reads `street1`/`street2`.
- **Files:** `packages/sanity-config/src/components/ShippingQuoteDialog.tsx` (query returns `shippingAddress`, component reads `street1`).
- **Impact:** auto-fill of customer address in quote dialog fails; user sees blank address.

**Finding B2: CreateLabelWizard expects `order.shippingAddress.street1`/`street2` while order schema uses `addressLine1`/`addressLine2`.**
- **Expected:** wizard pre-fills from `addressLine1`.
- **Actual:** wizard reads `street1`.
- **Files:** `packages/sanity-config/src/components/wizard/CreateLabelWizard.tsx`, `packages/sanity-config/src/schemaTypes/documents/order.tsx`.
- **Impact:** label wizard prefill is empty; manual entry required, increasing error risk.

### Transform/normalization mismatches
**Finding C1: stripeSummary uses `line1/line2`, but backfill copies it into `order.shippingAddress` unchanged.**
- **Expected:** stripeSummary mapping normalized to `addressLine1/2` when used to fill orders.
- **Actual:** `stripeSummary.normalizeAddress` outputs `line1/line2`, and `scripts/backfill-fulfillment-package.ts` copies it directly to `order.shippingAddress`.
- **Files:** `netlify/lib/stripeSummary.ts` (normalizeAddress), `scripts/backfill-fulfillment-package.ts` (assigns `stripeSummary.shippingAddress`).
- **Impact:** orders backfilled from stripeSummary miss `addressLine1` and therefore appear empty in UI and downstream label generation.

**Finding C2: Multiple normalization layers accept different field keys without a single shared contract.**
- **Expected:** one centralized `normalizeAddress` utility reused across ingestion and transforms.
- **Actual:** normalization is duplicated in `AddressAutocompleteInput`, `customerSnapshot`, `stripeSummary`, `create-shipping-label`, `easypostCreateLabel`, and `generatePackingSlips` with slight differences.
- **Files:** `packages/sanity-config/src/components/inputs/AddressAutocompleteInput.tsx`, `netlify/lib/customerSnapshot.ts`, `netlify/lib/stripeSummary.ts`, `src/pages/api/create-shipping-label.ts`, `netlify/functions/easypostCreateLabel.ts`, `netlify/functions/generatePackingSlips.ts`.
- **Impact:** inconsistent field mapping across flows leads to missing fields and hard-to-debug divergences.

### UI assumptions vs stored data
**Finding D1: Customers Overview formats addresses using `street/postalCode`, while addresses[] entries use `zip`.**
- **Expected:** address rendering handles `zip` or the schema uses `postalCode` everywhere.
- **Actual:** `customerAddressType` uses `zip` and `CustomersOverviewDashboard` expects `postalCode`.
- **Files:** `packages/sanity-config/src/schemaTypes/objects/customerAddressType.ts`, `packages/sanity-config/src/components/studio/CustomersOverviewDashboard.tsx`.
- **Impact:** customer address entries may display without ZIP/postal code in dashboards.

## 5. Tracing the Data Flow

### Shipping address flow (current)
1. **Stripe checkout webhook** writes `order.shippingAddress` with `addressLine1/2` and `postalCode` (`src/pages/api/webhooks/stripe-order.ts`).
2. **Order UI** renders `addressLine1/2` (`packages/sanity-config/src/views/orderView.tsx`).
3. **Label creation**:
   - CreateLabelWizard prefill uses `street1` (mismatch) (`packages/sanity-config/src/components/wizard/CreateLabelWizard.tsx`).
   - `easypostCreateLabel` converts `order.shippingAddress.addressLine1` to EasyPost `street1` (good) (`netlify/functions/easypostCreateLabel.ts`).
4. **Backfills** may set `order.shippingAddress` from `stripeSummary.shippingAddress` (line1/line2) without mapping (`scripts/backfill-fulfillment-package.ts`), causing missing canonical fields.

### Billing address flow (current)
1. **Stripe charge/backfills** map `billing_details.address` into `order.billingAddress.addressLine1` (`scripts/backfillOrders.ts`, `scripts/backfill-order-card-data.ts`).
2. **Customer snapshot** normalizes billing into `customer.billingAddress.street` (`netlify/lib/customerSnapshot.ts`), changing field names.
3. **Invoice** uses `billTo`/`shipTo` in snake_case (`packages/sanity-config/src/schemaTypes/documents/invoiceContent.tsx`, `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx`).
4. **Packing slips** normalize from invoice/order and accept both snake_case and camelCase (`netlify/functions/generatePackingSlips.ts`).

**Breakpoints:**
- order -> customer mapping changes `addressLine1` -> `street` and `postalCode` -> `postalCode` (ok) but diverges from invoice and vendor shapes.
- `stripeSummary` -> order backfill uses `line1/line2` without translation.
- UI components (`ShippingQuoteDialog`, `CreateLabelWizard`) assume `street1` even when schema uses `street` or `addressLine1`.

## 6. Fix Recommendations (No Code Yet)
1. **Adopt a canonical internal address shape** (`addressLine1`/`addressLine2` + `postalCode`) and formalize it in a shared type used by orders, customers, vendors, and invoices. Files to update: 
   - `packages/sanity-config/src/schemaTypes/documents/customer.ts`
   - `packages/sanity-config/src/schemaTypes/documents/vendor.ts`
   - `packages/sanity-config/src/schemaTypes/documents/invoiceContent.tsx`
   - `packages/sanity-config/src/schemaTypes/objects/customerBillingAddressType.ts`
   - `packages/sanity-config/src/schemaTypes/objects/customerAddressType.ts`
   - `packages/sanity-config/src/schemaTypes/objects/billToType.ts` and `packages/sanity-config/src/schemaTypes/objects/shipToType.ts` (or add normalized mirrors)
   - Migration required: transform `street`/`zip` fields to canonical `addressLine1`/`postalCode` and backfill existing docs.
2. **Centralize normalization** in a single utility (e.g., `normalizeAddress` in `netlify/lib/`) and reuse it in: 
   - `netlify/lib/customerSnapshot.ts`
   - `netlify/lib/stripeSummary.ts`
   - `src/pages/api/create-shipping-label.ts`
   - `netlify/functions/easypostCreateLabel.ts`
   - `netlify/functions/generatePackingSlips.ts`
3. **Fix UI assumptions** to read canonical fields:
   - `packages/sanity-config/src/components/ShippingQuoteDialog.tsx` should use `shippingAddress.street` (or canonical `addressLine1`).
   - `packages/sanity-config/src/components/wizard/CreateLabelWizard.tsx` should use `order.shippingAddress.addressLine1`.
4. **Prevent backfills from writing non-canonical shapes**:
   - Normalize `stripeSummary.shippingAddress` before writing to `order.shippingAddress` (e.g., in `scripts/backfill-fulfillment-package.ts`).
5. **Add migration/backfill** for existing orders/customers/vendors/invoices to align on the canonical shape. Include dry-run support and validation reporting.

## 7. Decision-Ready Checklist for Claude
- [ ] Approve schema unification to canonical address shape (affects customer/vendor/invoice schemas).
- [ ] Approve migration/backfill of existing address data to canonical fields.
- [ ] Approve UI updates to read canonical fields (`ShippingQuoteDialog`, `CreateLabelWizard`).
- [ ] Approve centralized normalization utility and refactors of existing address transforms.

## 8. Completion Contract

**Audit Method**
- Searched for address terms: `shippingAddress`, `billingAddress`, `address`, `street`, `postal`, `zip`, `city`, `state`, `country`.
- Enumerated schema definitions and address-bearing object types.
- Enumerated GROQ projections and API/function transforms that map address fields.
- Cross-checked schema shapes against UI and utility consumers.

**Audited schema files**
- `packages/sanity-config/src/schemaTypes/documents/order.tsx`
- `packages/sanity-config/src/schemaTypes/documents/customer.ts`
- `packages/sanity-config/src/schemaTypes/documents/vendor.ts`
- `packages/sanity-config/src/schemaTypes/documents/abandonedCheckout.ts`
- `packages/sanity-config/src/schemaTypes/documents/freightQuote.ts`
- `packages/sanity-config/src/schemaTypes/documents/invoiceContent.tsx`
- `packages/sanity-config/src/schemaTypes/documents/shippingLabel.tsx`
- `packages/sanity-config/src/schemaTypes/objects/shippingAddressType.ts`
- `packages/sanity-config/src/schemaTypes/objects/customerBillingAddressType.ts`
- `packages/sanity-config/src/schemaTypes/objects/customerAddressType.ts`
- `packages/sanity-config/src/schemaTypes/objects/billToType.ts`
- `packages/sanity-config/src/schemaTypes/objects/shipToType.ts`
- `packages/sanity-config/src/schemaTypes/objects/shipToSnakeType.ts`
- `packages/sanity-config/src/schemaTypes/objects/shipFromType.ts`
- `packages/sanity-config/src/schemaTypes/objects/shippingOptionCustomerAddressType.ts`
- `packages/sanity-config/src/schemaTypes/singletons/shippingSettings.ts`

**Audited queries (GROQ)**
- `packages/sanity-config/src/components/inputs/AddressAutocompleteInput.tsx`: `ADDRESS_QUERY` pulls `customer.shippingAddress`, `customer.billingAddress`, `order.shippingAddress`.
- `packages/sanity-config/src/components/ShippingQuoteDialog.tsx`: customer search query returns `shippingAddress`.
- `packages/sanity-config/src/components/studio/CustomersOverviewDashboard.tsx`: customer/overview queries with `shippingAddress{city,state,postalCode,country}` and `billingAddress{...}`.
- `netlify/lib/customerSnapshot.ts`: customer fetch queries (`shippingAddress`, `address`, `addresses`).
- `src/pages/api/create-shipping-label.ts`: `ORDER_FOR_LABEL_QUERY` includes `shippingAddress` + `packageDimensions`.
- `netlify/functions/generatePackingSlips.ts`: invoice/order queries (invoice `billTo`, `shipTo`, order `shippingAddress`, `billingAddress`).

**Audited address transforms / utilities**
- `netlify/lib/customerSnapshot.ts` (`normalizeShippingAddress`, customer patching)
- `netlify/lib/stripeSummary.ts` (`normalizeAddress`)
- `src/pages/api/webhooks/stripe-order.ts` (Stripe session -> order shippingAddress)
- `src/pages/api/create-shipping-label.ts` (`normalizeAddress`, `mapToEasyPostAddress`)
- `netlify/functions/easypostCreateLabel.ts` (`toEasyPostAddress`, payload mapping)
- `netlify/functions/generatePackingSlips.ts` (`normalizeAddress`)
- `scripts/backfillOrders.ts` (billingAddress backfill)
- `scripts/backfill-order-card-data.ts` (billingAddress normalization)
- `scripts/backfill-fulfillment-package.ts` (stripeSummary -> order.shippingAddress)
- `scripts/migrate-order-fields.ts` / `scripts/migrate-to-clean-order-schema.ts` (shippingAddress migrations)

**Checksums**
- `ReportVersion`: 1.0.0
- `RepoHead`: 33360ba9294cfd8d7d3a7cd601eceab0bbab1ba5
- `AuditScopeHash`: c73db7593745492ad195368ac88bf0a97a96a2f92d8cd376895721c614b937f5
- `FindingCount`: 9
