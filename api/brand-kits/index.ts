import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MAX_KIT_NAME, sanitizeKitDoc } from "../../config/brandKit.js";
import { getBearerUser } from "../_lib/auth.js";
import { loadKit, loadKits, writeKitVersion } from "../_lib/brandKitStore.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import { sanitizeText } from "../_lib/httpUrl.js";
import { parseJsonBody } from "../_lib/parseBody.js";

/**
 * The brand kits: what exists, and making a new one.
 *
 * Admin-only in both directions, like the recipe library and the board list. A
 * kit is a governing document rather than anything published — a public index
 * would hand out every brand's palette, typefaces and the wording of its voice.
 *
 * A kit is created *with* its first version rather than empty, when a document
 * is supplied. A kit with no version is a legal row — patch 031 allows it, and
 * `current_version_id` is nullable for exactly that reason — but it is a kit
 * that cannot be wired into anything, so it is not the default outcome of
 * pressing New.
 */

type Sql = ReturnType<typeof getSql>;
type User = ReturnType<typeof getBearerUser>;

async function handleGet(sql: Sql, user: User, res: VercelResponse) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.status(200).json(await loadKits(sql));
}

async function handlePost(
  sql: Sql,
  user: User,
  req: VercelRequest,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const body = parseJsonBody(req.body) as Record<string, unknown>;
  const name = sanitizeText(String(body.name ?? "")).slice(0, MAX_KIT_NAME);
  if (!name) {
    return res.status(400).json({ error: "A kit needs a name" });
  }

  /* A sub-brand names its parent at creation. The one-level rule and the cycle
     check are enforced by the database (patch 032), so a bad parent is a
     rejected insert rather than something this handler has to re-litigate. */
  const parentId =
    typeof body.parentId === "string" && body.parentId ? body.parentId : null;

  let created: { id: string }[];
  try {
    created = (await sql`
      INSERT INTO brand_kits (name, created_by, parent_id)
      VALUES (${name}, ${user.userId}, ${parentId})
      RETURNING id
    `) as { id: string }[];
  } catch (e) {
    /* The trigger raises for a sub-brand of a sub-brand, which is a request
       problem rather than a server one — so it is reported as such. */
    const message = e instanceof Error ? e.message : "Could not create the kit";
    return res.status(400).json({ error: message });
  }

  const [kit] = created;
  if (!kit) {
    return res.status(500).json({ error: "Could not create the kit" });
  }

  /* The first version, when the caller sent one. Sanitised rather than trusted:
     the same call that names the kit may be carrying a whole document. */
  if (body.doc !== undefined) {
    await writeKitVersion(sql, kit.id, sanitizeKitDoc(body.doc));
  }

  /* Read back rather than assembled here: the resolved document and the list of
     inherited parts are the store's answer, and two places computing them is
     how they come to disagree. */
  return res.status(201).json(await loadKit(sql, kit.id));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }
  const sql = getSql();
  const user = getBearerUser(req.headers.authorization);
  try {
    if (req.method === "GET") {
      return await handleGet(sql, user, res);
    }
    if (req.method === "POST") {
      return await handlePost(sql, user, req, res);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load brand kits" });
  }
}
