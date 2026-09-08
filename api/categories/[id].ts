import type { VercelRequest, VercelResponse } from "@vercel/node";
import { count, eq } from "drizzle-orm";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getDb, schema } from "../_lib/orm.js";

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
    const db = getDb();
    const usage = await db
      .select({ c: count() })
      .from(schema.photos)
      .where(eq(schema.photos.categoryId, id));
    const inUse = usage[0]?.c ?? 0;
    if (inUse > 0) {
      return res.status(409).json({
        detail: `${inUse} photo(s) use this category. Reassign them first.`,
        error: "Category is in use",
      });
    }

    const removed = await db
      .delete(schema.categories)
      .where(eq(schema.categories.id, id))
      .returning({ id: schema.categories.id });

    if (removed.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    return res.status(204).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Delete failed" });
  }
}
