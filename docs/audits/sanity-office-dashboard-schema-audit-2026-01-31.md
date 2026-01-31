# Sanity Office Dashboard – Schema Audit (Step 2)

Date: 2026-01-31  
Primary repo: `fas-sanity` (schema semantics + documentation only)  
Goal: Refactor Sanity into an **ops/office dashboard** while keeping **Medusa as the commerce engine**.

This is **non-destructive**:
- No schema deletions
- No field removals
- No backend/refund/checkout logic changes
- Only schema **annotations** (descriptions, `readOnly`, small semantics fields) + documentation

---

## Classification Key

- **Authoritative UI Field**: editable by staff; must not affect commerce math/state in Medusa
- **Read-Only Mirror**: copied from Medusa (or legacy systems during transition); never hand-edited
- **Derived / Display-Only**: computed/aggregated for reporting or UI convenience; never used as checkout authority
- **Legacy / Transitional**: exists for migration compatibility; should be phased out behind Medusa

---

# 1) Schema Classification Summary (by document type)

## `order` (`fas-sanity/packages/sanity-config/src/schemaTypes/documents/order.tsx`)

- **Authoritative UI Fields**
  - `opsInternalNotes`, `customerInstructions`
  - `opsFlags.*` (new: `needsReview`, `refundRequested`, etc.)
  - `orderDocuments[]` (attachments)
- **Read-Only Mirror**
  - `status`, `paymentStatus`
  - totals: `totalAmount`, `amountSubtotal`, `amountTax`, `amountShipping`, `amountDiscount`
  - identifiers: `medusaOrderId`, `medusaCartId`, `stripeSessionId`, `paymentIntentId`, etc.
  - line items: `cart[]`
  - shipping snapshot fields: `weight`, `dimensions`, `shippingAddress`, `shippingStatus`, `shippingLog`
- **Derived / Display-Only**
  - custom header component (`orderHeaderDisplay`) and any preview-derived workflow indicators
- **Legacy / Transitional**
  - Stripe-specific hidden fields (`stripeSummary`, legacy shipping quote IDs)
  - `wholesaleDetails` (explicitly labeled transitional)

Change applied (UI semantics only):
- Marked `status` and `cart` as read-only mirrors.
- Added `source` + `authoritative` semantics (read-only).
- Added `opsFlags` for triage without affecting commerce.
- Made `trackingNumber` editable as an **ops annotation** (explicitly non-authoritative).

## `customer` (`fas-sanity/packages/sanity-config/src/schemaTypes/documents/customer.ts`)

- **Authoritative UI Fields**
  - `customerNotes`
  - marketing preferences (opt-in/out annotations): `emailMarketing.*`
  - staff-managed communication preferences
- **Read-Only Mirror**
  - order summary arrays: `orders[]`, `quotes[]` (now explicitly read-only)
  - Stripe linkage fields: `stripeCustomerId`, `stripeLastSyncedAt`, etc.
  - derived counters: `totalOrders`, `lastOrderDate`, etc. (read-only)
- **Derived / Display-Only**
  - `segment`, `lifetimeSpend`, `lifetimeValue` (explicitly labeled as non-authoritative KPIs)
- **Legacy / Transitional**
  - Stripe discount records: `discounts[]` (now read-only and labeled legacy)
  - `customerStatus` (hidden + read-only; labeled legacy/derived)

Change applied (UI semantics only):
- Added hidden `medusaCustomerId`, `source`, and `authoritative` markers for future linkage.
- Converted Stripe discounts list to read-only and labeled as legacy.
- Labeled KPI fields as display-only (not commerce authority).

## `product` (`fas-sanity/packages/sanity-config/src/schemaTypes/documents/product.ts`)

Sanity product docs currently contain commerce-adjacent fields (pricing, shipping attributes, inventory). Step 2 does not delete them; it **relabels + restricts** them when a product is linked to Medusa.

- **Authoritative UI Fields**
  - content/SEO fields (copy, images, metadata)
  - `specialShippingNotes` (instructions/notes only)
- **Read-Only Mirror (when linked to Medusa)**
  - `price`, `onSale`, sale/discount helpers
  - wholesale pricing fields
  - `shippingConfig` (legacy shipping attributes)
  - inventory toggles/counts (`trackInventory`, `manualInventoryCount`)
- **Derived / Display-Only**
  - `shippingPreview` (explicitly “preview only”)
- **Legacy / Transitional**
  - any pricing/shipping/inventory fields used by pre-Medusa flows

Change applied (UI semantics only):
- Introduced `isMedusaBacked(document)` helper and made commerce-adjacent fields conditionally read-only when `medusaProductId` or `medusaVariantId` is present.
- Updated descriptions to clearly state Medusa authority.

## `checkoutSession` (`fas-sanity/packages/sanity-config/src/schemaTypes/documents/checkoutSession.ts`)

- **Read-Only Mirror**
  - Entire document is treated as a legacy Stripe snapshot for abandoned cart visibility.
  - Cart items, totals, shipping options are explicitly non-authoritative.

Change applied:
- Marked main fields as read-only and clarified that Medusa owns checkout/shipping/tax.

## `promotion` (`fas-sanity/packages/sanity-config/src/schemaTypes/documents/promotion.ts`)

- **Authoritative UI Fields**
  - marketing schedule fields (`active`, `validFrom`, `validUntil`)
  - descriptive rule text (`conditions.rules[]`)
- **Legacy / Transitional**
  - `code`, `discountType`, `discountValue` are now explicitly labeled as **marketing metadata**, not checkout enforcement.

Change applied:
- Added strong descriptions indicating checkout discounts are enforced in Medusa.

## `stripeWebhook` (`fas-sanity/packages/sanity-config/src/schemaTypes/documents/stripeWebhook.ts`)

- **Authoritative UI Fields**
  - `summary` (human label)
  - `opsNotes` (new: internal-only notes)
- **Read-Only Mirror**
  - status/event identifiers, payload fields, Stripe context and relations are now read-only.

Change applied:
- Reframed as an ops log (not commerce authority) and made most fields read-only.

## `shippingAddress` object (`fas-sanity/packages/sanity-config/src/schemaTypes/objects/shippingAddressType.ts`)

- **Read-Only Mirror / Ops Snapshot**
  - stored for office visibility; should not be treated as a shipping/tax authority.

Change applied:
- Added description clarifying it does not recalculate commerce.

---

# 2) Annotated Recommendations (Per Schema)

## Order

- Keep ops edits limited to: notes, flags, attachments, operational annotations.
- Any future “actions” in Studio should become **requests** that call Medusa admin workflows, then mirror back the resulting state.
- Follow-up (later phase): add explicit “ops-only” status fields if needed (e.g., `opsWorkflowStatus`) rather than editing `status`.

## Customer

- Treat identity and commerce history as Medusa-owned; Sanity additions should be notes/tags/segments only.
- Follow-up (later phase): standardize a Medusa → Sanity customer mirror process to populate `medusaCustomerId` and lock identity fields if desired.

## Product

- Keep Sanity focused on content; treat pricing/shipping/inventory as mirrors when Medusa IDs exist.
- Follow-up (later phase): migrate remaining dependencies (Merchant feeds, shipping previews) to consume Medusa-owned product attributes.

## Checkout Session

- Keep as read-only for historical/abandonment reporting.
- Follow-up (later phase): rename or relocate in desk structure to “Legacy / Stripe” to avoid implying authority.

## Promotion

- Keep as marketing copy/schedule.
- Follow-up (later phase): create a “Medusa Discount Mapping” reference (promotion → Medusa discount code) so staff can manage campaigns without inventing checkout logic in Sanity.

## Stripe Webhook Logs

- Treat as immutable audit trail.
- Follow-up (later phase): ensure Stripe webhooks ultimately terminate in Medusa, with Sanity receiving only mirrored state/events.

---

# 3) Risks / Follow-ups (Later Phases)

- **Legacy commerce fields still exist in Sanity** (pricing, shippingConfig, inventory): Step 2 makes them clearly non-authoritative and conditionally read-only when Medusa-linked, but does not remove them.
- **Sanity actions may still trigger external side effects** (refund/cancel/checkout helpers exist in Netlify functions and Studio actions): Step 2 does not modify those; later phases should re-route execution to Medusa.
- **Customer KPIs (LTV/segment)** remain as derived fields: acceptable for reporting, but must not be used to gate pricing/discount logic outside Medusa.

