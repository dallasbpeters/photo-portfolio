import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { PROTECTED_MODEL_ID } from "../../config/models.js";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { modelSelection } from "../_lib/modelStore.js";
import { readModelFields, rowToModelDto } from "../_lib/models.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";

async function handlePatch(
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

  /*
   * Only the columns that were actually sent.
   *
   * The raw form had to write every column on every save, using COALESCE to
   * mean "leave it alone" — and COALESCE cannot express "set this to NULL",
   * which is why clearing a LoRA needed five CASE expressions and a separate
   * flag. Building the SET clause from the keys present says the same thing
   * without the workaround: an absent key is not written, and an explicit null
   * is.
   */
  const { lora } = patch;
  const changes: PgUpdateSetSource<typeof schema.models> = {
    // In the database, not in Node: a function's clock is not the one every
    // other row's timestamp was written against.
    updatedAt: sql`NOW()`,
  };
  if (patch.label !== undefined) {
    changes.label = patch.label;
  }
  if (patch.input !== undefined) {
    changes.input = patch.input;
  }
  if (patch.output !== undefined) {
    changes.output = patch.output;
  }
  if (patch.imageParam !== undefined) {
    changes.imageParam = patch.imageParam;
  }
  if (patch.vector !== undefined) {
    changes.vector = patch.vector;
  }
  if (patch.enabled !== undefined) {
    changes.enabled = patch.enabled;
  }
  if (patch.sortOrder !== undefined) {
    changes.sortOrder = patch.sortOrder;
  }
  // Absent leaves the weights alone; null clears them. Both are meaningful,
  // and this is the distinction the CASE expressions existed to preserve.
  if (lora !== undefined) {
    changes.loraEndpoint = lora?.endpoint ?? null;
    changes.loraImageEndpoint = lora?.imageEndpoint ?? null;
    changes.loraPath = lora?.path ?? null;
    changes.loraScale = lora?.scale ?? null;
    changes.loraTrigger = lora?.trigger ?? null;
  }

  const rows = await getDb()
    .update(schema.models)
    .set(changes)
    .where(eq(schema.models.id, id))
    .returning(modelSelection);

  if (rows.length === 0) {
    return res.status(404).json({ error: "No such model" });
  }
  return res.status(200).json(rowToModelDto(rows[0]));
}

async function handleDelete(id: string, res: VercelResponse) {
  if (id === PROTECTED_MODEL_ID) {
    return res.status(422).json({
      error: `"${PROTECTED_MODEL_ID}" is the default and cannot be deleted.`,
    });
  }
  const rows = await getDb()
    .delete(schema.models)
    .where(eq(schema.models.id, id))
    .returning({ id: schema.models.id });

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
    return res.status(500).json({ error: "Could not save that model" });
  }
}
