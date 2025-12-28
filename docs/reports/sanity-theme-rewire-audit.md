# Sanity Theme Rewire Audit

## Scope
- Repo: fas-sanity
- Files: `packages/sanity-config/src/theme/darkModernTheme.ts`, `packages/sanity-config/sanity.config.ts`, `packages/sanity-config/src/components/studio/StudioLayout.tsx`
- Goal: determine why `darkModernTheme` is not taking effect

## Unexpected drift (stop condition)
- `packages/sanity-config/src/theme/darkModernTheme.ts` no longer matches the required `defineTheme`-based implementation and now spreads `studioTheme` with nested tokens like `base` and `card` that were explicitly forbidden. This is unexpected drift from the previously applied change set and violates the current constraints. Per instructions, this audit stops here.

## Findings (limited to observed drift)
1) `darkModernTheme` is not a pure `defineTheme()` object
- The file imports and spreads `studioTheme` instead of using `defineTheme`, so it is not a pure `defineTheme()` object (`packages/sanity-config/src/theme/darkModernTheme.ts:1`, `packages/sanity-config/src/theme/darkModernTheme.ts:7`).

2) `darkModernTheme` references `studioTheme` and unsupported tokens
- The theme spreads `studioTheme` and uses internal nested tokens (`base`, `card`, `muted.default.enabled`) which are not in the allowed token list (`packages/sanity-config/src/theme/darkModernTheme.ts:3`, `packages/sanity-config/src/theme/darkModernTheme.ts:12`, `packages/sanity-config/src/theme/darkModernTheme.ts:19`, `packages/sanity-config/src/theme/darkModernTheme.ts:27`).

3) Theme wiring in `sanity.config.ts`
- `sanity.config.ts` still imports `studioTheme` and uses `resolvedTheme`, but the actual `resolvedTheme` assignment must be revalidated once the theme file is corrected (`packages/sanity-config/sanity.config.ts:6`, `packages/sanity-config/sanity.config.ts:377`).

4) `ThemeProvider` theme instance
- `StudioLayout` wiring should be revalidated once the theme file is corrected; current verification is blocked by drift in the theme file.

5) Color scheme overrides
- Not evaluated due to stop condition.

## Why the theme is ignored (exactly)
The `darkModernTheme` file is not a pure `defineTheme()` theme and instead spreads `studioTheme` with internal token shapes. This violates the supported token contract and can cause Sanity UI to fall back to the default theme, so the custom colors do not take effect.

## Minimal safe fix (single recommendation)
Rebuild `packages/sanity-config/src/theme/darkModernTheme.ts` as a `defineTheme()` object that uses only the supported tokens listed in the requirements and remove all `studioTheme` spreads.
