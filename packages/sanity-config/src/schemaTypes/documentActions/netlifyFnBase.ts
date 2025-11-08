export function getNetlifyFnBase(): string {
  const envBase = (
    typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined
  ) as string | undefined
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem('NLFY_BASE')
      if (stored) return stored
      const origin = window.location?.origin
      if (origin && /^https?:\/\//i.test(origin)) return origin
    } catch {
      // ignore access errors (private mode, etc.)
    }
  }
  return 'https://fassanity.fasmotorsports.com'
}
