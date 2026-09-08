import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq, like, or, sql } from "drizzle-orm";
import { getBearerUser } from "../_lib/auth.js";
import {
  type CategoryRow,
  categoryRowToDto,
  slugifyLabel,
} from "../_lib/categories.js";
import { handleCors } from "../_lib/cors.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";

type Db = ReturnType<typeof getDb>;

const MAX_SLUG_ATTEMPTS = 50;

/**
 * The columns every category response is built from.
 *
 * `photo_count` stays a correlated subquery rather than becoming a join and a
 * GROUP BY: a category with no photographs has to come back with a count of
 * zero, and an inner join would drop it from the list entirely.
 *
 * The table and column names inside it are written out rather than
 * interpolated, and that is not a shortcut. Drizzle renders an interpolated
 * column *unqualified* inside a raw fragment, so the obvious
 * `${schema.photos.categoryId} = ${schema.categories.id}` compiles to
 * `"category_id" = "id"` — both of which resolve against `photos` inside the
 * subquery, comparing a category id to a photo id. That is never true, so
 * every count came back zero while the query itself succeeded. Nothing here
 * is user input, so the literal carries no injection risk.
 */
const categorySelection = {
  created_at: schema.categories.createdAt,
  id: schema.categories.id,
  label: schema.categories.label,
  photo_count: sql<number>`(
    SELECT COUNT(*)::int FROM photos p WHERE p.category_id = categories.id
  )`,
  slug: schema.categories.slug,
  sort_order: schema.categories.sortOrder,
};

const listCategories = async (db: Db): Promise<CategoryRow[]> =>
  await db
    .select(categorySelection)
    .from(schema.categories)
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.label));

/**
 * Pulls every slug already derived from this base in one query, then picks the
 * first free candidate in memory; probing them one at a time cost a round trip
 * per attempt. `baseSlug` comes from slugifyLabel, so it is [a-z0-9-] only and
 * carries no LIKE wildcards.
 */
const findFreeSlug = async (db: Db, baseSlug: string) => {
  const taken = await db
    .select({ slug: schema.categories.slug })
    .from(schema.categories)
    .where(
      or(
        eq(schema.categories.slug, baseSlug),
        like(schema.categories.slug, `${baseSlug}-%`)
      )
    );
  const used = new Set(taken.map((r) => r.slug));
  const candidates = Array.from({ length: MAX_SLUG_ATTEMPTS }, (_, attempt) =>
    attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
  );
  return candidates.find((slug) => !used.has(slug)) ?? null;
};

const createCategory = async (
  db: Db,
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

  const slug = await findFreeSlug(db, slugifyLabel(slugRaw || label));
  if (!slug) {
    return res.status(409).json({ error: "Could not allocate unique slug" });
  }

  const [row] = await db
    .insert(schema.categories)
    .values({ label, slug, sortOrder })
    .returning({ id: schema.categories.id });
  if (!row) {
    return res.status(500).json({ error: "Create failed" });
  }

  // Read back rather than answering from what was inserted: the response
  // carries a photo count, and the row just written has no way to know it.
  const [out] = await db
    .select(categorySelection)
    .from(schema.categories)
    .where(eq(schema.categories.id, row.id));
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
    const db = getDb();

    if (req.method === "GET") {
      const rows = await listCategories(db);
      return res.status(200).json(rows.map(categoryRowToDto));
    }

    if (req.method === "POST") {
      return await createCategory(db, req, res);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Request failed" });
  }
}
