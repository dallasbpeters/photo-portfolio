import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const id =
    typeof req.query.id === "string" ? req.query.id : req.query.id?.[0];
  if (!id) {
    return res.status(400).json({ error: "Missing category id" });
  }

  try {
    const sql = getSql();
    const usage = (await sql`
      SELECT COUNT(*)::int AS c FROM photos WHERE category_id = ${id}
    `) as { c: number }[];
    const count = usage[0]?.c ?? 0;
    if (count > 0) {
      return res.status(409).json({
        detail: `${count} photo(s) use this category. Reassign them first.`,
        error: "Category is in use",
      });
    }

    const removed = await sql`
      DELETE FROM categories WHERE id = ${id} RETURNING id
    `;

    if (removed.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    return res.status(204).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Delete failed" });
  }
}
