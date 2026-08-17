import type { VercelRequest, VercelResponse } from "@vercel/node";
import { PROTECTED_MODEL_ID } from "../../config/models.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { getSql } from "../_lib/db.js";
import {
  type ModelRow,
  readModelFields,
  rowToModelDto,
} from "../_lib/models.js";
import { parseJsonBody } from "../_lib/parseBody.js";

type Sql = ReturnType<typeof getSql>;

async function handlePatch(
  sql: Sql,
  id: string,
  req: VercelRequest,
  res: VercelResponse
) {
  const patch = readModelFields(parseJsonBody(req.body), false);
  if (typeof patch === "string") {
    return res.status(422).json({ error: patch });
  }

  // The default model's semantics are what the "auto" fallback is built on; a
  // label or an ordering change is fine, an edited shape or a LoRA is not.
  if (
    id === PROTECTED_MODEL_ID &&
    (patch.input !== undefined ||
      patch.imageParam !== undefined ||
      patch.vector !== undefined ||
      (patch.lora !== undefined && patch.lora !== null))
  ) {
    return res.status(422).json({
      error: `"${PROTECTED_MODEL_ID}" is the default; its shape and LoRA are fixed.`,
    });
  }

  const { lora } = patch;
  // Distinguishing "clear the LoRA" from "leave it alone" needs a flag, which
  // is why the lora columns are written with CASE rather than COALESCE.
  const loraProvided = lora !== undefined;
  const loraValue = lora ?? null;

  const rows = (await sql`
    UPDATE models
    SET label = COALESCE(${patch.label ?? null}, label),
        input = COALESCE(${patch.input ?? null}, input),
        output = COALESCE(${patch.output ?? null}, output),
        image_param = COALESCE(${patch.imageParam ?? null}, image_param),
        vector = COALESCE(${patch.vector ?? null}, vector),
        enabled = COALESCE(${patch.enabled ?? null}, enabled),
        sort_order = COALESCE(${patch.sortOrder ?? null}, sort_order),
        lora_path = CASE
          WHEN ${loraProvided} THEN ${loraValue?.path ?? null}
          ELSE lora_path
        END,
        lora_scale = CASE
          WHEN ${loraProvided} THEN ${loraValue?.scale ?? null}
          ELSE lora_scale
        END,
        lora_trigger = CASE
          WHEN ${loraProvided} THEN ${loraValue?.trigger ?? null}
          ELSE lora_trigger
        END,
        lora_endpoint = CASE
          WHEN ${loraProvided} THEN ${loraValue?.endpoint ?? null}
          ELSE lora_endpoint
        END,
        lora_image_endpoint = CASE
          WHEN ${loraProvided} THEN ${loraValue?.imageEndpoint ?? null}
          ELSE lora_image_endpoint
        END,
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING created_at, enabled, id, image_param, input, label, output,
      lora_endpoint, lora_image_endpoint, lora_path, lora_scale, lora_trigger,
      sort_order, updated_at, vector
  `) as ModelRow[];

  if (rows.length === 0) {
    return res.status(404).json({ error: "No such model" });
  }
  return res.status(200).json(rowToModelDto(rows[0]));
}

async function handleDelete(sql: Sql, id: string, res: VercelResponse) {
  if (id === PROTECTED_MODEL_ID) {
    return res.status(422).json({
      error: `"${PROTECTED_MODEL_ID}" is the default and cannot be deleted.`,
    });
  }
  const rows = (await sql`
    DELETE FROM models WHERE id = ${id} RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) {
    return res.status(404).json({ error: "No such model" });
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
    return res.status(400).json({ error: "A model id is required" });
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
    return res.status(500).json({ error: "Could not save that model" });
  }
}
