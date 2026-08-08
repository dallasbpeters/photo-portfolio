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

type Sql = ReturnType<typeof getSql>;

const MAX_SLUG_ATTEMPTS = 50;

const listCategories = async (sql: Sql) =>
  (await sql`
    SELECT c.id, c.slug, c.label, c.sort_order, c.created_at,
      (SELECT COUNT(*)::int FROM photos p WHERE p.category_id = c.id) AS photo_count
    FROM categories c
    ORDER BY c.sort_order ASC, c.label ASC
  `) as CategoryRow[];

/**
 * Pulls every slug already derived from this base in one query, then picks the
 * first free candidate in memory; probing them one at a time cost a round trip
 * per attempt. `baseSlug` comes from slugifyLabel, so it is [a-z0-9-] only and
 * carries no LIKE wildcards.
 */
const findFreeSlug = async (sql: Sql, baseSlug: string) => {
  const taken = (await sql`
    SELECT slug FROM categories
    WHERE slug = ${baseSlug} OR slug LIKE ${`${baseSlug}-%`}
  `) as { slug: string }[];
  const used = new Set(taken.map((r) => r.slug));
  const candidates = Array.from({ length: MAX_SLUG_ATTEMPTS }, (_, attempt) =>
    attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
  );
  return candidates.find((slug) => !used.has(slug)) ?? null;
};

const createCategory = async (
  sql: Sql,
  req: VercelRequest,
  res: VercelResponse
) => {
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

  const slug = await findFreeSlug(sql, slugifyLabel(slugRaw || label));
  if (!slug) {
    return res.status(409).json({ error: "Could not allocate unique slug" });
  }

  const [row] = (await sql`
    INSERT INTO categories (slug, label, sort_order)
    VALUES (${slug}, ${label}, ${sortOrder})
    RETURNING id, slug, label, sort_order, created_at
  `) as CategoryRow[];
  if (!row) {
    return res.status(500).json({ error: "Create failed" });
  }

  const [out] = (await sql`
    SELECT c.id, c.slug, c.label, c.sort_order, c.created_at,
      (SELECT COUNT(*)::int FROM photos p WHERE p.category_id = c.id) AS photo_count
    FROM categories c
    WHERE c.id = ${row.id}
  `) as CategoryRow[];
  if (!out) {
    return res.status(500).json({ error: "Create failed" });
  }
  return res.status(201).json(categoryRowToDto(out));
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  try {
    const sql = getSql();

    if (req.method === "GET") {
      const rows = await listCategories(sql);
      return res.status(200).json(rows.map(categoryRowToDto));
    }

    if (req.method === "POST") {
      return await createCategory(sql, req, res);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Request failed" });
  }
}
