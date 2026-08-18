import type {
  FalModelDef,
  FalModelInput,
} from "../../../../config/falModels.js";
import { falModelFor, falModelMasks } from "../../../../config/falModels.js";
import type { NodeCapability } from "../../../../config/nodeTypes.js";
import type { Job } from "../../../_lib/elementStyle.js";
import { parsePublicHttpUrl } from "../../../_lib/httpUrl.js";

/**
 * Every reason a run is refused before a penny is spent.
 *
 * Each of these exists because fal answers a mismatched request *after* it has
 * billed for it, and a picture that came back ignoring the mask or the wired
 * reference is indistinguishable from one where the mask or the reference was
 * made wrong. Refusing here turns a silent charge into a sentence.
 */

/** An explicit scheme, as api/ai/generate.ts requires for the same reason. */
export const HTTP_SCHEME = /^https?:\/\//i;

/**
 * A refused run: why, in the words the node will show, plus whatever else the
 * canvas can act on — `missingPort` lights up the input that is wanting.
 *
 * `error` is required rather than merely likely, because it is the sentence
 * written to `run_error`. A refusal with no reason to record would be exactly
 * the silence this type exists to end.
 */
export type Refusal = { error: string } & Record<string, unknown>;

/**
 * A mask wired into a model that cannot honour one.
 *
 * Refused rather than dropped. fal would accept the request, ignore the mask,
 * repaint the entire picture and bill for it — and the result looks like a
 * generation that simply did not respect the mask, which is indistinguishable
 * from the mask having been painted wrong.
 */
export const maskRefusal = (
  model: string | null,
  masked: boolean,
  models: readonly FalModelDef[]
): Refusal | null => {
  if (!masked || falModelMasks(models, model ?? "auto")) {
    return null;
  }
  const label = falModelFor(models, model)?.label ?? "This model";
  return {
    error: `${label} cannot paint into part of an image. Choose Auto or a Flux style, or clear the mask.`,
    missingPort: "image",
  };
};

/**
 * A picture wired into a model with nowhere to put one.
 * Refused for the same reason a mask is. "input: prompt" means every wired
 * image is dropped before the request is built — a reference, a subject, and an
 * element's style along with it — so the run invents something from the words
 * alone and bills in full for ignoring what was wired in. That reads as a model
 * that did not take the reference, which is indistinguishable from a reference
 * that was wired wrong.
 */
export const imageIgnoredRefusal = (
  shape: FalModelInput,
  model: string | null,
  values: Record<string, string[] | undefined>,
  models: readonly FalModelDef[]
): Refusal | null => {
  if (shape !== "prompt" || (values.image?.length ?? 0) === 0) {
    return null;
  }
  const label = falModelFor(models, model)?.label ?? "This model";
  return {
    error: `${label} works from a prompt alone and would ignore the wired image. Choose another model, or unwire it.`,
    missingPort: "image",
  };
};

export const unmetRequirement = (
  shape: FalModelInput,
  model: string | null,
  prompt: string,
  values: Record<string, string[] | undefined>,
  masked: boolean,
  capability: NodeCapability,
  models: readonly FalModelDef[]
): Refusal | null => {
  // A composite has no model and no prompt — its inputs are pictures, and the
  // required image port has already been checked by resolveInputs. Running it
  // through the model rules below would refuse it for lacking a prompt that it
  // has no field to type one into.
  if (capability === "board.composite") {
    return null;
  }
  const mask = maskRefusal(model, masked, models);
  if (mask) {
    return mask;
  }
  const ignored = imageIgnoredRefusal(shape, model, values, models);
  if (ignored) {
    return ignored;
  }
  /*
   * A clip-consuming model reached through the wrong door. `video` and
   * `prompt-and-video` rework an existing clip, and everything returning one
   * goes through the queue — see api/boards/[id]/video.ts. Sent from here it
   * would submit a video URL as an image, which fal answers with a 422 after
   * the call has been made.
   */
  if (shape === "video" || shape === "prompt-and-video") {
    const label = falModelFor(models, model)?.label ?? "This model";
    return {
      error: `${label} reworks a clip. Use a Video node, and wire the clip into it.`,
      missingPort: "image",
    };
  }
  if (shape === "prompt-and-image") {
    // Both, so both are checked before anything is spent.
    if ((values.image?.length ?? 0) === 0) {
      const label = falModelFor(models, model)?.label ?? "This model";
      return {
        error: `${label} reworks an existing image; wire one into it.`,
        missingPort: "image",
      };
    }
    if (!prompt) {
      return {
        error: "This node needs a prompt, wired in or typed on the node.",
        missingPort: "prompt",
      };
    }
    return null;
  }
  if (shape === "image") {
    const images = values.image ?? [];
    if (images.length === 0) {
      const label = falModelFor(models, model)?.label ?? "This model";
      return {
        error: `${label} traces an existing image; wire one into it.`,
        missingPort: "image",
      };
    }
    // A vectoriser has no prompt to want.
    return null;
  }
  if (!prompt) {
    return {
      error: "This node needs a prompt, wired in or typed on the node.",
      missingPort: "prompt",
    };
  }
  return null;
};

/**
 * The job list with every URL checked, or null if one is not forwardable.
 *
 * Validated even though these are usually our own blob URLs: they are handed to
 * a third party to go and fetch, which is the same reason api/ai/generate.ts
 * insists on an explicit scheme rather than helpfully adding one.
 */
export const validatedJobs = (raw: Job[]): { dropped: number; jobs: Job[] } => {
  const jobs: Job[] = [];
  let dropped = 0;
  for (const job of raw) {
    if (job.image === null) {
      jobs.push(job);
      continue;
    }
    // Trimmed before the scheme is tested: the test is anchored, so a stored
    // URL carrying a stray leading space failed it and took the whole batch
    // down with it.
    const trimmed = job.image.trim();
    const url = HTTP_SCHEME.test(trimmed) ? parsePublicHttpUrl(trimmed) : null;
    if (url) {
      jobs.push({ ...job, image: url });
      continue;
    }
    // Dropped rather than fatal, for the same reason a vector is: one wire out
    // of a frame carries everything on it, and a single unusable address among
    // twenty pictures should not mean none of them run.
    dropped += 1;
  }
  return { dropped, jobs };
};
