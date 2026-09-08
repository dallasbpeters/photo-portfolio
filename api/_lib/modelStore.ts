import { asc, eq } from "drizzle-orm";
import type { FalModelDef } from "../../config/falModels.js";
import { rowToModelDef } from "./models.js";
import { getDb, schema } from "./orm.js";

/**
 * Reading the model list out of the database.
 *
 * Split from models.ts, which holds the validators and the row-to-shape
 * helpers, and which api/_lib/modelShapes.test.ts imports in a browser
 * environment. Reaching the database means importing the client, which
 * imports bootstrapEnv, which imports node:fs — and that cannot be resolved in
 * a browser, so folding these two jobs into one module took the test suite
 * down at import time. The same reason api/_lib/lightroom.ts is split from its
 * config.
 */

/**
 * Every column a model row carries, under the snake_case names `ModelRow` and
 * `rowToModelDef` already expect. Named once because four call sites read it
 * and a column missing from one of them is a field that silently goes
 * undefined rather than an error.
 */
export const modelSelection = {
  created_at: schema.models.createdAt,
  enabled: schema.models.enabled,
  id: schema.models.id,
  image_param: schema.models.imageParam,
  input: schema.models.input,
  label: schema.models.label,
  lora_endpoint: schema.models.loraEndpoint,
  lora_image_endpoint: schema.models.loraImageEndpoint,
  lora_path: schema.models.loraPath,
  lora_scale: schema.models.loraScale,
  lora_trigger: schema.models.loraTrigger,
  output: schema.models.output,
  sort_order: schema.models.sortOrder,
  training_error: schema.models.trainingError,
  training_status: schema.models.trainingStatus,
  updated_at: schema.models.updatedAt,
  vector: schema.models.vector,
};

/** Ordered the way the picker shows them: by position, then by id to break ties. */
const modelOrder = [asc(schema.models.sortOrder), asc(schema.models.id)];

export const loadModelDefs = async (): Promise<readonly FalModelDef[]> => {
  const rows = await getDb()
    .select(modelSelection)
    .from(schema.models)
    .where(eq(schema.models.enabled, true))
    .orderBy(...modelOrder);
  return rows.map(rowToModelDef);
};

/**
 * The full list, hidden models included, for the admin panel.
 *
 * The picker and the run path want only what is live; the panel has to show the
 * models that are switched off, or there would be no way to switch one back on.
 */
export const loadModelRows = async (enabledOnly = false) => {
  const query = getDb().select(modelSelection).from(schema.models);
  return await (enabledOnly
    ? query.where(eq(schema.models.enabled, true)).orderBy(...modelOrder)
    : query.orderBy(...modelOrder));
};
