import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";
import { type PhotoRow, rowToDto } from "../_lib/photos.js";

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

    // The CTE must RETURNING every column the response needs: a data-modifying CTE's
    // writes are invisible to the rest of the same statement, so re-joining `photos`
    // here would read the pre-update snapshot and echo stale values back to the editor.
    const rows = (await sql`
        WITH u AS (
          UPDATE photos
          SET title = ${title}, category_id = ${categoryId}, sort_order = ${order},
            url = COALESCE(${url}, url),
            alt = COALESCE(${alt}, alt)
          WHERE id = ${id}
          RETURNING id, url, title, sort_order, created_at, category_id,
            alt, width, height, lqip, exif
        )
        SELECT u.id, u.url, u.title, u.sort_order, u.created_at,
          u.alt, u.width, u.height, u.lqip, u.exif,
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
