# scripts/ — Active Scripts Index

**Last Updated:** 2026-04-02

This directory contains active utility and operational scripts.
One-time migration/backfill/fix scripts that have already been run
are moved to `scripts/archive/`.

---

## Active Scripts

### Sync & Integration

| Script | Purpose |
|--------|---------|
| `syncProductsToMedusa.ts` | Full product → Medusa sync (creates products, variants, price_sets) |
| `linkPriceSetsPostSync.ts` | Generates SQL to link price_sets to variants post-sync |
| `sync-gmc-status.ts` | Sync Google Merchant Center product status |
| `sync-google-ads-performance.ts` | Pull Google Ads performance data |
| `sync-resend-contacts.ts` | Sync customer list to Resend |
| `sync-log-drain-functions.ts` | Sync Netlify log drain functions |
| `sync-governance.sh` | Run governance consistency checks |

### Governance & Health

| Script | Purpose |
|--------|---------|
| `check-schema-drift.mjs` | Detect schema drift between repos |
| `check-governance.sh` | Validate governance rules |
| `check-css-baseline.sh` | CSS baseline check |
| `check-shipping-guards.sh` | Verify shipping guard rules |
| `docs-drift-check.mjs` | Check for doc drift against tracker |
| `audit-unused-schema-types.ts` | Find schema types not used in any document |

### Email & Notifications

| Script | Purpose |
|--------|---------|
| `trigger-test-emails.ts` | Trigger test email sends |
| `trigger-test-emails-combined.ts` | Combined test email trigger |
| `trigger-test-emails-local.ts` | Local development email test |
| `ensure-email-marketing-channel.ts` | Ensure Resend marketing channel exists |

### Vendor & Seeding

| Script | Purpose |
|--------|---------|
| `seed-internal-doc-categories.ts` | Seed internal document categories |
| `seed-vendor-onboarding-campaign.ts` | Seed vendor onboarding email campaign |
| `setRoles.js` | Set Sanity user roles |

### Infrastructure

| Script | Purpose |
|--------|---------|
| `aws-secrets-shim.cjs` | AWS Secrets Manager shim for local dev |
| `deploy-schema-if-token.js` | Deploy schema when token available |
| `ensure-netlify-cjs.ts` | Ensure Netlify CJS compatibility |
| `ensure-sanity-cors.ts` | Ensure CORS origins configured in Sanity |
| `sanitize-cors-env.js` | Clean CORS environment variables |
| `serialize-secrets.ts` | Serialize secrets for deployment |
| `secret-link.sh` | Link secrets across environments |
| `bulk-volta-pin.sh` | Pin Node version via Volta across workspaces |
| `local-functions-server.ts` | Local Netlify functions dev server |
| `test-netlify-functions.ts` | Test suite runner for Netlify functions |
| `agent-rewrite-product-titles-async.ts` | AI-assisted product title rewrite |
| `upload-google-merchant-sftp.ts` | Upload merchant feed via SFTP |
| `bulkSEOUpdate.ts` | Bulk SEO field updates |

---

## Archived Scripts (do not re-run)

`scripts/archive/` contains one-time migration and backfill scripts that have
already been applied to production data. They are preserved for reference only.

- `scripts/archive/one-time-2026-04-02/` — 51 backfill/migrate/fix scripts archived 2026-04-02
- `scripts/archive/root-cleanup-2026-04-02/` — root-level scripts archived 2026-04-02
- `scripts/archive/` — older archived scripts

**Do not re-run archived scripts against production.**
