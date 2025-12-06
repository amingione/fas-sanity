export const resolveNetlifyBase = (): string => {
  const envBase =
    process.env.SANITY_STUDIO_NETLIFY_BASE ||
    process.env.NETLIFY_BASE_URL ||
    process.env.PUBLIC_SITE_URL ||
    ''
  if (envBase) return envBase
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

