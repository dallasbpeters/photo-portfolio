import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq, sql } from "drizzle-orm";
import { getBearerUser } from "../_lib/auth.js";
import { handleCors } from "../_lib/cors.js";
import { loadModelRows, modelSelection } from "../_lib/modelStore.js";
import { readModelFields, rowToModelDto } from "../_lib/models.js";
import { getDb, schema } from "../_lib/orm.js";
import { parseJsonBody } from "../_lib/parseBody.js";

async function handleGet(
  user: ReturnType<typeof getBearerUser>,
  all: boolean,
  res: VercelResponse
) {
  if (all && !user) {
    // The management panel. Admin-only, like the boards it sits beside.
    return res.status(401).json({ error: "Unauthorized" });
  }
  const rows = await loadModelRows(!all);
  return res.status(200).json(rows.map((row) => rowToModelDto(row)));
}

async function handlePost(
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

  const db = getDb();
  const exists = await db
    .select({ id: schema.models.id })
    .from(schema.models)
    .where(eq(schema.models.id, patch.id))
    .limit(1);
  if (exists.length > 0) {
    return res
      .status(409)
      .json({ error: "A model with that id already exists" });
  }

  // New rows go at the end unless told otherwise, so a freshly added model is
  // visible without a second step. COALESCE, not a JavaScript fallback: the
  // first model ever added has no MAX to read and would otherwise land on NaN.
  const [last] = await db
    .select({ top: sql<number>`COALESCE(MAX(sort_order), -1)` })
    .from(schema.models);
  const sortOrder = patch.sortOrder ?? last.top + 1;

  const lora = patch.lora ?? null;
  const [row] = await db
    .insert(schema.models)
    .values({
      enabled: patch.enabled,
      id: patch.id,
      imageParam: patch.imageParam,
      input: patch.input,
      label: patch.label,
      loraEndpoint: lora?.endpoint ?? null,
      loraImageEndpoint: lora?.imageEndpoint ?? null,
      loraPath: lora?.path ?? null,
      loraScale: lora?.scale ?? null,
      loraTrigger: lora?.trigger ?? null,
      output: patch.output,
      sortOrder,
      vector: patch.vector,
    })
    .returning(modelSelection);

  return res.status(201).json(rowToModelDto(row));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  const user = getBearerUser(req.headers.authorization);

  try {
    if (req.method === "GET") {
      // The picker reads the enabled list without auth (the ids are public, as
      // the static list used to be); `all=true` is the admin's management view.
      const all = req.query.all === "true";
      return await handleGet(user, all, res);
    }
    if (req.method === "POST") {
      return await handlePost(user, req, res);
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load models" });
  }
}
