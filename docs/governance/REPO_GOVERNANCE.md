# fas-sanity — Repo Governance

**Role in Pipeline:** Content layer (Sanity CMS)
**Last Updated:** 2026-04-02

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

## Authority Boundary Status (2026-04-02)

- ✅ Integration group schema fields: all `readOnly: true`
- ✅ Legacy Netlify functions (createCheckoutSession, stripeWebhook, manual-fulfill-order, createRefund): 410 GONE
- ✅ One-time migration scripts: moved to scripts/archive/
- ✅ Stale governance docs: moved to docs/archive/

## Cross-Repo Governance

- **Canonical tracker:** `docs/governance/FAS_4_REPO_PIPELINE_TASK_TRACKER.md` (synced from fas-dash)
- **Release checklist:** `docs/governance/RELEASE_CHECKLIST.md` (synced from fas-dash)
- **Architecture authority:** `AGENTS.md` (this repo root)
