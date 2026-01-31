# Sanity as Office Dashboard – Role Definition

Status: **Target end-state (Medusa-first)**  
Scope: Sanity Studio (internal ops UI), Sanity datasets as **mirrors + annotations**

## Purpose

Sanity exists to help humans run the business:

- Order fulfillment dashboard (queue, tracking, exceptions)
- Customer database (notes, tags, segmentation context)
- Marketing & content management (SEO, images, storytelling)
- Reporting & analytics snapshots (read-only mirrors, aggregations)

Sanity is **not** a commerce engine.

## Authority Model (Non-Negotiable)

### Medusa owns (authoritative)

- Products, variants, pricing, discounts
- Inventory levels and reservation
- Cart, checkout, shipping options, tax calculation
- Order creation, payment lifecycle, refunds/cancellations (system of record)
- Shippo and Stripe integrations (via Medusa)

### Sanity owns (authoritative UI + records)

- Content-only product enrichment (copy, images, SEO, marketing fields)
- Operational annotations (internal notes, flags, attachments)
- Fulfillment workflow context (who/when/why notes, exception tracking)
- Historical snapshots / reporting fields (explicitly marked as **read-only mirrors**)

## What Sanity may store (allowed)

- Read-only mirrors of Medusa orders/customers (IDs, totals, line items, fulfillment snapshots)
- Tracking numbers (as annotations, unless/until a Medusa sync writes them)
- Internal notes (ops/support)
- Manual flags: “needs review”, “fraud review”, “VIP handling”, “split shipment required”
- Attachments: packing slips, label PDFs, freight quote PDFs

## What Sanity must never calculate (prohibited)

Sanity must not compute, enforce, or be the authority for:

- Prices, discounts, coupons, promotions at checkout
- Tax amounts / tax rules
- Shipping rates, shipping selection, carrier/service pricing
- Cart totals, order totals, payment capture/refund state
- Inventory availability or reservations

If a field exists that resembles the above, it must be treated as **legacy/transitional** or **read-only mirror**, and must not be relied on for live commerce decisions.

## Day-to-day staff usage (intended workflow)

### Orders

- Use Sanity to:
  - View order status + totals (read-only mirrors)
  - Add ops notes, set “needs review”, attach docs
  - Record tracking numbers as an annotation (until Medusa sync is canonical)
- Do **not** use Sanity to:
  - Change totals, apply discounts, change payment status, or “fix” shipping/tax amounts

### Fulfillment

- Treat Sanity as the “fulfillment workbench”:
  - triage queue (needs review / errors / awaiting label)
  - see shipping snapshots and packaging hints
  - keep internal audit notes
- Execution of fulfillment (labels, tracking updates) must occur in Medusa.
  - Sanity can display state and record notes about requested actions.

### Customers

- Use Sanity to:
  - add support notes, tags, and segmentation context
  - review order history mirrors
- Do **not** use Sanity to:
  - override Medusa customer identity or create commerce-side entitlements/discounts

## Ops Console Model (UI behavior, not backend logic)

This section defines how Sanity should operate as a Shopify Admin / QuickBooks-style console.
Implementation can be done later via desk structure, custom views, and filtered lists.

### Order list views (recommended)

- **New / Needs Review**: `opsFlags.needsReview == true`
- **Paid / Awaiting Fulfillment**: `status == "paid"` and not shipped/delivered
- **Shipping Exceptions**: `shippingStatus.status == "failure"` or `fulfillmentError` present
- **In Transit**: `shippingStatus.status in ["in_transit","out_for_delivery"]`
- **Delivered**: `shippingStatus.status == "delivered"`

### Fulfillment status + tracking

- Sanity displays Medusa-derived fulfillment/shipping mirrors (read-only).
- Sanity may store manual tracking as an annotation only (with clear “may be overwritten” labeling).

### Refund / adjustment requests

- Sanity records the request as notes/flags (who/when/why), not as execution logic.
- Execution occurs in Medusa; resulting state is mirrored back into Sanity.

## Implementation Notes (UI semantics)

- Any field that mirrors Medusa must be labeled “Read-only mirror (from Medusa)” and set to `readOnly` in schema where appropriate.
- Any operational field must be labeled “Ops annotation (does not affect commerce)” and must not be consumed by checkout/pricing logic.

## Related

- Schema audit and field classification: `fas-sanity/docs/audits/sanity-office-dashboard-schema-audit-2026-01-31.md`
