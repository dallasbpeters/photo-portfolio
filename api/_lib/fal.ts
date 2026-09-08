import {
  type FalModelDef,
  FLUX_INPAINT_ENDPOINT,
  FLUX_LORA_INPAINT_ENDPOINT,
  falImageParam,
  falLoraEndpoint,
  falModelInput,
  falModelLora,
  falModelMasks,
} from "../../config/falModels.js";
import {
  applyFalParams,
  type GenerationParams,
} from "../../config/nodes/falParams.js";
import { bodyFor } from "./falBody.js";
import { PALETTE_MODELS, paletteFrom, paletteOf } from "./falPalette.js";
import { loadModelDefs } from "./modelStore.js";
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

export const falKey = (): string | null =>
  process.env.FAL_API_KEY?.trim() || null;

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
  maskUrl?: string | null,
  /**
   * Size, output format and quality, as the node's panel set them.
   *
   * Absent — and every field "auto" — reproduces the behaviour that existed
   * before these controls did, which is what makes them safe to add to a call
   * that spends money. See applyParams.
   */
  params?: GenerationParams
): Promise<GeneratedImage> => {
  const key = falKey();
  if (!key) {
    throw new Error("Image generation is not configured");
  }

  // The models are data now, read per request rather than imported: they are
  // edited from the admin, and this function must behave exactly like the node
  // the board is showing, so both read the same rows.
  const models = await loadModelDefs();

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

  /*
   * A real constraint where the model has one, rather than a request in prose.
   *
   * Taken from the parameters first and the prompt second. The prompt used to be
   * the only source — the hexes were scraped back out of it — and that stopped
   * working the moment prompts started describing colours in words instead of
   * listing them, which they now do because a model that letters well drew the
   * hex codes onto the picture. The scrape stays as a fallback for a prompt
   * somebody typed hex into by hand.
   */
  if (PALETTE_MODELS.has(model)) {
    const palette = paletteOf(params?.palette ?? []) ?? paletteFrom(prompt);
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

  // Last, so an explicit choice on the node wins over the defaults above —
  // including the square this function has always forced on the GPT family.
  // Somebody who has gone to the panel and picked portrait means it.
  applyFalParams(body, model, params);

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
