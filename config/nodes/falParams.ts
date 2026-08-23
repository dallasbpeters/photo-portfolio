/**
 * Which generation parameters may be sent to which fal endpoint.
 *
 * Pure policy, kept out of the module that makes the request so it can be
 * tested without one — and this is policy worth testing, because getting it
 * wrong is not a rendering bug. fal validates strictly and bills first: a field
 * an endpoint has never heard of, or a value outside its enum, comes back 422 on
 * a request that has already been paid for.
 *
 * The table it consults is generated from fal's own schemas
 * (falParams.generated.ts). A hand-written version had four errors — it sent
 * `image_size` to a vectoriser that takes none, and to Kontext and Nano Banana
 * which call the same idea `aspect_ratio`.
 */

import { FAL_PARAM_SUPPORT } from "./falParams.generated.js";
import { QUALITY_OPENAI, QUALITY_STEPS, SIZE_AS_ASPECT } from "./generation.js";

/**
 * The generation parameters a node may set, as the panel stores them.
 *
 * Every field is optional and "auto" is equivalent to absent — see
 * config/nodes/generation.ts on why that is the whole safety property.
 */
export interface GenerationParams {
  outputFormat?: string | null;
  quality?: string | null;
  size?: string | null;
}

const chosen = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && trimmed !== "auto" ? trimmed : null;
};

/**
 * Puts a field in the body only if this endpoint accepts it *with this value*.
 *
 * Both halves matter and the second is the one that is easy to miss: FLUX and
 * Kontext take `output_format` but only as jpeg or png, so a node set to webp
 * must send nothing rather than send webp. The table is read from fal's own
 * schemas — see config/nodes/falParams.generated.ts — because a hand-written
 * version of this had four errors, and every one of them would have been a
 * 422 on a request that had already been billed.
 */
const offer = (
  body: Record<string, unknown>,
  endpoint: string,
  field: string,
  value: string | null
): boolean => {
  if (!value) {
    return false;
  }
  const allowed = FAL_PARAM_SUPPORT[endpoint]?.[field];
  if (!allowed?.includes(value)) {
    return false;
  }
  body[field] = value;
  return true;
};

/**
 * Applies the node's parameters to a request body, for the endpoint it is
 * actually going to.
 *
 * Keyed off the resolved endpoint rather than the requested model, for the same
 * reason falImageParam is: "auto" resolves to nano-banana/edit, and a LoRA or a
 * mask resolves to a FLUX endpoint whatever the row said. Asking the requested
 * id would apply FLUX's step count to a model that has never heard of it.
 */
export const applyFalParams = (
  body: Record<string, unknown>,
  endpoint: string,
  params: GenerationParams | undefined
): void => {
  if (!params) {
    return;
  }

  /*
   * One control, two spellings.
   *
   * The panel asks for a shape; half these endpoints call that `image_size` and
   * take a name like "portrait_4_3", the other half call it `aspect_ratio` and
   * take "3:4". Trying the native spelling first and the translation second is
   * what makes one control work across both — without it, Size did nothing on
   * Kontext and Nano Banana, which are the two most used models on the board.
   */
  const size = chosen(params.size);
  if (size && !offer(body, endpoint, "image_size", size)) {
    offer(body, endpoint, "aspect_ratio", SIZE_AS_ASPECT[size] ?? null);
  }

  offer(body, endpoint, "output_format", chosen(params.outputFormat));

  const quality = chosen(params.quality);
  if (!quality) {
    return;
  }
  // Two vocabularies for one idea, and neither is the word the panel uses: a
  // count of steps where the endpoint measures effort that way, a word where it
  // takes one, and nothing at all where it has no such control.
  const steps = QUALITY_STEPS[quality as keyof typeof QUALITY_STEPS];
  if (steps !== undefined && FAL_PARAM_SUPPORT[endpoint]?.num_inference_steps) {
    body.num_inference_steps = steps;
  }
  offer(
    body,
    endpoint,
    "quality",
    QUALITY_OPENAI[quality as keyof typeof QUALITY_OPENAI] ?? null
  );
};
