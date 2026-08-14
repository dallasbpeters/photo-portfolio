import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  MAX_ELEMENT_DESCRIPTION,
  MAX_ELEMENT_IMAGES,
  MAX_ELEMENT_NAME,
} from "../../config/elements.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { type ElementRow, rowToElementDto } from "../_lib/elements.js";
import { parsePublicHttpUrl, sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";

type Sql = ReturnType<typeof getSql>;

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
  sql: Sql,
  id: string,
  req: VercelRequest,
  res: VercelResponse
) {
  const patch = readPatch(parseJsonBody(req.body));
  if (typeof patch === "string") {
    return res.status(422).json({ error: patch });
  }

  // COALESCE rather than a built statement: every field is sent as either its
  // new value or null-meaning-unchanged, so one query covers all of them
  // without string-building SQL. `description` is the exception — it is
  // nullable *and* clearable — so it carries its own flag.
  const rows = (await sql`
    UPDATE elements
    SET name = COALESCE(${patch.name ?? null}, name),
        description = CASE
          WHEN ${patch.description !== undefined} THEN ${patch.description ?? null}
          ELSE description
        END,
        cover_url = COALESCE(${patch.coverUrl ?? null}, cover_url),
        image_urls = COALESCE(
          ${patch.imageUrls ? JSON.stringify(patch.imageUrls) : null}::jsonb,
          image_urls
        ),
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, name, description, cover_url, image_urls, created_at, updated_at
  `) as ElementRow[];

  if (rows.length === 0) {
    return res.status(404).json({ error: "No such element" });
  }
  return res.status(200).json(rowToElementDto(rows[0]));
}

async function handleDelete(sql: Sql, id: string, res: VercelResponse) {
  // The pictures are deliberately left in blob storage. A node on some board
  // may still be showing one, and an element being deleted is a library
  // decision rather than an instruction to break every board that used it.
  const rows = (await sql`
    DELETE FROM elements WHERE id = ${id} RETURNING id
  `) as { id: string }[];

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

  const sql = getSql();

  try {
    if (req.method === "PATCH") {
      return await handlePatch(sql, id, req, res);
    }
    if (req.method === "DELETE") {
      return await handleDelete(sql, id, res);
    }
    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not save that element" });
  }
}
