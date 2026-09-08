import type {
  FalModelDef,
  FalModelInput,
  falModelLora,
} from "../../config/falModels.js";

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
 * How much of a wired picture a LoRA is allowed to repaint.
 *
 * fal-ai/flux-lora/image-to-image defaults this to 0.85, and this app never
 * sent it — so wiring a photograph into a style node repainted 85% of it and
 * handed back something with no visible relationship to the input. That reads
 * as the LoRA being broken rather than as a parameter nobody set.
 *
 * 0.7 keeps the composition and the subject legible while still restyling.
 * There is no correct value: below about 0.5 the style stops arriving, above
 * about 0.8 the source stops surviving, and where in between depends on the
 * LoRA. This is the value to change when a restyle is too faithful or too free.
 */
const LORA_STRENGTH = 0.7;

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
      // has no such field. See LORA_STRENGTH for why it is sent at all.
      ...(sourceImageUrl
        ? { image_url: sourceImageUrl, strength: LORA_STRENGTH }
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
