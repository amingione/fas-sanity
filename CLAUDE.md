# Claude AI Guide — fas-sanity

<<<<<<< HEAD
**Version:** 3.0.0
**Last Updated:** 2026-04-02
**Status:** Phase 6 — Optimize UX (Active)
=======
**Version:** 2.0.0
**Last Updated:** 2026-02-24
**For:** Claude Code, Cursor, and other AI assistants

---

## ⚡ CURRENT STATUS (2026-02-24)

**Active Phase**: Phase 1 Stabilization → Vendor Timeline Live

### ✅ NEW (2026-02-24)
- `vendorActivityEvent` schema — `packages/sanity-config/src/schemaTypes/documents/vendorActivityEvent.ts`
  - Read-only system document, registered in schema index
- `vendor-timeline-webhook.ts` Netlify function — `netlify/functions/vendor-timeline-webhook.ts`
  - Verifies HMAC (VENDOR_WEBHOOK_SECRET), idempotency on eventId, writes vendorActivityEvent docs

### 🔴 Manual Steps Required (env/infra — not code)
- Set `VENDOR_WEBHOOK_SECRET` in Netlify (fas-sanity) — same value as Railway fas-medusa
  - Generate: `openssl rand -hex 32`
  - Runbook: `fas-medusa/docs/ops-runbook-webhook-and-key-setup.md §3`
- Register Sanity Studio webhooks (product-sync + order-sync → Medusa)
  - Runbook: `fas-medusa/docs/ops-runbook-webhook-and-key-setup.md §1`
- Publishable key rotation (needs Railway shell) — see runbook §2

### ⏳ Still Pending
- Full curl workflow pass (product → cart → shipping → payment → order)
- Sanity project ID canonical lock (confirmed `r4og35qd` — needs env audit)
- Shippo UPS carrier linkage verification

**Sanity Project**: `r4og35qd` | Dataset: `production`
**Netlify Site IDs**: fassanity=`43b3d2f9-45f1-444a-8672-48a8694cba5b` | ingress=`334cf000-980e-414d-9450-dc983ac92279`

See full phase plan: `docs/SourceOfTruths/nextjs-medusa-takeover-plan/00-START-HERE/CURRENT-PHASE.md`
See vendor portal rules: `docs/SourceOfTruths/fas-sanity-vendor-portal-keep.md`
See integration status: `../docs/INTEGRATION_STATUS.md`

---

> **📖 Full Documentation:** See [codex.md](./codex.md) for comprehensive patterns, examples, and integration details.
>>>>>>> 659912a4 (feat: Add vendor timeline webhook and related schema for vendor activity events)

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

### AI — Claude Proxy
Used by: `netlify/functions/claude-chat.ts`
Returns 500 if absent — AI chat in Sanity Studio broken.
```
ANTHROPIC_API_KEY             required — Claude API key for Studio AI chat proxy
ANTHROPIC_MODEL               optional — defaults to claude-3-5-sonnet; override to pin model
```

### SMS — Twilio
Used by: `netlify/functions/notify-sms.ts`
Returns 500 if absent — SMS notifications broken.
```
TWILIO_ACCOUNT_SID            required
TWILIO_AUTH_TOKEN             required
TWILIO_PHONE_NUMBER           required
```

### Google Ads — Customer Match
Used by: `netlify/functions/uploadCustomerMatch.ts`
Silently fails if absent.
```
GOOGLE_ADS_CLIENT_ID          required
GOOGLE_ADS_CLIENT_SECRET      required
GOOGLE_ADS_REFRESH_TOKEN      required
GOOGLE_ADS_DEVELOPER_TOKEN    required
GOOGLE_ADS_LOGIN_CUSTOMER_ID  required
GOOGLE_ADS_CUSTOMER_ID        required
GOOGLE_ADS_CUSTOMER_MATCH_LIST required
```

### Google Merchant Center
Used by: `netlify/functions/syncMerchantProducts.ts`, `netlify/functions/merchantFeed.ts`
```
GOOGLE_MERCHANT_ID                    required — Merchant Center account ID
GOOGLE_SERVICE_ACCOUNT_EMAIL          required — service account for googleapis auth
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY    required — PEM key for service account
MERCHANT_SYNC_SECRET                  required — auth guard for syncMerchantProducts endpoint
MERCHANT_FEED_API_SECRET              required — auth guard for merchantFeed endpoint (open without this)
SITE_BASE_URL                         required by syncMerchantProducts — product URL prefix
```

### Backfill Auth Guards
```
SYNC_BACKFILL_SECRET    required — auth guard for syncSanityProductsToMedusa (open endpoint without this)
```

### Vendor Timeline Reconciliation
Used by: `netlify/functions/vendor-timeline-reconcile.ts`
```
VENDOR_TIMELINE_RECONCILE_SECRET    optional — falls back to VENDOR_WEBHOOK_SECRET if absent; document the fallback in ops runbook
```

### Stripe Financial Connections (Optional)
Used by: `netlify/functions/createFinancialConnectionSession.ts`
Falls back to PUBLIC_COMPANY_NAME / PUBLIC_STUDIO_URL if absent.
```
FINANCIAL_CONNECTIONS_BUSINESS_NAME   optional — display name in Stripe FC modal
FINANCIAL_CONNECTIONS_RETURN_URL      optional — redirect after FC session
```

### Log Drain (Optional)
Used by: `netlify/functions/logDrainProxy.ts`
```
LOG_DRAIN_ENABLED    optional — set to "false" to disable proxy; enabled by default
```

---

## What NOT to Do

- Do NOT write to `price`, `compareAtPrice`, `inventory`, or order-state fields in Sanity from app code.
- Do NOT add new Netlify functions that call Stripe or Shippo directly.
- Do NOT re-run scripts in `scripts/archive/` — they were one-time migrations already applied.
- Do NOT expand the `fas-cms-fresh/` or `fas-sanity/` nested dirs at repo root (they are empty artifacts).
