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
      SELECT url FROM photos WHERE id = ${id} LIMIT 1
    `) as { url: string }[];
    const [photo] = rows;
    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }

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
            height = ${meta.height ?? null}
        WHERE id = ${id}
        RETURNING id, url, title, sort_order, created_at, category_id,
          alt, width, height, lqip, exif, is_published
      )
      SELECT u.id, u.url, u.title, u.sort_order, u.created_at,
        u.alt, u.width, u.height, u.lqip, u.exif, u.is_published,
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
