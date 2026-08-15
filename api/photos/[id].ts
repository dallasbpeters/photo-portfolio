import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { type PhotoRow, parseIncomingExif, rowToDto } from "../_lib/photos.js";

interface ExistingPhoto {
  height: number | null;
  original_height: number | null;
  original_url: string | null;
  original_width: number | null;
  url: string;
  width: number | null;
}

/**
 * Non-destructive edits: swapping the URL keeps the pre-edit image as the
 * original, so an edit can always be undone. A null URL means the caller only
 * renamed or recategorised, and leaves the original columns alone.
 */
const resolveOriginal = (
  existing: ExistingPhoto,
  url: string | null
): {
  originalHeight: number | null;
  originalUrl: string | null;
  originalWidth: number | null;
} => {
  const changingUrl = url !== null && url !== existing.url;
  if (!changingUrl) {
    return { originalHeight: null, originalUrl: null, originalWidth: null };
  }
  return {
    originalHeight: existing.original_height ?? existing.height,
    originalUrl: existing.original_url ?? existing.url,
    originalWidth: existing.original_width ?? existing.width,
  };
};

async function handlePatch(
  req: VercelRequest,
  res: VercelResponse,
  id: string
) {
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseJsonBody(req.body);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const categoryId =
    typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const order =
    typeof body.order === "number" ? body.order : Number(body.order);
  const url =
    typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
  const alt =
    typeof body.alt === "string" ? body.alt.trim().slice(0, 300) : null;

  // Presence of the key, not its truthiness, decides whether EXIF is touched.
  // Callers that only rename a photo omit it and keep whatever was read off the
  // file; the details form sends it every time, and sending null clears it.
  // Same presence test as EXIF below: a caller that says nothing about
  // publishing must not accidentally republish a hidden photograph.
  const isPublished =
    typeof body.isPublished === "boolean" ? body.isPublished : null;

  const isFeatured =
    typeof body.isFeatured === "boolean" ? body.isFeatured : null;

  const hasExif = Object.hasOwn(body, "exif");
  // Null rather than the string "null": the latter casts to a JSON null that
  // sits in the column looking like data, where a cleared field should leave
  // the column genuinely empty.
  const parsedExif = hasExif ? parseIncomingExif(body.exif) : null;
  const exifJson = parsedExif === null ? null : JSON.stringify(parsedExif);

  if (!(title && categoryId)) {
    return res.status(400).json({ error: "Invalid title or categoryId" });
  }
  if (!Number.isFinite(order)) {
    return res.status(400).json({ error: "Invalid order" });
  }

  try {
    const sql = getSql();
    const catOk =
      await sql`SELECT id FROM categories WHERE id = ${categoryId} LIMIT 1`;
    if (catOk.length === 0) {
      return res.status(400).json({ error: "Unknown category" });
    }

    const current = (await sql`
      SELECT url, width, height, original_url, original_width, original_height
      FROM photos WHERE id = ${id} LIMIT 1
    `) as ExistingPhoto[];
    if (current.length === 0) {
      return res.status(404).json({ error: "Photo not found" });
    }
    const { originalHeight, originalUrl, originalWidth } = resolveOriginal(
      current[0],
      url
    );

    // The CTE must RETURNING every column the response needs: a data-modifying CTE's
    // writes are invisible to the rest of the same statement, so re-joining `photos`
    // here would read the pre-update snapshot and echo stale values back to the editor.
    const rows = (await sql`
        WITH u AS (
          UPDATE photos
          SET title = ${title}, category_id = ${categoryId}, sort_order = ${order},
            url = COALESCE(${url}, url),
            alt = COALESCE(${alt}, alt),
            is_published = COALESCE(${isPublished}, is_published),
            is_featured = COALESCE(${isFeatured}, is_featured),
            original_url = COALESCE(original_url, ${originalUrl}),
            original_width = COALESCE(original_width, ${originalWidth}),
            original_height = COALESCE(original_height, ${originalHeight}),
            -- COALESCE would make clearing impossible, since the cleared value
            -- is itself NULL. The flag says whether the caller spoke about
            -- EXIF at all; only then does this column change.
            exif = CASE WHEN ${hasExif} THEN ${exifJson}::jsonb ELSE exif END
          WHERE id = ${id}
          RETURNING id, url, title, sort_order, created_at, category_id,
            alt, width, height, lqip, exif, is_published, is_featured,
            original_url, original_width, original_height
        )
        SELECT u.id, u.url, u.title, u.sort_order, u.created_at,
          u.alt, u.width, u.height, u.lqip, u.exif, u.is_published, u.is_featured,
          u.original_url, u.original_width, u.original_height,
          c.id AS category_id, c.slug AS category_slug, c.label AS category_label
        FROM u
        JOIN categories c ON c.id = u.category_id
      `) as PhotoRow[];

    if (rows.length === 0) {
      return res.status(404).json({ error: "Photo not found" });
    }

    const [row] = rows;
    if (!row) {
      return res.status(500).json({ error: "Update failed" });
    }
    return res.status(200).json(rowToDto(row));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Update failed" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const id =
    typeof req.query.id === "string" ? req.query.id : req.query.id?.[0];
  if (!id) {
    return res.status(400).json({ error: "Missing photo id" });
  }

  if (req.method === "PATCH") {
    return await handlePatch(req, res, id);
  }

  if (req.method === "DELETE") {
    const user = getBearerUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const sql = getSql();
      const deleted = await sql`
        DELETE FROM photos
        WHERE id = ${id}
        RETURNING id
      `;

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Photo not found" });
      }

      return res.status(204).end();
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Delete failed" });
    }
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
