console.log('[THEME] darkModernTheme loaded')
import {
  studioTheme,
  type BaseTheme,
  type ThemeColor,
  type ThemeColorGenericState,
  type ThemeColorScheme,
} from '@sanity/ui'

const palette = {
  defaultBg: '#1F1F1F',
  defaultFg: '#D4D4D4',
  mutedBg: '#252526',
  mutedFg: '#A9A9A9',
  primaryBg: '#007ACC',
  primaryFg: '#FFFFFF',
  border: '#3C3C3C',
  focusRing: '#007ACC',
}

const withSecondaryBg = (state: ThemeColorGenericState): ThemeColorGenericState => ({
  ...state,
  bg2: palette.mutedBg,
})

const applyPalette = (tone: ThemeColor): ThemeColor => ({
  ...tone,
  base: {
    ...tone.base,
    bg: palette.defaultBg,
    fg: palette.defaultFg,
    border: palette.border,
    focusRing: palette.focusRing,
  },
  muted: {
    ...tone.muted,
    default: {
      ...tone.muted.default,
      enabled: {
        ...withSecondaryBg(tone.muted.default.enabled),
        bg: palette.mutedBg,
        fg: palette.mutedFg,
      },
    },
  },
  card: {
    ...tone.card,
    enabled: withSecondaryBg(tone.card.enabled),
    hovered: withSecondaryBg(tone.card.hovered),
    pressed: withSecondaryBg(tone.card.pressed),
    selected: withSecondaryBg(tone.card.selected),
    disabled: withSecondaryBg(tone.card.disabled),
  },
  solid: {
    ...tone.solid,
    primary: {
      ...tone.solid.primary,
      enabled: {
        ...tone.solid.primary.enabled,
        bg: palette.primaryBg,
        fg: palette.primaryFg,
      },
    },
  },
})

const applyScheme = (scheme: ThemeColorScheme): ThemeColorScheme =>
  Object.fromEntries(
    Object.entries(scheme).map(([tone, value]) => [tone, applyPalette(value)]),
  ) as ThemeColorScheme

const darkScheme = applyScheme(studioTheme.color.dark)

export const darkModernTheme: BaseTheme = {
  ...studioTheme,
  color: {
    light: darkScheme,
    dark: darkScheme,
  },
}
