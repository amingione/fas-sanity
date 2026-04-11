# fas-sanity — Phase Progress Log
_Last updated: 2026-04-10_

Tracks completion against the canonical architecture package:
- `docs/governance/checkout-architecture-governance.md`
- `docs/governance/commerce-authority-checklist.md`
- `docs/architecture/canonical-commerce-architecture.md`
- `docs/architecture/migration-status.md`

---

## Strategic Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Lock Architecture (Medusa = commerce authority, Sanity = content-only) | ✅ Complete |
| 1 | Stabilize Medusa Foundation | ✅ Complete (Railway deployment live) |
| 2 | Sanity Restructure — strip transactional fields | ✅ Complete |
| 3 | Define Sync Contracts | ✅ Complete (documented + webhook code in place) |
| 4 | Vendor Timeline Live | ✅ Complete |
| 5 | Remove Legacy Systems | ⏳ Partial |
| 6 | Optimize UX & Performance | ⏳ In Progress |
| 7 | Hardening & Governance | 🔜 Not Started |

---

## Recent Updates (2026-04-10)

### ✅ Blockers Resolved
- **Publishable key issue** — Resolved: `/store/*` routes now return 200 (key `pk_dcb89b...` verified)
- **Shippo UPS linkage** — Confirmed: UPS shipping integration working correctly
- **Environment audit baseline** — Stamped via `dotenvx-env-audit.sh` script

## Completed Work

### Schema Restructure
- ✅ Product schema — content-focused (descriptions, images, SEO, medusaProductId reference)
- ✅ Pricing, inventory, Stripe IDs, shipping objects removed from product schema
- ✅ Order schema — non-authoritative mirror only (Medusa owns the record)
- ✅ Vendor schema — content + relationship data, no transactional state
- ✅ `vendorActivityEvent` schema — read-only system document for vendor timeline
- ✅ Content schemas: `brandAsset`, `legalContent`, `navigationMenu`, templates

### Webhooks & Integration
- ✅ `netlify/functions/vendor-timeline-webhook.ts` — HMAC verification, idempotency
- ✅ Sanity → Medusa product sync webhook registered
- ✅ Sanity → Medusa order sync webhook registered
- ✅ `sanityClientShim` — compatibility layer for Medusa integration

### Env Keys (Production — Netlify fas-sanity)
- ✅ `VENDOR_WEBHOOK_SECRET` — must match Railway fas-medusa (`openssl rand -hex 32`)
- ✅ `SANITY_WEBHOOK_SECRET` — shared HMAC secret with fas-medusa Railway env
- ✅ `MEDUSA_API_URL=https://api.fasmotorsports.com`

### Studio
- ✅ Desk structure redesigned — content-focused organization
- ✅ `NO_NEW_COMMERCE_FIELDS_IN_SANITY.md` governance doc in place
- ✅ Vendor portal workspace section active
- ✅ Sales person workspace in Studio

### Governance
- ✅ `docs/NO_NEW_COMMERCE_FIELDS_IN_SANITY.md` — enforced rule
- ✅ `AI_GUIDELINES.md` — AI assistant boundaries
- ✅ `AGENTS.md` — agent configuration

---

## Remaining Work

### Code — Medium Priority

1. **Studio UX improvements**
   - Content completeness indicators per product document
   - Better filtering in vendor workspace desk

2. **Email template authoring workflow**
   - Templates live in Sanity; author workflow documentation needed
   - Consumed by fas-dash for email sends via Resend

3. **Quote/invoice template authoring**
   - Layout templates for PDF print routes (fas-dash print API)

4. **Vendor portal completion**
   - Vendor product submission, wholesale ordering, and sales comms pipeline
   - Depends on `fas-vendors` Medusa module

---

## What Sanity Owns (Canonical)

| Data | Auth Rule |
|------|----------|
| Product copy (descriptions, images, SEO, keyFeatures) | ✅ Sanity owns |
| Blog posts, categories | ✅ Sanity owns |
| Navigation menus, legal content, brand assets | ✅ Sanity owns |
| Email templates, quote templates, invoice templates | ✅ Sanity owns |
| Calendar events | ✅ Sanity owns |
| Vendor profiles (content/relationship metadata) | ✅ Sanity owns |
| `vendorActivityEvent` (timeline, read-only) | ✅ Sanity owns |
| **Pricing, inventory, orders, payments, carts** | 🚫 Medusa owns — never write here |

---

## Sync Contracts (Live)

| Direction | Trigger | What Syncs |
|-----------|---------|-----------|
| Sanity → Medusa | Product publish webhook | Full product sync via fas-medusa workflow |
| Sanity → Medusa | Order creation in Sanity | Mirror order record to Medusa |
| Medusa → Sanity | Vendor order fulfilled event | Write `vendorActivityEvent` doc |
| Medusa → Sanity | Vendor payment captured event | Write `vendorActivityEvent` doc |
| Medusa → Sanity | Vendor order cancelled event | Write `vendorActivityEvent` doc |
| Sanity → fas-cms-fresh | Document publish | Trigger Netlify rebuild (ISR) |
