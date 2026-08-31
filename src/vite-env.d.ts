/// <reference types="vite/client" />

// PWA version injected at build time
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** Public Google Business Profile review URL, shown on every feedback path. */
  readonly VITE_GOOGLE_REVIEW_URL: string;
  /** Canonical public site origin used when generating production QR codes. */
  readonly VITE_PUBLIC_SITE_URL?: string;
  /** Published App Store listing. Leave blank until Apple has created the listing. */
  readonly VITE_APP_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
