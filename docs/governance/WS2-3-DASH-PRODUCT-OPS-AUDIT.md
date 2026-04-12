# WS2-3 — Dash Product Operations: Medusa Admin API Audit

**Tracker ID:** WS2-3
**Issue:** https://github.com/amingione/fas-sanity/issues/228
**Repo scope:** fas-dash (cross-repo governance tracked here; fas-dash issues disabled)
**Last Updated:** 2026-04-08
**Status:** ✅ CLOSED
**Lifecycle:** COMPLETE (historical audit evidence)

---

## Purpose

This document formally records the cross-repo governance audit for WS2-3:
*"Ensure dash product operations map to Medusa admin APIs."*

fas-sanity is the governance anchor for this workstream because fas-dash has GitHub issues disabled.
The audit was conducted against the fas-dash codebase and verified via the compliance checker
`scripts/compliance/fas-compliance-check.ts` (rule `R10-ws2-3-dash-product-ops`).

---

## Acceptance Criteria

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Product operation endpoints in dash are mapped to Medusa admin APIs | ✅ Pass |
| 2 | Split-authority product mutations are removed | ✅ Pass |

---

## Evidence of Compliance

### 1. Medusa Admin Fetch Utility

`fas-dash/src/lib/medusa-admin.ts` exports a `medusaAdminFetch()` helper that is the
single entry point for all Medusa admin calls in fas-dash. It is authenticated via
`MEDUSA_ADMIN_API_KEY` and targets `MEDUSA_BACKEND_URL/admin/…`.

### 2. Product PATCH Routes → Medusa `/admin/products/:id`

All product mutation handlers in `fas-dash/src/app/api/products/` call
`medusaAdminFetch('/admin/products/:id', { method: 'PATCH', … })`. No route calls
Sanity, Stripe, or Shippo directly to modify a product record.

### 3. No Split-Authority Mutations

A prior audit pass (2026-04-01, WS2-1 Pricing Incident) confirmed that product/variant/price
mutations removed the last traces of dual-write logic (writing to both Medusa and Sanity in the
same operation). The `_shared.ts` product resolver now reads from Medusa only.

### 4. No Direct Stripe Product/Price Calls in Dash

`stripe.products.create / .update` and `stripe.prices.create / .update` calls are absent from
`fas-dash/src/app/api/products/`. Stripe product sync is owned exclusively by Medusa's payment
provider layer, never fas-dash.

### 5. No Sanity Commerce Writes in Product Routes

`sanityClient.patch()` and `sanityClient.create()` calls are absent from the product API routes.
Sanity is read-only from fas-dash for content enrichment only (title, description, images), and
those reads are non-transactional.

---

## Compliance Rule

The automated enforcement rule is `R10-ws2-3-dash-product-ops` in
`scripts/compliance/fas-compliance-check.ts`. It runs as part of `npm run compliance:check`
and enforces the following:

| Sub-check | What it guards |
|-----------|---------------|
| (a) No Sanity writes in product API routes | Prevents split-authority product mutations |
| (b) `medusaAdminFetch` present in product routes | Confirms Medusa is the authority endpoint |
| (c) No direct Stripe product/price calls | Enforces Stripe access via Medusa only |
| (d) This audit document exists | Requires formal sign-off to be on-disk |

---

## Related Workstreams

- **WS2-1:** Medusa price normalization hardened (fas-medusa). Pre-condition for correct Medusa-only pricing.
- **WS2-2:** Storefront reads product price/availability from Medusa only (fas-cms-fresh).
- **WS1-1 / WS1-2:** Direct Stripe/Shippo SDK files deleted from fas-dash (`stripe.ts`, `shippo.ts`).

---

## Sign-Off

| Role | Sign-Off |
|------|----------|
| Governance (fas-sanity) | ✅ 2026-04-08 |
| Cross-repo audit | ✅ Automated — `R10-ws2-3-dash-product-ops` |
