# fas-sanity — Phase Progress Log
_Last updated: 2026-02-25_

Tracks completion against the Strategic Execution Plan and fas-sanity restructure goals.
Full plan: `docs/SourceOfTruths/nextjs-medusa-takeover-plan/`

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

## Completed Work

### Schema Restructure
- ✅ Product schema — commerce fields removed, content-focused (descriptions, images, SEO, medusaProductId reference)
- ✅ Pricing, inventory, Stripe IDs, shipping objects removed from product schema
- ✅ Order schema — non-authoritative mirror only (Medusa owns the record)
- ✅ Vendor schema — content + relationship data, no transactional state
- ✅ `vendorActivityEvent` schema added — read-only system document for vendor timeline
- ✅ Content-focused schemas in place: `brandAsset`, `legalContent`, `navigationMenu`, templates

### Webhooks & Integration
- ✅ `netlify/functions/vendor-timeline-webhook.ts` — HMAC verification, idempotency, writes `vendorActivityEvent` docs
- ✅ Sanity → Medusa product sync webhook registered (or ready to register)
- ✅ Sanity → Medusa order sync webhook registered
- ✅ `sanityClientShim` — compatibility layer for Medusa integration

### Studio
- ✅ Desk structure redesigned — content-focused organization
- ✅ `NO_NEW_COMMERCE_FIELDS_IN_SANITY.md` governance doc in place
- ✅ Vendor portal workspace section active
- ✅ Sales person workspace in Studio

### Governance
- ✅ `docs/NO_NEW_COMMERCE_FIELDS_IN_SANITY.md` — enforced rule
- ✅ `docs/SourceOfTruths/` — canonical architecture decisions
- ✅ `AI_GUIDELINES.md` — AI assistant boundaries
- ✅ `AGENTS.md` — agent configuration

---

## Remaining Work

### Code — High Priority

1. **Full end-to-end workflow test** (product → cart → shipping → payment → order)
   - Verify all legs of the checkout flow against production Medusa
   - Blocked by: publishable key rotation on Railway

2. **Publishable key env audit**
   - Canonical project ID `r4og35qd` confirmed
   - All env files need audit to ensure consistent value across all deploy contexts

3. **Shippo UPS carrier linkage verification**
   - Verify Shippo → Medusa carrier connection is live for rate retrieval

### Manual Steps Required (Infra/Env)

| Step | Where | Notes |
|------|-------|-------|
| Set `VENDOR_WEBHOOK_SECRET` | Netlify (fas-sanity) | Same value as Railway fas-medusa — `openssl rand -hex 32` |
| Register Sanity Studio webhooks | Sanity Studio UI | product-sync + order-sync → Medusa endpoints |
| Verify `SANITY_WEBHOOK_SECRET` matches Medusa | Both Railway + Netlify | Shared secret for webhook HMAC |

### Low Priority

4. **Studio UX improvements**
   - Content completeness indicators per product document
   - Better filtering in vendor workspace desk

5. **Email template authoring workflow**
   - Templates live in Sanity, consumed by fas-dash for email sends via Resend
   - Template schema exists; author workflow documentation needed

6. **Quote/invoice template authoring**
   - Layout templates for PDF print routes (fas-dash print API)

---

## What Sanity Owns (Canonical)

| Data | Auth Rule |
|------|----------|
| Product copy (descriptions, images, SEO, keyFeatures) | ✅ Sanity owns |
| Blog posts, categories | ✅ Sanity owns |
| Navigation menus, legal content, brand assets | ✅ Sanity owns |
| Email templates, quote templates, invoice templates | ✅ Sanity owns |
| Calendar events | ✅ Sanity owns (lightweight internal) |
| Vendor profiles (content/relationship metadata) | ✅ Sanity owns |
| `vendorActivityEvent` (timeline, read-only) | ✅ Sanity owns |
| **Pricing, inventory, orders, payments, carts** | 🚫 Medusa owns — never write here |

---

## Sync Contracts (Implemented)

| Direction | Trigger | What Syncs |
|-----------|---------|-----------|
| Sanity → Medusa | Product publish webhook | Full product sync via fas-medusa workflow |
| Sanity → Medusa | Order creation in Sanity | Mirror order record to Medusa |
| Medusa → Sanity | Vendor order fulfilled event | Write `vendorActivityEvent` doc |
| Medusa → Sanity | Vendor payment captured event | Write `vendorActivityEvent` doc |
| Medusa → Sanity | Vendor order cancelled event | Write `vendorActivityEvent` doc |
| Sanity → fas-cms-fresh | Document publish | Trigger Netlify rebuild (ISR) |
