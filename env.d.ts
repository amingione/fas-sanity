/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly VITE_SITE_URL: string;
    readonly SANITY_STUDIO_CALCOM_EMBED_URL?: string;
    readonly VITE_CALCOM_EMBED_URL?: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
