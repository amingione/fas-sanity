# Stripe Product Metadata Authority Audit

Objective: Identify where Stripe product metadata (shipping weight/dimensions/class) is written, when it is written, and why it can diverge from `shippingConfig` even when `shippingConfig` is correct. This is a read-only audit.

## Findings by Required Question

### 1) Where is Stripe product metadata written?

**Stripe (metadata updates):**
- `netlify/functions/syncStripeCatalog.ts` (function `syncProduct` → `buildMetadata` → `stripe.products.update/create`) writes shipping-related metadata keys (`shipping_weight`, `shipping_dimensions`, `shipping_class`, etc.) directly into Stripe product metadata.
- `netlify/functions/productShippingSync.ts` (function `syncProduct` → `updateStripeMetadata` + `updateStripePriceMetadata`) writes shipping metadata to Stripe when a Sanity product webhook fires.
- `scripts/sync-shipping-to-stripe.js` (function `run` → `normalizeMetadata`) writes shipping metadata to Stripe in a manual batch script.
- `packages/sanity-config/src/utils/generateSKU.ts` (function `syncSKUToStripe`) updates Stripe product metadata with `{sku}` and does not merge with existing metadata.

**Sanity (`stripeMetadata` field):**
- `netlify/functions/syncStripeCatalog.ts` sets `stripeMetadata` on the Sanity product via `mapStripeMetadata(stripeProduct.metadata)` in `setOps`. This is the only place in the repo that writes the product document’s `stripeMetadata` field.

**Stripe → Sanity shipping fields (not `stripeMetadata`):**
- `netlify/functions/stripeWebhook.ts` (function `syncStripeProduct`) reads Stripe product metadata and writes into Sanity product fields like `shippingWeight`, `boxDimensions`, `shippingClass`, and `handlingTime`. It does **not** update `shippingConfig` or `stripeMetadata`.

### 2) When is Stripe metadata written?

- **On explicit catalog sync:** `netlify/functions/syncStripeCatalog.ts` is invoked by:
  - `scripts/backfill-stripe-products.ts` (manual backfill).
  - `netlify/functions/backfillStripeProducts.ts` (proxy), which is used by the Studio Admin Tools “Run Stripe Sync” button in `packages/sanity-config/src/components/studio/AdminTools.tsx`.
  - The product document action “Sync to Stripe” in `packages/sanity-config/src/documentActions/productDocumentActions.ts` (note: it posts `{mode: 'ids', ids: [targetId]}`, but `syncStripeCatalog` only reads `productId`/`productIds`, so it will fall back to the default “missing” mode unless a different path handles those fields).
- **On product save (webhook-driven):** `netlify/functions/productShippingSync.ts` is designed to run from a Sanity webhook (documented in `docs/product-field-guide.md`), writing shipping metadata to Stripe on save/update.
- **Manual batch script:** `scripts/sync-shipping-to-stripe.js` updates Stripe metadata for all products with Stripe IDs.
- **On SKU auto-generation:** `packages/sanity-config/src/components/AutoSKUInput.tsx` calls `syncSKUToStripe` when a SKU is auto-generated and the product already has a Stripe ID.

There is no scheduled/periodic sync logic in this repo for Stripe product metadata.

### 3) Is `shippingConfig` used as input when writing Stripe metadata?

**Yes, in multiple places:**
- `netlify/functions/syncStripeCatalog.ts` uses `shippingConfig` as the primary source of weight, dimensions, shipping class, handling time, and `requiresShipping` flags in `buildMetadata`. It falls back to legacy fields like `shippingWeight`, `boxDimensions`, `shippingClass`, and `handlingTime` when `shippingConfig` is missing.
- `netlify/functions/productShippingSync.ts` and `scripts/sync-shipping-to-stripe.js` both prefer `shippingConfig` and fall back to legacy fields when `shippingConfig` is missing.

**Not used:**
- `netlify/functions/stripeWebhook.ts` does not use `shippingConfig`. It reads Stripe metadata and writes to legacy Sanity fields (`shippingWeight`, `boxDimensions`, `shippingClass`, `handlingTime`).
- The `stripeMetadata` array on the Sanity product is never derived from `shippingConfig`; it is set to whatever is currently in Stripe metadata when `syncStripeCatalog` runs.

### 4) Are there multiple writers of Stripe metadata?

Yes. Stripe product metadata can be written by:
- `netlify/functions/syncStripeCatalog.ts`
- `netlify/functions/productShippingSync.ts`
- `scripts/sync-shipping-to-stripe.js`
- `packages/sanity-config/src/utils/generateSKU.ts` (`syncSKUToStripe`)

These are independent writers, and they do not share a single merge policy. In particular, `syncSKUToStripe` calls `stripe.products.update(stripeProductId, {metadata: {sku}})` without merging existing metadata, which can overwrite shipping keys written by other sync flows.

### 5) Is there any regeneration or backfill mechanism?

Yes:
- **Backfill script:** `scripts/backfill-stripe-products.ts` invokes `syncStripeCatalog` in bulk (supports `--mode all|missing` and `--ids`).
- **Admin Studio tool:** “Run Stripe Sync” in `packages/sanity-config/src/components/studio/AdminTools.tsx` calls the Netlify `backfillStripeProducts` proxy, which calls `syncStripeCatalog`.
- **Product document action:** “Sync to Stripe” in `packages/sanity-config/src/documentActions/productDocumentActions.ts` attempts to call `syncStripeCatalog` for a single product.
- **Manual shipping sync script:** `scripts/sync-shipping-to-stripe.js` is a separate manual regeneration path for shipping metadata only.

There is no cron/scheduled regeneration logic in the repo.

### 6) Is Stripe metadata cached or snapshot-based?

Yes, it is snapshot-based in Sanity:
- The Sanity `stripeMetadata` field is updated only when `netlify/functions/syncStripeCatalog.ts` runs, using a snapshot of `stripeProduct.metadata` at that time.
- Other paths (`productShippingSync.ts`, `sync-shipping-to-stripe.js`, `syncSKUToStripe`) update Stripe metadata but **do not** update the Sanity `stripeMetadata` field, leaving it stale until the next catalog sync.

## Why `stripeMetadata` Can Diverge From `shippingConfig`

1) **Two-step sync path:**  
   `shippingConfig` → Stripe metadata (via `productShippingSync.ts` or manual scripts) → Sanity `stripeMetadata` (only via `syncStripeCatalog.ts`).  
   If the second step never runs, `stripeMetadata` stays stale even when Stripe metadata is updated.

2) **Multiple independent writers to Stripe metadata:**  
   The SKU auto-sync (`syncSKUToStripe`) can overwrite metadata without merging, which can remove or revert shipping keys written by `productShippingSync` or `syncStripeCatalog`.

3) **Stripe → Sanity webhook writes legacy fields, not `shippingConfig` or `stripeMetadata`:**  
   `netlify/functions/stripeWebhook.ts` updates `shippingWeight`/`boxDimensions`/`shippingClass` based on Stripe metadata changes, but does not update `shippingConfig` or `stripeMetadata`. This can make Stripe metadata the de facto authority for other systems while `shippingConfig` remains correct but ignored.

4) **Manual/backfill scripts update `shippingConfig` without a guaranteed Stripe sync:**  
   Scripts like `scripts/backfill-product-codes-and-shipping.ts` and `scripts/migrateProductShipping.ts` update `shippingConfig`, but there is no direct invocation of Stripe metadata sync in those scripts. If a webhook is not configured or fails, Stripe metadata remains old.

## Direct Answers Summary

- **Where written (Stripe):** `netlify/functions/syncStripeCatalog.ts`, `netlify/functions/productShippingSync.ts`, `scripts/sync-shipping-to-stripe.js`, `packages/sanity-config/src/utils/generateSKU.ts`.
- **Where written (Sanity `stripeMetadata`):** Only `netlify/functions/syncStripeCatalog.ts`.
- **When written:** On explicit sync actions (Admin Tools, backfill script, document action), on product-save webhook (`productShippingSync`), on manual script execution, and on SKU auto-generation.
- **Uses `shippingConfig`?:** Yes in `syncStripeCatalog.ts`, `productShippingSync.ts`, and `scripts/sync-shipping-to-stripe.js`. No in Stripe webhook; `stripeMetadata` is a snapshot of Stripe, not `shippingConfig`.
- **Multiple writers?:** Yes; multiple independent metadata writers exist.
- **Regeneration/backfill?:** Yes via backfill script, Admin Tools, and manual scripts; no periodic job.
- **Cached/snapshot?:** Yes; `stripeMetadata` is a snapshot updated only during catalog sync, so it can become stale.
