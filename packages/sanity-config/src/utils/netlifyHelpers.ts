import {getNetlifyFunctionBaseCandidates} from './netlifyBase'

const NETLIFY_BASE_STORAGE_KEY = 'NLFY_BASE'

let lastSuccessfulBase: string | null = null

if (typeof window !== 'undefined') {
  try {
    lastSuccessfulBase = window.localStorage?.getItem(NETLIFY_BASE_STORAGE_KEY) ?? null
  } catch {
    // Ignore storage access failures (private mode, etc.)
  }
}

export interface CallNetlifyFunctionOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  baseOverride?: string | null
}

type JsonPayload = Record<string, unknown> | undefined

export async function callNetlifyFunction(
  functionName: string,
  payload?: JsonPayload,
  options: CallNetlifyFunctionOptions = {},
): Promise<Response> {
  const fetcher = options.fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!fetcher) {
    throw new Error('callNetlifyFunction: global fetch implementation not found')
  }

  const attempted = new Set<string>()
  const candidates = Array.from(
    new Set(
      [options.baseOverride, lastSuccessfulBase, ...getNetlifyFunctionBaseCandidates()].filter(
        (candidate): candidate is string => Boolean(candidate && candidate.trim()),
      ),
    ),
  )

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  const body = JSON.stringify(payload ?? {})
  let lastError: any

  for (const base of candidates) {
    if (!base || attempted.has(base)) continue
    attempted.add(base)

    try {
      const response = await fetcher(`${base}/.netlify/functions/${functionName}`, {
        method: 'POST',
        headers,
        body,
        signal: options.signal,
      })

      if (!response.ok) {
        const message = await response.text().catch(() => '')
        const error = new Error(message || `${functionName} request failed`) as Error & {
          status?: number
        }
        error.status = response.status
        lastError = error
        if (response.status === 404) {
          continue
        }
        throw error
      }

      lastSuccessfulBase = base
      if (typeof window !== 'undefined') {
        try {
          window.localStorage?.setItem(NETLIFY_BASE_STORAGE_KEY, base)
        } catch {
          // Ignore storage access errors
        }
      }

      return response
    } catch (err: any) {
      lastError = err
      const status = err?.status || err?.response?.status
      if (!(err instanceof TypeError) && status !== 404) {
        break
      }
    }
  }

  throw lastError || new Error(`${functionName} request failed`)
}
