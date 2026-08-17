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
  "video",
  "prompt-and-video",
] as const;

/**
 * The names endpoints give the thing you feed them.
 *
 * Not only images, despite the name the column has always had: Kling v3 calls
 * its source picture `start_image_url` where its own v2.5 says `image_url`, and
 * an endpoint that reworks a clip calls it `video_url`. Both were already legal
 * in the table; listing them here is what lets the admin panel edit such a row
 * instead of refusing its own data.
 */
export const MODEL_IMAGE_PARAMS = [
  "image_url",
  "image_urls",
  "start_image_url",
  "video_url",
] as const;

/**
 * What an endpoint hands back.
 *
 * Not cosmetic, and not derivable from `input`: it decides which door a run
 * goes through. An image is fetched synchronously through fal.run, a clip is
 * submitted to the queue and polled, because a clip takes minutes and neither
 * the request timeout nor the serverless ceiling will wait.
 */
export const MODEL_OUTPUTS = ["image", "video"] as const;

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
