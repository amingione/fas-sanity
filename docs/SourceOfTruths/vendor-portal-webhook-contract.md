# Vendor Portal Webhook Contract (Webhook-First)

Last aligned: 2026-02-21
Applies to: `fas-medusa`, `fas-cms-fresh`, `fas-sanity`

## Goal
Ensure vendor portal timeline and communications in Sanity are fed by authoritative commerce events, not direct transactional writes.

## Authority
- Medusa: commerce source of truth (quote/order/payment/fulfillment/shipping/refund state).
- Sanity: vendor relationship workspace + read-only mirrored timeline.
- fas-cms-fresh: frontend/API consumer only.

## Contract Rules
- All commerce lifecycle updates to Sanity must arrive through signed webhook events.
- Event ingestion in Sanity must be idempotent (`event_id` uniqueness).
- Event ordering must tolerate out-of-order delivery (`occurred_at` + sequence per aggregate).
- No event may grant Sanity commerce authority.

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
- `vendor.message.sent` (optional visibility event for timeline)
- `vendor.message.opened` (optional visibility event from email provider relay)

## Minimum `data` Fields by Domain
- Quote/order events: `quote_number` or `order_number`, `status`, `salesperson_id`.
- Payment events: `payment_link_id` or `invoice_id`, `payment_status`, `amount`, `currency`.
- Shipment events: `tracking_number`, `carrier`, `service`, `shipment_status`.
- Return/refund events: `return_id` or `refund_id`, `reason`, `amount`, `currency`.
- Message visibility events: `message_id`, `template_id`, `delivery_status`.

## Security + Reliability Requirements
- HMAC verification using shared secret per source.
- Reject unsigned/invalid events with `401`.
- Idempotency store in Sanity integration layer keyed by `event_id`.
- Retry policy from sender: exponential backoff + DLQ after max attempts.
- Receiver returns `2xx` only after durable write.
- Replay endpoint for manual recovery.

## Cross-Repo Endpoint Checklist

## `fas-medusa`
- [ ] Emit canonical vendor events at workflow transitions.
- [ ] Add webhook dispatcher module for Sanity timeline target.
- [ ] Sign payload with `VENDOR_WEBHOOK_SECRET`.
- [ ] Include `event_id`, `occurred_at`, and `version`.
- [ ] Add retry + dead-letter handling.
- [ ] Add replay command by date range and by aggregate id.

Suggested endpoints/jobs:
- `POST /internal/webhooks/vendor-timeline-dispatch` (internal dispatcher)
- `POST /admin/vendor-events/replay` (admin secured replay)

## `fas-sanity`
- [ ] Add webhook receiver for vendor timeline events.
- [ ] Verify signature and version.
- [ ] Enforce idempotency (`event_id` uniqueness).
- [ ] Write timeline entries as read-only mirror records.
- [ ] Map `aggregate.vendor_id` to vendor/salesperson references.
- [ ] Provide reconciliation report for missing sequences.

Suggested endpoint/functions:
- `/.netlify/functions/vendor-timeline-webhook`
- `/.netlify/functions/vendor-timeline-reconcile`

## `fas-cms-fresh`
- [ ] Remove direct transactional writes to Sanity for vendor order/payment/shipping state.
- [ ] Keep only non-transactional vendor profile/relationship writes if required.
- [ ] Route all commerce actions to Medusa APIs.
- [ ] Expose no endpoint that mutates Sanity order/payment/shipping authority fields.

## Sanity Data Shape (Read-Only Timeline)
- `vendorActivityEvent.eventId` (unique)
- `vendorActivityEvent.eventType`
- `vendorActivityEvent.occurredAt`
- `vendorActivityEvent.vendorRef`
- `vendorActivityEvent.orderRef` (optional reference/identifier only)
- `vendorActivityEvent.summary`
- `vendorActivityEvent.payload` (non-authoritative snapshot)
- `vendorActivityEvent.readOnly = true`

## Exception Policy
Direct write bypassing webhook flow is allowed only for essential vendor DB operations:
- Vendor profile fields
- Salesperson assignment
- Relationship notes/preferences/consent

Any exception must include:
- reason
- scope
- expiration date
- owner

## Acceptance Criteria
- No direct Sanity transactional mutations from storefront/vendor APIs.
- Timeline is fully event-driven and read-only for commerce state.
- Backfill/replay can reconstruct timeline for a vendor/order range.
- Signature failures and duplicates are observable in logs/metrics.
