import {
  type FalModelDef,
  type FalModelInput,
  FLUX_INPAINT_ENDPOINT,
  FLUX_LORA_INPAINT_ENDPOINT,
  falImageParam,
  falLoraEndpoint,
  falModelInput,
  falModelLora,
  falModelMasks,
  HEX_COLOUR,
} from "../../config/nodeTypes.js";
import { getSql } from "./db.js";
import { loadModelDefs } from "./models.js";
import { persistGenerated } from "./persistGenerated.js";

/**
 * Image generation through fal.ai.
 *
 * The two constants below are the *automatic* choice, and they do different
 * jobs: the pro model writes an image from a prompt, the edit model rewrites
 * one you already have, and the edit endpoint takes an array of source images
 * even when there is only one.
 *
 * A caller may instead name any model on the list in the `models` table — the
 * same table the node's picker is built from, so the two cannot drift —
 * including Recraft's vector models, which is why the request body is built
 * from the model's declared input shape rather than from whether an image
 * happens to be present. Those endpoints disagree about their parameters, and
 * fal only says so after the call has been billed.
 */
const TEXT_TO_IMAGE_MODEL = "fal-ai/nano-banana-pro";
const EDIT_MODEL = "fal-ai/nano-banana/edit";

/** Generation is slow by web standards; well under Vercel's function ceiling. */
const REQUEST_TIMEOUT_MS = 120_000;

export interface GeneratedImage {
  /** What the model says it produced. Useful as alt text. */
  description: string | null;
  height: number | null;
  url: string;
  width: number | null;
}

interface FalImage {
  /** What fal says it made — often truer than the header it serves it with. */
  content_type?: string | null;
  height?: number | null;
  url?: string;
  width?: number | null;
}

/** One entry of fal's validation-error array. */
interface FalDetail {
  msg?: string;
}

interface FalResponse {
  description?: string;
  detail?: unknown;
  /** Single-output models — the vectoriser among them — answer with one. */
  image?: FalImage;
  images?: FalImage[];
}

/**
 * The readable part of a fal error.
 *
 * `detail` is a string for some failures and an array of validation objects for
 * others — the shape FastAPI produces. Only the string form was ever read, so
 * every rejected Recraft call surfaced as a bare "status 422" and the actual
 * reason ("Unsupported image format", "Failed to load the image") was thrown
 * away. That silence is what made these calls so hard to diagnose.
 */
const falDetail = (json: FalResponse, status: number): string => {
  if (typeof json.detail === "string") {
    return json.detail;
  }
  if (Array.isArray(json.detail)) {
    const messages = (json.detail as FalDetail[])
      .map((entry) => entry?.msg)
      .filter((msg): msg is string => typeof msg === "string");
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  return `status ${status}`;
};

/**
 * The request body for a model, which is not the same shape for any two of them.
 *
 * fal rejects a body that does not match its endpoint, and only after the call
 * has been billed — so the shape comes from the model's declared input in the
 * `models` table rather than from whether an image happens to be present.
 */
const bodyFor = (
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

/** Models that accept a color palette as a parameter rather than as prose. */
const PALETTE_MODELS = new Set(["fal-ai/ideogram/v3"]);

/**
 * The hex codes in a prompt, as the palette parameter Ideogram expects.
 *
 * Lifted back out of the prompt rather than carried on a wire of their own.
 * A palette node writes its colors into the text so that every model gets
 * something to go on — most can only be asked — and this turns the same line
 * into an actual constraint for the one model that can honour it.
 *
 * Weights are left at the default: an even palette is what a brand palette
 * usually means, and guessing a weighting from the order they were typed in
 * would be inventing intent.
 */
const paletteFrom = (
  prompt: string
): { members: { rgb: { b: number; g: number; r: number } }[] } | null => {
  const found = prompt.match(HEX_COLOUR);
  if (!found || found.length === 0) {
    return null;
  }
  return {
    members: found.slice(0, 8).map((hex) => ({
      rgb: {
        b: Number.parseInt(hex.slice(5, 7), 16),
        g: Number.parseInt(hex.slice(3, 5), 16),
        r: Number.parseInt(hex.slice(1, 3), 16),
      },
    })),
  };
};

/**
 * Which fal endpoint this run actually goes to.
 *
 * Four things decide it and they are checked in order of how much they
 * constrain the answer: a mask needs an inpainting endpoint, a LoRA needs one
 * that loads weights, an explicitly named model is taken at its word, and
 * "auto" falls back to inventing or editing depending on whether a picture was
 * wired in.
 */
const endpointFor = ({
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

const falKey = (): string | null => process.env.FAL_API_KEY?.trim() || null;

export const isFalConfigured = (): boolean => falKey() !== null;

/**
 * Whether this run's endpoint takes a list of images rather than one.
 *
 * The only way a style reference can be sent: it rides in `image_urls` after
 * the subject. Answered here rather than in the run endpoint because the
 * endpoint a run reaches is not the model that was asked for — "auto" with a
 * picture resolves to nano-banana/edit, which takes a list, and a LoRA or a
 * mask resolves to endpoints that take a single `image_url` whatever the row
 * says. The run endpoint asks this before spending anything, and refuses by
 * name when the answer is no.
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

/**
 * Generates an image, or a variation of one, and stores it.
 *
 * `sourceImageUrl` switches models: with one, the prompt describes a change to
 * make to that image; without, it describes an image to invent.
 */
export const generateImage = async (
  prompt: string,
  sourceImageUrl?: string | null,
  /**
   * An explicit fal model id, or null/"auto" to keep choosing by whether a
   * source image is present.
   *
   * Callers pass a value already checked against the `models` table — this is
   * handed straight to fal, so an arbitrary string reaching here would be a
   * paid request to a model that may not exist.
   */
  requestedModel?: string | null,
  /**
   * A black-and-white bitmap confining the repaint to part of the picture:
   * white is redrawn, black is kept.
   *
   * Changes which endpoint is called rather than only what is sent, because
   * inpainting is a separate endpoint on fal rather than a parameter. Ignored
   * without a source image, since there would be nothing to repaint *into*.
   */
  maskUrl?: string | null
): Promise<GeneratedImage> => {
  const key = falKey();
  if (!key) {
    throw new Error("Image generation is not configured");
  }

  // The models are data now, read per request rather than imported: they are
  // edited from the admin, and this function must behave exactly like the node
  // the board is showing, so both read the same rows.
  const models = await loadModelDefs(getSql());

  // A LoRA style is not its own endpoint. They all run on fal-ai/flux-lora and
  // differ only in the weights it loads, so the id chosen on the node is a
  // style name rather than something fal would recognise.
  const lora = falModelLora(models, requestedModel);
  // A mask only means anything applied to a picture, and only where the model
  // has an inpainting endpoint to apply it with.
  const masking = Boolean(
    maskUrl && sourceImageUrl && falModelMasks(models, requestedModel ?? "auto")
  );
  const model = endpointFor({
    hasSourceImage: Boolean(sourceImageUrl),
    lora,
    masking,
    requestedModel: requestedModel ?? null,
  });

  const body = bodyFor(
    lora,
    falModelInput(models, requestedModel ?? "auto"),
    prompt,
    sourceImageUrl,
    // Keyed off the endpoint actually being called, not off what was asked
    // for. "auto" resolves to nano-banana/edit, which takes a list where most
    // take one URL — reading the parameter name off "auto" would send the
    // wrong field on every automatic edit.
    falImageParam(models, model)
  );

  // Inpainting endpoints take the picture as image_url whatever the chosen
  // model normally uses, and the mask beside it.
  if (masking && maskUrl && sourceImageUrl) {
    body.image_url = sourceImageUrl;
    body.image_urls = undefined;
    body.mask_url = maskUrl;
  }

  // A real constraint where the model has one, rather than a request in prose.
  if (PALETTE_MODELS.has(model)) {
    const palette = paletteFrom(prompt);
    if (palette) {
      body.color_palette = palette;
    }
  }

  // The GPT family outputs a preset aspect unless told otherwise: the text
  // model defaults to landscape, and the edit model's "auto" copies the input
  // image's shape — feed it a portrait crop and it returns a portrait, which is
  // how edits started coming back tall. Every other model on the board is
  // square, so ask for square here or a node changes shape with its model. Same
  // endpoint-quirk handling as the palette and mask overrides above.
  if (model === "openai/gpt-image-2" || model === "openai/gpt-image-2/edit") {
    body.image_size = "square";
  }

  const res = await fetch(`https://fal.run/${model}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const json = (await res.json().catch(() => ({}))) as FalResponse;
  if (!res.ok) {
    throw new Error(`Image generation failed (${falDetail(json, res.status)})`);
  }

  // Two response shapes, because fal has two: models that can produce several
  // return `images`, and single-output ones — Recraft's vectoriser, for
  // instance — return `image`. Reading only the list made a perfectly good
  // 200 look like a model that produced nothing.
  const image = json.images?.[0] ?? json.image;
  if (!image?.url) {
    throw new Error("The model returned no image");
  }

  return {
    description: json.description ?? null,
    // The pro model omits dimensions, so these are genuinely optional.
    height: typeof image.height === "number" ? image.height : null,
    url: await persistGenerated(image.url, "boards/ai", image.content_type),
    width: typeof image.width === "number" ? image.width : null,
  };
};

/** Vision model used to read a picture back as words. Cheap and fast. */
const VISION_MODEL = "google/gemini-flash-1.5";

const FOCUS_BRIEF: Record<string, string> = {
  both: "Describe both the subject and the visual style.",
  style:
    "Describe only the visual style. Never mention the specific subject, any people, or any text in the image.",
  subject: "Describe the subject and composition, briefly noting the style.",
};

/**
 * Reads a picture back as a prompt.
 *
 * A caption model would answer "a woman standing in a field", which tells a
 * generator what to draw. What is wanted here is how to draw *anything* — so
 * this asks a vision model for comma-separated phrases about medium, palette,
 * light, composition and rendering, and by default forbids it from naming the
 * subject at all. The result is meant to be wired straight into a prompt.
 */
export const describeImage = async (
  imageUrls: string[],
  focus: string,
  /** What to look for, wired in or typed. Empty means the default reading. */
  instruction: string
): Promise<string> => {
  const key = falKey();
  if (!key) {
    throw new Error("Image analysis is not configured");
  }

  const res = await fetch("https://fal.run/fal-ai/any-llm/vision", {
    body: JSON.stringify({
      image_urls: imageUrls,
      model: VISION_MODEL,
      prompt: [
        imageUrls.length > 1
          ? "These images share a visual style. Describe what they have in common, as one reusable image-generation prompt. Ignore anything true of only one of them."
          : "Describe this image as a reusable image-generation prompt.",
        // Appended rather than replacing the brief: the instruction says what
        // to pay attention to, while the sentence above is what makes the
        // answer a prompt rather than a paragraph about a picture.
        instruction ? `Pay particular attention to: ${instruction}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      system_prompt: `You describe images so their look can be reproduced by an image generator. Reply with a single paragraph of comma-separated descriptive phrases and nothing else — no preamble, no list, no quotation marks. Cover medium, palette, lighting, composition, texture, mood and rendering technique. ${FOCUS_BRIEF[focus] ?? FOCUS_BRIEF.style}`,
    }),
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const json = (await res.json().catch(() => ({}))) as FalResponse & {
    output?: string;
  };
  if (!res.ok) {
    throw new Error(`Image analysis failed (${falDetail(json, res.status)})`);
  }
  const text = json.output?.trim();
  if (!text) {
    throw new Error("The model returned no description");
  }
  return text;
};
