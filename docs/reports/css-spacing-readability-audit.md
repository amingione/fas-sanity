# CSS Spacing & Readability Audit

Scope: `fas-sanity` repo only. Read-only audit of custom React/TSX components, Tailwind usage in JSX/TSX, `packages/sanity-config/src/styles/tailwind.css`, and component-level CSS.

## Worst Offenders (Highest Risk of Cramped/Overlapping UI)
- `packages/sanity-config/src/components/studio/InvoiceDashboard.tsx` uses dense `text-xs` labels, a `text-[11px]` footer block, and negative horizontal margins (`-mx-2` / `-mx-3`) around the summary cards. This combination is likely to feel cramped and can visually collide with container edges/scrollbars on smaller widths.
- `packages/sanity-config/src/components/studio/CustomersOverviewDashboard.tsx` has heavy `text-xs` usage for metadata, nested compact spacing, and an absolutely positioned timeline dot with a negative left offset. This layout is fragile on narrow widths and can lead to collisions/overflow.
- `packages/sanity-config/src/components/studio/OrdersDashboard.tsx` defines a dense fixed-width grid (`GRID_TEMPLATE_COLUMNS`) with many columns and mixed fixed sizes. This encourages horizontal overflow and creates tight, unreadable column content at smaller viewport widths.
- `packages/sanity-config/src/schemaTypes/documents/quoteStyles.css` and `packages/sanity-config/src/schemaTypes/documents/invoiceStyles.css` rely on small text sizes (0.75–0.88rem) across badges, meta, and helper text; in combination with tight padding, this risks unreadable UI and crowded form sections.
- `src/pages/vendor-portal/messages.astro` and `src/pages/become-a-vendor.astro` use hardcoded `px` sizes for text and spacing, plus a negative container offset (`margin: -2rem auto 4rem`) that deliberately overlaps the hero with the form card, which can feel cramped on small screens.

## Spacing Findings (Padding/Margin Density & Scale Mismatch)
- Mixed spacing systems in the same repo: Tailwind spacing utilities in `src/styles/tailwind.css`, CSS variables (`--studio-space-*`) in `packages/sanity-config/src/styles/tailwind.css`, and ad hoc `px` values inside component-level CSS and inline styles. This inconsistency makes spacing feel uneven across screens.
- Frequent inline style spacing with raw pixel values (e.g., `gap: 8`, `marginBottom: 8`, `padding: 6px 8px`) in components like `packages/sanity-config/src/components/studio/FilterBulkAssign.tsx`, `packages/sanity-config/src/components/studio/FilterBulkRemove.tsx`, and `packages/sanity-config/src/components/studio/InvoiceLineItemInput.tsx`. These values bypass the Tailwind or studio spacing scale and are inconsistent with `--studio-space-*`.
- Negative spacing used in view-level layout (`packages/sanity-config/src/components/studio/InvoiceDashboard.tsx` uses `-mx-2`/`-mx-3`) risks visual collision with container borders and scrollbars.
- Component CSS uses fixed padding values that diverge from the studio spacing scale, especially in `quoteStyles.css` and `invoiceStyles.css` (e.g., `padding: 10px 12px`, `padding: 14px 18px`, `padding: 18px 22px`).

## Text & Readability Findings
- Overuse of `text-xs` and smaller type for labels/metadata in high-density dashboards, especially `packages/sanity-config/src/components/studio/InvoiceDashboard.tsx` and `packages/sanity-config/src/components/studio/CustomersOverviewDashboard.tsx`. Several badges/labels are `text-xs` or smaller (e.g., `text-[11px]`), which is likely too small for sustained reading.
- Custom CSS in `packages/sanity-config/src/schemaTypes/documents/quoteStyles.css` and `packages/sanity-config/src/schemaTypes/documents/invoiceStyles.css` uses 0.75–0.82rem for status/meta text (`quote-stripe-card__label`, `quote-stripe-card__muted`, `invoice-totals-card__note`). These are below typical readability thresholds in admin dashboards.
- Vendor portal and vendor application pages use 12px text for badges, eyebrow labels, and metadata (`src/pages/vendor-portal/messages.astro`), which feels inconsistent with the Tailwind base sizes used elsewhere.

## Layout Safety Findings (Min-Width/Min-Height, Overflow, Positioning)
- Several flex/grid layouts lack `min-width: 0`/`min-height: 0` safety rules, making truncation and overflow brittle. This shows up in complex dashboards like `packages/sanity-config/src/components/studio/OrdersDashboard.tsx` and in various table layouts where fixed widths and overflow are combined.
- The `OrdersDashboard` grid uses many fixed-width columns without clear responsive breakpoints or adaptive min/max constraints, increasing the chance of overflow or clipped content at smaller widths.
- Absolute positioning in list/detail UIs (e.g., timeline dot in `packages/sanity-config/src/components/studio/CustomersOverviewDashboard.tsx`) uses negative offsets that can collide with borders or be cut off when containers have `overflow: hidden`.
- Dropdowns/menus are absolutely positioned in multiple views (e.g., `packages/sanity-config/src/components/studio/InvoiceDashboard.tsx`, `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx`) without explicit spacing constraints from the trigger; combined with tight paddings this can visually crowd the parent sections.

## Opportunities for a Shared Spacing & Typography Baseline
There is already partial groundwork in `packages/sanity-config/src/styles/tailwind.css` with `--studio-space-*`. The rest of the repo still mixes Tailwind scales and raw `px` values. Standardizing on a single scale across both app and studio would remove the current mismatch.

## Recommended Minimal Baseline System (One System)
Adopt a single baseline for both studio and storefront:
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48 (px) with named tokens (e.g., `--space-1`..`--space-7`) and map Tailwind spacing to the same scale.
- **Typography scale:**
  - Body: 16px (`text-base`) with 1.5 line-height.
  - Secondary: 14px (`text-sm`) for metadata.
  - Caption: 12px (`text-xs`) only for badges/overline, not for paragraph text.
  - Headings: 20/24/30 for `h3/h2/h1`.
- **Usage rule:** avoid `text-[11px]` and 0.75rem for any content meant to be read continuously; reserve those for compact UI labels only.

## Systemic Fixes (Preferred)
- Consolidate spacing definitions: use a single set of CSS variables for spacing (`--space-*`) and map Tailwind + inline styles to those tokens. Extend Tailwind theme so `p-3`, `gap-3`, etc. align with the same scale.
- Standardize typography tokens in Tailwind config (e.g., `text-body`, `text-meta`, `text-caption`) and ban arbitrary `text-[...]` sizes in UI components unless explicitly allowed in a design exception list.
- Create shared layout helpers that enforce `min-width: 0` and `min-height: 0` on common flex/grid containers to prevent truncation/overflow issues.
- Align the studio stylesheet (`packages/sanity-config/src/styles/tailwind.css`) with app-level Tailwind conventions to avoid dual standards.

## Component-Specific Fixes (Secondary)
- `packages/sanity-config/src/components/studio/InvoiceDashboard.tsx`: replace `text-[11px]` and dense `text-xs` blocks with the baseline `text-sm`/`text-xs` rules, remove negative margins around summary cards, and use consistent gap tokens.
- `packages/sanity-config/src/components/studio/CustomersOverviewDashboard.tsx`: move timeline dot positioning to a layout that doesn’t require negative offsets; increase metadata size to `text-sm` where it’s read as content.
- `packages/sanity-config/src/components/studio/OrdersDashboard.tsx`: refactor grid column sizing to use `minmax()` with responsive collapse or stacked layouts on smaller widths; introduce `min-width: 0` on grid containers to allow truncation instead of overflow.
- `packages/sanity-config/src/schemaTypes/documents/quoteStyles.css` and `packages/sanity-config/src/schemaTypes/documents/invoiceStyles.css`: normalize text sizing to the baseline scale (avoid 0.75rem/0.82rem) and align padding with the shared spacing tokens.
- `src/pages/vendor-portal/messages.astro` and `src/pages/become-a-vendor.astro`: replace hardcoded 12px metadata sizes with baseline `text-sm`, and avoid negative layout offsets that create overlapping cards unless explicitly part of the design system.
