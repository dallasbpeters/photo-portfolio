import {
  type FalModelInput,
  FLUX_LORA_ENDPOINT,
  falModelInput,
  falModelLora,
} from "../../config/nodeTypes.js";
import { persistGenerated } from "./persistGenerated.js";

/**
 * Image generation through fal.ai.
 *
 * The two constants below are the *automatic* choice, and they do different
 * jobs: the pro model writes an image from a prompt, the edit model rewrites
 * one you already have, and the edit endpoint takes an array of source images
 * even when there is only one.
 *
 * A caller may instead name any model on the allowlist in
 * config/nodeTypes.ts — including Recraft's vector models, which is why the
 * request body is built from the model's declared input shape rather than from
 * whether an image happens to be present. Those endpoints disagree about their
 * parameters, and fal only says so after the call has been billed.
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
 * has been billed — so the shape comes from the model's declared input in
 * config/nodeTypes.ts rather than from whether an image happens to be present.
 */
const bodyFor = (
  lora: ReturnType<typeof falModelLora>,
  shape: FalModelInput,
  prompt: string,
  sourceImageUrl?: string | null
): Record<string, unknown> => {
  if (lora) {
    // The trigger token is prepended rather than left to be remembered. A LoRA
    // is trained against one, and a prompt without it quietly returns the base
    // model — which looks like the style simply not working.
    return {
      loras: [{ path: lora.path, scale: lora.scale }],
      prompt: prompt.toLowerCase().includes(lora.trigger.toLowerCase())
        ? prompt
        : `${lora.trigger}, ${prompt}`,
    };
  }
  if (shape === "image") {
    // A vectoriser traces an image; it has no prompt to speak of.
    if (!sourceImageUrl) {
      throw new Error("This model needs an image wired into it");
    }
    return { image_url: sourceImageUrl };
  }
  if (shape === "prompt-and-image") {
    // Both required, and the image singular. Refused here as well as in the
    // run endpoint, since this function is reachable from api/ai/generate.ts
    // too and fal bills before it validates.
    if (!sourceImageUrl) {
      throw new Error("This model needs an image wired into it");
    }
    return { image_url: sourceImageUrl, prompt };
  }
  if (shape === "prompt") {
    // Text-to-image and text-to-vector. Any wired image is deliberately not
    // sent — these endpoints do not take one.
    return { prompt };
  }
  return sourceImageUrl ? { image_urls: [sourceImageUrl], prompt } : { prompt };
};

const falKey = (): string | null => process.env.FAL_API_KEY?.trim() || null;

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
   * Callers pass a value already checked against the allowlist in
   * config/nodeTypes.ts — this is handed straight to fal, so an arbitrary
   * string reaching here would be a paid request to a model that may not exist.
   */
  requestedModel?: string | null
): Promise<GeneratedImage> => {
  const key = falKey();
  if (!key) {
    throw new Error("Image generation is not configured");
  }

  // A LoRA style is not its own endpoint. They all run on fal-ai/flux-lora and
  // differ only in the weights it loads, so the id chosen on the node is a
  // style name rather than something fal would recognise.
  const lora = falModelLora(requestedModel);
  const named =
    requestedModel && requestedModel !== "auto" ? requestedModel : null;
  const auto = sourceImageUrl ? EDIT_MODEL : TEXT_TO_IMAGE_MODEL;
  let model = auto;
  if (lora) {
    model = FLUX_LORA_ENDPOINT;
  } else if (named) {
    model = named;
  }

  const body = bodyFor(
    lora,
    falModelInput(requestedModel ?? "auto"),
    prompt,
    sourceImageUrl
  );

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
