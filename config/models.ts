/**
 * What a model row may hold.
 *
 * Shared by the endpoints that enforce these and the panels that have to say
 * so before anything is saved — the same reasoning as config/elements.ts.
 * Kept in config/ rather than api/_lib because the admin UI needs the same
 * bounds the API validates against.
 */

/**
 * The input shapes a model may consume, as the strings stored in the `input`
 * column and in `FalModelInput` in config/nodeTypes.ts. Kept in the same order
 * the picker should offer them.
 */
export const MODEL_INPUTS = [
  "prompt-or-image",
  "prompt-and-image",
  "prompt",
  "image",
] as const;

/** The names endpoints give their source image. */
export const MODEL_IMAGE_PARAMS = ["image_url", "image_urls"] as const;

/** A fal model id or a namespaced "lora/..." one — never an essay. */
export const MAX_MODEL_ID = 120;

/** Long enough to be a picker label, short enough to fit on a node. */
export const MAX_MODEL_LABEL = 60;

/** A URL or a weights path; bounded like any other stored string. */
export const MAX_MODEL_LORA_FIELD = 400;

/** How strongly the LoRA is applied. The card suggests 0.8-1.0; 5 is generous. */
export const MAX_MODEL_LORA_SCALE = 5;

/** The trigger token is prepended to the prompt, so it stays short. */
export const MAX_MODEL_LORA_TRIGGER = 200;

/** Never given a trigger or a hidden state. */
export const PROTECTED_MODEL_ID = "auto";
