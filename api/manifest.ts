import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  defaultSiteSettings,
  resolveSiteSettings,
  type SiteSettingsRow,
} from "../config/siteSettings.js";
import { handleCors } from "./_lib/cors.js";
import { getSql } from "./_lib/db.js";
import { getSite } from "./_lib/site.js";

/**
 * Serves the PWA manifest from the database.
 *
 * Unlike the title and favicon — which are baked into index.html at build time
 * and can only be corrected after mount — the manifest is fetched by the browser
 * as its own request, so serving it dynamically has no flash at all.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const site = getSite();

  let settings = defaultSiteSettings(site);
  try {
    const sql = getSql();
    const rows =
      await sql`SELECT * FROM site_settings WHERE site_key = ${site.key} LIMIT 1`;
    settings = resolveSiteSettings(
      site,
      (rows[0] as SiteSettingsRow | undefined) ?? null
    );
  } catch (e) {
    // An install prompt is not worth a 500 — fall back to the compiled defaults.
    console.error(e);
  }

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, stale-while-revalidate=86400"
  );

  return res.status(200).send(
    JSON.stringify(
      {
        background_color: settings.theme.background,
        description: `${settings.tagline} — ${settings.ownerName}.`,
        dir: "auto",
        display: "standalone",
        icons: [
          // Chrome requires a 192px icon before it will offer installation.
          {
            purpose: "any",
            sizes: "192x192",
            src: `/sites/${site.key}/icon192.png`,
            type: "image/png",
          },
          {
            purpose: "maskable",
            sizes: "512x512",
            src: `/sites/${site.key}/icon512_maskable.png`,
            type: "image/png",
          },
          {
            purpose: "any",
            sizes: "512x512",
            src: `/sites/${site.key}/icon512_rounded.png`,
            type: "image/png",
          },
        ],
        id: `https://${site.domain}`,
        lang: "en-US",
        name: settings.name,
        orientation: "any",
        scope: "/",
        short_name: settings.shortName,
        shortcuts: [
          {
            description: "Public gallery",
            icons: [
              {
                sizes: "512x512",
                src: `/sites/${site.key}/icon512_rounded.png`,
                type: "image/png",
              },
            ],
            name: "Portfolio",
            short_name: "Home",
            url: "/",
          },
        ],
        start_url: "/",
        theme_color: settings.theme.background,
      },
      null,
      2
    )
  );
}
