import {
  falImageParam,
  falModelInput,
  falModelLora,
  falModelMasks,
} from "../../config/falModels.js";
import {
  applyFalParams,
  type GenerationParams,
} from "../../config/nodes/falParams.js";
import {
  describeWithClaude,
  isClaudeVisionConfigured,
} from "./claudeVision.js";
import { describePrompt, describeSystemPrompt } from "./describePrompt.js";
import { applyEndpointQuirks, bodyFor } from "./falBody.js";
import { endpointFor } from "./falEndpoint.js";
import { loadModelDefs } from "./modelStore.js";
import { persistGenerated } from "./persistGenerated.js";

/**
 * Image generation through fal.ai.
 *
 * Which endpoint a run reaches — including the *automatic* choice between
 * inventing an image and rewriting one — is decided in falEndpoint.ts, where
 * it can be tested; this file holds the key, the call and the storing.
 *
 * A caller may instead name any model on the list in the `models` table — the
 * same table the node's picker is built from, so the two cannot drift —
 * including Recraft's vector models, which is why the request body is built
 * from the model's declared input shape rather than from whether an image
 * happens to be present. Those endpoints disagree about their parameters, and
 * fal only says so after the call has been billed.
 */
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

export const falKey = (): string | null =>
  process.env.FAL_API_KEY?.trim() || null;

export const isFalConfigured = (): boolean => falKey() !== null;

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
    params?.restyle ?? undefined,
    // Keyed off the endpoint actually being called, not off what was asked
    // for. "auto" resolves to nano-banana/edit, which takes a list where most
    // take one URL — reading the parameter name off "auto" would send the
    // wrong field on every automatic edit.
    falImageParam(models, model),
    // Only ever non-empty when the resolved endpoint takes a list; jobsFor
    // asks falAcceptsImageList the same question before it fills this in.
    params?.blendWith ?? []
  );

  // The endpoints that want something other than their declared shape. Three
  // separate quirks, applied together and away from here — see falBody.ts.
  applyEndpointQuirks(body, model, {
    masking,
    maskUrl,
    palette: params?.palette ?? [],
    prompt,
    sourceImageUrl,
  });

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
  const system = describeSystemPrompt(focus);
  const prompt = describePrompt(imageUrls, instruction);

  /*
   * Claude first, fal only if federation is not set up here.
   *
   * fal-ai/any-llm/vision is marked "no longer supported", so the fal path is
   * a fallback rather than a peer: it exists for a deployment that has no
   * workload identity configured, and it will stop working on fal's schedule
   * rather than ours. A failure from Claude is *not* caught and retried
   * against it — a provider that is answering badly should surface, not be
   * quietly papered over by one that is deprecated.
   */
  if (await isClaudeVisionConfigured()) {
    return await describeWithClaude(imageUrls, system, prompt);
  }

  const key = falKey();
  if (!key) {
    throw new Error("Image analysis is not configured");
  }

  const res = await fetch("https://fal.run/fal-ai/any-llm/vision", {
    body: JSON.stringify({
      image_urls: imageUrls,
      model: VISION_MODEL,
      prompt,
      system_prompt: system,
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
