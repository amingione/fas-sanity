# Claude AI Guide — fas-sanity

**Version:** 3.0.0
**Last Updated:** 2026-04-02
**Status:** Phase 6 — Optimize UX (Active)

---

## Architecture Authority

This repo is the **Sanity content layer** of the FAS 4-repo commerce pipeline.

```
Sanity (content) → Medusa (commerce) → fas-cms-fresh (storefront) + fas-dash (ops) → Stripe/Shippo via Medusa
```

**Medusa owns:** products, variants, pricing, inventory, cart, checkout, orders, customers, shipping, payments, refunds.
**Sanity owns:** product content enrichment (title, description, images, SEO), editorial pages, blog, campaigns, vendor CRM metadata.

Stripe and Shippo are ONLY accessed via Medusa. Never directly.

---

## Non-Negotiable Rules

- Sanity is content-only and non-transactional.
- All `integration` group schema fields are `readOnly: true` — never write prices, stock, or order state from app code.
- No direct Stripe or Shippo SDK calls in this repo.
- Legacy Netlify commerce functions (createCheckoutSession, stripeWebhook, manual-fulfill-order, createRefund) are 410 GONE.
- New work must reduce drift toward the end-state pipeline, not expand legacy paths.

---

## Sanity Project

- **Project ID:** `r4og35qd`
- **Dataset:** `production`
- **Netlify Site (studio):** `43b3d2f9-45f1-444a-8672-48a8694cba5b`
- **Netlify Site (ingress):** `334cf000-980e-414d-9450-dc983ac92279`

---

## Key Paths

```
packages/sanity-config/src/schemaTypes/   ← all document/object schema types
  documents/product.ts                    ← product content + readOnly integration fields
  documents/productVariant.tsx            ← variant with readOnly medusaVariantId
  documents/vendor*.ts                    ← vendor CRM (non-transactional)

netlify/functions/                        ← active Netlify functions
  generateInvoicePDF.ts                   ← PDF generation (active)
  generateQuotePDF.ts                     ← PDF generation (active)
  generatePackingSlips.ts                 ← PDF generation (active)
  send-vendor-invite.ts                   ← vendor email (active)
  vendor-timeline-webhook.ts              ← vendor activity events (active)
  stripeWebhook.ts                        ← 410 GONE (commerce functions dead)
  createCheckoutSession.ts                ← 410 GONE
  manual-fulfill-order.ts                 ← 410 GONE
  createRefund.ts                         ← 410 GONE

scripts/                                  ← active utility scripts only
  syncProductsToMedusa.ts                 ← product sync to Medusa
  linkPriceSetsPostSync.ts                ← post-sync price set linker
  check-schema-drift.mjs                  ← governance drift check
  sync-gmc-status.ts                      ← Google Merchant Center sync
  scripts/archive/                        ← one-time migration scripts (completed, do not re-run)

docs/governance/
  FAS_4_REPO_PIPELINE_TASK_TRACKER.md     ← canonical cross-repo workstream tracker
docs/archive/                             ← stale/superseded docs (read-only reference)
```

---

## Governance Tracker

Canonical: `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md`

Workstream summary as of 2026-04-02:
- WS1 (Authority Boundary): ✅ done — no direct Stripe/Shippo SDK, all integration fields readOnly
- WS2 (Product/Pricing Authority): ✅ done — Medusa authoritative, Sanity read-only mirror
- WS3 (Order Pipeline): ✅ done — Stripe webhook idempotent, ghost filter fixed
- WS4 (Fulfillment/Returns): ✅ done — Shippo via Medusa module, tracking dialog built
- WS5 (Content Separation): ✅ done — editorial workflows unaffected
- WS6 (Governance/CI): ✅ done — lint/typecheck clean, release checklist created
- Open: WS3-3 (reconciliation resolve/retry UI), WS4-2 (Dash approve/refund UI Phase 7)

---

## Active Env Vars (required in Netlify)

```
SANITY_PROJECT_ID=r4og35qd
SANITY_DATASET=production
SANITY_AUTH_TOKEN=...
MEDUSA_BACKEND_URL=https://api.fasmotorsports.com
RESEND_API_KEY=...
VENDOR_WEBHOOK_SECRET=...   # same value as fas-medusa Railway env
```

---

## What NOT to Do

- Do NOT write to `price`, `compareAtPrice`, `inventory`, or order-state fields in Sanity from app code.
- Do NOT add new Netlify functions that call Stripe or Shippo directly.
- Do NOT re-run scripts in `scripts/archive/` — they were one-time migrations already applied.
- Do NOT expand the `fas-cms-fresh/` or `fas-sanity/` nested dirs at repo root (they are empty artifacts).
