import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  defaultSiteSettings,
  resolveSiteSettings,
  type SiteSettingsRow,
} from "../config/siteSettings.js";
import { DEFAULT_THEME, findFont, isHexColor } from "../config/theme.js";
import { getBearerUser } from "./_lib/auth.js";
import { handleCors } from "./_lib/cors.js";
import { getSql } from "./_lib/db.js";
import { parsePublicHttpUrl, sanitizeText } from "./_lib/httpUrl.js";
import { parseJsonBody } from "./_lib/parseBody.js";
import { getSite } from "./_lib/site.js";

const MAX_TEXT = 200;

const readRow = async (siteKey: string): Promise<SiteSettingsRow | null> => {
  const sql = getSql();
  const rows =
    await sql`SELECT * FROM site_settings WHERE site_key = ${siteKey} LIMIT 1`;
  return (rows[0] as SiteSettingsRow | undefined) ?? null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const site = getSite();

  // ── Public read ───────────────────────────────────────────────────────────
  if (req.method === "GET") {
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
  }

  // ── Admin write ───────────────────────────────────────────────────────────
  if (req.method === "PATCH") {
    const user = getBearerUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = parseJsonBody(req.body);

    const str = (key: string): string | null => {
      const raw = body[key];
      if (raw === null) {
        return null;
      }
      if (typeof raw !== "string") {
        return null;
      }
      const clean = sanitizeText(raw).slice(0, MAX_TEXT);
      return clean === "" ? null : clean;
    };

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

    const fallbackTheme = DEFAULT_THEME[site.key] ?? DEFAULT_THEME.addison!;
    const themeInput = (body.theme ?? {}) as Record<string, unknown>;

    for (const key of ["background", "foreground", "accent"] as const) {
      const value = themeInput[key];
      // undefined means the field was omitted, which is valid — only an
      // explicitly supplied bad value is an error.
      if (value !== undefined && value !== null && !isHexColor(value)) {
        return res
          .status(400)
          .json({ error: `${key} must be a hex color like #1a1a1a` });
      }
    }
    for (const key of ["sansFont", "serifFont"] as const) {
      const value = themeInput[key];
      if (value !== undefined && value !== null && !findFont(value as string)) {
        return res
          .status(400)
          .json({ error: `Unknown font: ${String(value)}` });
      }
    }

    const theme = {
      accent: isHexColor(themeInput.accent)
        ? themeInput.accent
        : fallbackTheme.accent,
      background: isHexColor(themeInput.background)
        ? themeInput.background
        : fallbackTheme.background,
      foreground: isHexColor(themeInput.foreground)
        ? themeInput.foreground
        : fallbackTheme.foreground,
      sansFont:
        findFont(themeInput.sansFont as string)?.id ?? fallbackTheme.sansFont,
      serifFont:
        findFont(themeInput.serifFont as string)?.id ?? fallbackTheme.serifFont,
    };

    try {
      const sql = getSql();
      await sql`
        INSERT INTO site_settings (
          site_key, name, short_name, hero_title, owner_name, tagline,
          instagram_url, instagram_handle, theme, updated_at, updated_by
        ) VALUES (
          ${site.key}, ${str("name")}, ${str("shortName")}, ${str("heroTitle")},
          ${str("ownerName")}, ${str("tagline")}, ${instagramUrl}, ${str("instagramHandle")},
          ${JSON.stringify(theme)}::jsonb, now(), ${user.userId}
        )
        ON CONFLICT (site_key) DO UPDATE SET
          name = EXCLUDED.name,
          short_name = EXCLUDED.short_name,
          hero_title = EXCLUDED.hero_title,
          owner_name = EXCLUDED.owner_name,
          tagline = EXCLUDED.tagline,
          instagram_url = EXCLUDED.instagram_url,
          instagram_handle = EXCLUDED.instagram_handle,
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
      console.error(e);
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("site_settings")) {
        return res.status(503).json({
          error:
            "Database schema is out of date. Run pnpm db:migrate against this deployment.",
        });
      }
      return res.status(500).json({ error: "Could not save settings" });
    }
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
