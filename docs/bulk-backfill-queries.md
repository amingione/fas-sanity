# Bulk Backfill GROQ Helpers

Pre-filled snippets for the bulk backfill flows so you can paste them straight into Sanity Vision (or the CLI) when spot-checking results. Adjust the trailing slice (`[0...N]`) or add filters as needed. For the first page use an empty cursor (`""`); to paginate, replace it with the last `_id` you saw.

---

## Customers (`netlify/functions/backfillCustomers.ts`)

```groq
*[
  _type == "customer" && _id > ""
] | order(_id) {
  _id,
  userId,
  roles,
  updatedAt,
  emailOptIn,
  marketingOptIn,
  textOptIn
}[0...200]
```

**Resume pagination**  
Set `""` to the last processed `_id`, e.g. `_id > "02c2be5f-..."`.

---

## Orders (`netlify/functions/backfillOrders.ts`)

```groq
*[
  _type == "order" && _id > ""
] | order(_id) {
  _id,
  cart,
  customerRef,
  customer,
  customerEmail,
  slug,
  stripeSessionId,
  orderNumber,
  customerName,
  shippingAddress
}[0...100]
```

**Resume pagination**  
Swap the `""` with the previous `_id`, matching the cursor the function returns/logs.

---

## Invoices (`netlify/functions/backfillInvoices.ts`)

```groq
*[
  _type == "invoice" && _id > ""
] | order(_id) {
  _id,
  lineItems,
  customerRef,
  customer,
  orderRef,
  order,
  invoiceNumber,
  orderNumber,
  stripeSessionId,
  billTo,
  shipTo,
  taxRate,
  title,
  customerEmail,
  amountSubtotal,
  amountTax,
  invoiceDate,
  dueDate,
  _createdAt
}[0...100]
```

**Resume pagination**  
Update the cursor to the last `_id` you handled.

---

## Order Shipping Reprocessor (`scripts/backfill-order-shipping.ts`)

Use this when orders with Stripe sessions are missing packing slips, carrier info, or service codes.

```groq
*[
  _type == "order"
  && defined(stripeSessionId)
  && (
    !defined(selectedService)
    || !defined(selectedService.serviceCode)
    || !defined(packingSlipUrl)
    || !defined(shippingCarrier)
  )
] | order(_createdAt asc) {
  _id,
  orderNumber,
  stripeSessionId,
  packingSlipUrl,
  shippingCarrier,
  selectedService
}[0...50]
```

Run the script with `pnpm tsx scripts/backfill-order-shipping.ts 50` (limit optional). It loops the query above and replays `reprocessStripeSession`.

---

## Payment Failure Audit (`scripts/backfill-payment-failures.ts`)

```groq
*[
  _type == "order"
  && (defined(paymentIntentId) || defined(stripeSessionId))
  && (
    !defined(paymentFailureCode) || paymentFailureCode == ""
    || !defined(paymentFailureMessage) || paymentFailureMessage == ""
  )
  && (
    !defined(paymentStatus) || paymentStatus in [
      "requires_payment_method",
      "requires_confirmation",
      "requires_action",
      "requires_capture",
      "processing",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "unpaid",
      "past_due",
      "requires_source",
      "requires_source_action",
      "requires_customer_action"
    ]
  )
] | order(_createdAt asc) {
  _id,
  orderNumber,
  paymentIntentId,
  stripeSessionId,
  paymentStatus,
  status,
  paymentFailureCode,
  paymentFailureMessage,
  invoiceRef
}
```

To limit by ID/number, add `&& _id == "…"`, `&& orderNumber == "FAS-000123"`, or supply the script flags `--order`, `--order-number`, `--limit`, `--dry-run`.

---

### Optional: Triggering the Backfill Functions

For quick runs against the Netlify functions (local or deployed), the following `curl` template hits each endpoint. Replace `4d2f6242f6e2800bb7111c70db23a874f63136cc881ac83d7ed4a13e4f07cac` with `BACKFILL_SECRET`, and change the host if you are targeting production.

```bash
# Customers
curl -X POST http://localhost:8888/.netlify/functions/backfillCustomers \
  -H "Authorization: d2f6242f6e2800bb7111c70db23a874f63136cc881ac83d7ed4a13e4f07cac " \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Orders
curl -X POST http://localhost:8888/.netlify/functions/backfillOrders \
  -H "Authorization: Bearer 4d2f6242f6e2800bb7111c70db23a874f63136cc881ac83d7ed4a13e4f07cac" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# Invoices
curl -X POST http://localhost:8888/.netlify/functions/backfillInvoices \
  -H "Authorization: Bearer 4d2f6242f6e2800bb7111c70db23a874f63136cc881ac83d7ed4a13e4f07cac" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```

Add `?cursor=<id>&limit=<n>&dryRun=true` to tune each invocation. The functions log their last cursor so you can continue where they left off.
