# Phase 2 Decisions — Vendor Portal Polish

Scope: `fas-sanity` + `fas-cms-fresh`. Decision-only checkpoint. No implementation changes.

## Decision Summary

- Canonical vendor auth path is `fas-cms-fresh/src/pages/api/vendor/login.ts` with a single gate: `vendor.portalAccess.enabled === true` and `vendor.status === 'active'` (schema values are lowercase: `active`, `inactive`, `pending`, `suspended`, `on_hold`). Any `Approved` string usage is invalid and will be removed in implementation.
- Session contract for vendor portal uses `fas-cms-fresh/src/server/auth/session.ts` JWT payload: `sub` (vendor id), `email`, `roles` (lowercased). No anonymous vendor access to portal routes.
- Vendor permissions are limited to customer-like flows (wholesale pricing, order placement, order status, quotes). Supplier-style permissions (inventory, products, analytics, invoices) are treated as forbidden in portal enforcement, even if present in schema options.
- Email origination for all vendor transactional emails is **fas-sanity only**. `fas-cms-fresh` must not send vendor emails and will defer to fas-sanity functions/templates.
- Canonical vendor application UI is the Astro form in `fas-cms-fresh/src/pages/become-a-vendor.astro`. Canonical handler is `fas-sanity/netlify/functions/vendor-application.ts` with schema-safe payload only.
- Legacy and duplicate paths are deprecated in implementation: `fas-sanity/public/vendor-application.html`, `fas-sanity/netlify/functions/submitVendorApplication.ts`, and `fas-cms-fresh/src/pages/api/vendor-application.ts` (after parity is confirmed).
- Portal surface is minimal until auth/email consolidation is complete: login, setup, catalog, order creation, order history. Messages and analytics remain disabled.

## Proposed Target Flow Diagram

```
Applicant
  |
  v
fas-cms-fresh Astro form (become-a-vendor)
  |
  v
fas-sanity Netlify function (vendor-application)
  |
  v
Sanity vendorApplication (status: pending)
  |
  v
Internal review -> approve/reject
  |
  +--> approved: create vendor (status: active, portalAccess.enabled=true)
          |
          v
     fas-sanity send-vendor-invite (email + setup token)
          |
          v
     fas-cms-fresh /vendor-portal/setup (uses token)
          |
          v
     fas-cms-fresh /api/vendor/login (session JWT)
          |
          v
     Vendor Portal (catalog, wholesale order, order history)
```

## Schema Impact Assessment

- No schema changes requested.
- Vendor status values must align with `packages/sanity-config/src/schemaTypes/documents/vendor.ts`: `active`, `inactive`, `pending`, `suspended`, `on_hold`.
- Vendor application payload must align with `packages/sanity-config/src/schemaTypes/documents/vendorApplication.ts`. Non-schema fields currently sent by fas-cms-fresh (`businessAddress.full`, `resaleCertificateId`, `additionalInfo`) will be dropped or mapped in implementation without introducing new fields.
- Portal access uses existing fields only: `vendor.portalAccess.enabled`, `vendor.portalAccess.permissions`.

## Approval Checkpoint

Awaiting human approval to proceed to Phase 3 implementation.
