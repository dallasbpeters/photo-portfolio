import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSql } from './_lib/db.js';
import { getSite } from './_lib/site.js';
import { PHOTO_COLUMNS, rowToDto, type PhotoRow } from './_lib/photos.js';
import {
  defaultSiteSettings,
  resolveSiteSettings,
  type SiteSettingsRow,
} from '../config/siteSettings.js';

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
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/** The built index.html, fetched once per warm function instance. */
let shellCache: { html: string; at: number } | null = null;
const SHELL_TTL_MS = 5 * 60 * 1000;

const loadShell = async (origin: string): Promise<string> => {
  if (shellCache && Date.now() - shellCache.at < SHELL_TTL_MS) return shellCache.html;
  // index.html is a static asset and is not itself rewritten here, so this
  // cannot loop back into this function.
  const res = await fetch(`${origin}/index.html`);
  if (!res.ok) throw new Error(`Could not load shell (${res.status})`);
  const html = await res.text();
  shellCache = { html, at: Date.now() };
  return html;
};

type Meta = {
  title: string;
  description: string;
  image?: string;
  url: string;
  /** JSON-LD, already stringified. */
  jsonLd?: string;
};

const buildTags = (meta: Meta): string => {
  const tags = [
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="${meta.image ? 'article' : 'website'}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ];
  if (meta.image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(meta.image)}" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`);
  }
  if (meta.jsonLd) {
    // Escaping the closing tag prevents the payload terminating the script early.
    tags.push(
      `<script type="application/ld+json">${meta.jsonLd.replace(/</g, '\\u003c')}</script>`,
    );
  }
  return tags.join('\n    ');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const site = getSite();
  const origin = `https://${req.headers.host ?? site.domain}`;
  const path = typeof req.query.path === 'string' ? req.query.path : '/';

  let settings = defaultSiteSettings(site);
  let meta: Meta = {
    title: settings.name,
    description: `${settings.tagline} — ${settings.ownerName}.`,
    url: `${origin}${path}`,
  };

  try {
    const sql = getSql();

    const settingsRows = await sql`SELECT * FROM site_settings WHERE site_key = ${site.key} LIMIT 1`;
    settings = resolveSiteSettings(site, (settingsRows[0] as SiteSettingsRow | undefined) ?? null);
    meta.title = settings.name;
    meta.description = `${settings.tagline} — ${settings.ownerName}.`;

    const photoMatch = /^\/photo\/([0-9a-fA-F-]{36})$/.exec(path);

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
          title: `${photo.title} — ${settings.name}`,
          description: photo.alt || `${photo.title}, ${photo.categoryLabel} by ${settings.ownerName}.`,
          // The photograph is the card. Sized for the 1.91:1 slot most
          // platforms crop to, and routed through the optimizer.
          image: `${origin}/_vercel/image?url=${encodeURIComponent(photo.url)}&w=1200&q=85`,
          url: `${origin}/photo/${photo.id}`,
          jsonLd: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ImageObject',
            name: photo.title,
            description: photo.alt,
            contentUrl: photo.url,
            url: `${origin}/photo/${photo.id}`,
            datePublished: photo.createdAt,
            ...(photo.width && photo.height ? { width: photo.width, height: photo.height } : {}),
            creator: {
              '@type': 'Person',
              name: settings.ownerName,
              url: origin,
              ...(settings.instagramUrl ? { sameAs: [settings.instagramUrl] } : {}),
            },
          }),
        };
      }
    } else if (path === '/' || path === '') {
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
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: settings.ownerName,
        url: origin,
        description: settings.tagline,
        ...(settings.instagramUrl ? { sameAs: [settings.instagramUrl] } : {}),
      });
    } else {
      const slug = path.replace(/^\/+|\/+$/g, '');
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
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
      .replace('</head>', `    ${buildTags(meta)}\n  </head>`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return res.status(200).send(html);
  } catch (e) {
    console.error(e);
    // Better to redirect a crawler to the real app than to serve it an error.
    res.setHeader('Location', path);
    return res.status(302).end();
  }
}
