# Sanity → Medusa Product Sync

## Quick Start

### Full Sync Workflow

```bash
# Step 1: Sync products (creates products, variants, price_sets)
npx tsx scripts/syncProductsToMedusa.ts

# Step 2: Generate SQL to link price_sets to variants
npx tsx scripts/linkPriceSetsPostSync.ts > /tmp/link-price-sets.sql

# Step 3: Execute SQL
docker exec -i medusa-postgres psql -U medusa -d medusa < /tmp/link-price-sets.sql

# Step 4: Verify
docker exec -i medusa-postgres psql -U medusa -d medusa -c \
  "SELECT COUNT(*) as total_links FROM product_variant_price_set;"
```

## Why Two Steps?

Medusa v2's link module API (`/admin/links`) is not available in Admin API context. We must:
1. Use Admin API to create price_sets (Step 1)
2. Use direct SQL to link them to variants (Step 2)

## Environment Setup

Required in `.env`:

```bash
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
SANITY_API_TOKEN=your_token
SANITY_SYNC_CURRENCY=usd

MEDUSA_API_URL=http://localhost:9000
MEDUSA_ADMIN_API_TOKEN=your_admin_token
DATABASE_URL=postgres://medusa:medusa@localhost:5432/medusa
```

## Scripts

### `syncProductsToMedusa.ts`
- Syncs active products from Sanity to Medusa
- Creates/updates products, variants, price_sets
- Updates Sanity with `medusaProductId` and `medusaVariantId`

### `linkPriceSetsPostSync.ts` (NEW)
- Generates SQL to link price_sets to variants
- Finds matching price_set by amount and currency
- Idempotent (skips existing links)

## Troubleshooting

**"Missing Sanity configuration"**
→ Check `.env` has all `SANITY_*` variables

**"Medusa API error 401"**
→ Verify `MEDUSA_ADMIN_API_TOKEN` is valid

**No SQL generated**
→ Run sync script first to populate `medusaVariantId`

**Cart errors: "Variants do not have a price"**
→ Run Step 2 (linkPriceSetsPostSync) to create links

## Full Documentation

See `/docs/sync-workflow-updated.md` for complete details.
