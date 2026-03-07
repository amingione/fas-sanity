# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---

# Phase 1 Validation Run - February 21, 2026

## Scope
Medusa stabilization checks from the active Phase 1 checklist:
- hosted environment validation
- runtime health
- store/admin endpoint probe baseline

## Environment Used
- Repository: `fas-medusa`
- Config source: `.env-railway`
- API base: `https://api.fasmotorsports.com`
- Execution date: 2026-02-21

## Commands Executed
1. `VALIDATE_SETUP_MODE=hosted npm run validate-setup` with default `.env`
2. `VALIDATE_SETUP_MODE=hosted npm run validate-setup` with `.env-railway` exported
3. `curl` probes:
   - `GET /health`
   - `GET /store`
   - `GET /store/products?limit=1` (with publishable key)
   - `GET /store/regions` (with publishable key)
   - `GET /admin/products`

## Results

### Setup Validation
- Default `.env` in hosted mode: failed (`DATABASE_URL` resolves to localhost).
- `.env-railway` exported in hosted mode: passed.

### Endpoint Probe Baseline
- `GET /health`: `200 OK`
- `GET /admin/products`: `401 Unauthorized` (expected without admin auth)
- `GET /store`: `400` publishable-key-required (expected)
- `GET /store/products?limit=1`: `400` invalid publishable key (API reachable; key rejected)
- `GET /store/regions`: `400` invalid publishable key (API reachable; key rejected)

## Phase 1 Interpretation
- Medusa runtime is reachable.
- Admin routing baseline is reachable.
- Store gateway is reachable for required `/store/*` resource paths, but current client key is invalid.
- This blocks completion of Phase 1 API-only workflow verification for cart/shipping/payment/order flows until a valid key is propagated.

## Blockers to Resolve
1. Rotate and propagate a valid publishable key for `/store/*` clients.
2. Verify key propagation across all consumers (`fas-cms-fresh`, fas-dash, scripts, local secrets).
3. Re-run full API workflow checklist after key validation passes.

## Next Action
- Treat publishable-key propagation as the active Phase 1 blocker in `CURRENT-PHASE.md` until fixed and revalidated.

## Key Rotation Execution Notes (2026-02-21)
- Rotation checklist was run from `fas-medusa`.
- Admin API auth with current `MEDUSA_SECRET_KEY` returned `401` on `/admin/*`.
- Admin credential login attempts (`admin@local.test`) returned invalid email/password.
- DB-backed rotation via `medusa exec` is blocked from local because production `.env-railway` points to private `postgres.railway.internal`.
- Prepared artifacts:
  - `fas-medusa/src/scripts/rotate-publishable-key.ts`
  - `fas-medusa/scripts/propagate-publishable-key.sh`
  - `fas-medusa/docs/key-rotation-checklist-2026-02-21.md`
