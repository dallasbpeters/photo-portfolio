import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import {
  MAX_ELEMENT_DESCRIPTION,
  MAX_ELEMENT_IMAGES,
  MAX_ELEMENT_NAME,
} from "../../config/elements.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { elementSelection, rowToElementDto } from "../_lib/elements.js";
import { parsePublicHttpUrl, sanitizeText } from "../_lib/httpUrl.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * The fields a PATCH may set, or a reason it may not.
 *
 * Only what was sent is touched. Renaming an element must not blank its
 * description, and re-ordering its pictures must not silently move the cover —
 * see the schema for why those two are kept apart in the first place.
 */
interface ElementPatch {
  coverUrl?: string;
  description?: string | null;
  imageUrls?: string[];
  name?: string;
}

/**
 * Pictures for an edit, which are ours already.
 *
 * Unlike a create, nothing is fetched here: an edit re-orders, drops, or picks
 * a cover from the pictures the element already holds, and those are URLs this
 * project wrote. They are still checked, because "already ours" is a claim the
 * caller is making rather than one this endpoint can see.
 */
const editedImages = (raw: unknown): string[] | null => {
  if (!Array.isArray(raw)) {
    return null;
  }
  const urls: string[] = [];
  for (const value of raw) {
    const url = typeof value === "string" ? parsePublicHttpUrl(value) : null;
    if (url && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls.slice(0, MAX_ELEMENT_IMAGES);
};

const readPatch = (body: Record<string, unknown>): ElementPatch | string => {
  const patch: ElementPatch = {};

  if (typeof body.name === "string") {
    const name = sanitizeText(body.name).slice(0, MAX_ELEMENT_NAME);
    if (!name) {
      return "An element needs a name";
    }
    patch.name = name;
  }

  if (typeof body.description === "string") {
    const description = body.description
      .trim()
      .slice(0, MAX_ELEMENT_DESCRIPTION);
    patch.description = description || null;
  }

  if (body.imageUrls !== undefined) {
    const images = editedImages(body.imageUrls);
    if (!images?.length) {
      return "An element needs at least one picture";
    }
    patch.imageUrls = images;
  }

  if (typeof body.coverUrl === "string") {
    const cover = parsePublicHttpUrl(body.coverUrl);
    if (!cover) {
      return "That cover is not a public http(s) URL";
    }
    patch.coverUrl = cover;
  }

  return patch;
};

async function handlePatch(
  id: string,
  req: VercelRequest,
  res: VercelResponse
) {
  const patch = readPatch(parseJsonBody(req.body));
  if (typeof patch === "string") {
    return res.status(422).json({ error: patch });
  }

  /*
   * Only the fields that were sent.
   *
   * The raw form wrote every column on every save, with COALESCE standing in
   * for "unchanged" — and COALESCE cannot express "set this to NULL", which is
   * why `description` needed its own CASE and its own boolean. Building the
   * SET clause from the keys present says the same thing without the special
   * case: an absent key is not written, and an explicit null is.
   */
  const changes: PgUpdateSetSource<typeof schema.elements> = {
    // In the database, not in Node, so every row's timestamp comes from one
    // clock.
    updatedAt: sql`NOW()`,
  };
  if (patch.name !== undefined) {
    changes.name = patch.name;
  }
  // Nullable and clearable, which is exactly what the CASE existed for.
  if (patch.description !== undefined) {
    changes.description = patch.description ?? null;
  }
  if (patch.coverUrl !== undefined) {
    changes.coverUrl = patch.coverUrl;
  }
  if (patch.imageUrls !== undefined) {
    changes.imageUrls = patch.imageUrls;
  }

  const rows = await getDb()
    .update(schema.elements)
    .set(changes)
    .where(eq(schema.elements.id, id))
    .returning(elementSelection);

  if (rows.length === 0) {
    return res.status(404).json({ error: "No such element" });
  }
  return res.status(200).json(rowToElementDto(rows[0]));
}

async function handleDelete(id: string, res: VercelResponse) {
  // The pictures are deliberately left in blob storage. A node on some board
  // may still be showing one, and an element being deleted is a library
  // decision rather than an instruction to break every board that used it.
  const rows = await getDb()
    .delete(schema.elements)
    .where(eq(schema.elements.id, id))
    .returning({ id: schema.elements.id });

  if (rows.length === 0) {
    return res.status(404).json({ error: "No such element" });
  }
  return res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    return res.status(400).json({ error: "An element id is required" });
  }

  try {
    if (req.method === "PATCH") {
      return await handlePatch(id, req, res);
    }
    if (req.method === "DELETE") {
      return await handleDelete(id, res);
    }
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not save that element" });
  }
}
