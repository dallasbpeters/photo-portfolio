import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, asc, count, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getBearerUser } from "../_lib/auth.js";
import {
  type CollectionItemRow,
  collectionItemSelection,
  collectionSelection,
  itemKind,
  MAX_COLLECTION_DESCRIPTION,
  MAX_COLLECTION_ITEMS,
  MAX_COLLECTION_NAME,
  MAX_ITEM_TITLE,
  rowToCollectionDto,
  rowToItemDto,
} from "../_lib/collections.js";
import { handleCors } from "../_lib/cors.js";
import { parsePublicHttpUrl, sanitizeText } from "../_lib/httpUrl.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * One collection: its items, its name, adding to it, and removing from it.
 *
 * Adding is a POST here rather than a route of its own. It is the operation that
 * matters — a board saves one asset at a time — and a nested endpoint for a
 * single insert would be a second file to keep in step with this one's auth,
 * validation and bounds.
 */

const idOf = (req: VercelRequest): string => {
  const raw = req.query.id;
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
};

const loadItems = async (id: string): Promise<CollectionItemRow[]> =>
  await getDb()
    .select(collectionItemSelection)
    .from(schema.collectionItems)
    .where(eq(schema.collectionItems.collectionId, id))
    .orderBy(
      asc(schema.collectionItems.sortOrder),
      asc(schema.collectionItems.createdAt)
    );

async function handleGet(id: string, res: VercelResponse) {
  const rows = await getDb()
    .select(collectionSelection)
    .from(schema.collections)
    .where(eq(schema.collections.id, id))
    .limit(1);
  const [found] = rows;
  if (!found) {
    return res.status(404).json({ error: "Collection not found" });
  }
  return res.status(200).json(rowToCollectionDto(found, await loadItems(id)));
}

/** Renaming, re-describing, or setting which item is the cover. */
async function handlePatch(
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

  /*
   * Only what was sent.
   *
   * The raw form needed COALESCE for the name and a CASE each for the two
   * nullable fields, because COALESCE cannot mean "set this to NULL" — which
   * is exactly what clearing a description or a cover is. Keys present say the
   * same thing with no special cases.
   */
  const changes: PgUpdateSetSource<typeof schema.collections> = {
    updatedAt: sql`NOW()`,
  };
  if (name !== null) {
    changes.name = name;
  }
  if (body.description !== undefined) {
    changes.description = description;
  }
  if (body.coverUrl !== undefined) {
    changes.coverUrl = coverUrl;
  }

  const rows = await getDb()
    .update(schema.collections)
    .set(changes)
    .where(eq(schema.collections.id, id))
    .returning(collectionSelection);
  const [saved] = rows;
  if (!saved) {
    return res.status(404).json({ error: "Collection not found" });
  }
  return res.status(200).json(rowToCollectionDto(saved, await loadItems(id)));
}

/** Adds one asset. The url is what identifies it, so a repeat is a no-op. */
async function handlePost(
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

  const counted = await getDb()
    .select({ n: count() })
    .from(schema.collectionItems)
    .where(eq(schema.collectionItems.collectionId, id));
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

  const db = getDb();
  const rows = await db
    .insert(schema.collectionItems)
    .values({
      alt,
      collectionId: id,
      height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
      kind: itemKind(body.kind),
      sortOrder: (counted[0]?.n ?? 0) + 1,
      title,
      url,
      width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
    })
    // The same asset twice is a duplicate rather than an error: a second "save
    // to collection" on the same picture should read as already done, not as a
    // failure. The existing row comes back so the caller still gets an item,
    // and its title is only overwritten by a new one — COALESCE, so a repeat
    // with no title does not blank the title it already had.
    .onConflictDoUpdate({
      set: {
        title: sql`COALESCE(excluded.title, ${schema.collectionItems.title})`,
      },
      target: [schema.collectionItems.collectionId, schema.collectionItems.url],
    })
    .returning(collectionItemSelection);

  await db
    .update(schema.collections)
    .set({ updatedAt: sql`NOW()` })
    .where(eq(schema.collections.id, id));
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
  id: string,
  body: Record<string, unknown>,
  res: VercelResponse
) {
  const db = getDb();
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (itemId) {
    // Both ids, so an item id from another collection cannot delete a row
    // here — the collection is the scope, not just a hint.
    await db
      .delete(schema.collectionItems)
      .where(
        and(
          eq(schema.collectionItems.id, itemId),
          eq(schema.collectionItems.collectionId, id)
        )
      );
    await db
      .update(schema.collections)
      .set({ updatedAt: sql`NOW()` })
      .where(eq(schema.collections.id, id));
    return res.status(204).end();
  }
  await db.delete(schema.collections).where(eq(schema.collections.id, id));
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

  const body = parseJsonBody(req.body) as Record<string, unknown>;
  try {
    if (req.method === "GET") {
      return await handleGet(id, res);
    }
    if (req.method === "PATCH") {
      return await handlePatch(id, body, res);
    }
    if (req.method === "POST") {
      return await handlePost(id, body, res);
    }
    if (req.method === "DELETE") {
      return await handleDelete(id, body, res);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    const message =
      e instanceof Error ? e.message : "Could not read the collection";
    return res.status(500).json({ error: message });
  }
}
