import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MAX_KIT_NAME, sanitizeKitDoc } from "../../config/brandKit.js";
import { getBearerUser } from "../_lib/auth.js";
import {
  type BrandKitDto,
  loadKits,
  writeKitVersion,
} from "../_lib/brandKitStore.js";
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

  const created = (await sql`
    INSERT INTO brand_kits (name, created_by)
    VALUES (${name}, ${user.userId})
    RETURNING id, name, created_at, updated_at
  `) as { created_at: string; id: string; name: string; updated_at: string }[];
  const [kit] = created;
  if (!kit) {
    return res.status(500).json({ error: "Could not create the kit" });
  }

  /* The first version, when the caller sent one. Sanitised rather than trusted:
     the same call that names the kit may be carrying a whole document. */
  const written =
    body.doc === undefined
      ? null
      : await writeKitVersion(sql, kit.id, sanitizeKitDoc(body.doc));

  const dto: BrandKitDto = {
    createdAt: kit.created_at,
    doc: sanitizeKitDoc(body.doc),
    id: kit.id,
    name: kit.name,
    updatedAt: kit.updated_at,
    version: written?.version ?? null,
    versionCount: written ? 1 : 0,
    versionId: written?.id ?? null,
  };
  return res.status(201).json(dto);
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
