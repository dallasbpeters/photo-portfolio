import type { VercelRequest, VercelResponse } from "@vercel/node";
import sharp from "sharp";
import { getBearerUser } from "../../_lib/auth.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { persistBytes } from "../../_lib/persistGenerated.js";
import { type PhotoRow, rowToDto } from "../../_lib/photos.js";

/**
 * Rotates a photograph 90 degrees clockwise, in place.
 *
 * The image is re-encoded with sharp and uploaded to the same portfolio store,
 * so the thumbnail the library and the site show is the rotated file, not a
 * CSS trick that only lasts until the page reloads.
 *
 * Non-destructive: the first edit keeps a copy of the pre-rotate image (its
 * URL and dimensions) so the change can be undone. Later rotates leave the
 * original alone.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    return res.status(400).json({ error: "A photo id is required" });
  }

  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT url, width, height, original_url, original_width, original_height
      FROM photos WHERE id = ${id} LIMIT 1
    `) as {
      height: number | null;
      original_height: number | null;
      original_url: string | null;
      original_width: number | null;
      url: string;
      width: number | null;
    }[];
    const [photo] = rows;
    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }

    // The pre-edit state, only stored the first time the photo is touched.
    // COALESCE below keeps a stored original untouched on later rotates.
    const originalUrl = photo.original_url ?? photo.url;
    const originalWidth = photo.original_width ?? photo.width;
    const originalHeight = photo.original_height ?? photo.height;

    const fetched = await fetch(photo.url);
    if (!fetched.ok) {
      return res
        .status(502)
        .json({ error: `Could not fetch the photo (${fetched.status})` });
    }
    const bytes = Buffer.from(await fetched.arrayBuffer());

    // Sharp preserves the source format unless told otherwise, so a JPEG stays
    // a JPEG and a PNG stays a PNG.
    const rotated = await sharp(bytes).rotate(90).toBuffer();
    const meta = await sharp(rotated).metadata();
    const contentType =
      fetched.headers.get("content-type")?.split(";")[0]?.trim() ??
      "image/jpeg";
    const url = await persistBytes(rotated, "portfolio", contentType);

    const updated = (await sql`
      WITH u AS (
        UPDATE photos
        SET url = ${url},
            width = ${meta.width ?? null},
            height = ${meta.height ?? null},
            original_url = COALESCE(original_url, ${originalUrl}),
            original_width = COALESCE(original_width, ${originalWidth}),
            original_height = COALESCE(original_height, ${originalHeight})
        WHERE id = ${id}
        RETURNING id, url, title, sort_order, created_at, category_id,
          alt, width, height, lqip, exif, is_published,
          original_url, original_width, original_height
      )
      SELECT u.id, u.url, u.title, u.sort_order, u.created_at,
        u.alt, u.width, u.height, u.lqip, u.exif, u.is_published,
        u.original_url, u.original_width, u.original_height,
        c.id AS category_id, c.slug AS category_slug, c.label AS category_label
      FROM u
      JOIN categories c ON c.id = u.category_id
    `) as PhotoRow[];

    const [row] = updated;
    if (!row) {
      return res.status(404).json({ error: "Photo not found" });
    }
    return res.status(200).json(rowToDto(row));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not rotate the photo" });
  }
}
