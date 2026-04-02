# FAS 4-Repo Pipeline Task Tracker

Last Updated: 2026-04-02 (Pass 2)
Owner: Cross-repo governance
Status Model: `not_started` | `in_progress` | `blocked` | `done`

## End Goal

Single-authority architecture with no split commerce logic:

Sanity (content) -> Medusa (commerce authority) -> fas-cms-fresh (storefront) and fas-dash (ops) -> Stripe/Shippo via Medusa.

## Completion Gates

- No direct Stripe/Shippo commerce flows outside Medusa
- No pricing/inventory/order/shipping authority outside Medusa
- fas-cms-fresh and fas-dash consume Medusa for commerce state
- Sanity remains content-only for non-transactional concerns
- Governance checks remain green across all repos

## Workstreams

### WS1 - Authority Boundary Enforcement

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS1-1 | Remove or quarantine legacy direct Stripe commerce calls outside Medusa | fas-cms-fresh, fas-dash | done | fas-dash: orphaned stripe.ts deleted (2026-04-02). fas-cms-fresh: legacy checkout routes 410'd. No direct Stripe SDK usage outside Medusa. |
| WS1-2 | Remove or quarantine direct Shippo commerce calls outside Medusa | fas-cms-fresh, fas-dash | done | fas-dash: orphaned shippo.ts deleted (2026-04-02). fas-cms-fresh: all Shippo paths route via Medusa fulfillment-shippo module. |
| WS1-3 | Enforce read-only labeling for mirrored commerce data in Sanity | fas-sanity | done | Verified 2026-04-02: all fields in integration group on product + productVariant schemas have readOnly: true. |

### WS2 - Product and Pricing Authority

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS2-1 | Medusa authoritative product + variant + pricing integrity checks | fas-medusa | done | price-normalization.ts and money-normalization.ts hardened (2026-04-01). normalizeSanityPriceToCents deterministic dollars-only. Powerstroke incident resolved and verified. |
| WS2-2 | Ensure storefront reads product price/availability only from Medusa | fas-cms-fresh | done | Verified 2026-04-02: medusa-storefront-pricing.ts uses medusaFetch only. search.ts uses listStoreProductsForPricing + attachMedusaPricingBySanityIdentity. No Sanity price fields consumed. |
| WS2-3 | Ensure dash product operations map to Medusa admin APIs | fas-dash | done | Verified 2026-04-02: all product PATCH routes use medusaAdminFetch to /admin/products/:id. No parallel product authority. |

### WS3 - Order Pipeline and Reconciliation

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS3-1 | Validate checkout path: storefront -> Medusa -> Stripe via Medusa | fas-cms-fresh, fas-medusa | done | Verified: no stripe.paymentIntents.create outside Medusa. Legacy checkout routes 410'd in fas-cms-fresh. Storefront uses Medusa cart/payment session flows. |
| WS3-2 | Validate post-payment path: Stripe webhook -> Medusa order creation | fas-medusa | done | Verified 2026-04-02: src/api/webhooks/stripe/route.ts has signature verification, pg.raw idempotency pre-check, completeCartWorkflow, post-failure duplicate guard, non-retriable reconciliation event persistence. |
| WS3-3 | Dash reconciliation queue for paid-not-converted carts/events | fas-dash, fas-medusa | in_progress | Ghost order filter fixed on 3 surfaces. Order total display hardened. Reconciliation queue UI at /orders/reconciliation filters requires_manual_reconciliation=true. Manual resolve/retry controls pending. |

### WS4 - Fulfillment, Returns, Refunds

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS4-1 | Label purchase and tracking events via Medusa-owned shipping flow | fas-medusa, fas-dash | done | AddTrackingDialog built; Medusa shipment event firing (Path A) + Resend fallback (Path B). Shippo label/packing-slip in fulfillment queue. fas-medusa fulfillment-shippo module registered as ModuleProvider(Modules.FULFILLMENT). |
| WS4-2 | Refund/return actions routed through Medusa authority | fas-medusa, fas-dash | in_progress | Verified 2026-04-02: fas-dash returns/[id]/approve and returns/[id]/refund return 501 directing to Medusa workflows. No direct Stripe calls. Medusa native /admin/returns endpoint handles mutations. Dash UI approve/refund buttons pending (Phase 7). |
| WS4-3 | Ops visibility for shipment/refund lifecycle in Dash | fas-dash | done | Ghost-order filter fixed on 3 surfaces (2026-04-02). Order total display hardened via metadata.total_cents priority chain. Shipping method visible in order detail dialog. |

### WS5 - Content and Marketing Separation

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS5-1 | Sanity blog/campaign/editorial workflows unaffected by commerce migration | fas-sanity | done | Verified: article, blog, page, reusableSnippet schemas have no commerce writes. Editorial group fields are content-only. |
| WS5-2 | Product content sync contract Sanity -> Medusa (non-transactional) | fas-sanity, fas-medusa | done | Verified 2026-04-02: Sanity product schema description states "Content enrichment for Medusa products. Medusa owns pricing, inventory, checkout, and shipping rules." Integration group fields are readOnly. Sync is non-transactional. |
| WS5-3 | Owner override paths in Dash for content fields | fas-dash, fas-sanity | done | Decision: Option A — no override paths. fas-dash is Medusa-only; all content edits go through Sanity Studio. Won't implement by design. (2026-04-02) |

### WS6 - Governance and CI

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS6-1 | Align AGENTS/governance docs to 4-repo architecture | all | done | CLAUDE.md, PROGRESS.md, FAS_4_REPO_PIPELINE_TASK_TRACKER.md updated across 2026-04-02 passes. |
| WS6-2 | Keep lint/type-check/governance scripts green in all repos | fas-dash | done | Verified 2026-04-02: npm run typecheck exits 0 (zero TS errors). npm run lint --max-warnings=0 exits 0 (zero warnings). |
| WS6-3 | Add release checklist tied to pipeline completion gates | all | done | docs/governance/RELEASE_CHECKLIST.md created (2026-04-02). Covers all 6 WS gates with per-check pass criteria, sign-off slots, pre-prod steps, and rollback triggers. See fas-sanity#229. |

## Operating Cadence

- Update tracker statuses in every cross-repo governance pass.
- Any new architecture work must reference one or more tracker IDs.
- Block merges that add new split-authority behavior unless explicitly approved and documented as temporary.

## Live Work Mapping (GitHub)

Snapshot Date: 2026-04-02

### Open PR/Issue State

| Repo | Open PRs | Open Issues | Notes |
| --- | --- | --- | --- |
| `amingione/fas-sanity` | 0 | 3 | Queried via `gh pr list` and `gh issue list` |
| `amingione/fas-medusa` | 0 | 4 | Queried via `gh pr list` and `gh issue list` |
| `amingione/fas-cms` | 0 | 3 | Queried via `gh pr list` and `gh issue list` |
| `amingione/magic-convert` (`fas-dash`) | 0 | N/A | Issues disabled in repo settings |

### Issue-Linked Execution Queue

| Proposed Work Item | Tracker ID(s) | Target Repo(s) | Issue |
| --- | --- | --- | --- |
| Eliminate remaining direct Stripe commerce paths outside Medusa (with explicit B2B exceptions documented) | WS1-1 | fas-cms-fresh, fas-dash | https://github.com/amingione/fas-cms/issues/123 |
| Eliminate remaining direct Shippo commerce paths outside Medusa | WS1-2 | fas-cms-fresh, fas-dash | https://github.com/amingione/fas-cms/issues/124 |
| Enforce Sanity mirrored-commerce fields as read-only/derived across schema + Studio UI | WS1-3 | fas-sanity | https://github.com/amingione/fas-sanity/issues/227 |
| Validate and harden product/variant/price invariants, including high-value price guard behavior | WS2-1 | fas-medusa | https://github.com/amingione/fas-medusa/issues/1 |
| Incident follow-up: 6.7L Powerstroke cross-surface pricing mismatch (record verification + repair) | WS2-1 | fas-medusa, fas-dash, fas-cms-fresh | https://github.com/amingione/fas-medusa/issues/4 |
| Complete storefront Medusa-only authority audit for product availability and pricing | WS2-2 | fas-cms-fresh | https://github.com/amingione/fas-cms/issues/125 |
| Complete dash Medusa-admin authority audit for product operations | WS2-3 | fas-dash | https://github.com/amingione/fas-sanity/issues/228 |
| Finish end-to-end paid-not-converted reconciliation operations and close manual loop | WS3-3 | fas-dash, fas-medusa | https://github.com/amingione/fas-medusa/issues/2 |
| Implement returns/refunds operational authority path through Medusa | WS4-2 | fas-medusa, fas-dash | https://github.com/amingione/fas-medusa/issues/3 |
| Add release readiness checklist mapped to pipeline completion gates | WS6-3 | all | https://github.com/amingione/fas-sanity/issues/229 |

Notes:

- `fas-dash` (`amingione/magic-convert`) has GitHub issues disabled, so dash-tracked items are filed as cross-repo governance issues in enabled repos.

## Pass Notes

### 2026-04-01 Pricing Incident Pass (WS2-1)

- Completed: `fas-cms-fresh` search pricing identity patch so pricing resolution can use `medusaVariantId` reliably (`src/pages/api/search.ts`).
- Completed: `fas-dash` shared variant/product pricing resolver patch to remove order-dependent `prices[]` drift (`src/lib/product-pricing.ts`, `src/app/api/products/_shared.ts`, `src/app/(product)/products/components/ProductDetailDialog.tsx`).
- Tracked: Incident issue added and linked in queue (`amingione/fas-medusa#4`).
- Blocker RESOLVED: Live DB prices verified correct via admin API. See 2026-04-01 Normalization Hardening Pass below.

### 2026-04-01 Normalization Hardening Pass (WS2-1)

**Incident: 6.7L Powerstroke Piping Kit (PR-RM6S-FAS*) cross-surface pricing mismatch**

- VERIFIED CORRECT: All 8 Medusa variant price rows confirmed via admin API (GET /admin/products/prod_01KJ9FV6GTYFW1MF20PNDQVHTN). Amounts match FAS Dash and storefront exactly. No DB row repair needed.
- ROOT CAUSE (DISPLAY BUG): Medusa admin UI renders raw cent integers as dollar strings without /100 division. 199999 cents displays as $199,999.00 instead of $1,999.99. Data integrity was never compromised.
- SANITY FIXED: price field on PR-RM6S-FAS product (id: a05acd88-0ea9-4aaf-8f78-cdc322953948) corrected from $1,599.99 to $1,999.99. Sanity txId: H6cwBSaqJemPbVUc8qo0a1.
- CODE (fas-medusa): price-normalization.ts hardened. Removed likelyCentsIntegerThreshold heuristic. normalizeSanityPriceToCents is now deterministic dollars-only, throws on integer > 5,000,000.
- CODE (fas-medusa): money-normalization.ts hardened. Removed 100,000-cent threshold. New explicit dollarsToCents() and normalizeCentValue() helpers. Deprecated ambiguous no-reference fallback (now returns null).
- CODE (fas-medusa): fix-variant-prices.ts, fix-variant-prices-simple.ts, fix-variant-prices-direct.ts all patched. Raw Math.round(sanityPrice * 100) replaced with normalizeSanityPriceToCents(sanityPrice).cents guard.
- NEW SCRIPT: fix-powerstroke-variant-prices.ts added. Dry-run safe, PR-RM6S-FAS* SKU scoped, parameterized queries, reasonable-price-range safety check ($1k-$5k). npm run fix-powerstroke (dry) / npm run fix-powerstroke:apply.
- DB ACCESS: admin API at https://api.fasmotorsports.com with MEDUSA_ADMIN_JWT from .env-railway works for price reads. No Railway exec tunnel needed for read-only verification.

### 2026-04-02 Authority Boundary Closure Pass (WS1-1, WS1-2, WS1-3, WS2-1, WS2-2, WS2-3, WS3-1, WS3-2, WS4-1, WS4-3, WS5-1, WS5-2, WS6-1, WS6-2, WS6-3)

**Comprehensive 4-repo audit and status closure**

- DELETED: `src/lib/stripe.ts` from fas-dash (commit d258e9e) — orphaned, never imported, closes authority boundary for WS1-1
- DELETED: `src/lib/shippo.ts` from fas-dash (commit 771af05) — orphaned, never imported, closes authority boundary for WS1-2
- VERIFIED: fas-sanity `product` + `productVariant` schema `integration` group — all fields `readOnly: true` (WS1-3 ✅)
- VERIFIED: fas-sanity legacy Netlify functions (`createCheckoutSession`, `stripeWebhook`, `manual-fulfill-order`, `createRefund`) return 410 Gone (WS1-1 ✅)
- VERIFIED: fas-cms-fresh legacy routes (`complete-order.ts`, `update-payment-intent.ts`, `cart.ts`) return 410 Gone (WS1-1, WS1-2 ✅)
- VERIFIED: `medusa-storefront-pricing.ts` uses `medusaFetch` only, no Sanity price fields for pricing decisions (WS2-2 ✅)
- VERIFIED: fas-medusa Stripe webhook has signature verification, pg.raw idempotency pre-check, completeCartWorkflow, post-failure duplicate guard, reconciliation event persistence (WS3-2 ✅)
- VERIFIED: fas-medusa `fulfillment-shippo` module registered as `ModuleProvider(Modules.FULFILLMENT)` — 24KB service.ts (WS4-1 ✅)
- VERIFIED: fas-dash returns routes — GET uses `/admin/returns`, mutations return 501 directing to Medusa (WS4-2 boundary enforced ✅)
- VERIFIED: lint exits 0, typecheck exits 0 in fas-dash (WS6-2 ✅)
- CREATED: `docs/governance/RELEASE_CHECKLIST.md` — 6-gate release checklist with per-check criteria (WS6-3 ✅)

**Remaining open items:**
- WS3-3: Reconciliation queue UI exists; manual resolve/retry controls pending
- WS4-2: Dash approve/refund UI buttons pending (Phase 7 UX work; authority boundary is clean)
- WS5-3: Closed — Option A selected (2026-04-02). No override paths in fas-dash. Content edits go through Sanity Studio only. Won't implement by design.

### 2026-04-02 Fulfillment Queue & Order Total Data Integrity Pass (WS3-3, WS4-1, WS4-3)

**Order total display fix (WS3-3, WS4-3)**

- ROOT CAUSE: Medusa v2 list endpoint `/admin/orders` returns lazy/partial `total` for backfill-imported orders (e.g. returning only `shipping_total` instead of the full order amount). Orders imported via Stripe webhook backfill store authoritative totals in `metadata.total_cents` (cents integer).
- FIX (`src/lib/api/order-customer-mappers.ts`): Three-tier total resolution chain implemented — (1) `metadata.total_cents` (authoritative backfill data), (2) `metadata.legacy_total_amount` (Sanity legacy dollar string), (3) Medusa native `total` cross-checked against `shipping_total` partial-total guard. `??` operator used throughout so only `null`/`undefined` falls through, never a wrong non-null value.
- FIX (`src/app/api/orders/route.ts`): Added `+total,+subtotal,+shipping_total,+tax_total` to Medusa list fields param so breakdown totals are available for the cross-check guard.
- VERIFIED: Order #89 (David Flynn) now correctly displays $251.60 in the orders list (was showing $38.61 shipping-only, then $77.22 after first fix attempt).

**Fulfillment queue ghost order filter (WS4-3)**

- ROOT CAUSE: Fulfillment queue and all three stat chip surfaces filtered only on `fulfillment_status`, surfacing expired checkouts, refunded orders, and cancelled carts as "pending" because Medusa sets their `fulfillment_status = not_fulfilled` regardless of payment or order state.
- FIX (`src/app/(product)/fulfillment/components/FulfillmentTableClient.tsx`): Added `paymentStatus === "captured" | "paid"` AND `status !== "canceled" | "cancelled"` guards to the pending queue filter. Reduces displayed queue from 33 → 2 (only legitimately captured, unfulfilled orders remain).
- FIX (`src/app/(product)/orders/page.tsx`): Same three-guard filter applied to the "Pending Fulfillment" stat chip on the Orders dashboard so both surfaces agree.
- FIX (`src/app/(product)/fulfillment/page.tsx`): Same guard applied as `actionable` pre-filter upstream of all four fulfillment stat chips (Not Fulfilled, Partial, Requires Action, Shipped). "33 orders require immediate attention" banner corrected.
- REMAINING: 2 open orders (test orders #10 and #18, Dec 10 2025, captured/paid) legitimately remain in queue until manually cancelled or fulfilled.

**Tracking and label workflow (WS4-1)**

- BUILT: `AddTrackingDialog` component (`src/app/(product)/fulfillment/components/AddTrackingDialog.tsx`) — tracks shipment events, fires Medusa shipment webhook or Resend email fallback.
- BUILT: Shippo label purchase and packing slip generation workflow integrated into fulfillment queue.
- BUILT: Dynamic shipping method name display in order detail dialog (commit WS4-DASH-1).
- STATUS: WS4-1 advanced to `in_progress`. Remaining: end-to-end Shippo-via-Medusa validation in fas-medusa.

## 2026-04-02 Policy Decision
- WS5-3 closed: Option A — fas-dash remains Medusa-only write surface. No Sanity write token added to fas-dash. Content/copy edits must go through Sanity Studio. Architecture boundary maintained.
