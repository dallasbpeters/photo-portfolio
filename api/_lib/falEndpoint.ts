import {
  type FalModelDef,
  FLUX_INPAINT_ENDPOINT,
  FLUX_LORA_INPAINT_ENDPOINT,
  falImageParam,
  falLoraEndpoint,
  falModelLora,
} from "../../config/falModels.js";

/**
 * Which fal endpoint a run actually reaches, and what it accepts.
 *
 * Split from api/_lib/fal.ts for the same reason falBody.ts was: that file
 * reaches bootstrapEnv for the API key and therefore node:fs, which cannot be
 * resolved in the browser environment this project's tests run in. Everything
 * here is pure, and it decides two things worth testing — where a run goes,
 * and whether it may be handed more than one picture.
 *
 * The second question had no test and no caller. falAcceptsImageList was
 * written to refuse a mis-wired node by name, exported, and then never called
 * from anywhere; meanwhile every endpoint that blends a list was being sent a
 * list of exactly one. It decides the blend now, so it is worth being able to
 * check.
 */

/**
 * The *automatic* choice, and the two do different jobs: the pro model writes
 * an image from a prompt, the edit model rewrites one you already have — and
 * the edit endpoint takes an array of source images even when there is only
 * one, which is what makes blending possible at all.
 */
export const TEXT_TO_IMAGE_MODEL = "fal-ai/nano-banana-pro";
export const EDIT_MODEL = "fal-ai/nano-banana/edit";

/**
 * Which fal endpoint this run actually goes to.
 *
 * Four things decide it and they are checked in order of how much they
 * constrain the answer: a mask needs an inpainting endpoint, a LoRA needs one
 * that loads weights, an explicitly named model is taken at its word, and
 * "auto" falls back to inventing or editing depending on whether a picture was
 * wired in.
 */
export const endpointFor = ({
  hasSourceImage,
  lora,
  masking,
  requestedModel,
}: {
  hasSourceImage: boolean;
  lora: ReturnType<typeof falModelLora>;
  masking: boolean;
  requestedModel: string | null;
}): string => {
  if (lora) {
    return masking
      ? FLUX_LORA_INPAINT_ENDPOINT
      : // A wired image reworks rather than invents, so the style is applied
        // to it through the image-to-image endpoint instead.
        falLoraEndpoint(lora, hasSourceImage);
  }
  if (masking) {
    return FLUX_INPAINT_ENDPOINT;
  }
  if (requestedModel && requestedModel !== "auto") {
    return requestedModel;
  }
  return hasSourceImage ? EDIT_MODEL : TEXT_TO_IMAGE_MODEL;
};

/**
 * Whether this run's endpoint takes a list of pictures rather than one.
 *
 * This is what decides whether several wired images become one blended run or
 * several separate ones. Asked of the *resolved* endpoint rather than of the
 * model chosen on the node, which is the whole reason it cannot be answered
 * where the node is read: "auto" with a picture wired in resolves to
 * nano-banana/edit, which takes a list, while a LoRA or a mask resolves to
 * something taking a single `image_url` whatever the row declares.
 *
 * The doc that stood here described a refusal — the function was written to
 * turn down a mis-wired node by name. That never happened: nothing called it,
 * and every list-taking endpoint was quietly sent a list of one instead.
 */
export const falAcceptsImageList = ({
  hasSourceImage,
  masking,
  models,
  requestedModel,
}: {
  hasSourceImage: boolean;
  masking: boolean;
  models: readonly FalModelDef[];
  requestedModel: string | null;
}): boolean => {
  const lora = falModelLora(models, requestedModel);
  // Both send the picture as image_url; see bodyFor and the mask override.
  if (lora || masking) {
    return false;
  }
  const model = endpointFor({ hasSourceImage, lora, masking, requestedModel });
  return falImageParam(models, model) === "image_urls";
};
