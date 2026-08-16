import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  defaultSiteSettings,
  resolveSiteSettings,
  type SiteSettingsRow,
} from "../config/siteSettings.js";
import { findFont, isHexColor, normalizeTheme } from "../config/theme.js";
import { getBearerUser } from "./_lib/auth.js";
import { handleCors } from "./_lib/cors.js";
import { getSql } from "./_lib/db.js";
import { parsePublicHttpUrl, sanitizeText } from "./_lib/httpUrl.js";
import { parseJsonBody } from "./_lib/parseBody.js";
import { getSite, type SiteConfig } from "./_lib/site.js";

const MAX_TEXT = 200;
const COLOR_KEYS = ["background", "foreground", "accent"] as const;
const FONT_KEYS = ["sansFont", "serifFont"] as const;

const readRow = async (siteKey: string): Promise<SiteSettingsRow | null> => {
  const sql = getSql();
  const rows =
    await sql`SELECT * FROM site_settings WHERE site_key = ${siteKey} LIMIT 1`;
  return (rows[0] as SiteSettingsRow | undefined) ?? null;
};

const str = (body: Record<string, unknown>, key: string): string | null => {
  const raw = body[key];
  if (typeof raw !== "string") {
    return null;
  }
  const clean = sanitizeText(raw).slice(0, MAX_TEXT);
  return clean === "" ? null : clean;
};

/**
 * A submitted boolean, or null to clear the column back to the compiled default.
 *
 * Anything that is not a real boolean stores NULL rather than `false`, so a
 * malformed or partial body cannot silently pin a site to "off".
 */
const bool = (body: Record<string, unknown>, key: string): boolean | null => {
  const raw = body[key];
  return typeof raw === "boolean" ? raw : null;
};

/** The first thing wrong with a submitted theme, or null when it is usable. */
const themeError = (themeInput: Record<string, unknown>): string | null => {
  for (const key of COLOR_KEYS) {
    const value = themeInput[key];
    // undefined means the field was omitted, which is valid — only an
    // explicitly supplied bad value is an error.
    if (value !== undefined && value !== null && !isHexColor(value)) {
      return `${key} must be a hex color like #1a1a1a`;
    }
  }
  for (const key of FONT_KEYS) {
    const value = themeInput[key];
    if (value !== undefined && value !== null && !findFont(value as string)) {
      return `Unknown font: ${String(value)}`;
    }
  }
  return null;
};

const handleGet = async (site: SiteConfig, res: VercelResponse) => {
  try {
    const settings = resolveSiteSettings(site, await readRow(site.key));
    // Short cache: the gallery fetches this on every load, but an admin
    // saving a change should see it almost immediately.
    res.setHeader(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=300"
    );
    return res.status(200).json(settings);
  } catch (e) {
    console.error(e);
    // A settings table that is missing or unreachable must not take the site
    // down — fall back to the compiled-in defaults.
    return res.status(200).json(defaultSiteSettings(site));
  }
};

const handleSaveFailure = (e: unknown, res: VercelResponse) => {
  console.error(e);
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("site_settings")) {
    return res.status(503).json({
      error:
        "Database schema is out of date. Run pnpm db:migrate against this deployment.",
    });
  }
  return res.status(500).json({ error: "Could not save settings" });
};

const save = async (
  site: SiteConfig,
  res: VercelResponse,
  body: Record<string, unknown>,
  values: { instagramUrl: string | null; theme: unknown; userId: string }
) => {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO site_settings (
        site_key, name, short_name, hero_title, owner_name, tagline,
        instagram_url, instagram_handle, show_shader, theme, updated_at, updated_by
      ) VALUES (
        ${site.key}, ${str(body, "name")}, ${str(body, "shortName")}, ${str(body, "heroTitle")},
        ${str(body, "ownerName")}, ${str(body, "tagline")}, ${values.instagramUrl}, ${str(body, "instagramHandle")},
        ${bool(body, "showShader")},
        ${JSON.stringify(values.theme)}::jsonb, now(), ${values.userId}
      )
      ON CONFLICT (site_key) DO UPDATE SET
        name = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        hero_title = EXCLUDED.hero_title,
        owner_name = EXCLUDED.owner_name,
        tagline = EXCLUDED.tagline,
        instagram_url = EXCLUDED.instagram_url,
        instagram_handle = EXCLUDED.instagram_handle,
        show_shader = EXCLUDED.show_shader,
        theme = EXCLUDED.theme,
        updated_at = now(),
        updated_by = EXCLUDED.updated_by
    `;

    // Re-read rather than echoing the input, so the client renders exactly
    // what a fresh page load would.
    return res
      .status(200)
      .json(resolveSiteSettings(site, await readRow(site.key)));
  } catch (e) {
    return handleSaveFailure(e, res);
  }
};

const handlePatch = async (
  req: VercelRequest,
  res: VercelResponse,
  site: SiteConfig
) => {
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body);

  // Instagram is a link the public gallery renders, so it must be a real
  // http(s) URL rather than anything a text field could hold.
  let instagramUrl: string | null = null;
  if (
    typeof body.instagramUrl === "string" &&
    body.instagramUrl.trim() !== ""
  ) {
    instagramUrl = parsePublicHttpUrl(body.instagramUrl);
    if (!instagramUrl) {
      return res
        .status(400)
        .json({ error: "Instagram URL must be a full https:// link" });
    }
  }

  const themeInput = (body.theme ?? {}) as Record<string, unknown>;
  const error = themeError(themeInput);
  if (error) {
    return res.status(400).json({ error });
  }

  const theme = normalizeTheme(themeInput, defaultSiteSettings(site).theme);

  return await save(site, res, body, {
    instagramUrl,
    theme,
    userId: user.userId,
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const site = getSite();

  // ── Public read ───────────────────────────────────────────────────────────
  if (req.method === "GET") {
    return await handleGet(site, res);
  }

  // ── Admin write ───────────────────────────────────────────────────────────
  if (req.method === "PATCH") {
    return await handlePatch(req, res, site);
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
