# Cross-Repo Handoff Checklist

## fas-medusa
- [ ] Product sync writes `medusaProductId` and updates `lastSyncedFromMedusa` in Sanity.
- [ ] No Sanity-originated commerce writes are accepted as authoritative.
- [ ] Product deletions/archives only flag Sanity docs; no checkout dependency on Sanity state.

## fas-cms-fresh
- [ ] Product list/detail pages do not read price or inventory fields from Sanity.
- [ ] Content queries use enrichment fields only.
- [ ] Checkout/cart/shipping/payment remain Medusa-driven.
- [ ] Content publish hook continues to trigger page revalidation/rebuild.

## fas-sanity
- [ ] Transactional schemas are de-registered from `schemaTypes` and hidden from desk.
- [ ] Studio dashboards and desk routes do not expose removed operational domains.
- [ ] Guard scripts fail on new commerce authority fields in content schemas.
