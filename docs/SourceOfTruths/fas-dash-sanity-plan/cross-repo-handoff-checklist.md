# Cross-Repo Handoff Checklist

Use this checklist when moving vendor-related work from legacy paths to the webhook-first model.

## Prereqs
- [ ] `docs/SourceOfTruths/vendor-cutover-checklist.md` reviewed and complete.
- [ ] `docs/SourceOfTruths/vendor-portal-webhook-contract.md` implemented and tested.
- [ ] Legacy Sanity vendor integration remains on until cutover is verified.

## fas-medusa
- [ ] Product sync writes `medusaProductId` and updates `lastSyncedFromMedusa` in Sanity.
- [ ] Commerce writes originate in Medusa (not Sanity).
- [ ] Product archive/delete behavior does not block checkout.
- [ ] Vendor lifecycle events are emitted as signed, idempotent webhooks.

## fas-cms-fresh
- [ ] Product list/detail pages do not read price or inventory from Sanity.
- [ ] Content queries use enrichment fields only.
- [ ] Cart/checkout/shipping/payment are Medusa-driven.
- [ ] Publish hooks still trigger revalidation/rebuild.
- [ ] No direct transactional writes to Sanity for order/payment/shipping state.

## fas-sanity
- [ ] Removed transactional schemas are not exposed in `schemaTypes` or desk.
- [ ] Removed operational domains are not exposed in dashboards/routes.
- [ ] Guard scripts block new commerce-authority fields in content schemas.
- [ ] Vendor timeline remains read-only and webhook-fed.
