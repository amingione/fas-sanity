# Sanity Studio Theme Colors Audit

Scope: fas-sanity repo only. Read-only audit.

## Findings

### 1) Studio is hard-wired to the default Sanity UI theme
- `resolvedTheme` is explicitly set to `studioTheme`, and `defineConfig` uses that value as the Studio theme.
- This means any custom theme objects (like `fasTheme` / `fasBrandTheme`) are not referenced by configuration, so edits to those files do not affect Studio.

Evidence:
- `packages/sanity-config/sanity.config.ts:159` sets `resolvedTheme` to `studioTheme`.
- `packages/sanity-config/sanity.config.ts:376` passes `theme: resolvedTheme` into `defineConfig`.

### 2) The custom Studio layout overrides theme context with `ThemeProvider` using `studioTheme`
- The Studio layout wraps the entire Studio in a `ThemeProvider` whose `theme` is `studioTheme`.
- This forces the default theme at runtime even if `defineConfig.theme` were changed, effectively overriding the config theme layer inside the layout tree.

Evidence:
- `packages/sanity-config/src/components/studio/StudioLayout.tsx:4` imports `studioTheme`.
- `packages/sanity-config/src/components/studio/StudioLayout.tsx:46` uses `<ThemeProvider theme={studioTheme}>`.

### 3) Global Tailwind CSS injects hard-coded color variables with `!important`
- The Studio bundle imports `packages/sanity-config/src/styles/tailwind.css`, which defines many `--studio-*` and card/badge variables with fixed hex values and `!important` flags.
- These overrides are applied to `body.sanity-studio-theme` (and `[data-ui]`) and force a palette regardless of theme tokens, meaning theme changes can be masked by CSS variable overrides.

Evidence:
- `packages/sanity-config/sanity.config.ts:5` imports `./src/styles/tailwind.css` into the Studio bundle.
- `packages/sanity-config/src/styles/tailwind.css:8`–`70` defines `--studio-*` variables with fixed values, many marked `!important`.
- `packages/sanity-config/src/styles/tailwind.css:318`–`520` overrides card/badge variables and badge styling with `!important`.

### 4) Custom theme files exist but are not wired into Studio configuration
- The repo includes `fasTheme` and `fasBrandTheme` objects, but they are not imported or referenced in `sanity.config.ts`.
- As a result, changes there are inert for the Studio UI.

Evidence:
- `packages/sanity-config/src/theme/fasTheme.ts` defines `fasTheme`.
- `packages/sanity-config/src/theme/fasBrandTheme.ts` defines `fasBrandTheme`.
- No references to these files in `packages/sanity-config/sanity.config.ts` (see `theme: resolvedTheme` in `packages/sanity-config/sanity.config.ts:376`).

## Why colors are not changing
- The Studio is configured to use the default `studioTheme` rather than a custom theme, so edits to custom theme objects are never applied.
- The custom Studio layout explicitly wraps the app with `ThemeProvider` using `studioTheme`, which overrides any theme supplied via `defineConfig`.
- The Studio’s Tailwind CSS injects fixed color variables with `!important`, which can override Sanity UI theme tokens even if a custom theme were applied.

## Authoritative theme layer (current state)
1. `packages/sanity-config/src/components/studio/StudioLayout.tsx` provides the top-level `ThemeProvider` with `studioTheme` and therefore dictates the active theme context.
2. `packages/sanity-config/src/styles/tailwind.css` defines hard-coded `--studio-*` and card/badge variables, overriding colors at the CSS layer.
3. `packages/sanity-config/sanity.config.ts` sets `theme: resolvedTheme`, but `resolvedTheme` is the default `studioTheme` and is not custom.

## Notes on version compatibility
- Sanity is at `sanity@^5.1.0` and `@sanity/ui@^3.1.11` (from `package.json`). The `theme` key in `defineConfig` is present and used, but it is currently set to the default theme object, not a custom theme.
