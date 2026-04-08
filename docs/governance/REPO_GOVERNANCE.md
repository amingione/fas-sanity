# fas-sanity — Repo Governance

**Role in Pipeline:** Content layer (Sanity CMS)
**Last Updated:** 2026-04-08

---

## This Repo's Responsibility

fas-sanity is the content enrichment layer only. It does NOT own commerce data.

```
Sanity (content) → Medusa (commerce) → fas-cms-fresh + fas-dash → Stripe/Shippo via Medusa
```

## What This Repo Does

- Product content enrichment: title, description, images, SEO metadata
- Editorial pages, blog, campaigns
- Vendor CRM metadata (non-transactional)
- PDF generation via Netlify functions (invoices, quotes, packing slips)
- Email sending via Resend (vendor invites, customer emails)

## What This Repo Must NOT Do

- Write to price, inventory, order state, or payment data
- Call Stripe SDK directly
- Call Shippo SDK directly
- Expand legacy Netlify commerce functions (4 are 410 GONE)

## Read-Only Integration Field Pattern (WS1-3)

Schemas that mirror Medusa/Stripe commerce data follow this pattern to enforce content-only boundaries:

1. **Group separation** — All mirrored fields are placed in a dedicated `integration` group (Studio tab titled "Medusa Bridge (read-only)"), visually isolated from editable content fields.
2. **`readOnly: true`** — Every integration group field carries `readOnly: true` so Sanity Studio renders them as non-editable, preventing accidental writes.
3. **Field descriptions** — Individual integration fields include a description noting they are "Mirrored from Medusa – read-only."

Affected schemas: `product`, `productVariant`, `collection`.

### CI Guard

`scripts/ci/check-content-schema-commerce-authority.mjs` (run via `npm run guard:content-schema-authority`) enforces that no unauthorized commerce authority fields appear in content-focused schemas.

- Fields that are both `readOnly: true` **and** in `group: 'integration'` are exempt — they are intentional read-only mirrors, not authority drift.
- Any commerce field added to a content schema without `readOnly: true` + `group: 'integration'` will fail the guard.

## Authority Boundary Status (2026-04-08)

- ✅ Integration group schema fields: all `readOnly: true` (product, productVariant, collection)
- ✅ productVariant and collection schemas: `integration` group added, mirrored fields clearly separated
- ✅ CI guard: exempts properly-labeled read-only integration mirrors; flags unauthorized commerce authority
- ✅ Legacy Netlify functions (createCheckoutSession, stripeWebhook, manual-fulfill-order, createRefund): 410 GONE
- ✅ One-time migration scripts: moved to scripts/archive/
- ✅ Stale governance docs: moved to docs/archive/

## Cross-Repo Governance

- **Canonical tracker:** `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md` (synced from fas-dash)
- **Release checklist:** `docs/governance/RELEASE_CHECKLIST.md` (synced from fas-dash)
- **Architecture authority:** `AGENTS.md` (this repo root)
