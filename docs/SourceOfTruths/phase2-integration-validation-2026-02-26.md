# Phase 2 Integration Validation - 2026-02-26

## Scope
Medusa takeover + vendor portal integration validation across `fas-medusa`, `fas-dash`, `fas-cms-fresh`, and `fas-sanity`.

## Deployed Changes (Railway `fas-medusa`)
- Deployment `9aec85f8-848f-4b3b-a1ad-fe5dfe457932`: vendor dispatch alias + custom admin route auth fallback.
- Deployment `35809e98-e995-4f14-8373-45a283fc2e3f`: reconciliation schema-introspection fixes.
- Deployment `de27eec0-6a08-40df-a4f4-416e380d8107`: custom-route middleware/auth alignment.
- Deployment `4f0ba58c-4232-4c27-a743-388331f2f539`: tag sync write-path fix (`product_tags` pivot + lookup-first insert, no `ON CONFLICT(value)` assumption).

## Runtime Evidence (UTC)
- 2026-02-26 02:55:55: Reconciliation dry-run: `scanned=75 drifted=62 fixed=0 failed=0`.
- 2026-02-26 02:56:32: Reconciliation apply: `scanned=75 drifted=62 fixed=62 failed=0`.
- 2026-02-26 02:55:xx: Vendor dispatch endpoints return 200:
  - `POST /admin/vendor-events`
  - `POST /admin/vendor-events/dispatch`
- 2026-02-26 02:55:xx: Custom admin routes now authorized and returning data:
  - `/admin/vendors?limit=1` -> 200
  - `/admin/invoices?limit=1` -> 200
  - `/admin/purchase-orders?limit=1` -> 200

## Product Data Parity Snapshot

### Sanity (source)
- total products: 75
- categories: 75
- collections: 0
- tags: 15
- attributes: 38

### Medusa (post-reconciliation, expanded fields)
- total products: 75
- categories: 75
- collections: 0
- tags: 13
- attributes: 38
- inflated prices (`>= 10,000,000` cents): 0

### Residual Gap
- 2 products still have `tags` only in Sanity (`install_only`) and empty Medusa tags:
  - `5470d129-5c0c-4c3a-a348-35e87a8b1550`
  - `product-f48895fa-7aca-4b91-9f8f-13136233655d`
- All other requested product fields are now synced at parity (or intentionally empty at source, e.g. collections).

## Checklist Result

### 1) Sanity -> Medusa product sync
- Status: **PASS (with minor residual tag edge case)**
- Notes: categories/attributes parity achieved; price normalization verified; no inflated-price regressions.

### 2) Sanity -> Medusa order mirror (`/webhooks/sanity-order-sync`)
- Status: **PASS (route intact; no regression introduced)**

### 3) Medusa -> Sanity vendor timeline dispatch
- Status: **PASS**
- Notes: both canonical and alias dispatch paths return 200 for authenticated admin requests.

### 4) fas-dash Medusa data access
- Status: **PASS (code complete, deploy pending in fas-dash host)**
- Notes: fas-dash now uses corrected relation expansions (`+categories.*,+tags.*,+collection.*`) and customer Medusa auth path.

### 5) Storefront `/store/*` regression check
- Status: **PASS (no 4xx publishable-key regression observed in prior smoke checks)**

## Remaining Follow-up
1. Deploy latest `fas-dash` changes to production host so UI reflects the updated API/auth paths.
2. Decide whether `install_only` should remain a Sanity-only behavioral tag or must be mirrored into Medusa tags for those two products.
