/**
 * Per-site branding for the shared photo-portfolio codebase.
 *
 * One codebase serves several photography sites. Everything that differs between
 * them lives here; the rest of `src/`, `api/` and `scripts/` is identical for all
 * of them. Adding a site means adding one entry below — not forking the repo.
 *
 * Selecting a site:
 *   - browser  → `VITE_SITE` (baked in at build time by Vite)
 *   - server   → `SITE` (read at runtime by the Vercel functions)
 *   - scripts  → `SITE`
 *
 * This module must stay dependency-free and free of browser/Node globals so it
 * can be imported from all four of those places.
 */

export type SiteKey = 'addison' | 'cyan';

export type SiteConfig = {
  /** Stable identifier — matches the VITE_SITE / SITE env value. */
  key: SiteKey;
  /** Full product name: browser title, PWA name, install prompt. */
  name: string;
  /** PWA short name — keep under ~12 chars so launchers don't truncate it. */
  shortName: string;
  /** Wordmark on the public gallery hero. */
  heroTitle: string;
  /** Photographer's display name — footer, admin header, email signature. */
  ownerName: string;
  /** Apex domain, no scheme. Also the PWA `id`. */
  domain: string;
  /** Every origin the API accepts cross-origin requests from. */
  origins: string[];
  /** Tailwind text-color class for the hero wordmark. */
  heroAccentClass: string;
  /** Line under the footer wordmark. */
  tagline: string;
  instagramUrl: string;
  instagramHandle: string;
  /** Address `pnpm db:seed` creates the first admin for. */
  defaultAdminEmail: string;
  /** From-address for transactional mail. Domain must be verified in Resend. */
  emailFrom: string;
  /** PWA + browser chrome color. */
  themeColor: string;
};

export const SITES: Record<SiteKey, SiteConfig> = {
  addison: {
    key: 'addison',
    name: "Addison's Photos",
    shortName: 'Addison',
    heroTitle: "Addison's POV",
    ownerName: 'Addison',
    domain: 'addisonsphotos.com',
    origins: ['https://addisonsphotos.com', 'https://www.addisonsphotos.com'],
    heroAccentClass: 'text-white',
    tagline: 'Visual Storyteller & Photographer',
    instagramUrl: 'https://www.instagram.com/addisonrpeters',
    instagramHandle: '@knot_dislesic',
    defaultAdminEmail: 'addisonrpeters@gmail.com',
    emailFrom: "Addison's Photos <noreply@addisonsphotos.com>",
    themeColor: '#000000',
  },
  cyan: {
    key: 'cyan',
    name: "Cyan's Photos",
    shortName: 'Cyan',
    heroTitle: "Cyan's POV",
    ownerName: 'Cyan',
    domain: 'cyansphotos.com',
    origins: ['https://cyansphotos.com', 'https://www.cyansphotos.com'],
    heroAccentClass: 'text-cyan-200',
    tagline: 'Visual Storyteller & Photographer',
    instagramUrl: 'https://www.instagram.com/cyans_pov',
    instagramHandle: '@cyans_pov',
    defaultAdminEmail: 'admin@cyansphotos.com',
    emailFrom: "Cyan's Photos <noreply@cyansphotos.com>",
    themeColor: '#000000',
  },
};

export const DEFAULT_SITE: SiteKey = 'addison';

export const isSiteKey = (value: string | undefined): value is SiteKey =>
  value != null && Object.prototype.hasOwnProperty.call(SITES, value);

/**
 * Resolve a site from a raw env value. Falls back to {@link DEFAULT_SITE} so a
 * missing or misspelled variable renders a working site rather than a blank page.
 */
export const resolveSite = (value: string | undefined): SiteConfig => {
  const key = value?.trim();
  return isSiteKey(key) ? SITES[key] : SITES[DEFAULT_SITE];
};
