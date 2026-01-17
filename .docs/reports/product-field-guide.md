# FAS Product Field Guide

Use this guide to help merchandisers move quickly without missing critical details. Every section below maps to the reorganized fieldsets inside the Sanity Studio product form.

## Required Fields & Why They Matter

| Field                                                  | Why it matters                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Title**                                              | Shown everywhere (site, invoices, search). Keep it under 100 chars and include platform.                                                         |
| **Slug**                                               | Controls the product URL and canonical tag. Let it auto-generate from the title.                                                                 |
| **Status**                                             | `Active` items appear on the storefront and merchant feeds. Use `Draft`/`Paused` to stage work.                                                  |
| **Product Type**                                       | Tells the system whether to show shipping fields, service scheduling inputs, or bundle composition. Also powers storefront filtering and badges. |
| **Images**                                             | First image becomes the hero card. Upload 3–5 angles so the storefront carousel looks complete.                                                  |
| **Short Description**                                  | Two-sentence hook used on collection cards and checkout. Mention platforms + outcome.                                                            |
| **Full Description**                                   | Long-form content for SEO + customers. Include install tips and kit contents.                                                                    |
| **Categories**                                         | Controls where the product appears on the storefront and the service catalog.                                                                    |
| **Price**                                              | Base USD price sent to Stripe, Google Merchant, and quotes.                                                                                      |
| **Shipping Weight + Box Dimensions** (physical/bundle) | Used to calculate shipping rates, packing slips, and freight flags. Missing values stop the shipping calculator.                                 |
|  |

## Fieldset Quick Reference

- **Basic Info** – Everything needed to launch a product in under 5 minutes: title, slug, product type, images, descriptions, price, categories, highlights.
- **Product Details** – Key features, specs, kit contents, and supporting media.
- **Options & Variants** – Only visible for physical/bundle products. Choose “Requires options” if the customer must pick size/color/platform. Upgrades, Add-Ons & Optional Bundles, and the Custom Paint builder live here for mix-and-match upsells.
- **Service Details** – Appears when `Product Type = Service`. Capture duration, location, deliverables, and scheduling notes rather than shipping data.
- **Bundle Components** – Appears when `Product Type = Bundle`. Reference each included product, quantity, and special notes.
- **Shipping & Fulfillment** – Weight, box size, handling time, shipping class, ships-alone flag, and a live shipping-cost preview. Hidden for services.
- **Inventory** – Toggle manual tracking and update quantities. Keeps Merchant Center inventory in sync.
- **Compatibility** – Vehicle fitment, required tunes, average HP gain. Hidden for services.
- **SEO & Marketing** – Collapsible section for meta title/description, focus keyword usage indicator, social image, and canonical URL.
- **Stripe Sync** – Read-only IDs, timestamps, metadata snapshots (collapsed by default).
- **Advanced** – Merchant feed fields, tax behavior, Google product category, legacy data.

## Add-Ons & Optional Bundles

## Add-Ons cost money - when they are selected it ads cost to the original price.

##

### Overview

The `Add-Ons & Optional Bundles` field now supports two approaches inside the same array: manual upgrades for quick price adjustments and product references for optional bundles. Referencing another product keeps pricing, inventory, SKU, and imagery in sync automatically, while still letting you override labels, add bundle discounts, or mark the add-on as required.

### Manual Upgrade (Custom Entry)

- Mirrors the legacy upgrade workflow with required name + price validations.
- Perfect for labor adders, coatings, or services that do not need standalone inventory.
- Fields: Upgrade Name, Price Adjustment, Description, SKU suffix, Default Selected toggle.

### Product Bundle Add-On (Reference)

- Reference any active product (except the one you are editing) so pricing + photos stay synced.
- Configure quantity, fixed dollar or percent discounts, custom labels/descriptions, and default/required toggles.
- Discount fields are optional; leave blank to surface the referenced product price.

### Use Cases

1. **Installation Hardware Kit** – Reference the kit, set quantity `1`, apply a `$20` bundle discount, and label it “Add Installation Kit” to highlight the savings.
2. **Required Shipping Label** – Reference the prepaid label, mark `Required = true`, and rename it “Purchase Shipping Label (Required)” to enforce fulfillment steps.
3. **Optional Tune Package** – Reference the remote tuning service, set `Bundle Discount (%) = 15`, and label it “Add Custom Tune” for cold-air intake products.

### GROQ Query

Expand add-ons when fetching a product so the frontend can render both manual upgrades and referenced bundles:

```groq
*[_type == "product" && slug.current == $slug][0]{
  _id,
  title,
  slug,
  price,
  images,
  description,
  options[]{
    _type,
    _key,
    title,
    required,
    colors[]{title, color},
    sizes[]{title},
    values[]{title, value}
  },
  addOns[]{
    _type,
    _key,
    label,
    priceDelta,
    description,
    skuSuffix,
    defaultSelected,
    quantity,
    bundleDiscount,
    bundleDiscountPercent,
    customLabel,
    required,
    product->{
      _id,
      title,
      slug,
      price,
      sku,
      "imageUrl": images[0].asset->url,
      status,
      trackInventory,
      manualInventoryCount
    }
  }
}
```

**Important:** `options` are not returned unless you query them. If a product uses variable options, omitting `options[]{...}` means customers cannot select required values or add the item to the cart.

### Benefits

**For Editors** – Reuse accessory products across the catalog, let pricing follow the source product automatically, and lean on inventory tracking + imagery without duplicate data.  
**For Customers** – Visual bundles, clear savings callouts (“save $50” or “15% off”), smart defaults, and required badges keep checkout honest.  
**For The Business** – Accurate inventory deductions, bundle analytics, and flexible discount testing unlock better upsell performance.

### Checklist & Testing

- [ ] Manual upgrades still save/publish correctly.
- [ ] Product reference add-ons show preview pricing + imagery.
- [ ] Bundle discount math (fixed + percent) renders correctly.
- [ ] `Required` toggles display the badge in Studio/front-end tests.
- [ ] Circular references are prevented by the product filter.

## Custom Paint & Powder Coating

### Overview

The dedicated `Custom Paint Options` object replaces the old “customizations” array so we can offer powder coating the way customers actually buy it: as an optional checkbox with conditional paint-code entry. The paint code field now only appears—and becomes required—after the buyer opts into coating. This flow prevents forcing every shopper to enter a code, while still capturing the details we need when the service is selected.

### Studio Setup

- **Toggle** `Offer Custom Paint/Powder Coating?` to reveal the configuration block.
- **Checkbox Label** – defaults to “Add Powder Coating”, but you can override it for anodizing/ceramic etc.
- **Price** – enter the upcharge (supports decimals with two-place precision).
- **Description** – explain turnaround time or finish details shown next to the checkbox.
- **Paint Code Field Label & Instructions** – what customers see after checking the box; set expectations like “Enter RAL, Pantone…”.
- **Popular Color Swatches** – optional quick-picks with name/code/hex that auto-fill the paint-code input on click.

### Customer Flow

1. Page loads with the checkbox + price and supportive description.
2. Leaving the box unchecked does nothing—customer can checkout without a code.
3. Checking the box reveals instructions, swatches, and a required paint-code input (red asterisk).
4. Selecting a swatch fills the code automatically; otherwise they can type any code manually.
5. Unchecking the box clears the selection so validation no longer fires.

### Validation & Cart

- Frontend validation should only trigger when `selected = true` and `paintCode` is empty.
- When selected, send `{selected: true, paintCode, price}` inside the cart payload so order + checkout metadata can surface the detail (`powder_coating`, `powder_coating_price`, `paint_code`).
- Cart/checkout UI should list the powder coating line with the upcharge and customer-entered code.

### Testing Checklist

- [ ] Checkbox hidden when `enabled` is false.
- [ ] Price/description show correctly when enabled.
- [ ] Checking the box reveals instructions + swatches + required paint field.
- [ ] Swatch click populates the paint code.
- [ ] Unchecking clears the code and removes required validation.
- [ ] Cart + checkout metadata include powder coating info only when selected.

## Product Creation Checklist

1. **Set the Product Type first.** This unlocks the right fieldsets (Shipping vs Service vs Bundle).
2. **Fill the Basic Info block** (Title, Slug, Status, Price, Categories, Images, Short/Full descriptions).
3. **Complete Product Details** – at least 3 key features + kit contents if applicable.
4. **Add Variants or Upgrades** if customers must choose options before checkout.
5. **Provide Shipping data** (weight, box dimensions, handling time, shipping class). Watch the shipping preview for warnings like “Heavy item – may require freight.”
6. **Inventory** – leave tracking enabled unless this is made-to-order. Enter the on-hand quantity.
7. **Compatibility or Service details** depending on product type.
8. **SEO & Marketing** – Meta title (≤60 chars), meta description (≤160 chars), focus keyword, social share image, canonical URL.
9. **Review Stripe Sync block** to confirm IDs exist after saving.
10. **Publish.** Stripe metadata, shipping dimensions, and service catalog badges update automatically via the new product shipping webhook.

## Service vs Product Guidelines

| Scenario        | Choose **Service** when…                                                         | Choose **Physical** when…                       | Choose **Bundle** when…                    |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| Offer type      | Labor, installation, tuning, inspections                                         | Item ships to customer                          | Multiple physical items sold together      |
| Shipping fields | Hidden (service catalog uses scheduling inputs)                                  | Required                                        | Required                                   |
| Badges          | ⚙️ “In-shop service” badge appears automatically                                 | 📦 Standard product badge                       | 📦+ Bundle badge                           |
| Storefront      | Services appear in the Service Catalog and are removed from product-grid queries | Included in main catalog                        | Included in main catalog + bundle callouts |
| Stripe metadata | Clears shipping metadata so services never charge shipping                       | Weight/dimensions/class sync to Stripe metadata | Same as physical                           |

### Service Creation Tips

- Use **Service Details** to describe duration, required lead time, and location.
- Upload at least one image (shop bay, before/after) so the catalog isn’t empty.
- Price can be base labor rate; add details in description if pricing varies.
- Service products never appear in standard product feeds or Google Merchant exports.

### Bundle Creation Tips

- Reference each included product in **Bundle Components** (with optional overrides).
- Shipping profile + weight should represent the entire packed bundle.
- Use promotion tagline to highlight savings (“Includes Install Hardware + Calibration”).

## Shipping & Stripe Sync Notes

- Saving a product triggers the new `productShippingSync` Netlify function. It updates Stripe product metadata keys (`shipping_weight`, `shipping_dimensions`, `shipping_class`, `handling_time`, `ships_alone`).
- Stripe webhook events now push those metadata values back into Sanity if someone edits them from the Stripe dashboard.
- The shipping calculator preview warns about missing dimensions, heavy items, or obviously incorrect data.

## Storefront Queries & Badges

- **Default product listing** filters out services:  
  `*[_type == "product" && productType != "service" && status != "archived"]{...}`
- **Service catalog** uses:  
  `*[_type == "product" && productType == "service" && status != "archived"]{...}`
- Use the new `fetchPhysicalProducts` and `fetchServiceProducts` helpers in `src/lib/fetchCatalogProducts.ts`.
- `ProductTypeBadge` renders the 🔧/⚙️/📦+ badges so customers instantly know what they’re viewing.
- `ServiceCatalog` component assembles a simple services page—drop in the fetched data and wire the CTA to your booking flow.

## Downloads & Documents Workspace

- Open the **Downloads & Documents** tab in the desk to see four buckets: **All Documents**, **By Type**, **By Category**, and **Create New**. The type lists split Downloads, Templates, Reference Docs, Guides, plus an Archived bin. Category lists track Marketing, Operations, Technical, Legal, and Template resources.
- Use the **Create New** pane for a one-click starter. Each button spins up a document with the right `documentType`, default access-level, and template toggle so you’re not hunting through the global “New document” menu.
- When editing, the custom actions on the right let you ① download the uploaded file, ② copy the published asset URL, ③ mark a document as a template, ④ duplicate templates (“Template Name – Copy” with an empty file field), and ⑤ archive/restore items without deleting them.
- Templates and guides can be duplicated from the action menu and from the desk lists. Archived documents disappear from the default lists but remain in the Archived view for recovery.
- The Studio Home dashboard now includes a **Recent Documents** widget. Filter by category, open anything with one click, or hit “Download” without leaving the dashboard. “View All” jumps straight to the Downloads workspace.
- All downloads now carry metadata for document type, category, access level, version tag, and related documents. The `lastUpdated` field auto-refreshes on publish and when template/archived actions run, so list ordering follows the latest edits.
- Run `pnpm tsx scripts/migrate-download-resource.ts` one time per environment to backfill the original placeholder download with the new metadata requirements.

## Publishing Checklist

- [ ] Product Type set correctly (Physical vs Service vs Bundle)
- [ ] Required basic info fields complete
- [ ] At least one image uploaded
- [ ] Shipping weight, box size, class, and handling time added (physical/bundle)
- [ ] Service fields (duration/location) filled when relevant
- [ ] Inventory count updated or tracking disabled intentionally
- [ ] Meta title/description + focus keyword entered
- [ ] Stripe IDs populated after saving
- [ ] Service catalog previewed if productType = service
