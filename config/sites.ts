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

export type SiteKey = "addison" | "cyan";

export interface SiteConfig {
  /**
   * PostHog ingestion host — a per-site reverse proxy on the site's own domain,
   * so analytics are first-party and survive tracking blockers.
   *
   * Must be the site's own subdomain: a proxy on another site's domain would be
   * third-party again, defeating the point. Include the scheme, no trailing
   * slash. This is only where events are *sent*; the project token still decides
   * which PostHog project receives them.
   */
  analyticsHost: string;
  /** Address `pnpm db:seed` creates the first admin for. */
  defaultAdminEmail: string;
  /** Apex domain, no scheme. Also the PWA `id`. */
  domain: string;
  /** From-address for transactional mail. Domain must be verified in Resend. */
  emailFrom: string;
  /** Wordmark on the public gallery hero. */
  heroTitle: string;
  instagramHandle: string;
  instagramUrl: string;
  /** Stable identifier — matches the VITE_SITE / SITE env value. */
  key: SiteKey;
  /** Full product name: browser title, PWA name, install prompt. */
  name: string;
  /** Every origin the API accepts cross-origin requests from. */
  origins: string[];
  /** Photographer's display name — footer, admin header, email signature. */
  ownerName: string;
  /** PWA short name — keep under ~12 chars so launchers don't truncate it. */
  shortName: string;
  /** Line under the footer wordmark. */
  tagline: string;
  /** PWA + browser chrome color. */
  themeColor: string;
}

export const SITES: Record<SiteKey, SiteConfig> = {
  addison: {
    analyticsHost: "https://t.addisonsphotos.com",
    defaultAdminEmail: "addisonrpeters@gmail.com",
    domain: "addisonsphotos.com",
    emailFrom: "Addison's Photos <noreply@addisonsphotos.com>",
    heroTitle: "Addison's POV",
    instagramHandle: "@knot_dislesic",
    instagramUrl: "https://www.instagram.com/knot_dislesic",
    key: "addison",
    name: "Addison's Photos",
    origins: ["https://addisonsphotos.com", "https://www.addisonsphotos.com"],
    ownerName: "Addison",
    shortName: "Addison",
    tagline: "Visual Storyteller & Photographer",
    themeColor: "#000000",
  },
  cyan: {
    analyticsHost: "https://t.cyansphotos.com",
    defaultAdminEmail: "admin@cyansphotos.com",
    domain: "cyansphotos.com",
    emailFrom: "Cyan's Photos <noreply@cyansphotos.com>",
    heroTitle: "Cyan's POV",
    instagramHandle: "@cyans_pov",
    instagramUrl: "https://www.instagram.com/cyans_pov",
    key: "cyan",
    name: "Cyan's Photos",
    origins: ["https://cyansphotos.com", "https://www.cyansphotos.com"],
    ownerName: "Cyan",
    shortName: "Cyan",
    tagline: "Visual Storyteller & Photographer",
    themeColor: "#000000",
  },
};

export const DEFAULT_SITE: SiteKey = "addison";

export const isSiteKey = (value: string | undefined): value is SiteKey =>
  // Both null and undefined must be rejected here; a lone `!== null` lets
  // undefined through to Object.hasOwn.
  value !== undefined && value !== null && Object.hasOwn(SITES, value);

/**
 * Resolve a site from a raw env value. Falls back to {@link DEFAULT_SITE} so a
 * missing or misspelled variable renders a working site rather than a blank page.
 */
export const resolveSite = (value: string | undefined): SiteConfig => {
  const key = value?.trim();
  return isSiteKey(key) ? SITES[key] : SITES[DEFAULT_SITE];
};
