import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import {
  type CollectionItemRow,
  type CollectionRow,
  itemKind,
  MAX_COLLECTION_DESCRIPTION,
  MAX_COLLECTION_ITEMS,
  MAX_COLLECTION_NAME,
  MAX_ITEM_TITLE,
  rowToCollectionDto,
  rowToItemDto,
} from "../_lib/collections.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { parsePublicHttpUrl, sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * One collection: its items, its name, adding to it, and removing from it.
 *
 * Adding is a POST here rather than a route of its own. It is the operation that
 * matters — a board saves one asset at a time — and a nested endpoint for a
 * single insert would be a second file to keep in step with this one's auth,
 * validation and bounds.
 */

type Sql = ReturnType<typeof getSql>;

const idOf = (req: VercelRequest): string => {
  const raw = req.query.id;
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
};

const loadItems = async (sql: Sql, id: string): Promise<CollectionItemRow[]> =>
  (await sql`
    SELECT id, url, kind, title, alt, width, height, sort_order, created_at
    FROM collection_items
    WHERE collection_id = ${id}::uuid
    ORDER BY sort_order, created_at
  `) as CollectionItemRow[];

async function handleGet(sql: Sql, id: string, res: VercelResponse) {
  const rows = (await sql`
    SELECT id, name, description, cover_url, created_at, updated_at
    FROM collections WHERE id = ${id}::uuid
  `) as CollectionRow[];
  const [found] = rows;
  if (!found) {
    return res.status(404).json({ error: "Collection not found" });
  }
  return res
    .status(200)
    .json(rowToCollectionDto(found, await loadItems(sql, id)));
}

/** Renaming, re-describing, or setting which item is the cover. */
async function handlePatch(
  sql: Sql,
  id: string,
  body: Record<string, unknown>,
  res: VercelResponse
) {
  const name =
    typeof body.name === "string"
      ? sanitizeText(body.name).slice(0, MAX_COLLECTION_NAME)
      : null;
  if (body.name !== undefined && !name) {
    return res.status(400).json({ error: "A collection needs a name" });
  }
  const description =
    typeof body.description === "string"
      ? sanitizeText(body.description).slice(0, MAX_COLLECTION_DESCRIPTION)
      : null;
  const coverUrl =
    typeof body.coverUrl === "string"
      ? parsePublicHttpUrl(body.coverUrl)
      : null;

  const rows = (await sql`
    UPDATE collections SET
      name = COALESCE(${name}, name),
      description = CASE WHEN ${body.description === undefined}
        THEN description ELSE ${description} END,
      cover_url = CASE WHEN ${body.coverUrl === undefined}
        THEN cover_url ELSE ${coverUrl} END,
      updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id, name, description, cover_url, created_at, updated_at
  `) as CollectionRow[];
  const [saved] = rows;
  if (!saved) {
    return res.status(404).json({ error: "Collection not found" });
  }
  return res
    .status(200)
    .json(rowToCollectionDto(saved, await loadItems(sql, id)));
}

/** Adds one asset. The url is what identifies it, so a repeat is a no-op. */
async function handlePost(
  sql: Sql,
  id: string,
  body: Record<string, unknown>,
  res: VercelResponse
) {
  // Checked, not taken: this is stored, rendered in a page, and handed to fal as
  // a source image, so a "javascript:" or a file path must not survive.
  const url =
    typeof body.url === "string" ? parsePublicHttpUrl(body.url.trim()) : null;
  if (!url) {
    return res
      .status(400)
      .json({ error: "An asset needs a public http(s) URL" });
  }

  const counted = (await sql`
    SELECT COUNT(*)::int AS n FROM collection_items
    WHERE collection_id = ${id}::uuid
  `) as { n: number }[];
  if ((counted[0]?.n ?? 0) >= MAX_COLLECTION_ITEMS) {
    return res.status(409).json({
      error: `A collection holds ${MAX_COLLECTION_ITEMS} items. Start another one.`,
    });
  }

  const title =
    typeof body.title === "string"
      ? sanitizeText(body.title).slice(0, MAX_ITEM_TITLE) || null
      : null;
  const alt =
    typeof body.alt === "string"
      ? sanitizeText(body.alt).slice(0, MAX_ITEM_TITLE) || null
      : null;
  const width = Number(body.width);
  const height = Number(body.height);

  const rows = (await sql`
    INSERT INTO collection_items (
      collection_id, url, kind, title, alt, width, height, sort_order
    ) VALUES (
      ${id}::uuid, ${url}, ${itemKind(body.kind)}, ${title}, ${alt},
      ${Number.isFinite(width) && width > 0 ? Math.round(width) : null},
      ${Number.isFinite(height) && height > 0 ? Math.round(height) : null},
      ${(counted[0]?.n ?? 0) + 1}
    )
    -- The same asset twice is a duplicate rather than an error: a second "save
    -- to collection" on the same picture should read as already done, not as a
    -- failure. The existing row is returned so the caller still gets an item.
    ON CONFLICT (collection_id, url) DO UPDATE
      SET title = COALESCE(EXCLUDED.title, collection_items.title)
    RETURNING id, url, kind, title, alt, width, height, sort_order, created_at
  `) as CollectionItemRow[];

  await sql`
    UPDATE collections SET updated_at = NOW() WHERE id = ${id}::uuid
  `;
  const [added] = rows;
  if (!added) {
    return res.status(404).json({ error: "Collection not found" });
  }
  return res.status(201).json(rowToItemDto(added));
}

/**
 * Removes one item, or the whole collection.
 *
 * An `itemId` in the body means the item; its absence means the collection, and
 * its items go with it by cascade. The blobs they point at are untouched — they
 * may be in other collections, and on a board.
 */
async function handleDelete(
  sql: Sql,
  id: string,
  body: Record<string, unknown>,
  res: VercelResponse
) {
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (itemId) {
    await sql`
      DELETE FROM collection_items
      WHERE id = ${itemId}::uuid AND collection_id = ${id}::uuid
    `;
    await sql`UPDATE collections SET updated_at = NOW() WHERE id = ${id}::uuid`;
    return res.status(204).end();
  }
  await sql`DELETE FROM collections WHERE id = ${id}::uuid`;
  return res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const id = idOf(req);
  if (!id) {
    return res.status(400).json({ error: "A collection is required" });
  }

  const sql = getSql();
  const body = parseJsonBody(req.body) as Record<string, unknown>;
  try {
    if (req.method === "GET") {
      return await handleGet(sql, id, res);
    }
    if (req.method === "PATCH") {
      return await handlePatch(sql, id, body, res);
    }
    if (req.method === "POST") {
      return await handlePost(sql, id, body, res);
    }
    if (req.method === "DELETE") {
      return await handleDelete(sql, id, body, res);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    const message =
      e instanceof Error ? e.message : "Could not read the collection";
    return res.status(500).json({ error: message });
  }
}
