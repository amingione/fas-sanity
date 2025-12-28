# Sanity Studio Color Authority Audit

## Scope
- Repo: fas-sanity
- Objective: determine why `body.sanity-studio-theme` CSS variables do not change Sanity Studio UI colors

## Findings (by objective)
1) `body.sanity-studio-theme` on `<body>` at runtime
- `StudioLayout` adds the class on mount and removes it on unmount, so it should be present during the Studio session after hydration (`packages/sanity-config/src/components/studio/StudioLayout.tsx:11`, `packages/sanity-config/src/components/studio/StudioLayout.tsx:14`, `packages/sanity-config/src/components/studio/StudioLayout.tsx:31`).
- `StudioLayout` is wired as the Studio layout component, so this effect runs for the Studio (`packages/sanity-config/sanity.config.ts:374`).

2) CSS file load order relative to Sanity UI styles
- The Studio entry imports `src/styles/tailwind.css` first, then re-exports the package config (`sanity.config.ts:1`, `sanity.config.ts:4`).
- The package config also imports its own `./src/styles/tailwind.css`, which is bundled after the root import (`packages/sanity-config/sanity.config.ts:4`).
- `@sanity/ui` styles are injected at runtime via styled-components (`ThemeProvider` + `StyleSheetManager`), which places generated `<style>` tags in `<head>` after static CSS, so Sanity UI rules come later in the cascade (`packages/sanity-config/src/components/studio/StudioLayout.tsx:46`, `packages/sanity-config/src/components/studio/StudioLayout.tsx:47`).

3) styled-components injection overriding variables
- styled-components does not set `--studio-*` variables here, but it does inject component styles with concrete color values derived from the JS theme tokens (via `ThemeProvider theme={studioTheme}`), so those component rules override any color effects you expected from CSS variables (`packages/sanity-config/src/components/studio/StudioLayout.tsx:46`).
- This is not inline style attributes, but it is runtime-injected CSS with later load order and direct color values.

4) Sanity UI components read JS theme tokens instead of CSS variables
- The Studio theme is explicitly provided as a JS theme (`studioTheme`) in both the Studio config and ThemeProvider (`packages/sanity-config/sanity.config.ts:159`, `packages/sanity-config/sanity.config.ts:374`, `packages/sanity-config/src/components/studio/StudioLayout.tsx:46`).
- That means Sanity UI components style themselves from the JS theme tokens, not from `--studio-*` variables defined in `tailwind.css`.

5) Remaining selectors redefining `--studio-*` after the authoritative block
- The root `src/styles/tailwind.css` defines `:root`/`body` variables and data-attribute overrides for color schemes (`src/styles/tailwind.css:4`, `src/styles/tailwind.css:63`, `src/styles/tailwind.css:113`).
- The package `packages/sanity-config/src/styles/tailwind.css` defines `body.sanity-studio-theme` variables using `light-dark()` and is bundled after the root file (`packages/sanity-config/src/styles/tailwind.css:43`, `packages/sanity-config/sanity.config.ts:4`).
- No later repo CSS redefines `--studio-*` after the package `body.sanity-studio-theme` block; the later overrides come from Sanity UI’s injected component styles which do not reference these variables.

## Root cause (proven)
Sanity Studio UI colors are authoritative in the JS theme layer, not in CSS variables. The Studio is configured to use `studioTheme` (JS tokens) and wraps the app in `ThemeProvider`, so `@sanity/ui` components render their colors from those tokens via styled-components. As a result, `--studio-*` variables under `body.sanity-studio-theme` are defined but not consumed by the core Sanity UI components, and the injected styled-components rules take precedence in the cascade.

## Authoritative color layer
The authoritative layer is the JS theme tokens from `@sanity/ui` (`studioTheme`) applied via `ThemeProvider` and the `theme` property in `sanity.config.ts` (`packages/sanity-config/sanity.config.ts:159`, `packages/sanity-config/sanity.config.ts:374`, `packages/sanity-config/src/components/studio/StudioLayout.tsx:46`).

## Why CSS variables are ignored or overridden
- `@sanity/ui` components do not read `--studio-*` variables from CSS; they read JS theme tokens and generate concrete color styles.
- Those component styles are injected at runtime by styled-components after your static Tailwind CSS, so they win in cascade order for elements rendered by Sanity UI.

## Minimal fix (single recommendation)
Replace the default `studioTheme` with a custom `StudioTheme` that sets your desired color tokens, and pass that theme both in `sanity.config.ts` (`theme`) and `StudioLayout` (`ThemeProvider`) so Sanity UI components render your colors from the authoritative JS layer.
