# Sanity UI Chrome Audit

## Scope
- Repo: fas-sanity
- Goal: find Studio UI elements not fully controlled by the JS theme and identify safe, scoped CSS overrides

## Findings: elements not fully theme-driven
- **Native inputs/selects/textarea in custom panes use hardcoded focus colors.** These bypass the JS theme and use Tailwind color utilities (e.g., `focus:border-blue-500`, `focus:ring-blue-200` or fixed RGBA) instead of theme-driven values. Examples:
  - `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx:1333`
  - `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx:1423`
  - `packages/sanity-config/src/components/studio/InvoiceVisualEditor.tsx:1667`
  - `packages/sanity-config/src/components/studio/FilterBulkRemovePane.tsx:22`
- **Badges/status pills with inline styles are not theme-driven.** The `Badge` instances in `CalendarTasksWidget` set `borderColor`, `background`, and `color` via inline styles sourced from `TASK_BADGE_STYLES`, which bypasses the JS theme and prevents safe CSS overrides without `!important`.
  - `packages/sanity-config/src/components/studio/CalendarTasksWidget.tsx:542`
- **Custom card/panel surfaces use fixed colors.** `CalendarTasksWidget` forces a `Card` background with hardcoded RGBA, so it will not follow the JS theme.
  - `packages/sanity-config/src/components/studio/CalendarTasksWidget.tsx:535`
- **Custom panels rely on CSS variables defined outside the JS theme.** Several dashboards use `var(--card-*)` and `var(--studio-*)` variables from CSS, not JS tokens, so they will not automatically track the JS theme unless the CSS variables are kept in sync.
  - `packages/sanity-config/src/components/studio/AccountsReceivable.tsx:200`
  - `src/styles/tailwind.css:4`

## Safe, scoped CSS overrides (allowed)
Only use selectors scoped under `body.sanity-studio-theme` and avoid global overrides.

1) **Native inputs/selects/textarea inside custom panes**
- Scope to non-Sanity UI inputs used in custom panes so you do not override Sanity UI inputs.
- Suggested selector targets:
  - `body.sanity-studio-theme .studio-page input:not([data-ui])`
  - `body.sanity-studio-theme .studio-page select:not([data-ui])`
  - `body.sanity-studio-theme .studio-page textarea:not([data-ui])`
- Use existing CSS variables (e.g., `--studio-surface-strong`, `--studio-text`, `--studio-border-strong`, `--studio-accent`, `--studio-accent-muted`) to align with the rest of the Studio chrome.

2) **Custom surface sections that use fixed RGBA backgrounds**
- Restrict overrides to the specific custom section/class when possible (e.g., a wrapper class around the widget) to avoid affecting Sanity UI panels.
- Example target (if you add a wrapper class later):
  - `body.sanity-studio-theme .calendar-tasks-widget .sanity-card` (note: currently not present; would require adding a wrapper class to be safe).

## Elements not safe for CSS-only override
- **Inline-styled badges in `CalendarTasksWidget`** are not safely overridable via CSS because inline styles win; changing them would require component changes, not CSS.

## Summary
- The remaining mismatches are primarily in custom panes that use native inputs or inline styles.
- Sanity UI components (`Card`, `Badge`, etc.) are theme-driven unless inline styles override them.
- Safe overrides are limited to scoped selectors under `body.sanity-studio-theme` targeting custom (non-`data-ui`) inputs and clearly scoped widget wrappers.
