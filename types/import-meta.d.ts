// Minimal ImportMeta env typing so TS code can use import.meta.env
// without depending on vite/client or astro/client types.
declare interface ImportMetaEnv {
  [key: string]: string | undefined
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv
}

