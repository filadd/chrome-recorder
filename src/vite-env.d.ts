/// <reference types="vite/client" />

// Build-time config injected by Vite from the root `.env` (VITE_-prefixed only).
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_COOKIE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
