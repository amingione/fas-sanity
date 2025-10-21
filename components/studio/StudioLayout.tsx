import {useEffect} from 'react'
import type {LayoutProps} from 'sanity'

type ColorScheme = 'dark' | 'light'

const SCHEME_DATA_ATTRIBUTES = [
  'mode',
  'theme',
  'colorScheme',
  'uiColorScheme',
  'sanityColorScheme',
  'studioColorScheme',
] as const satisfies readonly (keyof DOMStringMap)[]

const applySchemeAttributes = (element: HTMLElement, scheme: ColorScheme) => {
  for (const attribute of SCHEME_DATA_ATTRIBUTES) {
    element.dataset[attribute] = scheme
  }

  element.style.setProperty('color-scheme', scheme)
}

const clearSchemeAttributes = (element: HTMLElement) => {
  for (const attribute of SCHEME_DATA_ATTRIBUTES) {
    delete element.dataset[attribute]
  }

  element.style.removeProperty('color-scheme')
}

function isColorScheme(value: string | null | undefined): value is ColorScheme {
  return value === 'dark' || value === 'light'
}

export default function StudioLayout(props: LayoutProps) {
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined
    }

    const {body, documentElement} = document
    body.classList.add('sanity-studio-theme')

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : undefined

    const readStoredScheme = (): string | null => {
      try {
        return window.localStorage.getItem('sanityStudio:ui:colorScheme')
      } catch (error) {
        console.warn('Unable to read Sanity color scheme preference from localStorage.', error)
        return null
      }
    }

    const resolveScheme = (): ColorScheme => {
      const candidates = [
        body.getAttribute('data-mode'),
        body.getAttribute('data-theme'),
        body.getAttribute('data-color-scheme'),
        body.getAttribute('data-ui-color-scheme'),
        body.getAttribute('data-sanity-color-scheme'),
        documentElement.getAttribute('data-mode'),
        documentElement.getAttribute('data-theme'),
        documentElement.getAttribute('data-color-scheme'),
        documentElement.getAttribute('data-ui-color-scheme'),
        documentElement.getAttribute('data-sanity-color-scheme'),
        readStoredScheme(),
      ]

      const explicit = candidates.find(isColorScheme)
      if (explicit) {
        return explicit
      }

      const systemPreference = mediaQuery?.matches ? 'dark' : 'light'

      if (candidates.includes('system')) {
        return systemPreference
      }

      return systemPreference
    }

    const applyScheme = () => {
      const scheme = resolveScheme()

      applySchemeAttributes(body, scheme)
      applySchemeAttributes(documentElement, scheme)
      body.classList.toggle('sanity-studio-theme-dark', scheme === 'dark')
      body.classList.toggle('sanity-studio-theme-light', scheme === 'light')
    }

    applyScheme()

    const observer = new MutationObserver(applyScheme)
    observer.observe(body, {attributes: true})
    observer.observe(documentElement, {attributes: true})

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'sanityStudio:ui:colorScheme') {
        applyScheme()
      }
    }

    window.addEventListener('storage', handleStorage)

    const cleanupMedia = (() => {
      if (!mediaQuery) {
        return undefined
      }

      const listener = () => applyScheme()

      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', listener)
        return () => mediaQuery.removeEventListener('change', listener)
      }

      // Fallback for older browsers
      if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(listener)
        return () => mediaQuery.removeListener(listener)
      }

      return undefined
    })()

    return () => {
      cleanupMedia?.()
      window.removeEventListener('storage', handleStorage)
      observer.disconnect()
      body.classList.remove('sanity-studio-theme', 'sanity-studio-theme-dark', 'sanity-studio-theme-light')
      clearSchemeAttributes(body)
      clearSchemeAttributes(documentElement)
    }
  }, [])

  return props.renderDefault(props)
}
