import type { SiteConfig } from "./sites.js";
import { DEFAULT_THEME, normalizeTheme, type SiteTheme } from "./theme.js";

/** The subset of a site that an admin may edit. */
export interface EditableSiteFields {
  heroTitle: string;
  instagramHandle: string;
  instagramUrl: string;
  name: string;
  ownerName: string;
  shortName: string;
  tagline: string;
}

/** What GET /api/site-settings returns and the client renders from. */
export type ResolvedSiteSettings = EditableSiteFields & {
  siteKey: string;
  theme: SiteTheme;
};

/** A row from site_settings, with every column possibly NULL. */
export interface SiteSettingsRow {
  hero_title: string | null;
  instagram_handle: string | null;
  instagram_url: string | null;
  name: string | null;
  owner_name: string | null;
  short_name: string | null;
  site_key: string;
  tagline: string | null;
  theme: unknown;
}

const text = (value: string | null | undefined, fallback: string): string => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? fallback : trimmed;
};

/**
 * Layers a settings row over the compiled-in defaults.
 *
 * The code defaults always win when a column is NULL or blank, so a missing row,
 * an empty row, or an unreachable database all still render a correct site
 * rather than a blank one.
 */
export const resolveSiteSettings = (
  site: SiteConfig,
  row: SiteSettingsRow | null | undefined
): ResolvedSiteSettings => {
  const fallbackTheme = DEFAULT_THEME[site.key] ?? DEFAULT_THEME.addison;

  return {
    heroTitle: text(row?.hero_title, site.heroTitle),
    instagramHandle: text(row?.instagram_handle, site.instagramHandle),
    instagramUrl: text(row?.instagram_url, site.instagramUrl),
    name: text(row?.name, site.name),
    ownerName: text(row?.owner_name, site.ownerName),
    shortName: text(row?.short_name, site.shortName),
    siteKey: site.key,
    tagline: text(row?.tagline, site.tagline),
    theme: normalizeTheme(row?.theme, fallbackTheme),
  };
};

/** Defaults with no database involved — the client's first-paint values. */
export const defaultSiteSettings = (site: SiteConfig): ResolvedSiteSettings =>
  resolveSiteSettings(site, null);
