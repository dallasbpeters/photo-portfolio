import {
  MAX_MODEL_ID,
  MAX_MODEL_LABEL,
  MAX_MODEL_LORA_FIELD,
  MAX_MODEL_LORA_SCALE,
  MAX_MODEL_LORA_TRIGGER,
  MODEL_IMAGE_PARAMS,
  MODEL_INPUTS,
  MODEL_OUTPUTS,
  PROTECTED_MODEL_ID,
} from "../../config/models.js";
import type {
  FalLora,
  FalModelDef,
  FalModelInput,
} from "../../config/nodeTypes.js";
import { parsePublicHttpUrl, sanitizeText } from "./httpUrl.js";

type Sql = ReturnType<typeof import("./db.js").getSql>;

/**
 * A row of the `models` table.
 *
 * Field names are the columns' snake_case, mirroring the pattern api/_lib uses
 * for other tables, because the query selects them directly onto the object.
 */
export interface ModelRow {
  created_at: string;
  enabled: boolean;
  id: string;
  image_param: string;
  input: string;
  label: string;
  lora_endpoint: string | null;
  lora_image_endpoint: string | null;
  lora_path: string | null;
  lora_scale: number | null;
  lora_trigger: string | null;
  output?: string;
  sort_order: number;
  updated_at: string;
  vector: boolean;
}

/** What a model row looks like over the wire. */
export interface ModelDto {
  createdAt: string;
  enabled: boolean;
  id: string;
  imageParam: "image_url" | "image_urls";
  input: FalModelInput;
  label: string;
  lora: {
    endpoint: string | null;
    imageEndpoint: string | null;
    path: string | null;
    scale: number | null;
    trigger: string | null;
  } | null;
  output: "image" | "video";
  sortOrder: number;
  updatedAt: string;
  vector: boolean;
}

export const loadModelDefs = async (
  sql: Sql
): Promise<readonly FalModelDef[]> => {
  const rows = (await sql`
    SELECT created_at, enabled, id, image_param, input, label,
      lora_endpoint, lora_image_endpoint, lora_path, lora_scale, lora_trigger,
      sort_order, updated_at, vector
    FROM models
    WHERE enabled
    ORDER BY sort_order, id
  `) as ModelRow[];
  return rows.map(rowToModelDef);
};

/**
 * The full list, hidden models included, for the admin panel.
 *
 * The picker and the run path want only what is live; the panel has to show the
 * models that are switched off, or there would be no way to switch one back on.
 */
export const loadModelRows = async (
  sql: Sql,
  enabledOnly = false
): Promise<ModelRow[]> => {
  const rows = enabledOnly
    ? ((await sql`
        SELECT created_at, enabled, id, image_param, input, label,
          lora_endpoint, lora_image_endpoint, lora_path, lora_scale, lora_trigger,
          output, sort_order, updated_at, vector
        FROM models
        WHERE enabled
        ORDER BY sort_order, id
      `) as ModelRow[])
    : ((await sql`
        SELECT created_at, enabled, id, image_param, input, label,
          lora_endpoint, lora_image_endpoint, lora_path, lora_scale, lora_trigger,
          output, sort_order, updated_at, vector
        FROM models
        ORDER BY sort_order, id
      `) as ModelRow[]);
  return rows;
};

export const isModelImageParam = (
  value: unknown
): value is NonNullable<FalModelDef["imageParam"]> =>
  typeof value === "string" &&
  (MODEL_IMAGE_PARAMS as readonly string[]).includes(value);

export const isModelInput = (value: unknown): value is FalModelInput =>
  typeof value === "string" &&
  (MODEL_INPUTS as readonly string[]).includes(value);

/**
 * A row as the run path reads it.
 *
 * Defensive rather than trusting: a row that ever slipped past the table's
 * checks (or predates them) should behave like the "auto" default, not like a
 * model that consumes something it does not.
 */
export const rowToModelDef = (row: ModelRow): FalModelDef => {
  const lora: FalLora | undefined = row.lora_path
    ? {
        endpoint: row.lora_endpoint ?? undefined,
        imageEndpoint: row.lora_image_endpoint ?? undefined,
        path: row.lora_path,
        scale:
          typeof row.lora_scale === "number" && row.lora_scale > 0
            ? row.lora_scale
            : 1,
        trigger: row.lora_trigger ?? "",
      }
    : undefined;
  return {
    id: row.id,
    // The stored name, not a guess at it. Collapsing anything unfamiliar to
    // `image_url` is what made a Kling v3 row send the field its own schema
    // rejects; the column exists precisely because these endpoints disagree.
    imageParam: isModelImageParam(row.image_param)
      ? row.image_param
      : undefined,
    input: isModelInput(row.input) ? row.input : "prompt-or-image",
    label: row.label,
    lora,
    // Anything that is not exactly "video" is an image, matching the column's
    // default: a row written before this column existed, or one that somehow
    // slipped past the check, should behave like every row always has rather
    // than be dispatched down the queue path and wait for a clip that is
    // never coming.
    output: row.output === "video" ? "video" : "image",
    vector: row.vector,
  };
};

export const rowToModelDto = (row: ModelRow): ModelDto => {
  const def = rowToModelDef(row);
  const { lora } = def;
  return {
    createdAt: row.created_at,
    enabled: row.enabled,
    id: row.id,
    imageParam: row.image_param === "image_urls" ? "image_urls" : "image_url",
    input: def.input,
    label: row.label,
    lora: lora
      ? {
          endpoint: lora.endpoint ?? null,
          imageEndpoint: lora.imageEndpoint ?? null,
          path: lora.path,
          scale: lora.scale,
          trigger: lora.trigger,
        }
      : null,
    output: def.output,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
    vector: row.vector,
  };
};

/**
 * Whether a LoRA row is coherent enough to run.
 *
 * A LoRA without weights is a model that reaches fal as a plain prompt with no
 * trigger and no style — indistinguishable from a bug. Path and scale are
 * checked on create, but the column is nullable, so the read side checks too.
 */
export const isUsableLoraRow = (row: ModelRow): boolean =>
  row.lora_path !== null &&
  typeof row.lora_scale === "number" &&
  row.lora_scale > 0 &&
  row.lora_scale <= MAX_MODEL_LORA_SCALE;

/** What the admin may set on a model, create or edit. */
export interface ModelPatch {
  enabled?: boolean;
  id?: string;
  imageParam?: NonNullable<FalModelDef["imageParam"]>;
  input?: FalModelInput;
  label?: string;
  /**
   * The LoRA fields, as one thing because they are one thing: a LoRA is path,
   * strength, token and base together, and saving four of five would be a
   * model that runs wrongly rather than one that fails. `null` clears the
   * LoRA; absent leaves it alone.
   */
  lora?: {
    endpoint: string | null;
    imageEndpoint: string | null;
    path: string | null;
    scale: number | null;
    trigger: string | null;
  } | null;
  /** What the endpoint returns. See MODEL_OUTPUTS for why it is not derived. */
  output?: "image" | "video";
  sortOrder?: number;
  vector?: boolean;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A trimmed, length-bounded string, or null when absent. */
const boundedText = (value: unknown, limit: number): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = sanitizeText(value).slice(0, limit);
  return trimmed || null;
};

const loraNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

/**
 * The LoRA fields of a create or edit, or a reason they cannot be saved.
 *
 * Returns null when the model is not a LoRA (no weights, no strength), the
 * fields when it is, or an error string when the fields do not cohere — a LoRA
 * with a scale but no path is exactly the kind of half-save that looks right
 * and then misbehaves at run time.
 */
const readLora = (
  raw: unknown
):
  | {
      endpoint: string | null;
      imageEndpoint: string | null;
      path: string | null;
      scale: number | null;
      trigger: string | null;
    }
  | null
  | string => {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (!isPlainRecord(raw)) {
    return "A LoRA is a path, a strength, a trigger and an optional base.";
  }
  const path = boundedText(raw.path, MAX_MODEL_LORA_FIELD);
  if (!path) {
    return "A LoRA needs a weights path (a public https:// address).";
  }
  if (!parsePublicHttpUrl(path)) {
    return "A LoRA's weights path must be a public http(s) URL.";
  }
  const scale = loraNumber(raw.scale);
  if (scale === null || scale <= 0 || scale > MAX_MODEL_LORA_SCALE) {
    return `A LoRA's strength must be a number between 0 and ${MAX_MODEL_LORA_SCALE}.`;
  }
  const endpoint = boundedText(raw.endpoint, MAX_MODEL_LORA_FIELD) ?? null;
  const imageEndpoint =
    boundedText(raw.imageEndpoint, MAX_MODEL_LORA_FIELD) ?? null;
  const trigger =
    boundedText(raw.trigger, MAX_MODEL_LORA_TRIGGER)?.trim() || null;
  return { endpoint, imageEndpoint, path, scale, trigger };
};

/** A validated id, or a reason it cannot be saved. Only a create sets one. */
const readId = (
  body: Record<string, unknown>,
  create: boolean
): Pick<ModelPatch, "id"> | string => {
  if (!create) {
    return {};
  }
  const id = boundedText(body.id, MAX_MODEL_ID);
  if (!id) {
    return "A model id is required (the exact fal.ai id).";
  }
  if (id === PROTECTED_MODEL_ID) {
    return `"${PROTECTED_MODEL_ID}" is the default and already exists.`;
  }
  return { id };
};

/** A validated label, or a reason it cannot be saved. */
const readLabel = (
  body: Record<string, unknown>,
  create: boolean
): Pick<ModelPatch, "label"> | string => {
  if (typeof body.label === "string") {
    const label = sanitizeText(body.label).slice(0, MAX_MODEL_LABEL);
    if (!label) {
      return "A model needs a label.";
    }
    return { label };
  }
  return create ? "A model needs a label." : {};
};

/** One known input shape, or a reason it is not. */
const readInput = (
  body: Record<string, unknown>,
  patch: ModelPatch,
  create: boolean
): string | null => {
  if (typeof body.input === "string") {
    if (!(MODEL_INPUTS as readonly string[]).includes(body.input)) {
      return "That input shape is not one this system knows.";
    }
    patch.input = body.input as FalModelInput;
    return null;
  }
  if (create) {
    patch.input = "prompt-or-image";
  }
  return null;
};

/**
 * Image or video, or a reason it is neither.
 *
 * Its absence is why a video model could not be added by hand at all: the
 * column defaulted to 'image', nothing here ever wrote it, and the Video node
 * refuses anything that says it makes pictures — so a background-removal
 * endpoint was rejected with "makes pictures, not video" by the very row that
 * had just been created for it.
 */
const readOutput = (
  body: Record<string, unknown>,
  patch: ModelPatch,
  create: boolean
): string | null => {
  if (typeof body.output === "string") {
    if (!(MODEL_OUTPUTS as readonly string[]).includes(body.output)) {
      return "A model returns either an image or a video.";
    }
    patch.output = body.output as "image" | "video";
    return null;
  }
  if (create) {
    patch.output = "image";
  }
  return null;
};

/** One known source-image parameter, or a reason it is not. */
const readImageParam = (
  body: Record<string, unknown>,
  patch: ModelPatch,
  create: boolean
): string | null => {
  if (typeof body.imageParam === "string") {
    if (!(MODEL_IMAGE_PARAMS as readonly string[]).includes(body.imageParam)) {
      return "That source-image parameter is not one this system knows.";
    }
    patch.imageParam = body.imageParam as "image_url" | "image_urls";
    return null;
  }
  if (create) {
    patch.imageParam = "image_url";
  }
  return null;
};

/** A boolean flag, defaulted on create and left alone on edit. */
const readBool = (
  body: Record<string, unknown>,
  patch: ModelPatch,
  create: boolean,
  key: "enabled" | "vector",
  fallback: boolean
): void => {
  if (typeof body[key] === "boolean") {
    patch[key] = body[key];
  } else if (create) {
    patch[key] = fallback;
  }
};

/**
 * The settable fields of a model, validated, or a reason they cannot be.
 *
 * `create` is stricter in the ways that only a new row can break: the id is
 * required and "auto" is reserved. An edit is partial — only what was sent is
 * touched — and the protected default is refused the edits that would change
 * what the fallback means.
 */
export const readModelFields = (
  body: Record<string, unknown>,
  create: boolean
): ModelPatch | string => {
  const patch: ModelPatch = {};

  const id = readId(body, create);
  if (typeof id === "string") {
    return id;
  }
  patch.id = id.id;

  const label = readLabel(body, create);
  if (typeof label === "string") {
    return label;
  }
  patch.label = label.label;

  const output = readOutput(body, patch, create);
  if (output) {
    return output;
  }

  const input = readInput(body, patch, create);
  if (input) {
    return input;
  }

  const imageParam = readImageParam(body, patch, create);
  if (imageParam) {
    return imageParam;
  }

  readBool(body, patch, create, "vector", false);
  readBool(body, patch, create, "enabled", true);

  if (typeof body.sortOrder === "number") {
    patch.sortOrder = Number.isFinite(body.sortOrder)
      ? Math.max(0, Math.trunc(body.sortOrder))
      : undefined;
  }

  const lora = readLora(body.lora);
  if (typeof lora === "string") {
    return lora;
  }
  // On create, absent and null both mean "not a LoRA". On an edit, absent must
  // mean "leave the LoRA alone" — a label-only save must not wipe the weights.
  if (create || body.lora !== undefined) {
    patch.lora = lora;
  }

  return patch;
};
