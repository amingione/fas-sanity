# Audit Summary

## Executive Summary
- Sanity is the shared system of record for customers, vendors, orders, invoices, quotes, and messages; fas-cms-fresh reads and mutates these documents via API routes and server helpers.
- Stripe and EasyPost are active external authorities for payments and shipping, with order creation in `src/pages/api/webhooks.ts` and shipment updates in `netlify/functions/easypostWebhook.ts`.
- Multiple cross-repo contract mismatches exist (missing schemas, divergent field usage, and mixed document types), which currently destabilize vendor auth, promotions, and invoice/quote retrieval.

## What Is Correct
- Checkout and Stripe webhook flow creates Sanity orders with structured addresses, cart line items, and Stripe summary data (`src/pages/api/checkout.ts`, `src/pages/api/webhooks.ts`, `packages/sanity-config/src/schemaTypes/documents/order.tsx`).
- Customer identity is consistently normalized to lowercase emails in fas-cms-fresh auth and profile endpoints (`src/pages/api/auth/login.ts`, `src/pages/api/get-customer-profile.ts`).
- EasyPost rate and label flows are separated into rate lookup and label purchase (`src/pages/api/shipping/rates.ts`, `src/pages/api/shipping/create-label.ts`) with downstream shipment syncing in fas-sanity (`netlify/functions/easypostWebhook.ts`).

## What Is Fragile
- fas-cms-fresh assumes `promotion` and `vendorAuthToken` schemas that are not present in fas-sanity schema definitions, impacting promotions and vendor invite/reset flows.
- Vendor portal and wholesale order workflows reuse customer references and non-schema vendor fields, creating data integrity drift.
- Invoice and quote APIs read fields that are not defined in their schemas, leading to partial or empty responses and hidden data.

## What Must Be Decided Next (No Solutions)
- Whether the canonical discount system is Stripe customer discounts (`customer.discounts[]`) or promotion documents (type `promotion`) used by the storefront.
- Whether wholesale orders should reference vendors directly, and if so, which order field is authoritative for that relationship.
- Whether vendor auth tokens are expected as a first-class Sanity document type, and if so, which schema name is authoritative.
- Which quote document type is the authoritative customer-facing quote (`quote` vs `buildQuote` vs `quoteRequest`).
- Which fields are canonical for vendor identity (`companyName`/`portalAccess.email` vs top-level `name`/`email`).
