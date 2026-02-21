# Vendor Portal Keep Plan (Sanity-Aligned)

Last aligned: 2026-02-21

## Purpose
Keep Sanity as the vendor-facing communication workspace for salespeople while preserving architecture authority:
- Medusa owns all commerce state and workflows.
- Sanity owns vendor relationships, communication content, and read-only activity timelines.
- fas-cms-fresh remains UI/API consumer only.

## Hard Boundaries
- No direct transactional API writes from storefront to Sanity.
- No pricing, checkout, payment, order authority, or shipping authority in Sanity.
- Stripe and Shippo interactions stay in Medusa flow.
- Sanity timeline data is read-only event mirror sourced by webhooks.

## Allowed Direct Writes to Sanity (Essential Vendor DB Scope Only)
Direct API write is allowed only when absolutely essential for vendor relationship data:
- Vendor profile and account metadata.
- Salesperson ownership/assignment metadata.
- Communication preferences and marketing consent metadata.
- Non-transactional notes and relationship history.

Everything else must flow by webhook events from Medusa (or trusted integration relay).

## Vendor Workflow (Realigned)
1. Vendor builds cart/quote through storefront.
2. Commerce events are created in Medusa.
3. Medusa emits signed webhook events to sync activity into Sanity timeline.
4. Salesperson communicates with vendor from Sanity using approved templates/content.
5. Payment and fulfillment updates remain Medusa-owned and arrive in Sanity as read-only timeline events.
6. Shipping/tracking updates arrive via Medusa-managed shipping flow and sync into Sanity timeline.

## Timeline Ownership Model
`invoice = order`, `cart = quote`

- `quote.created`: read-only timeline item in Sanity.
- `order.processing`: read-only timeline item in Sanity.
- `order.backordered`: timeline item + optional salesperson communication template in Sanity.
- `order.partially_fulfilled`: timeline item + optional salesperson communication template in Sanity.
- `order.fulfilled`: Medusa-driven fulfillment/payment workflow; Sanity receives read-only status.
- `payment.link.sent`: read-only timeline item in Sanity.
- `payment.received`: read-only timeline item in Sanity.
- `shipment.label.purchased`: read-only timeline item with tracking metadata.
- `shipment.in_transit`: read-only timeline item.
- `shipment.delivered`: read-only timeline item.
- `return.started`: read-only timeline item.
- `refund.completed`: read-only timeline item.

## Communications Model
- Sanity can initiate vendor communications for relationship updates and non-payment workflow messaging.
- Medusa/fas-dash handles payment-link and payment-confirmation communications.
- Sanity stores message content/log references for visibility, not payment/shipping authority state.

## Webhook-First Requirement
- Primary integration mode is webhooks into Sanity timeline.
- Polling/fetch fallback is acceptable only for retry/reconciliation.
- Any new direct API bridge to Sanity must be documented as exception with justification.

## Implementation Companion
Detailed event contract and endpoint checklist:
- `docs/SourceOfTruths/vendor-portal-webhook-contract.md`
