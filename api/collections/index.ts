import type { VercelRequest, VercelResponse } from "@vercel/node";
import { count, desc, eq } from "drizzle-orm";
import { getBearerUser } from "../_lib/auth.js";
import {
  collectionSelection,
  MAX_COLLECTION_DESCRIPTION,
  MAX_COLLECTION_NAME,
  rowToCollectionDto,
} from "../_lib/collections.js";
import { handleCors } from "../_lib/cors.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * The collections, and making one.
 *
 * Admin-only throughout. A collection is a working library, like the elements
 * list and unlike the gallery — nothing in it is published by being in it, so
 * there is no anonymous read to serve.
 */

async function handleGet(res: VercelResponse) {
  const rows = await getDb()
    .select({
      ...collectionSelection,
      item_count: count(schema.collectionItems.id),
    })
    .from(schema.collections)
    // LEFT, so a collection with nothing in it still appears with a count of
    // zero. An inner join would drop exactly the empty ones somebody is most
    // likely to be looking for.
    .leftJoin(
      schema.collectionItems,
      eq(schema.collectionItems.collectionId, schema.collections.id)
    )
    .groupBy(schema.collections.id)
    .orderBy(desc(schema.collections.updatedAt));
  // Counted rather than fetched: the list draws a card per collection with a
  // number on it, and pulling every item of every collection to arrive at that
  // number is the whole library on every page load.
  return res.status(200).json(rows.map((row) => rowToCollectionDto(row)));
}

async function handlePost(
  userId: string,
  body: Record<string, unknown>,
  res: VercelResponse
) {
  const name = sanitizeText(
    typeof body.name === "string" ? body.name : ""
  ).slice(0, MAX_COLLECTION_NAME);
  if (!name) {
    return res.status(400).json({ error: "A collection needs a name" });
  }
  const description =
    typeof body.description === "string"
      ? sanitizeText(body.description).slice(0, MAX_COLLECTION_DESCRIPTION) ||
        null
      : null;

  const rows = await getDb()
    .insert(schema.collections)
    .values({ createdBy: userId, description, name })
    .returning(collectionSelection);
  const [created] = rows;
  if (!created) {
    return res.status(500).json({ error: "The collection was not created" });
  }
  return res.status(201).json(rowToCollectionDto(created, []));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  const user = getBearerUser(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      return await handleGet(res);
    }
    if (req.method === "POST") {
      return await handlePost(
        user.userId,
        parseJsonBody(req.body) as Record<string, unknown>,
        res
      );
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not read the collections" });
  }
}
