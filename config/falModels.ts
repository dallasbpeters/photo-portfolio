/**
 * What a fal.ai model takes, returns, and loads — and how to ask it.
 *
 * Lifted out of config/nodeTypes.ts, which had grown two unrelated jobs: saying
 * what a node *is*, and describing the third-party endpoints one particular node
 * happens to call. Only eight modules ever wanted this half, and none of them
 * wanted the other, so keeping them together made every importer read a file
 * four times the size of what it used.
 *
 * Like config/nodeTypes.ts, this stays dependency-free and free of browser and
 * Node globals so every layer can import it. The model *list* is not here — it
 * lives in the `models` table so it can be edited without a code change, and
 * every helper below takes that loaded list as its first argument.
 */

/**
 * What a model consumes.
 *
 * Not cosmetic: fal rejects a request whose body does not match the endpoint,
 * and it does so after the call has been made. Encoding the shape per model is
 * what lets a run be refused *before* it is billed when the wiring cannot
 * satisfy it — a vectoriser with no image, or a text-to-vector with no prompt.
 */
export type FalModelInput =
  /** A prompt, and an image only if one happens to be wired. */
  | "prompt-or-image"
  /**
   * Both, and both required — the image as `image_url`, singular.
   *
   * Distinct from "prompt-or-image", which sends `image_urls` as an array and
   * is happy without one. Ideogram's image-to-image endpoint lists prompt and
   * image_url as required and takes neither in the other shape, so sending it
   * the wrong one is a request that fails after it has been billed.
   */
  | "prompt-and-image"
  /** A prompt. Any wired image is ignored. */
  | "prompt"
  /** An image, and nothing else. Refused when none is wired. */
  | "image"
  /**
   * A clip, and nothing else — background removal, upscaling, interpolation.
   *
   * Its own shape rather than folded into "image" because what gets wired in is
   * a different kind of thing, and an endpoint handed a still where it wanted a
   * clip fails after it has been billed. Reached through the queue like every
   * other `output: "video"` row: reworking a clip takes minutes.
   */
  | "video"
  /** A clip and words: restyling, and anything that takes direction. */
  | "prompt-and-video";

export interface FalLora {
  /**
   * The endpoint these weights were trained against, when it is not Flux.
   *
   * A LoRA only loads on the base model it was trained on — a Krea-2 LoRA sent
   * to fal-ai/flux-lora returns a picture, but a picture in the base style,
   * which reads as the LoRA simply not being very strong. That silence is why
   * the base is declared here rather than assumed.
   *
   * Omitted means the Flux pair below.
   */
  endpoint?: string;
  /** The same base, applied to a picture rather than a blank canvas. */
  imageEndpoint?: string;
  path: string;
  scale: number;
  trigger: string;
}

export interface FalModelDef {
  /** The exact fal.ai model id, or "auto". */
  id: string;
  /**
   * What this endpoint calls its source image.
   *
   * Orthogonal to `input`, which says whether an image is required: these
   * endpoints disagree about the parameter's *name* as well as its necessity,
   * and nano-banana wants a list where Recraft and Ideogram want one URL.
   * Defaults to "image_url", which is the majority.
   */
  imageParam?: "image_url" | "image_urls" | "start_image_url" | "video_url";
  input: FalModelInput;
  /** Shown on the node — model ids are too long and too alike to read. */
  label: string;
  /**
   * A LoRA to load, for the models that are a style rather than an endpoint.
   *
   * Most run on fal-ai/flux-lora and differ only in the weights it loads, so
   * they are listed as models here because that is what they are to whoever is
   * picking one. `path` is a URL to a safetensors file, ours or Hugging Face's.
   *
   * `trigger` is not optional in practice: a LoRA is trained against a token,
   * and a prompt without it gets the base model. It is prepended for you.
   */
  lora?: FalLora;
  /**
   * What the endpoint returns, which is not the same question as `input`.
   *
   * A video is reached through fal's queue and polled for minutes where an
   * image is one synchronous call, so the run path dispatches on this and a
   * node's picker offers only the endpoints that make what it makes.
   */
  output: "image" | "video";
  /**
   * True when this model returns vector art rather than a raster.
   *
   * It decides what a result claims to be, which is not cosmetic: the node
   * warns when an image came back as a raster, and a mislabelled SVG would
   * either raise that warning wrongly or hide it when it mattered.
   * persistGenerated already stores an SVG with the right extension and
   * content type, so nothing else has to change.
   */
  vector: boolean;
}

/** The fal endpoint a LoRA style runs on unless it names its own. */
export const FLUX_LORA_ENDPOINT = "fal-ai/flux-lora";

/**
 * The same weights, applied to a picture rather than to a blank canvas.
 *
 * A LoRA is a style, and a style is as useful for reworking a photograph as for
 * inventing one — so an image wired into a style model switches endpoint rather
 * than being ignored, which is what "input: prompt" used to mean here.
 */
export const FLUX_LORA_IMAGE_ENDPOINT = "fal-ai/flux-lora/image-to-image";

/**
 * Repainting part of a picture and leaving the rest alone.
 *
 * A separate endpoint rather than a parameter, which is why a mask changes
 * where the request goes rather than only what it carries. The LoRA form takes
 * the same `loras` array as the others, so a mask and a custom style compose —
 * masking does not cost you the trained look.
 */
export const FLUX_INPAINT_ENDPOINT = "fal-ai/flux-general/inpainting";
export const FLUX_LORA_INPAINT_ENDPOINT = "fal-ai/flux-lora/inpainting";

export const falModelFor = (
  models: readonly FalModelDef[],
  value: unknown
): FalModelDef | null => models.find((model) => model.id === value) ?? null;

export const falModelLora = (
  models: readonly FalModelDef[],
  value: unknown
): FalLora | null => falModelFor(models, value)?.lora ?? null;

/** Where a style's weights actually load, with or without a source image. */
export const falLoraEndpoint = (lora: FalLora, hasImage: boolean): string => {
  if (hasImage) {
    return lora.imageEndpoint ?? FLUX_LORA_IMAGE_ENDPOINT;
  }
  return lora.endpoint ?? FLUX_LORA_ENDPOINT;
};

/**
 * Whether this model can repaint part of an image rather than all of it.
 *
 * Only the Flux family, for now. A mask sent to a model without an inpainting
 * endpoint would be ignored silently and billed in full, so the run is refused
 * instead — see maskRefusal in the run endpoint.
 */
export const falModelMasks = (
  models: readonly FalModelDef[],
  value: unknown
): boolean => {
  const model = falModelFor(models, value);
  if (!model) {
    return false;
  }
  // A LoRA on a non-Flux base has its own endpoints and no inpainting one.
  if (model.lora) {
    return !model.lora.endpoint;
  }
  return model.id === "auto" || model.id.startsWith("fal-ai/flux");
};

/** Whether a chosen model is on the list at all. Unknown ids are not. */
export const isFalModel = (
  models: readonly FalModelDef[],
  value: unknown
): value is string => falModelFor(models, value) !== null;

/** Whether a chosen model returns vector art. Unknown ids are not vector. */
export const isVectorModel = (
  models: readonly FalModelDef[],
  value: unknown
): boolean => falModelFor(models, value)?.vector ?? false;

/** What a chosen model consumes; unknown ids behave like "auto". */
export const falModelInput = (
  models: readonly FalModelDef[],
  value: unknown
): FalModelInput => falModelFor(models, value)?.input ?? "prompt-or-image";

/** What to call the source image for this model. See FalModelDef.imageParam. */
export const falImageParam = (
  models: readonly FalModelDef[],
  value: unknown
): NonNullable<FalModelDef["imageParam"]> =>
  falModelFor(models, value)?.imageParam ?? "image_url";
