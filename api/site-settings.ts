import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "drizzle-orm";
import {
  defaultSiteSettings,
  resolveSiteSettings,
} from "../config/siteSettings.js";
import { findFont, isHexColor, normalizeTheme } from "../config/theme.js";
import { getBearerUser } from "./_lib/auth.js";
import { handleCors } from "./_lib/cors.js";
import { parsePublicHttpUrl, sanitizeText } from "./_lib/httpUrl.js";
import { getDb, schema } from "./_lib/orm.js";
import { parseJsonBody } from "./_lib/parseBody.js";
import { getSite, type SiteConfig } from "./_lib/site.js";
import {
  readSiteSettingsRow,
  type SiteSettingsWrite,
} from "./_lib/siteSettingsStore.js";

const MAX_TEXT = 200;
const COLOR_KEYS = ["background", "foreground", "accent"] as const;
const FONT_KEYS = ["sansFont", "serifFont"] as const;

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
    const settings = resolveSiteSettings(
      site,
      await readSiteSettingsRow(site.key)
    );
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
    /*
     * One statement, so a save is never half-applied.
     *
     * `onConflictDoUpdate` is the same INSERT ... ON CONFLICT the raw form
     * wrote out twice — once as values and once as EXCLUDED — and getting
     * those two lists out of step was a column that silently stopped saving
     * on an edit while still working on a first save. Naming each field once
     * removes the way for them to disagree.
     */
    const saved: SiteSettingsWrite = {
      heroTitle: str(body, "heroTitle"),
      instagramHandle: str(body, "instagramHandle"),
      instagramUrl: values.instagramUrl,
      name: str(body, "name"),
      ownerName: str(body, "ownerName"),
      shortName: str(body, "shortName"),
      showShader: bool(body, "showShader"),
      tagline: str(body, "tagline"),
      theme: values.theme,
      // In the database, not in Node: a function's clock is not the one every
      // other row's timestamp was written against.
      updatedAt: sql`now()`,
      updatedBy: values.userId,
    };
    await getDb()
      .insert(schema.siteSettings)
      .values({ siteKey: site.key, ...saved })
      .onConflictDoUpdate({
        set: saved,
        target: schema.siteSettings.siteKey,
      });

    // Re-read rather than echoing the input, so the client renders exactly
    // what a fresh page load would.
    return res
      .status(200)
      .json(resolveSiteSettings(site, await readSiteSettingsRow(site.key)));
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
