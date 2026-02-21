# Sanity Content Contract for fas-cms-fresh and fas-medusa

## Consumers
- `fas-cms-fresh`: reads content-only fields from Sanity.
- `fas-medusa`: remains commerce authority and writes product sync bridge data.
- Vendor workspace consumers: may read non-transactional vendor relationship fields and read-only timeline mirror events.

## Product Contract
- Required bridge fields: `medusaProductId`, `medusaVariantId`.
- Editorial fields: `title`, `displayTitle`, `slug`, `shortDescription`, `description`, `images`, `keyFeatures`, `specifications`, `attributes`, `compatibleVehicles`, `seo`.
- Workflow fields: `contentStatus`, `lastSyncedFromMedusa`.

## Sync Contract
- `Medusa -> Sanity`:
  - Product created: create/update stub content doc with bridge ID.
  - Product updated: refresh `lastSyncedFromMedusa` and optional display-only mirrors.
  - Vendor lifecycle events: write read-only timeline records only.
- `Sanity -> fas-cms-fresh`:
  - Publish triggers content rebuild/revalidation.

## Non-Negotiable
- Sanity does not own or enforce prices, inventory, order state, payment, or shipping calculations.
- Vendor transitional exception scope is relationship metadata only; no transactional authority.

## References
- `docs/SourceOfTruths/fas-sanity-vendor-portal-keep.md`
- `docs/SourceOfTruths/vendor-portal-webhook-contract.md`
- `docs/SourceOfTruths/vendor-cutover-checklist.md`
