import { resolveSite, type SiteConfig } from '../config/sites';

/**
 * The site this bundle was built for. `VITE_SITE` is inlined at build time, so
 * each Vercel project ships a bundle branded for exactly one site.
 */
export const site: SiteConfig = resolveSite(import.meta.env.VITE_SITE);

export type { SiteConfig };
