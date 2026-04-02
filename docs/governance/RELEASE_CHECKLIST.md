# FAS 4-Repo Release Checklist

**Tracker Reference:** WS6-3 | fas-sanity#229
**Last Updated:** 2026-04-02
**Owner:** Cross-repo governance

---

## Purpose

This checklist must pass before any production promotion of the FAS 4-repo pipeline. It encodes the pipeline completion gates defined in `FAS_4_REPO_PIPELINE_TASK_TRACKER.md` as concrete, verifiable steps.

All items must be signed off by role. **No partial passes — every gate must be green.**

---

## Gate 1 — Authority Boundary (WS1)

Corresponds to: WS1-1, WS1-2, WS1-3

| Check | Repo | Pass Criteria | Sign-Off |
|-------|------|---------------|----------|
| No direct Stripe SDK imports outside Medusa | fas-dash, fas-cms-fresh | `grep -r "new Stripe\|import.*stripe" src/` returns no commerce-path results | `[ ]` |
| No direct Shippo SDK imports outside Medusa | fas-dash, fas-cms-fresh | `grep -r "new Shippo\|import.*shippo" src/` returns no commerce-path results | `[ ]` |
| Sanity integration group fields are `readOnly: true` | fas-sanity | All fields in `group: 'integration'` on product/productVariant schemas have `readOnly: true` | `[ ]` |
| Legacy commerce functions still 410'd | fas-sanity | `createCheckoutSession`, `stripeWebhook`, `manual-fulfill-order`, `createRefund` Netlify functions return 410 | `[ ]` |
| Legacy storefront routes still 410'd | fas-cms-fresh | `complete-order.ts`, `update-payment-intent.ts`, `cart.ts` return 410 | `[ ]` |

---

## Gate 2 — Product & Pricing Authority (WS2)

Corresponds to: WS2-1, WS2-2, WS2-3

| Check | Repo | Pass Criteria | Sign-Off |
|-------|------|---------------|----------|
| Price normalization helpers are deterministic | fas-medusa | `price-normalization.ts` uses `normalizeSanityPriceToCents` with no heuristic thresholds | `[ ]` |
| Money normalization helpers explicit | fas-medusa | `money-normalization.ts` uses explicit `dollarsToCents()` / `normalizeCentValue()` | `[ ]` |
| Storefront pricing source is Medusa-only | fas-cms-fresh | `medusa-storefront-pricing.ts` uses `medusaFetch` only; no Sanity price fields consumed for pricing decisions | `[ ]` |
| Dash product operations via Medusa admin APIs | fas-dash | Product PATCH routes call `/admin/products/:id` with `medusaAdminFetch`; no parallel product authority | `[ ]` |
| No Sanity price field writes from application code | all | Search for writes to `price`, `compareAtPrice`, `stripePriceId` outside of the Sanity sync script | `[ ]` |

---

## Gate 3 — Order Pipeline & Reconciliation (WS3)

Corresponds to: WS3-1, WS3-2, WS3-3

| Check | Repo | Pass Criteria | Sign-Off |
|-------|------|---------------|----------|
| Checkout path: storefront → Medusa → Stripe via Medusa | fas-cms-fresh, fas-medusa | No `stripe.paymentIntents.create` outside Medusa payment module | `[ ]` |
| Stripe webhook idempotency | fas-medusa | `src/api/webhooks/stripe/route.ts` has pre-check SELECT + post-failure duplicate guard | `[ ]` |
| Reconciliation queue surfaced in Dash | fas-dash | `/orders/reconciliation` page exists and filters `requires_manual_reconciliation: true` from order metadata | `[ ]` |
| Ghost order filter on all fulfillment surfaces | fas-dash | Pending fulfillment counts require `paymentStatus ∈ {captured, paid}` AND `status ∉ {canceled}` on all three surfaces (FulfillmentTableClient, orders/page, fulfillment/page) | `[ ]` |
| Order total resolution priority chain | fas-dash | `order-customer-mappers.ts` resolves total via: `metadata.total_cents` → `metadata.legacy_total_amount` → Medusa `total` (with shipping-only guard) | `[ ]` |

---

## Gate 4 — Fulfillment, Returns & Refunds (WS4)

Corresponds to: WS4-1, WS4-2, WS4-3

| Check | Repo | Pass Criteria | Sign-Off |
|-------|------|---------------|----------|
| Shippo fulfillment module registered | fas-medusa | `src/modules/fulfillment-shippo/index.ts` exports `ModuleProvider(Modules.FULFILLMENT, ...)` | `[ ]` |
| Label purchase and tracking events via Medusa-owned flow | fas-dash, fas-medusa | `AddTrackingDialog` fires Medusa shipment event or Resend fallback; no direct Shippo SDK in Dash | `[ ]` |
| No direct Stripe refund calls in Dash | fas-dash | Returns/refund routes return 501 directing to Medusa workflow; no `stripe.refunds.create` | `[ ]` |
| Return/refund path through Medusa | fas-medusa | Medusa native `/admin/returns` and refund workflows handle all return mutations | `[ ]` |
| Ops visibility for shipment lifecycle | fas-dash | Shipping page shows shipped/delivered status from Medusa fulfillment state; order dialog shows shipping method | `[ ]` |

---

## Gate 5 — Content & Marketing Separation (WS5)

Corresponds to: WS5-1, WS5-2

| Check | Repo | Pass Criteria | Sign-Off |
|-------|------|---------------|----------|
| Blog/editorial Sanity workflows unaffected | fas-sanity | `article`, `blog`, `page`, `reusableSnippet` schema types have no commerce writes | `[ ]` |
| Product content sync contract documented | fas-sanity, fas-medusa | GROQ query for content enrichment sync is non-transactional: title, description, images only; no price/stock fields written from Sanity to Medusa | `[ ]` |

---

## Gate 6 — Governance & CI (WS6)

Corresponds to: WS6-1, WS6-2

| Check | Repo | Pass Criteria | Sign-Off |
|-------|------|---------------|----------|
| AGENTS/governance docs reflect 4-repo architecture | all | CLAUDE.md, PROGRESS.md, FAS_4_REPO_PIPELINE_TASK_TRACKER.md are consistent | `[ ]` |
| TypeScript compiles with no errors | fas-dash | `npm run typecheck` exits 0 | `[ ]` |
| ESLint passes with no warnings | fas-dash | `npm run lint` (max-warnings=0) exits 0 | `[ ]` |
| No `any` types in new code | fas-dash | `grep -rn ": any" src/` returns no new hits since last release | `[ ]` |

---

## Pre-Production Promotion Steps

Perform these in order after all gates are green:

1. Run `npm run typecheck && npm run lint` in fas-dash — must exit 0
2. Merge main branch to `production` (or equivalent) in each repo
3. Confirm Vercel deployment succeeds for fas-dash (fasmotorsports.io admin)
4. Confirm Netlify deployment succeeds for fas-cms-fresh (fasmotorsports.io storefront)
5. Smoke test: place a test order end-to-end (storefront → Medusa → Stripe capture → fulfillment queue → tracking)
6. Verify reconciliation queue shows 0 unresolved events
7. Verify fulfillment queue shows only captured/paid, non-cancelled orders
8. Tag release in GitHub with format `v{YYYY.MM.DD}-pipeline-{gate}` (e.g. `v2026.04.02-pipeline-gate6`)

---

## Rollback Triggers

Initiate rollback if any of the following occur post-promotion:

- Payment intents created outside Medusa (authority boundary violation)
- Sanity price fields written from application code (authority violation)
- Fulfillment queue shows ghost/expired orders (filter regression)
- Order totals display incorrect amounts (mapper regression)
- Stripe webhook creates duplicate orders for same `payment_intent` (idempotency failure)

Rollback: revert to previous Vercel/Netlify deployment; open GitHub issue with WS tracker ID reference.

---

## Issue References

- WS6-3: https://github.com/amingione/fas-sanity/issues/229
- WS1-1 Stripe paths: https://github.com/amingione/fas-cms/issues/123
- WS1-2 Shippo paths: https://github.com/amingione/fas-cms/issues/124
- WS1-3 Sanity read-only: https://github.com/amingione/fas-sanity/issues/227
- WS2-1 Price invariants: https://github.com/amingione/fas-medusa/issues/1
- WS2-2 Storefront pricing: https://github.com/amingione/fas-cms/issues/125
- WS2-3 Dash product ops: https://github.com/amingione/fas-sanity/issues/228
- WS3-3 Reconciliation: https://github.com/amingione/fas-medusa/issues/2
- WS4-2 Returns/refunds: https://github.com/amingione/fas-medusa/issues/3
