# Maintenance & Backfill Script Reference (Grok + Terminal Workflow)

This guide documents the long-running maintenance scripts we routinely execute from the Grok terminal. Use it as a quick reference before kicking off any Stripe/Sanity backfills or when you need to bump the default timeout.

---

## 1. Required Environment Setup

Most scripts assume Sanity + Stripe credentials are available as environment variables. Before running anything, load `.env` (or the appropriate env file):

```bash
set -a
source .env 2>/dev/null || source .env.development 2>/dev/null
set +a
```

The `set -a` trick exports every variable declared inside the sourced file so `pnpm tsx` / `node` processes inherit the credentials.

---

## 2. Key Script Commands

| Area                               | Command                                                                                                        | Notes                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe product snapshots           | `pnpm tsx scripts/backfill-stripe-products.ts --mode all`                                                      | Re-syncs Stripe metadata for every product. Requires `STRIPE_SECRET_KEY` (optional `STRIPE_SYNC_SECRET` for authenticated Netlify endpoint). |
| Product core fields                | `pnpm tsx scripts/backfillProductCoreFields.ts [--batch=50 --max=200]`                                         | Defaults undefined `coreRequired` (false) and `promotionTagline` (empty string). Use `--batch` + `--max` to process manageable chunks.      |
| Order cart metadata                | `pnpm tsx scripts/backfillOrderCartMetadata.ts [--batch=10 --max=50]`                                          | Copies legacy `optionSummary`/`upgrades` into `metadata`. The new flags let you limit how many orders are touched per run.                  |
| Orders (generic)                   | `node scripts/backfill-orders.js`                                                                              | Legacy order cleanup (id migration, cart fixes).                                                                                             |
| Customers                          | `node scripts/backfill-customers.js`                                                                           | Refreshes customer aggregates (orders, quotes, addresses).                                                                                   |
| Invoices                           | `node scripts/backfill-invoices.js`                                                                            | Rebuilds invoice totals, bill/ship blocks, and links to customers/orders.                                                                    |
| Stripe checkout/PI/charge backfill | `pnpm tsx scripts/backfill-order-stripe.ts --type checkout --limit 50` (repeat for `paymentIntent` + `charge`) | Replays Netlify reprocess handler for missing Stripe fields.                                                                                 |
| Payment failure diagnostics        | `pnpm tsx scripts/backfill-payment-failures.ts`                                                                | Pulls Stripe failure codes/messages for orders flagged as failed.                                                                            |
| Refund hydration                   | `pnpm tsx scripts/backfill-refunds.ts`                                                                         | Creates/updates refund docs and appends events to affected orders.                                                                           |
| Async checkout cleaner             | `pnpm tsx scripts/backfill-checkout-async-payments.ts`                                                         | Marks stale async sessions as expired or success, depending on Stripe status.                                                                |
| Expired checkout tagging           | `pnpm tsx scripts/backfill-expired-checkouts.ts`                                                               | Reconciles `expiredCart` docs with Stripe events (may need multiple runs).                                                                   |
| Stripe webhook replay (local)      | `pnpm tsx scripts/stripe-maintenance/webhook-handler-fixed.js ./payload.json`                                  | Sends a captured Stripe event through the Netlify handler (bypasses signature verification).                                                 |
| Webhook smoke test                 | `pnpm tsx scripts/stripe-maintenance/test-webhook.js`                                                          | Uses built-in fixture or a provided JSON body.                                                                                               |
| Stripe field backfill              | `node scripts/stripe-maintenance/backfill-missing-fields.js`                                                   | Patches orders/customers missing card, receipt, invoiceRef, or billing address.                                                              |
| Deduplicate customer orders        | `node scripts/stripe-maintenance/fix-duplicate-orders.js`                                                      | Cleans `customer.orders[]` arrays so each order number appears once.                                                                         |
| Link invoices to orders            | `node scripts/stripe-maintenance/link-invoices.js`                                                             | Resolves missing `invoiceRef` values by matching Stripe invoice ids/numbers.                                                                 |

> **Tip:** For scripts that stream progress endlessly (e.g., cart metadata, product core fields), keep another terminal tab open to monitor for “Updated …” messages. Interrupt (`Ctrl+C`) only after the output repeats the same docs (meaning the queue might be empty).

---

## 3. Handling Long-Running Commands & Timeouts

Grok’s default command timeout is ~120 seconds unless overridden. For scripts that need more time:

1. **Use built-in chunk flags when available.**
   - Several scripts (e.g., `backfillProductCoreFields.ts`, `backfillOrderCartMetadata.ts`) now expose `--batch`/`--max` arguments. Run something like `pnpm tsx scripts/backfillProductCoreFields.ts --batch=10 --max=50` repeatedly until the script reports “Updated 0 …”.

2. **Use the `timeout` utility (macOS: `gtimeout` via `brew install coreutils`):**

   ```bash
   timeout 900 pnpm tsx scripts/backfillProductCoreFields.ts
   ```

   This allows the script to run for 15 minutes (900 seconds). If your shell lacks GNU `timeout`, install it or use the `perl -MPOSIX -e 'alarm 900'` pattern around the command.

3. **Chunk your work:**
   - Most scripts accept `--limit` or specific ids. Run multiple smaller batches instead of one huge call, e.g.:
     ```bash
     pnpm tsx scripts/backfill-order-stripe.ts --type checkout --limit 25
     pnpm tsx scripts/backfill-order-stripe.ts --type checkout --limit 25 --offset 25
     ```
     (Add an offset flag if the script exposes it; otherwise, rely on the internal cursor which advances after each run.)

4. **Background the process:**
   - For trusted long jobs, launch them via `nohup` or `tmux` from the shell, then detach. Example:
     ```bash
     nohup pnpm tsx scripts/backfillProductCoreFields.ts > logs/core-backfill.log 2>&1 &
     ```
     Reattach with `tail -f logs/core-backfill.log`.

5. **Use Grok’s “increase timeout” option (if available):**
   - Some terminal UIs offer a per-command timeout toggle. When prompted, choose “Allow longer runtime” before re-running the command.

6. **Check for progress before retrying:**
   - Many scripts log each document they update. If the same doc ids keep repeating, the script has re-queued them—safe to stop and investigate.

---

## 4. Troubleshooting Cheatsheet

- **“Configuration must contain `projectId`”**: Ensure `.env` was sourced or pass the Sanity vars inline (`SANITY_PROJECT_ID=... SANITY_DATASET=...`).
- **Stripe `resource_missing` warnings**: Happens when a script references sandbox ids (e.g., `cs_test_*`). If the script output still ends with “status=200”, the miss was non-blocking.
- **Timeout mid-run**: Re-run the script; most are idempotent and will skip rows already fixed.
- **Need to replay a specific checkout session**: Use `pnpm tsx scripts/backfill-order-stripe.ts --type checkout --id cs_live_...`.
- **Need to replay a webhook with extra logging**: Set `DEBUG=stripeWebhook:*` before running the maintenance script to increase verbosity.

---

## 5. Keeping This Doc Updated

When new backfill scripts land:

1. Add them to the table in §2.
2. Note any special flags, env requirements, or expected runtime.
3. Commit the update (`docs/run-scripts-reference.md`) so the team always has an up-to-date runbook.

Happy backfilling!
