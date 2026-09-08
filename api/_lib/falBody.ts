import type {
  FalModelDef,
  FalModelInput,
  falModelLora,
} from "../../config/falModels.js";
import { PALETTE_MODELS, paletteFrom, paletteOf } from "./falPalette.js";

/**
 * What each fal endpoint's request body looks like.
 *
 * Split from api/_lib/fal.ts, which also holds the HTTP client and reaches
 * bootstrapEnv for the API key — and therefore node:fs, which cannot be
 * resolved in the browser environment this project's tests run in. This half
 * is pure, and it is the half worth testing: it decides whether a trained
 * style fires at all.
 */

/**
 * How much of a wired picture a LoRA repaints, when the node has not said.
 *
 * fal-ai/flux-lora/image-to-image takes `strength` from 0 to 1: 0 preserves
 * the original, 1 remakes it. Its own default is 0.85 and this app sent
 * nothing at all for a while, so a photograph wired into a style came back
 * with no visible relationship to the input.
 *
 * The correction to that overshot in the other direction: a fixed 0.7, chosen
 * against one LoRA, which turned out to leave the first trained style
 * reproducing its input almost exactly. There is no correct value — it depends
 * on the LoRA and on the picture — so the node carries it now, and this is
 * only the fallback for a node that predates the setting.
 */
const DEFAULT_LORA_STRENGTH = 0.8;

/**
 * The request body for a model, which is not the same shape for any two of them.
 *
 * fal rejects a body that does not match its endpoint, and only after the call
 * has been billed — so the shape comes from the model's declared input in the
 * `models` table rather than from whether an image happens to be present.
 */
export const bodyFor = (
  lora: ReturnType<typeof falModelLora>,
  shape: FalModelInput,
  prompt: string,
  sourceImageUrl: string | null | undefined,
  /**
   * How far to repaint the wired picture, 0 to 1, from the node's Restyle
   * setting. Undefined for a node that has never carried one.
   */
  loraStrength: number | undefined,
  /** What this endpoint calls its source: "image_url" for most. */
  imageParam: NonNullable<FalModelDef["imageParam"]>
): Record<string, unknown> => {
  /*
   * A clip is not this function's business.
   *
   * The video shapes are served by the queue — api/boards/[id]/video.ts — the
   * same way every `output: "video"` row is, because reworking a clip takes
   * minutes and neither the request timeout nor the serverless ceiling will
   * wait. Falling through to the branches below would send a video URL as
   * `image_url` to an endpoint that never asked for one, which fal answers
   * with a 422 after the call has been made.
   */
  if (shape === "video" || shape === "prompt-and-video") {
    throw new Error(
      "This model reworks a clip; run it from a Video node rather than here"
    );
  }
  /**
   * The source image under whichever name this endpoint expects.
   *
   * One picture either way. A wired Element's style used to ride here as extra
   * entries beside the subject, which is why a restyle came back looking like
   * the element: an edit endpoint weighs every entry equally, so the subject
   * was one of seven. The style is read into words now — see elementBrief.ts.
   */
  const imageField = (url: string): Record<string, unknown> =>
    imageParam === "image_urls" ? { image_urls: [url] } : { [imageParam]: url };

  if (lora) {
    // The trigger token is prepended rather than left to be remembered. A LoRA
    // is trained against one, and a prompt without it quietly returns the base
    // model — which looks like the style simply not working.
    const withTrigger = prompt
      .toLowerCase()
      .includes(lora.trigger.toLowerCase())
      ? prompt
      : `${lora.trigger}, ${prompt}`;
    return {
      loras: [{ path: lora.path, scale: lora.scale }],
      prompt: withTrigger,
      // image_url only when there is one: the plain endpoint rejects it.
      // `strength` goes with it, and only with it — the text-to-image endpoint
      // has no such field. See DEFAULT_LORA_STRENGTH for why it is sent at all.
      ...(sourceImageUrl
        ? {
            image_url: sourceImageUrl,
            strength: loraStrength ?? DEFAULT_LORA_STRENGTH,
          }
        : {}),
    };
  }
  if (shape === "image") {
    // A vectoriser traces an image; it has no prompt to speak of.
    if (!sourceImageUrl) {
      throw new Error("This model needs an image wired into it");
    }
    return imageField(sourceImageUrl);
  }
  if (shape === "prompt-and-image") {
    // Both required. Refused here as well as in the run endpoint, since this
    // function is reachable from api/ai/generate.ts too and fal bills before
    // it validates.
    if (!sourceImageUrl) {
      throw new Error("This model needs an image wired into it");
    }
    return { ...imageField(sourceImageUrl), prompt };
  }
  if (shape === "prompt") {
    // Text-to-image and text-to-vector. Any wired image is deliberately not
    // sent — these endpoints do not take one.
    return { prompt };
  }
  return sourceImageUrl
    ? { ...imageField(sourceImageUrl), prompt }
    : { prompt };
};

/**
 * The overrides for endpoints that do not take what they declare.
 *
 * Three unrelated quirks, grouped because they are all the same *kind* of
 * thing — a body that has to be bent for one endpoint — and because leaving
 * them inline pushed generateImage past the complexity ceiling. They stay in
 * order: each is independent, but `applyFalParams` runs after all of them so
 * an explicit choice on the node still wins.
 */
export const applyEndpointQuirks = (
  body: Record<string, unknown>,
  model: string,
  from: {
    maskUrl?: string | null;
    masking: boolean;
    palette: readonly string[];
    prompt: string;
    sourceImageUrl?: string | null;
  }
): void => {
  // Inpainting endpoints take the picture as image_url whatever the chosen
  // model normally uses, and the mask beside it.
  if (from.masking && from.maskUrl && from.sourceImageUrl) {
    body.image_url = from.sourceImageUrl;
    body.image_urls = undefined;
    body.mask_url = from.maskUrl;
  }

  /*
   * A real constraint where the model has one, rather than a request in prose.
   *
   * Taken from the parameters first and the prompt second. The prompt used to
   * be the only source — the hexes were scraped back out of it — and that
   * stopped working the moment prompts started describing colours in words
   * instead of listing them, which they now do because a model that letters
   * well drew the hex codes onto the picture. The scrape stays as a fallback
   * for a prompt somebody typed hex into by hand.
   */
  if (PALETTE_MODELS.has(model)) {
    const palette = paletteOf(from.palette) ?? paletteFrom(from.prompt);
    if (palette) {
      body.color_palette = palette;
    }
  }

  // The GPT family outputs a preset aspect unless told otherwise: the text
  // model defaults to landscape, and the edit model's "auto" copies the input
  // image's shape — feed it a portrait crop and it returns a portrait, which
  // is how edits started coming back tall. Every other model on the board is
  // square, so ask for square here or a node changes shape with its model.
  if (model === "openai/gpt-image-2" || model === "openai/gpt-image-2/edit") {
    body.image_size = "square";
  }
};
