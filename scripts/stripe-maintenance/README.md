# Stripe Maintenance Toolkit

Utility scripts for diagnosing and repairing Stripe → Sanity sync issues. All scripts expect a Sanity write token and Stripe secret key to be available in the environment:

```bash
export SANITY_API_TOKEN=<sanity api token>
export SANITY_STUDIO_PROJECT_ID=r4og35qd       # or your project id
export SANITY_STUDIO_DATASET=production        # or your dataset
export STRIPE_SECRET_KEY=sk_live_xxx    # or test key
export STRIPE_WEBHOOK_SECRET=whsec_xxx  # required for webhook simulations
```

Use `pnpm tsx` for scripts that import TypeScript files (webhook tests) and plain `node` for pure JS utilities.

## Scripts

| Script | Description | Command |
| ------ | ----------- | ------- |
| `webhook-handler-fixed.js` | Runs the Netlify webhook handler locally against a captured Stripe event. Accepts a JSON payload file. Signature verification is bypassed when `STRIPE_WEBHOOK_NO_VERIFY=1`. | `pnpm tsx scripts/stripe-maintenance/webhook-handler-fixed.js ./fixtures/checkout.session.completed.json` |
| `test-webhook.js` | Quick smoke test for the webhook using either the provided JSON payload or an inline sample `checkout.session.completed` event. | `pnpm tsx scripts/stripe-maintenance/test-webhook.js [optional-event.json]` |
| `backfill-missing-fields.js` | Queries orders that are missing card details, receipt URLs, invoice references, Stripe customer IDs, or customer links and backfills them from Stripe. Also patches the related customer with billing address + Stripe ID. Limit via `BACKFILL_LIMIT` (default 50). | `node scripts/stripe-maintenance/backfill-missing-fields.js` |
| `fix-duplicate-orders.js` | Deduplicates the `orders` array on customer documents so each order number only appears once. Batch size configurable via `DUPLICATE_BATCH` (default 200). | `node scripts/stripe-maintenance/fix-duplicate-orders.js` |
| `link-invoices.js` | Links orders without `invoiceRef` to existing invoice documents by matching order numbers or Stripe invoice IDs pulled from Stripe. Limit via `LINK_INVOICE_LIMIT` (default 100). | `node scripts/stripe-maintenance/link-invoices.js` |

## Workflow

1. **Run webhook smoke-test**  
   ```
   pnpm tsx scripts/stripe-maintenance/test-webhook.js ./fixtures/checkout.session.completed.json
   ```
   Confirms the Netlify handler accepts the payload locally (signature bypassed with `STRIPE_WEBHOOK_NO_VERIFY=1`).

2. **Process real captured events (optional)**  
   ```
   pnpm tsx scripts/stripe-maintenance/webhook-handler-fixed.js ./stripe-events/event.json
   ```
   Useful when replaying payloads exported from Stripe CLI.

3. **Backfill missing Sanity fields**  
   ```
   BACKFILL_LIMIT=100 node scripts/stripe-maintenance/backfill-missing-fields.js
   ```
   Populates `cardBrand`, `cardLast4`, `receiptUrl`, `invoiceRef`, `stripeCustomerId`, and customer billing metadata.

4. **Clean duplicate order summaries**  
   ```
   node scripts/stripe-maintenance/fix-duplicate-orders.js
   ```

5. **Link dangling invoices**  
   ```
   node scripts/stripe-maintenance/link-invoices.js
   ```

6. **Re-run tests on a new Stripe checkout** and verify the checklist:
   - stripeCustomerId populated on the Customer doc
   - billingAddress filled in
   - cardBrand, cardLast4, and receiptUrl filled in on the Order doc
   - invoiceRef references the matching invoice
   - Customer summary shows unique order numbers (no duplicates)
