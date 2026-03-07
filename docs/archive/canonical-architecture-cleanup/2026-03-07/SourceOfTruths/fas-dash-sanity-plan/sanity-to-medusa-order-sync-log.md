# ARCHIVED DOCUMENT

This file is superseded by the canonical architecture package:

- docs/governance/checkout-architecture-governance.md
- docs/governance/commerce-authority-checklist.md
- docs/architecture/canonical-commerce-architecture.md

Do not use this file as implementation authority.

---

ambermin@storm fas-medusa % npm run migrate-sanity-historical-commerce

> fas-medusa@0.0.1 migrate-sanity-historical-commerce
> medusa exec ./src/scripts/migrate-sanity-historical-commerce.ts

info: Executing script at ./src/scripts/migrate-sanity-historical-commerce.ts...
info: No link to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/links. skipped.
info: Locking module: Using "in-memory" as default.
info: Connection to Redis in module 'event-bus-redis' established
info: No workflow to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/workflows. skipped.
info: No subscriber to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/subscribers. skipped.
info:  
============================================================
info: SANITY -> MEDUSA HISTORICAL COMMERCE MIGRATION
info: Mode: DRY RUN (default)
info: Sanity source: r4og35qd/production
info: Limit: none
info: Order: customers -> orders -> invoices
info: ============================================================

info: Customers fetched: 166
info: Orders fetched: 88
info: Invoices fetched: 67
info:  
============================================================
info: HISTORICAL MIGRATION COMPLETE
info: Mode: DRY RUN
info: Customer summary: {"scanned":166,"created":0,"updated":166,"skipped":0,"failed":0}
info: Order summary: {"scanned":88,"created":88,"updated":0,"skipped":0,"failed":0}
info: Invoice summary: {"scanned":67,"created":67,"updated":0,"skipped":0,"failed":0}
info: Errors: 0
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/historical-commerce-2026-02-20T20-07-03-173Z-dry-run.json
info: ============================================================

info: Finished executing script.
ambermin@storm fas-medusa % npm run migrate-sanity-historical-commerce:apply

> fas-medusa@0.0.1 migrate-sanity-historical-commerce:apply
> APPLY=true medusa exec ./src/scripts/migrate-sanity-historical-commerce.ts

info: Executing script at ./src/scripts/migrate-sanity-historical-commerce.ts...
info: No link to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/links. skipped.
info: Locking module: Using "in-memory" as default.
info: Connection to Redis in module 'event-bus-redis' established
info: No workflow to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/workflows. skipped.
info: No subscriber to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/subscribers. skipped.
info:  
============================================================
info: SANITY -> MEDUSA HISTORICAL COMMERCE MIGRATION
info: Mode: APPLY
info: Sanity source: r4og35qd/production
info: Limit: none
info: Order: customers -> orders -> invoices
info: ============================================================

info: Customers fetched: 166
info: Orders fetched: 88
info: Invoices fetched: 67
info:  
============================================================
info: HISTORICAL MIGRATION COMPLETE
info: Mode: APPLY
info: Customer summary: {"scanned":166,"created":0,"updated":166,"skipped":0,"failed":0}
info: Order summary: {"scanned":88,"created":0,"updated":88,"skipped":0,"failed":0}
info: Invoice summary: {"scanned":67,"created":0,"updated":67,"skipped":0,"failed":0}
info: Errors: 0
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/historical-commerce-2026-02-20T20-07-30-722Z-apply.json
info: ============================================================

info: Finished executing script.
ambermin@storm fas-medusa % npm run migrate:historical:all

> fas-medusa@0.0.1 migrate:historical:all
> medusa exec ./src/scripts/migrate-historical-all.ts

info: Executing script at ./src/scripts/migrate-historical-all.ts...
info: No link to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/links. skipped.
info: Locking module: Using "in-memory" as default.
info: Connection to Redis in module 'event-bus-redis' established
info: No workflow to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/workflows. skipped.
info: No subscriber to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/subscribers. skipped.
info: [Historical Runner] Starting step: customers
info:  
============================================================
info: SANITY -> MEDUSA CUSTOMER COMPLETE MIGRATION
info: Mode: DRY RUN (default)
info: Sanity source: r4og35qd/production
info: Limit: none
info: Policy: enforce non-null defaults for mapped customer properties
info: ============================================================

info: Customers fetched: 166
info:  
============================================================
info: CUSTOMER COMPLETE MIGRATION FINISHED
info: Mode: DRY RUN
info: Summary: {"scanned":166,"created":0,"updated":166,"failed":0,"fallback_emails_used":24}
info: Errors: 0
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/customer-complete-2026-02-20T20-08-45-884Z-dry-run.json
info: ============================================================

info: [Historical Runner] Completed step: customers
info: [Historical Runner] Starting step: orders-invoices
info:  
============================================================
info: SANITY -> MEDUSA HISTORICAL COMMERCE MIGRATION
info: Mode: DRY RUN (default)
info: Sanity source: r4og35qd/production
info: Limit: none
info: Order: customers -> orders -> invoices
info: ============================================================

info: Customers fetched: 166
info: Orders fetched: 88
info: Invoices fetched: 67
info:  
============================================================
info: HISTORICAL MIGRATION COMPLETE
info: Mode: DRY RUN
info: Customer summary: {"scanned":166,"created":0,"updated":166,"skipped":0,"failed":0}
info: Order summary: {"scanned":88,"created":88,"updated":0,"skipped":0,"failed":0}
info: Invoice summary: {"scanned":67,"created":67,"updated":0,"skipped":0,"failed":0}
info: Errors: 0
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/historical-commerce-2026-02-20T20-08-47-189Z-dry-run.json
info: ============================================================

info: [Historical Runner] Completed step: orders-invoices
info: [Historical Runner] Starting step: quotes-shipping-quotes
info:  
============================================================
info: HISTORICAL QUOTES MIGRATION COMPLETE
info: Mode: DRY RUN
info: Quote summary: {"scanned":0,"created":0,"updated":0,"failed":0}
info: Shipping quote summary: {"scanned":0,"created":0,"updated":0,"failed":0}
info: Errors: 0
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/historical-quotes-2026-02-20T20-08-47-577Z-dry-run.json
info: ============================================================

info: [Historical Runner] Completed step: quotes-shipping-quotes
info: [Historical Runner] Starting step: products-services-reconciliation
info: [Reconciliation] Starting (script) lookback=24h limit=200 dryRun=false
warn: [Product Sync] Invalid MPN format: "FAS-HC-001OW". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 850 Package | Trackhawk & Durango (1a91e721-04dc-44fb-a257-2eef4ecb83c8). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 850 Package | Trackhawk & Durango (prod_01KGA3CHX3N5NDHX6HK842Q3W5)
info: [Product Sync] Updating existing product: FAS 2.7L IHI Supercharger Rebuild (prod_01KG5WQYJSSYYYXJWYBCP7BP65)
warn: [Product Sync] Existing product has 3 option(s) but incoming has 1. Preserving existing variant options.
info: [Product Sync] Updated product prod_01KG5WQYJSSYYYXJWYBCP7BP65 with variant variant_01KG5WQYJS06S09AN7727HQMDX: $1200
info: [Product Sync] Created product_type 'physical' (ptyp_ae1139f94e2141c7925507492a726cfd)
warn: [Product Sync] Invalid MPN format: "FAS-TRX-004PX". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 500+ Performance Package | 500+ HP Turn-Key Build (2018+ F-150) (464a1a29-e992-4dad-b4b8-b4bfe5cb30ef). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 500+ Performance Package | 500+ HP Turn-Key Build (2018+ F-150) (prod_01KGA3EQGD676HVZ52VDNRJZSG)
warn: [Product Sync] Invalid MPN format: "FAS-PR-006H6". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 850 Package | TRX (5470d129-5c0c-4c3a-a348-35e87a8b1550). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 850 Package | TRX (prod_01KGA3ET7NCVNKGM9DYA9HT6KC)
info: [Product Sync] Updating existing product: 6" Axel-Back Exhaust (2011+ 6.7L Powerstroke) (prod_01KG5WR0BXJ8JWYX3SPHQRDC2S)
info: [Product Sync] Updated product prod_01KG5WR0BXJ8JWYX3SPHQRDC2S with variant variant_01KG5WR0BXG8F2CABQVPMGG2ZA: $699.99
warn: [Product Sync] Invalid MPN format: "FAS-TRX-007MU". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 800 Performance Package | TRX (7ba614f6-aad1-48b7-bbb3-4230c71a4e9c). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 800 Performance Package | TRX (prod_01KGA3EWX8WDNMC627YX2Y2SGD)
warn: [Product Sync] Invalid MPN format: "FAS-UNI-009I3". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 1000 Performance Package | TRX (85d6413f-d409-4e44-a237-e4a516995228). MPN will be omitted from metadata.
warn: [Product Sync] FAS 1000 Performance Package | TRX (85d6413f-d409-4e44-a237-e4a516995228): Price 17999 appears to already be in cents (>= 10000 and integer). Not converting. Verify Sanity data.
info: [Product Sync] Updating existing product: FAS 1000 Performance Package | TRX (prod_01KGA3EZHCHFC0YHV7K702E2C9)
warn: [Product Sync] Invalid MPN format: "piping kit". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: F.A.S. 2020+ 6.7L Powerstroke Piping Kit (a05acd88-0ea9-4aaf-8f78-cdc322953948). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: F.A.S. 2020+ 6.7L Powerstroke Piping Kit (prod_01KG5WR3V5KAKC6TGVAPR4K81V)
warn: [Product Sync] Existing product has 4 option(s) but incoming has 1. Preserving existing variant options.
info: [Product Sync] Updated product prod_01KG5WR3V5KAKC6TGVAPR4K81V with variant variant_01KG5WR3V5GS07BCZBEPH5DVSS: $1599.99
warn: [Product Sync] Invalid MPN format: "FAS-PR-011MV". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 800 Performance Package | Trackhawk/Durango (b7ad8224-d6e6-4c0f-a5f5-020f6543fbb0). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 800 Performance Package | Trackhawk/Durango (prod_01KGA3F5RY521F9N35TY8DR6XR)
info: [Product Sync] Updating existing product: FAS 900 Package | RAM TRX (prod_01KGA3FBJRJVRD48W5NKP4V447)
info: [Product Sync] Updating existing product: FAS FAFO T-Shirt (prod_01KG5WRZD1TBZRN7DRZA12WH3T)
info: [Product Sync] Updated product prod_01KG5WRZD1TBZRN7DRZA12WH3T with variant variant_01KG5WRZD1NEW4K2EZFEHX5AT5: $29.99
info: [Product Sync] Updating existing product: FAS 850 Package | Hellcat Platform (prod_01KGA3GKVSNEDNXRJMG8KNMZS8)
info: [Product Sync] Updating existing product: FAS 2.4L IHI Supercharger Rebuild (prod_01KG5WSN4EVDPPF0JTVMV2F8B3)
warn: [Product Sync] Existing product has 4 option(s) but incoming has 1. Preserving existing variant options.
info: [Product Sync] Updated product prod_01KG5WSN4EVDPPF0JTVMV2F8B3 with variant variant_01KG5WSN4EZBS6F3HB3431RER9: $1200
warn: [Product Sync] Invalid MPN format: "FAS-UNI-05726". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 1000 Performance Package | Charger & Challenger (product-c3357fac-579d-458d-9675-bd055111718c). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 1000 Performance Package | Charger & Challenger (prod_01KGA3H27ZQCZ4ZZ85YHC7BTH1)
info: [Product Sync] Updating existing product: FAS 1000 Performance Package – 1000 HP Turn-Key Build (2018+ F-150) (prod_01KGA3H65PW75HQC3T2JXHNZY6)
warn: [Product Sync] Invalid MPN format: "FAS-TRX-065SV". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS “Factory Freak” Package | Trackhawk & Durango (product-f48895fa-7aca-4b91-9f8f-13136233655d). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS “Factory Freak” Package | Trackhawk & Durango (prod_01KGA3HCX6W2956PC88WXC3NNW)
warn: [Product Sync] Invalid MPN format: "FAS-PR-0672R". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: Billet Bearing Plate | 2.4L IHI Hellcat | Installed (product-fc8c64e2-0375-4e6d-9544-b5bdd78d8bf3). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: Billet Bearing Plate | 2.4L IHI Hellcat | Installed (prod_01KGA3HFBXZT63V0KCA6FCRKCK)
info: [Reconciliation] Completed scanned=75 drifted=23 fixed=0 failed=23
info: [Reconciliation] Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/audits/reconciliation/product-sync-reconciliation-2026-02-20T20-08-53-508Z.json
info: [Historical Runner] Completed step: products-services-reconciliation
info:  
============================================================
info: HISTORICAL ALL RUNNER COMPLETE
info: Mode: dry-run
info: Duration: 8195ms
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/historical-all-2026-02-20T20-08-53-510Z.json
info: ============================================================

info: Finished executing script.
ambermin@storm fas-medusa % npm run migrate:historical:all:apply

> fas-medusa@0.0.1 migrate:historical:all:apply
> APPLY=true medusa exec ./src/scripts/migrate-historical-all.ts

info: Executing script at ./src/scripts/migrate-historical-all.ts...
info: No link to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/links. skipped.
info: Locking module: Using "in-memory" as default.
info: Connection to Redis in module 'event-bus-redis' established
info: No workflow to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/workflows. skipped.
info: No subscriber to load from /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/node_modules/@medusajs/draft-order/.medusa/server/src/subscribers. skipped.
info: [Historical Runner] Starting step: customers
info:  
============================================================
info: SANITY -> MEDUSA CUSTOMER COMPLETE MIGRATION
info: Mode: APPLY
info: Sanity source: r4og35qd/production
info: Limit: none
info: Policy: enforce non-null defaults for mapped customer properties
info: ============================================================

info: Customers fetched: 166
info:  
============================================================
info: CUSTOMER COMPLETE MIGRATION FINISHED
info: Mode: APPLY
info: Summary: {"scanned":166,"created":0,"updated":166,"failed":0,"fallback_emails_used":24}
info: Errors: 0
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/customer-complete-2026-02-20T20-09-03-207Z-apply.json
info: ============================================================

info: [Historical Runner] Completed step: customers
info: [Historical Runner] Starting step: orders-invoices
info:  
============================================================
info: SANITY -> MEDUSA HISTORICAL COMMERCE MIGRATION
info: Mode: APPLY
info: Sanity source: r4og35qd/production
info: Limit: none
info: Order: customers -> orders -> invoices
info: ============================================================

info: Customers fetched: 166
info: Orders fetched: 88
info: Invoices fetched: 67
info:  
============================================================
info: HISTORICAL MIGRATION COMPLETE
info: Mode: APPLY
info: Customer summary: {"scanned":166,"created":0,"updated":166,"skipped":0,"failed":0}
info: Order summary: {"scanned":88,"created":0,"updated":88,"skipped":0,"failed":0}
info: Invoice summary: {"scanned":67,"created":0,"updated":67,"skipped":0,"failed":0}
info: Errors: 0
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/historical-commerce-2026-02-20T20-09-04-594Z-apply.json
info: ============================================================

info: [Historical Runner] Completed step: orders-invoices
info: [Historical Runner] Starting step: quotes-shipping-quotes
info:  
============================================================
info: HISTORICAL QUOTES MIGRATION COMPLETE
info: Mode: APPLY
info: Quote summary: {"scanned":0,"created":0,"updated":0,"failed":0}
info: Shipping quote summary: {"scanned":0,"created":0,"updated":0,"failed":0}
info: Errors: 0
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/historical-quotes-2026-02-20T20-09-05-192Z-apply.json
info: ============================================================

info: [Historical Runner] Completed step: quotes-shipping-quotes
info: [Historical Runner] Starting step: products-services-reconciliation
info: [Reconciliation] Starting (script) lookback=24h limit=200 dryRun=false
warn: [Product Sync] Invalid MPN format: "FAS-HC-001OW". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 850 Package | Trackhawk & Durango (1a91e721-04dc-44fb-a257-2eef4ecb83c8). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 850 Package | Trackhawk & Durango (prod_01KGA3CHX3N5NDHX6HK842Q3W5)
info: [Product Sync] Updating existing product: FAS 2.7L IHI Supercharger Rebuild (prod_01KG5WQYJSSYYYXJWYBCP7BP65)
warn: [Product Sync] Existing product has 3 option(s) but incoming has 1. Preserving existing variant options.
info: [Product Sync] Updated product prod_01KG5WQYJSSYYYXJWYBCP7BP65 with variant variant_01KG5WQYJS06S09AN7727HQMDX: $1200
warn: [Product Sync] Invalid MPN format: "FAS-TRX-004PX". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 500+ Performance Package | 500+ HP Turn-Key Build (2018+ F-150) (464a1a29-e992-4dad-b4b8-b4bfe5cb30ef). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 500+ Performance Package | 500+ HP Turn-Key Build (2018+ F-150) (prod_01KGA3EQGD676HVZ52VDNRJZSG)
warn: [Product Sync] Invalid MPN format: "FAS-PR-006H6". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 850 Package | TRX (5470d129-5c0c-4c3a-a348-35e87a8b1550). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 850 Package | TRX (prod_01KGA3ET7NCVNKGM9DYA9HT6KC)
info: [Product Sync] Updating existing product: 6" Axel-Back Exhaust (2011+ 6.7L Powerstroke) (prod_01KG5WR0BXJ8JWYX3SPHQRDC2S)
info: [Product Sync] Updated product prod_01KG5WR0BXJ8JWYX3SPHQRDC2S with variant variant_01KG5WR0BXG8F2CABQVPMGG2ZA: $699.99
warn: [Product Sync] Invalid MPN format: "FAS-TRX-007MU". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 800 Performance Package | TRX (7ba614f6-aad1-48b7-bbb3-4230c71a4e9c). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 800 Performance Package | TRX (prod_01KGA3EWX8WDNMC627YX2Y2SGD)
warn: [Product Sync] Invalid MPN format: "FAS-UNI-009I3". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 1000 Performance Package | TRX (85d6413f-d409-4e44-a237-e4a516995228). MPN will be omitted from metadata.
warn: [Product Sync] FAS 1000 Performance Package | TRX (85d6413f-d409-4e44-a237-e4a516995228): Price 17999 appears to already be in cents (>= 10000 and integer). Not converting. Verify Sanity data.
info: [Product Sync] Updating existing product: FAS 1000 Performance Package | TRX (prod_01KGA3EZHCHFC0YHV7K702E2C9)
warn: [Product Sync] Invalid MPN format: "piping kit". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: F.A.S. 2020+ 6.7L Powerstroke Piping Kit (a05acd88-0ea9-4aaf-8f78-cdc322953948). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: F.A.S. 2020+ 6.7L Powerstroke Piping Kit (prod_01KG5WR3V5KAKC6TGVAPR4K81V)
warn: [Product Sync] Existing product has 4 option(s) but incoming has 1. Preserving existing variant options.
info: [Product Sync] Updated product prod_01KG5WR3V5KAKC6TGVAPR4K81V with variant variant_01KG5WR3V5GS07BCZBEPH5DVSS: $1599.99
warn: [Product Sync] Invalid MPN format: "FAS-PR-011MV". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 800 Performance Package | Trackhawk/Durango (b7ad8224-d6e6-4c0f-a5f5-020f6543fbb0). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 800 Performance Package | Trackhawk/Durango (prod_01KGA3F5RY521F9N35TY8DR6XR)
info: [Product Sync] Updating existing product: FAS 900 Package | RAM TRX (prod_01KGA3FBJRJVRD48W5NKP4V447)
info: [Product Sync] Updating existing product: FAS FAFO T-Shirt (prod_01KG5WRZD1TBZRN7DRZA12WH3T)
info: [Product Sync] Updated product prod_01KG5WRZD1TBZRN7DRZA12WH3T with variant variant_01KG5WRZD1NEW4K2EZFEHX5AT5: $29.99
info: [Product Sync] Updating existing product: FAS 850 Package | Hellcat Platform (prod_01KGA3GKVSNEDNXRJMG8KNMZS8)
info: [Product Sync] Updating existing product: FAS 2.4L IHI Supercharger Rebuild (prod_01KG5WSN4EVDPPF0JTVMV2F8B3)
warn: [Product Sync] Existing product has 4 option(s) but incoming has 1. Preserving existing variant options.
info: [Product Sync] Updated product prod_01KG5WSN4EVDPPF0JTVMV2F8B3 with variant variant_01KG5WSN4EZBS6F3HB3431RER9: $1200
warn: [Product Sync] Invalid MPN format: "FAS-UNI-05726". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS 1000 Performance Package | Charger & Challenger (product-c3357fac-579d-458d-9675-bd055111718c). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS 1000 Performance Package | Charger & Challenger (prod_01KGA3H27ZQCZ4ZZ85YHC7BTH1)
info: [Product Sync] Updating existing product: FAS 1000 Performance Package – 1000 HP Turn-Key Build (2018+ F-150) (prod_01KGA3H65PW75HQC3T2JXHNZY6)
warn: [Product Sync] Invalid MPN format: "FAS-TRX-065SV". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: FAS “Factory Freak” Package | Trackhawk & Durango (product-f48895fa-7aca-4b91-9f8f-13136233655d). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: FAS “Factory Freak” Package | Trackhawk & Durango (prod_01KGA3HCX6W2956PC88WXC3NNW)
warn: [Product Sync] Invalid MPN format: "FAS-PR-0672R". Expected pattern: XX-XXXX (e.g., HC-A8FI). Product: Billet Bearing Plate | 2.4L IHI Hellcat | Installed (product-fc8c64e2-0375-4e6d-9544-b5bdd78d8bf3). MPN will be omitted from metadata.
info: [Product Sync] Updating existing product: Billet Bearing Plate | 2.4L IHI Hellcat | Installed (prod_01KGA3HFBXZT63V0KCA6FCRKCK)
info: [Reconciliation] Completed scanned=75 drifted=23 fixed=0 failed=23
info: [Reconciliation] Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/audits/reconciliation/product-sync-reconciliation-2026-02-20T20-09-11-352Z.json
info: [Historical Runner] Completed step: products-services-reconciliation
info:  
============================================================
info: HISTORICAL ALL RUNNER COMPLETE
info: Mode: apply
info: Duration: 8860ms
info: Report: /Users/ambermin/LocalStorm/Workspace/DevProjects/GitHub/fas-medusa/reports/historical-migration/historical-all-2026-02-20T20-09-11-355Z.json
info: ============================================================

info: Finished executing script.
ambermin@storm fas-medusa %
