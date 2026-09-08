import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "./_lib/orm.js";
import { getSite } from "./_lib/site.js";

/**
 * Sitemap built from live content: the gallery, every published page, and every
 * photograph's own address.
 *
 * Generated rather than static because photos and pages change without a
 * deploy, and a sitemap that lags the content is worse than none.
 */
export default async function handler(
  _req: VercelRequest,
  res: VercelResponse
) {
  const site = getSite();
  const origin = `https://${site.domain}`;

  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: origin, priority: "1.0" },
  ];

  try {
    const db = getDb();

    const pages = await db
      .select({ slug: schema.pages.slug, updated_at: schema.pages.updatedAt })
      .from(schema.pages)
      .where(eq(schema.pages.status, "published"))
      .orderBy(asc(schema.pages.sortOrder));

    for (const page of pages) {
      urls.push({
        lastmod: new Date(page.updated_at).toISOString().slice(0, 10),
        loc: `${origin}/${page.slug}`,
        priority: "0.8",
      });
    }

    const photos = await db
      .select({ created_at: schema.photos.createdAt, id: schema.photos.id })
      .from(schema.photos)
      .orderBy(asc(schema.photos.sortOrder), asc(schema.photos.createdAt));

    for (const photo of photos) {
      urls.push({
        lastmod: new Date(photo.created_at).toISOString().slice(0, 10),
        loc: `${origin}/photo/${photo.id}`,
        priority: "0.6",
      });
    }
  } catch (e) {
    // Still return a valid sitemap containing at least the gallery.
    console.error(e);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=3600, stale-while-revalidate=86400"
  );
  return res.status(200).send(xml);
}
