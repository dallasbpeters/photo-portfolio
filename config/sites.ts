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

export type SiteKey = "addison" | "cyan" | "dallas-images";

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
  /**
   * Stable identifier — matches the VITE_SITE / SITE env value.
   *
   * Typed as a plain string rather than SiteKey because a site created from the
   * admin is not in this file: its key is whatever the deployment was given.
   */
  key: string;
  /** Full product name: browser title, PWA name, install prompt. */
  name: string;
  /** Every origin the API accepts cross-origin requests from. */
  origins: string[];
  /** Photographer's display name — footer, admin header, email signature. */
  ownerName: string;
  /** PWA short name — keep under ~12 chars so launchers don't truncate it. */
  shortName: string;
  /** Default for the animated dither backdrop; an admin can override it. */
  showShader: boolean;
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
    showShader: false,
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
    showShader: false,
    tagline: "Visual Storyteller & Photographer",
    themeColor: "#000000",
  },
  // Key must match the VITE_SITE / SITE value this site is deployed with —
  // `resolveSite` matches on it exactly, and a near-miss silently serves this
  // deployment as a copy of the default site.
  "dallas-images": {
    analyticsHost: "https://t.addisonsphotos.com",
    defaultAdminEmail: "dallaspeters@gmail.com",
    domain: "dallaspeters.com",
    emailFrom: "Addison's Photos <noreply@addisonsphotos.com>",
    heroTitle: "Addison's POV",
    instagramHandle: "@dallas_saves",
    instagramUrl: "https://www.instagram.com/dallas_saves",
    key: "dallas-images",
    name: "Dallas Peters",
    origins: ["https://dallaspeters.com", "https://www.dallaspeters.com"],
    ownerName: "Dallas",
    shortName: "Dallas  ",
    showShader: true,
    tagline: "Product Designer",
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
  if (isSiteKey(key)) {
    return SITES[key];
  }
  // An unknown key means a site added after this file was compiled. Keeping the
  // key rather than silently becoming the default matters: falling back
  // wholesale would serve the new deployment as a copy of another site, with
  // its CORS origins and its transactional email address.
  return key ? { ...SITES[DEFAULT_SITE], key } : SITES[DEFAULT_SITE];
};

/** Env var carrying a comma-separated list. */
const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Layers SITE_* environment variables over a compiled site.
 *
 * This is how a site that does not exist in this file gets its identity: the
 * values travel as environment variables on its own deployment rather than
 * requiring a code change and a release to add a site. Anything unset keeps the
 * compiled value, so existing sites are unaffected.
 *
 * Takes the environment as an argument rather than reading process.env, since
 * this module has to stay usable from the browser bundle too.
 */
export const applySiteOverrides = (
  base: SiteConfig,
  env: Record<string, string | undefined>
): SiteConfig => {
  const text = (name: string): string | undefined => {
    const value = env[name]?.trim();
    return value ? value : undefined;
  };

  /**
   * Env var carrying a boolean.
   *
   * Only an explicit "true"/"false" overrides. Anything else — unset, a typo,
   * "1" — keeps the compiled default rather than silently reading as off, so a
   * fat-fingered variable cannot switch a feature off across a deployment.
   */
  const flag = (name: string, fallback: boolean): boolean => {
    const value = text(name)?.toLowerCase();
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    return fallback;
  };

  const origins = text("SITE_ORIGINS");

  return {
    ...base,
    analyticsHost: text("SITE_ANALYTICS_HOST") ?? base.analyticsHost,
    defaultAdminEmail:
      text("SITE_DEFAULT_ADMIN_EMAIL") ?? base.defaultAdminEmail,
    domain: text("SITE_DOMAIN") ?? base.domain,
    emailFrom: text("SITE_EMAIL_FROM") ?? base.emailFrom,
    heroTitle: text("SITE_HERO_TITLE") ?? base.heroTitle,
    instagramHandle: text("SITE_INSTAGRAM_HANDLE") ?? base.instagramHandle,
    instagramUrl: text("SITE_INSTAGRAM_URL") ?? base.instagramUrl,
    name: text("SITE_NAME") ?? base.name,
    origins: origins ? splitList(origins) : base.origins,
    ownerName: text("SITE_OWNER_NAME") ?? base.ownerName,
    shortName: text("SITE_SHORT_NAME") ?? base.shortName,
    showShader: flag("SITE_SHOW_SHADER", base.showShader),
    tagline: text("SITE_TAGLINE") ?? base.tagline,
    themeColor: text("SITE_THEME_COLOR") ?? base.themeColor,
  };
};
