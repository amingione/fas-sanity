const DEFAULT_NETLIFY_BASE = 'https://fassanity.fasmotorsports.com'

function normalizeNetlifyBase(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed.replace(/\/+$/, '')
}

function isHostedStudio(base: string): boolean {
  try {
    const hostname = new URL(base).hostname.toLowerCase()
    return /\.sanity\.studio$/.test(hostname)
  } catch {
    return false
  }
}

function getNetlifyFunctionBaseCandidates(): string[] {
  const localNetlifyBases = [
    normalizeNetlifyBase('http://localhost:8888'),
    normalizeNetlifyBase('http://127.0.0.1:8888'),
  ].filter((candidate): candidate is string => Boolean(candidate))

  const envBase = normalizeNetlifyBase(
    (typeof process !== 'undefined'
      ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE ||
        (process as any)?.env?.SANITY_NETLIFY_BASE ||
        (process as any)?.env?.SANITY_API_NETLIFY_BASE
      : null) as string | null,
  )

  const storedBases: string[] = []
  let currentOrigin: string | null = null
  if (typeof window !== 'undefined') {
    try {
      const stored = normalizeNetlifyBase(window.localStorage?.getItem('NLFY_BASE'))
      if (stored) storedBases.push(stored)
    } catch {
      // ignore storage access errors
    }
    currentOrigin = normalizeNetlifyBase(window.location?.origin)
  }

  const fallback = normalizeNetlifyBase(DEFAULT_NETLIFY_BASE)

  const isLocalStudio =
    typeof window !== 'undefined' &&
    /localhost:\d+|127\.0\.0\.1:\d+/.test(window.location.host || '')

  // Prefer local Netlify dev when running Studio locally, then any stored success, then env/prod.
  const ordered = [
    ...(isLocalStudio ? localNetlifyBases : []),
    ...storedBases,
    ...(envBase ? [envBase] : []),
    ...(currentOrigin ? [currentOrigin] : []),
    ...(!isLocalStudio ? localNetlifyBases : []),
    ...(fallback ? [fallback] : []),
  ]

  return Array.from(new Set(ordered))
}

function resolveNetlifyBase(): string {
  const candidates = getNetlifyFunctionBaseCandidates()
  for (const candidate of candidates) {
    if (!candidate) continue
    if (isHostedStudio(candidate)) continue
    return candidate
  }
  return DEFAULT_NETLIFY_BASE
}

export {
  DEFAULT_NETLIFY_BASE,
  getNetlifyFunctionBaseCandidates,
  normalizeNetlifyBase,
  resolveNetlifyBase,
}
