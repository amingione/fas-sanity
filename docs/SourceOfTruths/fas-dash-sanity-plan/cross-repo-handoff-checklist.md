# Cross-Repo Handoff Checklist

## Vendor Cutover Gate (Required Before Vendor Decommission)
- [ ] `docs/SourceOfTruths/vendor-cutover-checklist.md` is fully signed off.
- [ ] `docs/SourceOfTruths/vendor-portal-webhook-contract.md` is implemented and validated.
- [ ] Existing Sanity vendor integration remains enabled until sign-off is complete.

## fas-medusa
- [ ] Product sync writes `medusaProductId` and updates `lastSyncedFromMedusa` in Sanity.
- [ ] No Sanity-originated commerce writes are accepted as authoritative.
- [ ] Product deletions/archives only flag Sanity docs; no checkout dependency on Sanity state.
- [ ] Vendor lifecycle events are emitted with signed, idempotent webhook payloads.

## fas-cms-fresh
- [ ] Product list/detail pages do not read price or inventory fields from Sanity.
- [ ] Content queries use enrichment fields only.
- [ ] Checkout/cart/shipping/payment remain Medusa-driven.
- [ ] Content publish hook continues to trigger page revalidation/rebuild.
- [ ] No direct transactional writes to Sanity for vendor order/payment/shipping state.

## fas-sanity
- [ ] Transactional schemas are de-registered from `schemaTypes` and hidden from desk (except deferred vendor transition scope).
- [ ] Studio dashboards and desk routes do not expose removed operational domains.
- [ ] Guard scripts fail on new commerce authority fields in content schemas.
- [ ] Vendor timeline is read-only and webhook-fed.
