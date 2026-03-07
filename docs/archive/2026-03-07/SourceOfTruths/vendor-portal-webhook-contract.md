# ARCHIVED DOCUMENT

This document is superseded by the canonical architecture package.

Use instead:
- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md
- docs/architecture/migration-status.md

---

# Vendor Portal Webhook Contract

Last aligned: 2026-02-21
Applies to: `fas-medusa`, `fas-cms-fresh`, `fas-sanity`

## Goal
Feed Sanity vendor timeline/communications from Medusa commerce events instead of direct transactional writes.

## Ownership
- Medusa: source of commerce state (quote/order/payment/fulfillment/shipping/refund).
- Sanity: vendor relationship workspace + mirrored timeline for vendor ops visibility.
- fas-cms-fresh: frontend/API consumer.

## Event Rules
- Commerce lifecycle updates to Sanity are sent by signed webhook events.
- Receiver is idempotent by `event_id`.
- Receiver supports out-of-order delivery (`occurred_at` + sequence per aggregate).
- Events do not grant commerce authority to Sanity.
- Vendor account/profile/document data can be managed in Sanity outside this event stream.

## Canonical Event Envelope
```json
{
  "event_id": "evt_01JXXXX",
  "event_type": "vendor.order.fulfilled",
  "occurred_at": "2026-02-21T18:40:20.000Z",
  "source": "fas-medusa",
  "version": "2026-02-21.v1",
  "aggregate": {
    "type": "order",
    "id": "order_01JXXXX",
    "vendor_id": "vendor_abc123"
  },
  "data": {},
  "signature": "HMAC_SHA256_HEX"
}
```

## Required Event Types
- `vendor.quote.created`
- `vendor.order.processing`
- `vendor.order.backordered`
- `vendor.order.partially_fulfilled`
- `vendor.order.fulfilled`
- `vendor.payment.link_sent`
- `vendor.payment.received`
- `vendor.shipment.label_purchased`
- `vendor.shipment.in_transit`
- `vendor.shipment.delivered`
- `vendor.return.started`
- `vendor.refund.completed`
- `vendor.message.sent` (optional)
- `vendor.message.opened` (optional)

## Minimum `data` Fields
- Quote/order: `quote_number` or `order_number`, `status`, `salesperson_id`.
- Payment: `payment_link_id` or `invoice_id`, `payment_status`, `amount`, `currency`.
- Shipment: `tracking_number`, `carrier`, `service`, `shipment_status`.
- Return/refund: `return_id` or `refund_id`, `reason`, `amount`, `currency`.
- Message visibility: `message_id`, `template_id`, `delivery_status`.

## Delivery Requirements
- HMAC verify with shared secret.
- Reject invalid signature with `401`.
- Store/process idempotently by `event_id`.
- Sender retries with backoff and dead-letter handling.
- Receiver returns `2xx` only after durable write.
- Support replay for recovery.

## Cross-Repo Checklist

### `fas-medusa`
- [ ] Emit canonical vendor events at workflow transitions.
- [ ] Add Sanity timeline webhook dispatcher.
- [ ] Sign payload with `VENDOR_WEBHOOK_SECRET`.
- [ ] Include `event_id`, `occurred_at`, `version`.
- [ ] Add retry + dead-letter handling.
- [ ] Add replay by date range and aggregate id.

Suggested endpoints/jobs:
- `POST /internal/webhooks/vendor-timeline-dispatch`
- `POST /admin/vendor-events/replay`

### `fas-sanity`
- [ ] Add vendor timeline webhook receiver.
- [ ] Verify signature and version.
- [ ] Enforce idempotency (`event_id` uniqueness).
- [ ] Write read-only timeline mirror records.
- [ ] Map `aggregate.vendor_id` to vendor/salesperson refs.
- [ ] Provide reconciliation report for missing sequences.

Suggested endpoint/functions:
- `/.netlify/functions/vendor-timeline-webhook`
- `/.netlify/functions/vendor-timeline-reconcile`

### `fas-cms-fresh`
- [ ] Remove direct transactional writes to Sanity for order/payment/shipping state.
- [ ] Keep only non-transactional vendor relationship writes where needed.
- [ ] Route commerce actions to Medusa APIs.
- [ ] Do not expose endpoints that mutate Sanity commerce-authority fields.

## Sanity Timeline Shape
- `vendorActivityEvent.eventId` (unique)
- `vendorActivityEvent.eventType`
- `vendorActivityEvent.occurredAt`
- `vendorActivityEvent.vendorRef`
- `vendorActivityEvent.orderRef` (optional)
- `vendorActivityEvent.summary`
- `vendorActivityEvent.payload` (snapshot only)
- `vendorActivityEvent.readOnly = true`

## Exceptions
Direct writes that bypass webhook flow are limited to vendor relationship operations:
- Vendor profile fields
- Salesperson assignment
- Relationship notes/preferences/consent
- Vendor business documents and communication records

For each exception, record: reason, scope, expiration date, owner.

## Done Criteria
- No direct transactional Sanity mutations from storefront/vendor APIs.
- Timeline is event-driven and read-only for commerce state.
- Replay/backfill can rebuild timeline for vendor/order ranges.
- Signature failures and duplicates are visible in logs/metrics.
