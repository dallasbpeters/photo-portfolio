import { resolveSite, type SiteConfig } from '../config/sites';

/**
 * The site this bundle was built for. `VITE_SITE` is inlined at build time, so
 * each Vercel project ships a bundle branded for exactly one site.
 *
 * This is the *identity and security* layer — canonical domain, CORS origins,
 * email From address — and is deliberately not editable at runtime. For the
 * content and theme an admin can change, use `useSiteSettings()`.
 */
export const siteConfig: SiteConfig = resolveSite(import.meta.env.VITE_SITE);

/** @deprecated Prefer `useSiteSettings()` for anything an admin can edit. */
export const site = siteConfig;

export type { SiteConfig };
