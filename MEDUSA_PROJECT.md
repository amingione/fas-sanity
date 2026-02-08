# FAS Motorsports - Sanity Repo Objectives

> Sanity-specific phase objectives for the Medusa migration project.
> **Central control hub:** [`fas-medusa/docs/PROJECT_STATUS.md`](../fas-medusa/docs/PROJECT_STATUS.md)

---

## Sanity's Role in the Migration

Sanity is transitioning from a hybrid commerce/content system to a **content-only + operations** role:

| Before Migration | After Migration |
|-----------------|-----------------|
| Content + some commerce logic | Content only |
| Direct Stripe calls | No direct payment calls |
| Order creation in webhooks | Order record-keeping (non-authoritative) |
| Shipping label purchase (keeps this) | Shipping label purchase via stored Shippo rate IDs |
| 88 Netlify functions | Streamlined function set |

---

## Current Phase: Phase 2 - E-Commerce Integration

### What Sanity Needs to Do in Phase 2

#### 2B: Product Sync (Sanity's Side)
- [ ] Ensure webhook fires on product content changes (descriptions, images, SEO)
- [ ] Validate that Sanity product schemas expose the data Medusa sync workflow expects
- [ ] Document which Sanity fields map to which Medusa fields
- [ ] Test: Content change in Studio triggers sync to Medusa

#### 2C: Cart Integration (Sanity's Side)
- [ ] No direct Sanity work required (cart lives in Medusa)
- [ ] Verify add-ons data is accessible via Medusa API for cart line items

#### 2D: Order Fulfillment (Sanity's Side)
- [ ] Verify Stripe webhook (`stripeWebhook.ts`) creates accurate Sanity order records
- [ ] Ensure `shippoRateId` is preserved from checkout through order document
- [ ] Verify label purchase flow in Sanity Studio still works with Medusa orders
- [ ] Test: Complete order -> Sanity record -> Label purchase -> Tracking update

### Key Files in This Repo

| File | Purpose | Status |
|------|---------|--------|
| `netlify/functions/createCheckoutSession.ts` | Checkout session creation (25K) | Phase 1 complete |
| `netlify/functions/stripeWebhook.ts` | Order creation from Stripe events (329K) | Working, needs Phase 2 validation |
| `netlify/functions/manual-fulfill-order.ts` | Label purchase from Studio | Working |
| `netlify/lib/stripeShipping.ts` | Metadata extraction utilities (330 lines) | Working |
| `packages/sanity-config/src/schemaTypes/documents/order.ts` | Order schema | Review for Phase 2 |
| `CLAUDE.md` | AI context for this repo | Active |
| `AGENTS.md` | Architecture authority reference | Active |

---

## Boundaries (Non-Negotiable)

From `AGENTS.md` and `CLAUDE.md`:

**Sanity MUST NOT:**
- Contain pricing logic, inventory counts, or shipping rules
- Compute cart totals or checkout flows
- Make direct Stripe or Shippo API calls (except label purchase via stored rate ID)
- Be treated as a transactional database

**Sanity MUST:**
- Remain the authority for content (descriptions, images, SEO, marketing)
- Keep non-authoritative order records for employee operations
- Provide label purchase UI via Sanity Studio
- Fire webhooks on content changes for sync pipelines

---

## Quick Links

| Document | Location |
|----------|----------|
| Project Status | [`fas-medusa/docs/PROJECT_STATUS.md`](../fas-medusa/docs/PROJECT_STATUS.md) |
| Phase Tracker | [`fas-medusa/docs/PHASE_TRACKER.md`](../fas-medusa/docs/PHASE_TRACKER.md) |
| Architecture | [`fas-medusa/docs/ARCHITECTURE.md`](../fas-medusa/docs/ARCHITECTURE.md) |
| Work Log | [`fas-medusa/docs/WORK_LOG.md`](../fas-medusa/docs/WORK_LOG.md) |
| Navigation | [`fas-medusa/docs/NAVIGATION.md`](../fas-medusa/docs/NAVIGATION.md) |
| AI Context (this repo) | [`CLAUDE.md`](./CLAUDE.md) |
| Architecture Authority | [`AGENTS.md`](./AGENTS.md) |
