# FAS Ecosystem — Final Pre-Implementation Audit

**Verified: February 12, 2026** **Coordinator: Claude (this document)** **Executor: Claude Code**

---

## Verified State of All 4 Repos

### fas-medusa (Medusa v2.12.6) ✅ MOST MATURE

**Already has:**

- Stripe payment module configured
- Shippo fulfillment module (`fulfillment-shippo`) — UPS-only, live rate calculation, parcel building from variant dimensions
- Sanity → Medusa product sync workflow (6 steps: fetch → validate → transform → upsert → tag sync → update Sanity metadata)
- Sanity product sync webhook endpoint (`/api/webhooks/sanity-product-sync`) with signature verification, idempotency (postgres event log), dead letter queue, retry logic
- Shippo webhook endpoint (`/api/webhooks/shippo`)
- Product sync reconciliation job
- 40+ scripts for repair, audit, migration, and diagnostics
- `@sanity/client` already installed (used for sync workflows)
- Medusa admin + store API routes (custom endpoints at `/api/admin/custom` and `/api/store/custom`)
- `shippo-rates` store endpoint for live rate fetching

**Does NOT have:**

- Custom modules for: quotes, invoices, vendors, purchase orders
- Subscriber handlers in `/src/subscribers/` (directory exists but empty — only README)
- Admin UI customizations (minimal `/src/admin/`)
- No `.env` file (only `.env.template` — needs to be created from template before running)

**Key env vars needed (from template):**

- `DATABASE_URL`, `REDIS_URL`, `SHIPPO_API_KEY`, `SHIPPO_ORIGIN_*` (warehouse address), `STRIPE_SECRET_KEY`
- `SANITY_PROJECT_ID`, `SANITY_DATASET`, `SANITY_API_TOKEN` (for sync workflow)
- `SANITY_SYNC_SALES_CHANNEL_ID`, `SANITY_SYNC_SHIPPING_PROFILE_ID` (Medusa references)

---

### fas-sanity (Sanity CMS) ✅ AUDITED

**Current count:** 87 document schemas, ~55 object types, 3 singletons = ~145 total **Target count:** ~38 document schemas, ~35 object types, 3 singletons = ~76 total

**Sanity Project ID:** `r4og35qd` (confirmed in fas-dash `.env` — note: differs from `ps4wgpv9` hardcoded in `lib/sanity.ts` as fallback)

**Critical finding:** fas-dash has `NEXT_PUBLIC_SANITY_PROJECT_ID=r4og35qd` but `lib/sanity.ts` has hardcoded fallback `ps4wgpv9`. These might be different projects. **Verify which project ID is actually in use before any migration.**

**Product schema already has Medusa link fields:**

- `medusaProductId` — set by the sync workflow's `update-sanity-metadata` step
- `medusaVariantId` — same

**Sync direction already established:** Sanity → Medusa (webhook pushes product data to Medusa). The restructure plan reverses the authority while keeping this sync mechanism for the content layer.

---

### fas-dash (Next.js 15 + NextAuth) ⚠️ NEEDS FULL REWRITE OF DATA LAYER

**Current state: 100% Sanity-dependent**

- 50+ API routes ALL hit `sanityClient.fetch()` or `sanityClient.create()`
- `lib/queries.ts` — ~500 lines of GROQ queries for transactional data
- `lib/store-adapter.ts` — ~300 lines mapping Sanity products to UI types (includes price, inventory, availability — all wrong source)
- `lib/auth/options.ts` — authenticates against Sanity `user` docs (bcrypt)
- Auth/RBAC working: 5 roles (admin, manager, sales, warehouse, support) with path-based permissions

**What fas-dash does NOT have:**

- No `@medusajs/js-sdk` or any Medusa dependency
- No Medusa env vars in `.env` or `.env.example`
- No Shippo client
- No Stripe SDK (despite handling refunds/payments conceptually in UI)

**Store pages that should be deleted:**

- `(store)/` — product listing and detail pages duplicate fas-cms-fresh
- `(landing)/` — marketing pages (blog, brand, pricing, about) duplicate fas-cms-fresh
- `src/content/` — static MDX blog posts, should come from Sanity
- `src/lib/context/CartContext.tsx`, `src/components/cart/` — cart belongs in storefront

**What stays as-is:**

- `(auth)/` — login/register flow (uses Sanity users, keep for now)
- `dashboard/` — the core admin panel (all pages reusable, just need data source swap)
- `app/components/dashboard/` — UI components (tables, filters, badges, charts)
- `app/components/print/` — invoice/packing/picklist renderers (swap data source)
- Auth middleware + RBAC permissions
- Blog API routes (Sanity is correct source)
- Calendar API routes (keep Sanity for now)
- Email sending via Resend
- AI gateway
- OG image generation
- Barcode lookup

---

### fas-cms-fresh (Astro Storefront) ✅ ALREADY MEDUSA-AWARE

**Already has:**

- `lib/medusa.ts` — full Medusa client with `medusaFetch()`, config resolution, publishable key support
- `lib/medusa-pricing.ts` — pricing utilities with authority comments, `assertMedusaPrice()` validation
- `lib/medusa-metadata.ts` — metadata utilities
- `lib/medusa-storefront-pricing.ts` — storefront-specific pricing
- `lib/cart.ts`, `lib/cart/` — Medusa cart integration
- `checkout/` — checkout flow
- Multiple Sanity clients (`lib/sanity.ts`, `lib/sanityClient.ts`, `lib/sanityServer.ts`, `lib/sanityFetch.ts`)
- `lib/queries.ts`, `lib/storefrontQueries.ts`, `lib/blogQueries.ts` — GROQ for content
- `lib/stripe-config.ts` — Stripe integration
- `lib/emailService.ts`, `lib/resend.ts` — email sending

**Already correct architecture:** Medusa for commerce (pricing, cart, checkout), Sanity for content (product descriptions, blog, pages, SEO). This is the target pattern fas-dash needs to adopt.

---

## Corrections to Previous Plan

### 1. Sanity Project ID mismatch

fas-dash `lib/sanity.ts` has fallback `ps4wgpv9` but `.env` says `r4og35qd`. Need to confirm which is live. The `.env` value likely wins since it's set, but both IDs should be audited.

### 2. Sync infrastructure already exists

The plan proposed building Medusa → Sanity webhook sync. **This already exists** in fas-medusa as a mature system with:

- 6-step workflow with rollback
- Idempotent event processing with postgres tracking
- Dead letter queue for failed syncs
- Signature verification
- Multi-product batch support

The plan should LEVERAGE this, not rebuild it.

### 3. fas-medusa already has `@sanity/client`

No need to add it. The sync workflows already fetch from and write to Sanity.

### 4. fas-cms-fresh is ALREADY the reference implementation

It already does exactly what fas-dash needs: Medusa for commerce, Sanity for content. Code patterns can be directly referenced.

### 5. `fulfillment-shippo` has a deliberate no-auto-label policy

`createFulfillment()` throws an error by design — labels must be purchased manually in Shippo dashboard. fas-dash shipping UI should respect this.

### 6. The `(landing)` route group has marketing/SaaS-template pages

The landing pages (hero, features, testimonials, pricing, FAQ) appear to be from a UI template ("once-ui-system/magic-convert" in package.json). These are NOT FAS storefront pages — they're template boilerplate. Safe to delete entirely.

---

## Locked-In Decisions (Confirmed)

1. **Medusa = sole source of truth** for all commerce data (orders, customers, products/pricing/inventory, shipping, returns, payments)
2. **Sanity = content + experience layer** — product descriptions/images/SEO, blog, email templates, document templates, marketing campaigns, calendar events
3. **Email workflow:** Sanity authors templates → fas-dash/Next.js fetches template + Medusa data → sends via Resend
4. **Marketing email content stays in Sanity** (`emailCampaign`, `emailTemplate`). Execution tracking (`emailLog`, `emailAutomation`) moves out.
5. **Product API is hybrid:** Medusa for commerce fields, Sanity for content fields, merged at fas-dash API layer
6. **Store/landing pages deleted from fas-dash** — Astro handles public storefront
7. **Auth stays in Sanity short-term** — migrate to Medusa admin auth after everything else is stable
8. **fas-medusa's existing sync workflow is the foundation** — extend it, don't replace it
9. **No pricing, inventory, or shipping authority in Sanity** — guard this boundary

---

## Implementation Readiness Checklist

|Prerequisite|Status|Action|
|---|---|---|
|fas-medusa running locally with Postgres + Redis|❓ Verify|Needs `.env` from template|
|Medusa product data seeded|❓ Verify|Check if sync has been run|
|Sanity project ID confirmed (`r4og35qd` vs `ps4wgpv9`)|❓ Verify|Check Sanity dashboard|
|Medusa Admin API key exists|❓ Verify|Run `create-api-key.ts` script if not|
|Medusa sales channel + shipping profile IDs known|❓ Verify|Needed for sync config|
|fas-dash can reach Medusa on localhost:9000|❓ Verify|Will need CORS update|

---

## Phase Execution Order (Updated)

### Phase 0 — Foundation (Claude Code Task 1-3)

1. Create `fas-dash/src/lib/medusa-admin.ts` — typed admin API client
2. Create `fas-dash/src/lib/adapters/` — order, customer, product, inventory adapters
3. Add env vars to `.env` and `.env.example`
4. Install `@medusajs/types` (for type imports, not the full SDK)

### Phase 1 — Core Commerce Routes (Claude Code Tasks 4-10)

Rewrite in order: orders → customers → products (hybrid) → inventory

### Phase 2 — Operations Routes (Claude Code Tasks 11-16)

Rewrite: fulfillment → shipping → returns → quotes → invoices

### Phase 3 — Vendor & Secondary Routes (Claude Code Tasks 17-22)

Rewrite: vendors → POs → reports → settings → bulk ops → notifications

### Phase 4 — Templates & Email (Claude Code Tasks 23-25)

Wire: print routes (Medusa data + Sanity templates) → email webhook handler → marketing email orchestrator

### Phase 5 — Cleanup (Claude Code Tasks 26-28)

Delete: `(store)/`, `(landing)/`, store components, dead queries from `queries.ts`, cart context, content files

### Phase 6 — Auth Migration (Future)

Optional: Migrate from Sanity `user` docs to Medusa admin auth

---

## What I (Coordinator) Will Check After Each Phase

1. **No Sanity reads for commerce data** — grep for GROQ queries that fetch orders, inventory, pricing, customers
2. **No Sanity writes for commerce data** — grep for `sanityClient.create` or `sanityClient.patch` on commerce types
3. **Type safety** — no `any` types in new adapter files
4. **Existing UI components unchanged** — dashboard pages should render with the new data shape via adapters
5. **Auth still works** — NextAuth + Sanity users unchanged until Phase 6
6. **Blog/calendar routes untouched** — these correctly use Sanity
7. **CORS configured** — fas-dash can reach Medusa on its configured URL