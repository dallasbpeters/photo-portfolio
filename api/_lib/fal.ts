import { persistGenerated } from "./persistGenerated.js";

/**
 * Image generation through fal.ai, running Google's Nano Banana models.
 *
 * Two models, because they do different jobs: the pro model writes an image
 * from a prompt, and the edit model rewrites an image you already have. The
 * edit endpoint takes an array of source images even when there is only one.
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
  height?: number | null;
  url?: string;
  width?: number | null;
}

interface FalResponse {
  description?: string;
  detail?: unknown;
  images?: FalImage[];
}

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
  sourceImageUrl?: string | null
): Promise<GeneratedImage> => {
  const key = falKey();
  if (!key) {
    throw new Error("Image generation is not configured");
  }

  const model = sourceImageUrl ? EDIT_MODEL : TEXT_TO_IMAGE_MODEL;
  const body = sourceImageUrl
    ? { image_urls: [sourceImageUrl], prompt }
    : { prompt };

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
    // fal reports validation problems in `detail`; surface something readable
    // rather than a bare status.
    const detail =
      typeof json.detail === "string" ? json.detail : `status ${res.status}`;
    throw new Error(`Image generation failed (${detail})`);
  }

  const image = json.images?.[0];
  if (!image?.url) {
    throw new Error("The model returned no image");
  }

  return {
    description: json.description ?? null,
    // The pro model omits dimensions, so these are genuinely optional.
    height: typeof image.height === "number" ? image.height : null,
    url: await persistGenerated(image.url, "boards/ai"),
    width: typeof image.width === "number" ? image.width : null,
  };
};
