import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  defaultSiteSettings,
  resolveSiteSettings,
  type SiteSettingsRow,
} from "../config/siteSettings.js";
import { getSql } from "./_lib/db.js";
import { PHOTO_COLUMNS, type PhotoRow, rowToDto } from "./_lib/photos.js";
import { getSite } from "./_lib/site.js";

const PHOTO_PATH = /^\/photo\/([0-9a-fA-F-]{36})$/;
const TITLE_TAG = /<title>[^<]*<\/title>/;

/**
 * Serves index.html with share-card metadata injected, for crawlers only.
 *
 * The app is a client-rendered SPA, so a scraper receives an empty root element
 * and no title, description or preview image — links to the site unfurl as a
 * bare URL, which for a photographer is the difference between work spreading
 * and not.
 *
 * vercel.json routes here only when the user agent looks like a crawler, so a
 * real visitor still gets the static file straight from the CDN with no added
 * latency and nothing to hydrate around.
 */

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "'": "&#39;", '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[
        c
      ] as string
  );

/** The built index.html, fetched once per warm function instance. */
let shellCache: { html: string; at: number } | null = null;
const SHELL_TTL_MS = 5 * 60 * 1000;

const loadShell = async (origin: string): Promise<string> => {
  if (shellCache && Date.now() - shellCache.at < SHELL_TTL_MS) {
    return shellCache.html;
  }
  // index.html is a static asset and is not itself rewritten here, so this
  // cannot loop back into this function.
  const res = await fetch(`${origin}/index.html`);
  if (!res.ok) {
    throw new Error(`Could not load shell (${res.status})`);
  }
  const html = await res.text();
  shellCache = { at: Date.now(), html };
  return html;
};

interface Meta {
  description: string;
  image?: string;
  /** JSON-LD, already stringified. */
  jsonLd?: string;
  title: string;
  url: string;
}

const buildTags = (meta: Meta): string => {
  const tags = [
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="${meta.image ? "article" : "website"}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ];
  if (meta.image) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(meta.image)}" />`
    );
    tags.push(
      `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`
    );
  }
  if (meta.jsonLd) {
    // Escaping the closing tag prevents the payload terminating the script early.
    tags.push(
      `<script type="application/ld+json">${meta.jsonLd.replace(/</g, "\\u003c")}</script>`
    );
  }
  return tags.join("\n    ");
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const site = getSite();
  const origin = `https://${req.headers.host ?? site.domain}`;
  const path = typeof req.query.path === "string" ? req.query.path : "/";

  let settings = defaultSiteSettings(site);
  let meta: Meta = {
    description: `${settings.tagline} — ${settings.ownerName}.`,
    title: settings.name,
    url: `${origin}${path}`,
  };

  try {
    const sql = getSql();

    const settingsRows =
      await sql`SELECT * FROM site_settings WHERE site_key = ${site.key} LIMIT 1`;
    settings = resolveSiteSettings(
      site,
      (settingsRows[0] as SiteSettingsRow | undefined) ?? null
    );
    meta.title = settings.name;
    meta.description = `${settings.tagline} — ${settings.ownerName}.`;

    const photoMatch = PHOTO_PATH.exec(path);

    if (photoMatch) {
      const rows = (await sql`
        SELECT ${sql.unsafe(PHOTO_COLUMNS)}
        FROM photos p INNER JOIN categories c ON c.id = p.category_id
        WHERE p.id = ${photoMatch[1]} LIMIT 1
      `) as PhotoRow[];

      const row = rows[0];
      if (row) {
        const photo = rowToDto(row);
        meta = {
          description:
            photo.alt ||
            `${photo.title}, ${photo.categoryLabel} by ${settings.ownerName}.`,
          // The photograph is the card. Sized for the 1.91:1 slot most
          // platforms crop to, and routed through the optimizer.
          image: `${origin}/_vercel/image?url=${encodeURIComponent(photo.url)}&w=1200&q=85`,
          jsonLd: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ImageObject",
            contentUrl: photo.url,
            datePublished: photo.createdAt,
            description: photo.alt,
            name: photo.title,
            url: `${origin}/photo/${photo.id}`,
            ...(photo.width && photo.height
              ? { height: photo.height, width: photo.width }
              : {}),
            creator: {
              "@type": "Person",
              name: settings.ownerName,
              url: origin,
              ...(settings.instagramUrl
                ? { sameAs: [settings.instagramUrl] }
                : {}),
            },
          }),
          title: `${photo.title} — ${settings.name}`,
          url: `${origin}/photo/${photo.id}`,
        };
      }
    } else if (path === "/" || path === "") {
      // The site card uses the newest photograph, so it reflects current work.
      const rows = (await sql`
        SELECT ${sql.unsafe(PHOTO_COLUMNS)}
        FROM photos p INNER JOIN categories c ON c.id = p.category_id
        ORDER BY p.sort_order ASC, p.created_at ASC LIMIT 1
      `) as PhotoRow[];

      const row = rows[0];
      if (row) {
        meta.image = `${origin}/_vercel/image?url=${encodeURIComponent(rowToDto(row).url)}&w=1200&q=85`;
      }
      meta.jsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Person",
        description: settings.tagline,
        name: settings.ownerName,
        url: origin,
        ...(settings.instagramUrl ? { sameAs: [settings.instagramUrl] } : {}),
      });
    } else {
      const slug = path.replace(/^\/+|\/+$/g, "");
      const rows = await sql`
        SELECT title, content FROM pages WHERE slug = ${slug} AND status = 'published' LIMIT 1
      `;
      const page = rows[0] as { title: string } | undefined;
      if (page) {
        meta.title = `${page.title} — ${settings.name}`;
        meta.url = `${origin}/${slug}`;
      }
    }
  } catch (e) {
    // A metadata lookup must never take the page down; fall through to the
    // site-level defaults already in `meta`.
    console.error(e);
  }

  try {
    const shell = await loadShell(origin);
    const html = shell
      .replace(TITLE_TAG, `<title>${escapeHtml(meta.title)}</title>`)
      .replace("</head>", `    ${buildTags(meta)}\n  </head>`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, max-age=300, stale-while-revalidate=3600"
    );
    return res.status(200).send(html);
  } catch (e) {
    console.error(e);
    // Better to redirect a crawler to the real app than to serve it an error.
    res.setHeader("Location", path);
    return res.status(302).end();
  }
}
