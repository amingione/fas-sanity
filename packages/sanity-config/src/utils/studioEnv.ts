type EnvMap = Record<string, string | undefined>

declare const __SANITY_STUDIO_RUNTIME_ENV__: EnvMap | undefined

declare global {
  interface Window {
    __SANITY_STUDIO_RUNTIME_ENV__?: EnvMap
  }
}

function runtimeEnv(): EnvMap | undefined {
  if (typeof __SANITY_STUDIO_RUNTIME_ENV__ !== 'undefined') {
    return __SANITY_STUDIO_RUNTIME_ENV__
  }
  if (typeof window !== 'undefined') {
    return window.__SANITY_STUDIO_RUNTIME_ENV__
  }
  return undefined
}

export function readStudioEnv(key: string): string | undefined {
  const envSources: Array<EnvMap | undefined> = []

  if (typeof process !== 'undefined' && process?.env) {
    envSources.push(process.env as EnvMap)
  }

  envSources.push(runtimeEnv())

  for (const env of envSources) {
    if (!env) continue
    const value = env[key]
    if (value !== undefined) return value
  }

  return undefined
}
