import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import {
  type CategoryRow,
  categoryRowToDto,
  slugifyLabel,
} from "../_lib/categories.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parseJsonBody } from "../_lib/parseBody.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  try {
    const sql = getSql();

    if (req.method === "GET") {
      const rows = (await sql`
        SELECT c.id, c.slug, c.label, c.sort_order, c.created_at,
          (SELECT COUNT(*)::int FROM photos p WHERE p.category_id = c.id) AS photo_count
        FROM categories c
        ORDER BY c.sort_order ASC, c.label ASC
      `) as CategoryRow[];
      return res.status(200).json(rows.map(categoryRowToDto));
    }

    if (req.method === "POST") {
      const user = getBearerUser(req.headers.authorization);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = parseJsonBody(req.body);
      const label = typeof body.label === "string" ? body.label.trim() : "";
      const slugRaw = typeof body.slug === "string" ? body.slug.trim() : "";
      const sortOrder =
        typeof body.sortOrder === "number"
          ? body.sortOrder
          : Number(body.sortOrder);

      if (!label) {
        return res.status(400).json({ error: "Label is required" });
      }
      if (!Number.isFinite(sortOrder)) {
        return res.status(400).json({ error: "Invalid sortOrder" });
      }

      let baseSlug = slugRaw ? slugifyLabel(slugRaw) : slugifyLabel(label);
      if (!baseSlug) {
        baseSlug = "category";
      }

      for (let attempt = 0; attempt < 50; attempt += 1) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
        const clash =
          await sql`SELECT 1 FROM categories WHERE slug = ${slug} LIMIT 1`;
        if (clash.length > 0) {
          continue;
        }

        const inserted = (await sql`
          INSERT INTO categories (slug, label, sort_order)
          VALUES (${slug}, ${label}, ${sortOrder})
          RETURNING id, slug, label, sort_order, created_at
        `) as CategoryRow[];
        const row = inserted[0];
        if (!row) {
          return res.status(500).json({ error: "Create failed" });
        }
        const full = (await sql`
          SELECT c.id, c.slug, c.label, c.sort_order, c.created_at,
            (SELECT COUNT(*)::int FROM photos p WHERE p.category_id = c.id) AS photo_count
          FROM categories c
          WHERE c.id = ${row.id}
        `) as CategoryRow[];
        const out = full[0];
        if (!out) {
          return res.status(500).json({ error: "Create failed" });
        }
        return res.status(201).json(categoryRowToDto(out));
      }
      return res.status(409).json({ error: "Could not allocate unique slug" });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Request failed" });
  }
}
