// Ensure the compiled runtime env is available on the browser global for debugging
// and for any code paths that rely on window/globalThis lookups.

type EnvMap = Record<string, string | undefined>

declare const __SANITY_STUDIO_RUNTIME_ENV__: EnvMap | undefined

const envFromDefine = typeof __SANITY_STUDIO_RUNTIME_ENV__ !== 'undefined'
  ? __SANITY_STUDIO_RUNTIME_ENV__
  : undefined

try {
  const target = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined
  if (target) {
    // Populate window/globalThis for devtools visibility.
    if (!target.__SANITY_STUDIO_RUNTIME_ENV__) {
      target.__SANITY_STUDIO_RUNTIME_ENV__ = envFromDefine || {}
    }

    // Keep process.env in sync so legacy reads still work in the browser.
    if (target.process?.env) {
      target.process.env = {...target.process.env, ...(envFromDefine || {})}
    } else {
      target.process = {env: {...(envFromDefine || {})}}
    }
  }
} catch {
  // Ignore globals assignment failures (e.g., restrictive runtimes).
}

export {}
