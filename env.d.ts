/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __SANITY_STUDIO_RUNTIME_ENV__: Record<string, string | undefined> | undefined

interface Window {
  __SANITY_STUDIO_RUNTIME_ENV__?: Record<string, string | undefined>
}
