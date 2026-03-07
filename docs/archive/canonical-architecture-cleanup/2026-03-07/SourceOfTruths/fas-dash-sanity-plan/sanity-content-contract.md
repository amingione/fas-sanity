# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---

# Sanity Content Contract for fas-cms-fresh and fas-medusa

## Consumers
- `fas-cms-fresh`: reads content and approved vendor workspace fields from Sanity.
- `fas-medusa`: remains commerce authority and writes product sync bridge data.
- Vendor workspace consumers: may read/write non-transactional vendor relationship data and read mirrored lifecycle events.

## Product Contract
- Required bridge fields: `medusaProductId`, `medusaVariantId`.
- Editorial fields: `title`, `displayTitle`, `slug`, `shortDescription`, `description`, `images`, `keyFeatures`, `specifications`, `attributes`, `compatibleVehicles`, `seo`.
- Workflow fields: `contentStatus`, `lastSyncedFromMedusa`.

## Sync Contract
- `Medusa -> Sanity`:
  - Product created: create/update stub content doc with bridge ID.
  - Product updated: refresh `lastSyncedFromMedusa` and optional display-only mirrors.
  - Vendor lifecycle events: write timeline mirror records for vendor visibility.
- `Sanity -> fas-cms-fresh`:
  - Publish triggers content rebuild/revalidation.

## Boundaries
- Sanity does not own or enforce prices, inventory, order state, payment, or shipping calculations.
- Sanity may own vendor profile, account, communication, and business-document metadata for B2B workflows.
- Shopper customer commerce records and transaction state stay in Medusa.

## References
- `docs/SourceOfTruths/fas-sanity-vendor-portal-keep.md`
- `docs/SourceOfTruths/vendor-portal-webhook-contract.md`
- `docs/SourceOfTruths/vendor-cutover-checklist.md`
