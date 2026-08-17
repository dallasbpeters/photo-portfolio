import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import {
  type CollectionRow,
  MAX_COLLECTION_DESCRIPTION,
  MAX_COLLECTION_NAME,
  rowToCollectionDto,
} from "../_lib/collections.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * The collections, and making one.
 *
 * Admin-only throughout. A collection is a working library, like the elements
 * list and unlike the gallery — nothing in it is published by being in it, so
 * there is no anonymous read to serve.
 */

type Sql = ReturnType<typeof getSql>;

async function handleGet(sql: Sql, res: VercelResponse) {
  const rows = (await sql`
    SELECT c.id, c.name, c.description, c.cover_url, c.created_at, c.updated_at,
           COUNT(i.id)::int AS item_count
    FROM collections c
    LEFT JOIN collection_items i ON i.collection_id = c.id
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `) as CollectionRow[];
  // Counted rather than fetched: the list draws a card per collection with a
  // number on it, and pulling every item of every collection to arrive at that
  // number is the whole library on every page load.
  return res.status(200).json(rows.map((row) => rowToCollectionDto(row)));
}

async function handlePost(
  sql: Sql,
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

  const rows = (await sql`
    INSERT INTO collections (name, description, created_by)
    VALUES (${name}, ${description}, ${userId}::uuid)
    RETURNING id, name, description, cover_url, created_at, updated_at
  `) as CollectionRow[];
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

  const sql = getSql();
  try {
    if (req.method === "GET") {
      return await handleGet(sql, res);
    }
    if (req.method === "POST") {
      return await handlePost(
        sql,
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
