// Ensure the runtime env is available on the browser global for debugging
// and for any code paths that rely on window/globalThis lookups.

type EnvMap = Record<string, string | undefined>

declare const __SANITY_STUDIO_RUNTIME_ENV__: EnvMap | undefined

const ALLOWED_PREFIXES = ['SANITY_STUDIO_', 'VITE_', 'PUBLIC_']
const pickAllowed = (source: EnvMap | undefined): EnvMap =>
  Object.fromEntries(
    Object.entries(source || {}).filter(([key]) =>
      ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  )

const envFromDefine =
  typeof __SANITY_STUDIO_RUNTIME_ENV__ !== 'undefined'
    ? pickAllowed(__SANITY_STUDIO_RUNTIME_ENV__)
    : undefined

// For CJS build paths (schema deploy), avoid import.meta access to prevent warnings.
// Pull from process.env instead; the Studio bundle will already inline allowed vars.
const envFromProcess =
  typeof process !== 'undefined' && process.env ? pickAllowed(process.env as EnvMap) : undefined

const mergedEnv: EnvMap = {
  ...(envFromDefine || {}),
  ...(envFromProcess || {}),
}

try {
  const target = typeof globalThis !== 'undefined' ? (globalThis as any) : undefined
  if (target) {
    // Populate window/globalThis for devtools visibility.
    if (!target.__SANITY_STUDIO_RUNTIME_ENV__) {
      target.__SANITY_STUDIO_RUNTIME_ENV__ = mergedEnv
    }

    // Keep process.env in sync so legacy reads still work in the browser.
    if (target.process?.env) {
      target.process.env = {...target.process.env, ...mergedEnv}
    } else {
      target.process = {env: {...mergedEnv}}
    }
  }
} catch {
  // Ignore globals assignment failures (e.g., restrictive runtimes).
}

export {}
