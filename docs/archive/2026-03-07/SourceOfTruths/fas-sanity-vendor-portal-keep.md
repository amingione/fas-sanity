# ARCHIVED DOCUMENT

This document is superseded by the canonical architecture package.

Use instead:
- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md
- docs/architecture/migration-status.md

---

# Vendor Portal Keep Plan (Sanity)

Last aligned: 2026-02-21

## Goal
Keep Sanity as the vendor communication workspace while Medusa remains the commerce engine.

## Ownership
- Medusa: products, pricing, inventory, cart, checkout, orders, payments, shipping.
- Sanity: vendor relationships, communication content, business documents, and mirrored activity timeline.
- fas-cms-fresh: storefront UI + API consumer.

## Account Separation
- Vendor/B2B account records live in Sanity vendor workspace schemas.
- Shopper customer commerce accounts and lifecycle state live in Medusa.
- Cross-links between systems use stable IDs and references, not duplicated transaction logic.

## What Can Be Written Directly to Sanity
Only non-transactional vendor relationship data:
- Vendor profile/account metadata.
- Salesperson assignment metadata.
- Communication preferences and consent metadata.
- Non-transactional notes/history.

Order/payment/shipping lifecycle state must come from webhook events.

## Vendor Workflow
1. Vendor creates quote/cart in storefront.
2. Medusa creates/updates commerce state.
3. Medusa sends signed webhook events.
4. Sanity stores timeline mirror events.
5. Salespeople communicate from Sanity using approved content/templates.

## Timeline Model
`invoice = order`, `cart = quote`

Core timeline events:
- `quote.created`
- `order.processing`
- `order.backordered`
- `order.partially_fulfilled`
- `order.fulfilled`
- `payment.link.sent`
- `payment.received`
- `shipment.label.purchased`
- `shipment.in_transit`
- `shipment.delivered`
- `return.started`
- `refund.completed`

## Integration Notes
- Use webhooks as the primary sync path.
- Polling is only for retry/reconciliation.
- Any direct API bridge for transactional state should be treated as temporary and documented.

## Companion Doc
- `docs/SourceOfTruths/vendor-portal-webhook-contract.md`
