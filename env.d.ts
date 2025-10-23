/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly DEV: boolean;
    readonly VITE_SITE_URL: string;
    readonly SANITY_STUDIO_CALCOM_EMBED_URL?: string;
    readonly SANITY_STUDIO_CALCOM_API_KEY?: string;
    readonly SANITY_STUDIO_CALCOM_API_BASE_URL?: string;
    readonly SANITY_STUDIO_CALCOM_BOOKING_URL?: string;
    readonly VITE_CALCOM_EMBED_URL?: string;
    readonly VITE_CALCOM_API_KEY?: string;
    readonly VITE_CALCOM_API_BASE_URL?: string;
    readonly VITE_CALCOM_BOOKING_URL?: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

declare const __SANITY_STUDIO_RUNTIME_ENV__:
  | Record<string, string | undefined>
  | undefined;

interface Window {
  __SANITY_STUDIO_RUNTIME_ENV__?: Record<string, string | undefined>;
}
