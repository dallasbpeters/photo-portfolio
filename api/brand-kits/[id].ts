import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MAX_KIT_NAME, sanitizeKitDoc } from "../../config/brandKit.js";
import { getBearerUser } from "../_lib/auth.js";
import {
  loadKit,
  loadKitVersions,
  writeKitVersion,
} from "../_lib/brandKitStore.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * One brand kit: reading it, editing it, deleting it.
 *
 * Editing never rewrites a version. A PATCH carrying a document writes a *new*
 * version and moves the kit's pointer, because "which version was this made
 * against" is the question every other brand feature is built on — see patch
 * 031, and `brand_verdicts.brand_kit_version_id`, which would otherwise be
 * pointing at a document that had changed underneath it.
 *
 * A rename is not a version. The name lives on the kit, not in the document, so
 * renaming leaves the history alone — the palette did not change because
 * somebody fixed a typo in the title.
 */

type Sql = ReturnType<typeof getSql>;
type User = ReturnType<typeof getBearerUser>;

const idOf = (req: VercelRequest): string | null => {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" && id.length > 0 ? id : null;
};

async function handleGet(
  sql: Sql,
  user: User,
  id: string,
  req: VercelRequest,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const kit = await loadKit(sql, id);
  if (!kit) {
    return res.status(404).json({ error: "Brand kit not found" });
  }
  /* History only when asked for. The panel wants it when a kit is open and not
     when it is one card in a list, and every version is a whole document. */
  if (req.query.versions === "1") {
    return res
      .status(200)
      .json({ ...kit, versions: await loadKitVersions(sql, id) });
  }
  return res.status(200).json(kit);
}

async function handlePatch(
  sql: Sql,
  user: User,
  id: string,
  req: VercelRequest,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const existing = await loadKit(sql, id);
  if (!existing) {
    return res.status(404).json({ error: "Brand kit not found" });
  }
  const body = parseJsonBody(req.body) as Record<string, unknown>;

  if (body.name !== undefined) {
    const name = sanitizeText(String(body.name)).slice(0, MAX_KIT_NAME);
    if (!name) {
      return res.status(400).json({ error: "A kit needs a name" });
    }
    await sql`
      UPDATE brand_kits SET name = ${name}, updated_at = NOW() WHERE id = ${id}
    `;
  }

  if (body.doc !== undefined) {
    const written = await writeKitVersion(sql, id, sanitizeKitDoc(body.doc));
    if (!written) {
      return res.status(500).json({ error: "Could not save the kit" });
    }
  }

  return res.status(200).json(await loadKit(sql, id));
}

async function handleDelete(
  sql: Sql,
  user: User,
  id: string,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  /* Versions and verdicts go with it by cascade — see patch 031. Nothing here
     re-implements that, because two places deciding what a delete reaches is
     how one of them ends up wrong. */
  const deleted = (await sql`
    DELETE FROM brand_kits WHERE id = ${id} RETURNING id
  `) as { id: string }[];
  if (deleted.length === 0) {
    return res.status(404).json({ error: "Brand kit not found" });
  }
  return res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  const id = idOf(req);
  if (!id) {
    return res.status(400).json({ error: "A kit id is required" });
  }
  const sql = getSql();
  const user = getBearerUser(req.headers.authorization);
  try {
    if (req.method === "GET") {
      return await handleGet(sql, user, id, req, res);
    }
    if (req.method === "PATCH") {
      return await handlePatch(sql, user, id, req, res);
    }
    if (req.method === "DELETE") {
      return await handleDelete(sql, user, id, res);
    }
    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load the brand kit" });
  }
}
