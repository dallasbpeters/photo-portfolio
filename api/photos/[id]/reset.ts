import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../../_lib/auth.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import { type PhotoRow, rowToDto } from "../../_lib/photos.js";

/**
 * Restores a photograph to its pre-edit image.
 *
 * The original is only kept after the first edit (rotate, editor save), so a
 * photo that has never been edited returns 400. Restoring clears the original
 * columns — the restored image becomes the new baseline for future edits.
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
      SELECT original_url, original_width, original_height
      FROM photos WHERE id = ${id} LIMIT 1
    `) as {
      original_height: number | null;
      original_url: string | null;
      original_width: number | null;
    }[];
    const [photo] = rows;
    if (!photo) {
      return res.status(404).json({ error: "Photo not found" });
    }
    if (!photo.original_url) {
      return res
        .status(400)
        .json({ error: "This photo has not been edited yet" });
    }

    const updated = (await sql`
      WITH u AS (
        UPDATE photos
        SET url = ${photo.original_url},
            width = ${photo.original_width},
            height = ${photo.original_height},
            original_url = NULL,
            original_width = NULL,
            original_height = NULL
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
    return res.status(500).json({ error: "Could not restore the photo" });
  }
}
