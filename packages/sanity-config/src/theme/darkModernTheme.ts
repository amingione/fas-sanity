import type {StudioTheme} from 'sanity'

console.log('[THEME] darkModernTheme loaded')

const darkColors = {
  default: {
    base: {
      bg: '#1F1F1F',
      fg: '#D4D4D4',
      border: '#3C3C3C',
      focusRing: '#007ACC',
      shadow: {
        outline: 'rgba(0, 122, 204, 0.5)',
        umbra: 'rgba(0, 0, 0, 0.2)',
        penumbra: 'rgba(0, 0, 0, 0.14)',
        ambient: 'rgba(0, 0, 0, 0.12)',
      },
    },
  },
}

export const darkModernTheme = {
  color: {
    dark: darkColors,
    light: darkColors,
  },
} as StudioTheme
