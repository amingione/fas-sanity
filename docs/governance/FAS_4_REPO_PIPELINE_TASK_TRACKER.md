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
