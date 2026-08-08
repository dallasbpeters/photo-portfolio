/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Google OAuth web client id. Unset hides the Google sign-in button. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** PostHog API host used by the browser SDK. */
  readonly VITE_POSTHOG_HOST?: string;
  /** Public PostHog project token used by the browser SDK. */
  readonly VITE_POSTHOG_KEY?: string;
  /** Which site in config/sites.ts this bundle is branded for. */
  readonly VITE_SITE?: string;
  /** Set by `pnpm dev:local` — ignore VITE_API_BASE_URL and use same-origin /api → Vite proxy */
  readonly VITE_USE_LOCAL_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
