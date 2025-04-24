/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly VITE_SITE_URL: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }