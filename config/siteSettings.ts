import { type SiteConfig } from './sites.js';
import { DEFAULT_THEME, normalizeTheme, type SiteTheme } from './theme.js';

/** The subset of a site that an admin may edit. */
export type EditableSiteFields = {
  name: string;
  shortName: string;
  heroTitle: string;
  ownerName: string;
  tagline: string;
  instagramUrl: string;
  instagramHandle: string;
};

/** What GET /api/site-settings returns and the client renders from. */
export type ResolvedSiteSettings = EditableSiteFields & {
  siteKey: string;
  theme: SiteTheme;
};

/** A row from site_settings, with every column possibly NULL. */
export type SiteSettingsRow = {
  site_key: string;
  name: string | null;
  short_name: string | null;
  hero_title: string | null;
  owner_name: string | null;
  tagline: string | null;
  instagram_url: string | null;
  instagram_handle: string | null;
  theme: unknown;
};

const text = (value: string | null | undefined, fallback: string): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? fallback : trimmed;
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
  row: SiteSettingsRow | null | undefined,
): ResolvedSiteSettings => {
  const fallbackTheme = DEFAULT_THEME[site.key] ?? DEFAULT_THEME.addison!;

  return {
    siteKey: site.key,
    name: text(row?.name, site.name),
    shortName: text(row?.short_name, site.shortName),
    heroTitle: text(row?.hero_title, site.heroTitle),
    ownerName: text(row?.owner_name, site.ownerName),
    tagline: text(row?.tagline, site.tagline),
    instagramUrl: text(row?.instagram_url, site.instagramUrl),
    instagramHandle: text(row?.instagram_handle, site.instagramHandle),
    theme: normalizeTheme(row?.theme, fallbackTheme),
  };
};

/** Defaults with no database involved — the client's first-paint values. */
export const defaultSiteSettings = (site: SiteConfig): ResolvedSiteSettings =>
  resolveSiteSettings(site, null);
