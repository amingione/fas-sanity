const DEFAULT_NETLIFY_BASE = 'https://fassanity.fasmotorsports.com'

function normalizeNetlifyBase(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed.replace(/\/+$/, '')
}

function getNetlifyFunctionBaseCandidates(): string[] {
  const candidates: string[] = []

  const envBase = normalizeNetlifyBase(
    (typeof process !== 'undefined'
      ? ((process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE ||
          (process as any)?.env?.SANITY_NETLIFY_BASE ||
          (process as any)?.env?.SANITY_API_NETLIFY_BASE)
      : null) as string | null,
  )
  if (envBase) candidates.push(envBase)

  const localNetlifyBases = [
    normalizeNetlifyBase('http://localhost:8888'),
    normalizeNetlifyBase('http://127.0.0.1:8888'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  candidates.push(...localNetlifyBases)

  if (typeof window !== 'undefined') {
    try {
      const stored = normalizeNetlifyBase(window.localStorage?.getItem('NLFY_BASE'))
      if (stored) candidates.push(stored)
    } catch {
      // ignore storage access errors
    }

    const origin = normalizeNetlifyBase(window.location?.origin)
    if (origin) candidates.push(origin)
  }

  const fallback = normalizeNetlifyBase(DEFAULT_NETLIFY_BASE)
  if (fallback) candidates.push(fallback)

  return Array.from(new Set(candidates))
}

export {DEFAULT_NETLIFY_BASE, getNetlifyFunctionBaseCandidates, normalizeNetlifyBase}
