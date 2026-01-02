# Phase 7 Local Runbook (Shim-Free)

This workflow uses the local functions server to avoid Netlify plugin/shim issues.

Prereqs

- `.env` or `.env.development.local` includes:
  - `EASYPOST_API_KEY`
  - `EASYPOST_WEBHOOK_SECRET`
  - `STRIPE_WEBHOOK_SECRET`
  - `RESEND_WEBHOOK_SECRET`

Start local functions server (shim-free)

```bash
pnpm netlify:functions-local
```

Functions are available at `http://localhost:8888/.netlify/functions/*`.

## 7.1 Stripe Webhook Event Logging

Terminal A:

```bash
stripe listen --forward-to localhost:8888/.netlify/functions/stripeWebhook
```

Terminal B:

```bash
stripe trigger checkout.session.completed
```

Verify in Sanity:

- `stripeWebhookEvent` created with `processingStatus=completed`
- Order + invoice created; order has `sourceInvoice`

## 7.2 EasyPost Label Creation

Create a test order in Sanity with:

- Shipping address
- `weight.value` (e.g., `2`)
- `dimensions.length/width/height` (e.g., `12/10/8`)

Call label function:

```bash
curl -X POST http://localhost:8888/.netlify/functions/create-shipping-label \
  -H "Content-Type: application/json" \
  -d '{"orderId":"ORDER_ID_HERE","serviceLevel":"cheapest"}'
```

Verify in Sanity:

- `fulfillmentStatus`: `pending → creating_label → label_created`
- `trackingNumber`, `carrier`, `service`, `shippingLabelUrl` filled
- new `shippingLabel` doc created

## 7.3 EasyPost Webhook

```bash
payload='{"id":"evt_test_123","description":"tracker.updated","result":{"object":"Tracker","tracking_code":"TRACKING_NUMBER","status":"in_transit","tracking_details":[]}}'
sig=$(printf "%s" "$payload" | openssl dgst -sha256 -hmac "$EASYPOST_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST http://localhost:8888/.netlify/functions/easypost-webhook \
  -H "Content-Type: application/json" \
  -H "X-EasyPost-Signature: $sig" \
  -d "$payload"
```

Verify in Sanity:

- Order `trackingStatus` / `trackingUpdatedAt` updated
- `easypostWebhookEvent` created with `processingStatus=completed`

## 7.4 Resend Email Webhook

- Send a test email (use `sendCustomerEmail` or your existing sendEmail call).
- Trigger Resend events from the dashboard.
- Verify `emailLog` updates: `sentAt`, `deliveredAt`, `openedAt`, `clickEvents`, etc.
