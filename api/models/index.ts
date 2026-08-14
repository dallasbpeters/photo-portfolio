import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import {
  loadModelRows,
  type ModelRow,
  readModelFields,
  rowToModelDto,
} from "../_lib/models.js";
import { parseJsonBody } from "../_lib/parseBody.js";

type Sql = ReturnType<typeof getSql>;

async function handleGet(
  sql: Sql,
  user: ReturnType<typeof getBearerUser>,
  all: boolean,
  res: VercelResponse
) {
  if (all && !user) {
    // The management panel. Admin-only, like the boards it sits beside.
    return res.status(401).json({ error: "Unauthorized" });
  }
  const rows = await loadModelRows(sql, !all);
  return res.status(200).json(rows.map((row) => rowToModelDto(row)));
}

async function handlePost(
  sql: Sql,
  user: ReturnType<typeof getBearerUser>,
  req: VercelRequest,
  res: VercelResponse
) {
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const patch = readModelFields(parseJsonBody(req.body), true);
  if (typeof patch === "string") {
    return res.status(422).json({ error: patch });
  }

  const exists = (await sql`
    SELECT 1 FROM models WHERE id = ${patch.id}
  `) as { "?column?": number }[];
  if (exists.length > 0) {
    return res
      .status(409)
      .json({ error: "A model with that id already exists" });
  }

  // New rows go at the end unless told otherwise, so a freshly added model is
  // visible without a second step.
  const last = (await sql`
    SELECT COALESCE(MAX(sort_order), -1) AS top FROM models
  `) as { top: number }[];
  const sortOrder = patch.sortOrder ?? last[0].top + 1;

  const lora = patch.lora ?? null;
  const rows = (await sql`
    INSERT INTO models (
      id, label, input, image_param, vector,
      lora_endpoint, lora_image_endpoint, lora_path, lora_scale, lora_trigger,
      enabled, sort_order
    )
    VALUES (
      ${patch.id},
      ${patch.label},
      ${patch.input},
      ${patch.imageParam},
      ${patch.vector},
      ${lora?.endpoint ?? null},
      ${lora?.imageEndpoint ?? null},
      ${lora?.path ?? null},
      ${lora?.scale ?? null},
      ${lora?.trigger ?? null},
      ${patch.enabled},
      ${sortOrder}
    )
    RETURNING created_at, enabled, id, image_param, input, label,
      lora_endpoint, lora_image_endpoint, lora_path, lora_scale, lora_trigger,
      sort_order, updated_at, vector
  `) as ModelRow[];

  return res.status(201).json(rowToModelDto(rows[0]));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const sql = getSql();
  const user = getBearerUser(req.headers.authorization);

  try {
    if (req.method === "GET") {
      // The picker reads the enabled list without auth (the ids are public, as
      // the static list used to be); `all=true` is the admin's management view.
      const all = req.query.all === "true";
      return await handleGet(sql, user, all, res);
    }
    if (req.method === "POST") {
      return await handlePost(sql, user, req, res);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load models" });
  }
}
