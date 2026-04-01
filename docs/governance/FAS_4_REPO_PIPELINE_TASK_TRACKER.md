# FAS 4-Repo Pipeline Task Tracker

Last Updated: 2026-04-01
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
| WS1-1 | Remove or quarantine legacy direct Stripe commerce calls outside Medusa | fas-cms-fresh, fas-dash | in_progress | Vendor/B2B exceptions must be explicitly documented |
| WS1-2 | Remove or quarantine direct Shippo commerce calls outside Medusa | fas-cms-fresh, fas-dash | in_progress | Keep only Medusa-owned paths |
| WS1-3 | Enforce read-only labeling for mirrored commerce data in Sanity | fas-sanity | in_progress | Schema and studio validation |

### WS2 - Product and Pricing Authority

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS2-1 | Medusa authoritative product + variant + pricing integrity checks | fas-medusa | in_progress | Include high-value price guard validation |
| WS2-2 | Ensure storefront reads product price/availability only from Medusa | fas-cms-fresh | in_progress | Sanity enrichment optional only |
| WS2-3 | Ensure dash product operations map to Medusa admin APIs | fas-dash | in_progress | No parallel product authority |

### WS3 - Order Pipeline and Reconciliation

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS3-1 | Validate checkout path: storefront -> Medusa -> Stripe via Medusa | fas-cms-fresh, fas-medusa | in_progress | Includes pre-payment guards |
| WS3-2 | Validate post-payment path: Stripe webhook -> Medusa order creation | fas-medusa | in_progress | Includes idempotency + retries |
| WS3-3 | Dash reconciliation queue for paid-not-converted carts/events | fas-dash, fas-medusa | in_progress | Resolve/retry controls required |

### WS4 - Fulfillment, Returns, Refunds

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS4-1 | Label purchase and tracking events via Medusa-owned shipping flow | fas-medusa, fas-dash | not_started | Shippo via Medusa only |
| WS4-2 | Refund/return actions routed through Medusa authority | fas-medusa, fas-dash | not_started | No external authority drift |
| WS4-3 | Ops visibility for shipment/refund lifecycle in Dash | fas-dash | not_started | Operational completeness |

### WS5 - Content and Marketing Separation

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS5-1 | Sanity blog/campaign/editorial workflows unaffected by commerce migration | fas-sanity | in_progress | Preserve marketing autonomy |
| WS5-2 | Product content sync contract Sanity -> Medusa (non-transactional) | fas-sanity, fas-medusa | in_progress | Content enrichment only |
| WS5-3 | Owner override paths in Dash for content fields (if needed) | fas-dash, fas-sanity | blocked | Requires explicit product policy decision |

### WS6 - Governance and CI

| ID | Task | Repo(s) | Status | Notes |
| --- | --- | --- | --- | --- |
| WS6-1 | Align AGENTS/governance docs to 4-repo architecture | all | in_progress | This pass updates docs |
| WS6-2 | Keep lint/type-check/governance scripts green in all repos | all | in_progress | Standardized command contracts |
| WS6-3 | Add release checklist tied to pipeline completion gates | all | not_started | Pre-prod and prod promotion gates |

## Operating Cadence

- Update tracker statuses in every cross-repo governance pass.
- Any new architecture work must reference one or more tracker IDs.
- Block merges that add new split-authority behavior unless explicitly approved and documented as temporary.

## Live Work Mapping (GitHub)

Snapshot Date: 2026-04-01

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
