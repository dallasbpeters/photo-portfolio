/**
 * The remote executor: it asks a model, and it invents no API to do it.
 *
 * Everything here goes through `aiApi.generate`, which is POST /api/ai/generate
 * — the endpoint that already exists, is already admin-gated, and already
 * returns a URL on our own blob host rather than fal's expiring one. It takes
 * exactly two things: `{ prompt, sourceImageUrl }`.
 *
 * ## What that endpoint cannot do, and what is done about it
 *
 * `generateImage` in api/_lib/fal.ts takes four arguments — prompt, source
 * image, requested model, mask — and routes between a text-to-image model, an
 * edit model, an inpainting endpoint and LoRA weights on the strength of the
 * last two. `/api/ai/generate` forwards only the first two. So from the client:
 *
 * - **A mask cannot be sent.** There is no `maskUrl` in the request body.
 * - **A model cannot be chosen.** Every call resolves through `endpointFor` to
 *   nano-banana/edit (with an image) or the text-to-image default (without).
 *
 * Both are refused here rather than dropped. Sending a masked invocation to an
 * endpoint that ignores masks produces a fully repainted picture, a full bill,
 * and a result indistinguishable from a mask that was painted wrong — which is
 * precisely the reasoning `maskRefusal` in api/boards/[id]/run.ts sets out for
 * refusing rather than proceeding. The `replace-area` and `restyle` tools are
 * registered as "planned" for this reason and not because the executor is
 * unfinished.
 *
 * The board run endpoint (`boardsApi.runNode`) *does* support both, but it is a
 * different thing: it runs a saved `op` node against its wired graph inputs,
 * needs a board id and an item that is a node, and skips on an unchanged
 * fingerprint. A bar acting on a selected photograph has none of that.
 */

import { aiApi, type GeneratedImage } from "../../services/portfolioService.js";
import { appendVariation } from "./history.js";
import {
  failed,
  type ToolExecutor,
  type ToolInvocation,
  type ToolOutcome,
} from "./types.js";

/** Tools this executor actually calls the service for. See the header. */
const IMPLEMENTED = new Set(["edit-image", "generate-image"]);

/**
 * Tools that need a request field /api/ai/generate does not have, with the
 * sentence to say about each. Separated from the merely-unbuilt so the message
 * names the real obstacle — "not built yet" would send someone looking in this
 * file for the missing branch.
 */
const BLOCKED_ON_ENDPOINT: Record<string, string> = {
  "replace-area":
    "Painting into part of an image needs the mask to reach the generator, and the image endpoint does not take one yet.",
  restyle:
    "Choosing a style needs the model to reach the generator, and the image endpoint does not take one yet.",
};

/** Matches MAX_PROMPT in api/ai/generate.ts, which truncates silently past it. */
const MAX_PROMPT = 1200;

/**
 * Whether a tool works from the item's picture or from nothing.
 *
 * The distinction is the endpoint's own: with a source image the prompt
 * describes a change to make, without one it describes an image to invent.
 * Getting it backwards is not an error anywhere — it just quietly produces the
 * wrong kind of picture.
 */
const USES_SOURCE_IMAGE = new Set(["edit-image"]);

const CANCELLED_MESSAGE = "Cancelled before it finished.";

/**
 * The model the tool was asked to use, if any.
 *
 * Read off `config`, where the registry's settings land, and null when the tool
 * declares no model setting or nothing was chosen — the endpoint then keeps its
 * own default. Not validated here: the server checks it against the models
 * table, because that is the side that pays for a wrong answer.
 */
const modelOf = (invocation: ToolInvocation): string | null => {
  const chosen = invocation.config.model;
  return typeof chosen === "string" && chosen.trim() ? chosen.trim() : null;
};

/**
 * Rejects as soon as the signal fires.
 *
 * `aiApi.generate` takes no `AbortSignal`, so this abandons the *wait* and not
 * the request: the generation carries on server-side and is billed. Worth
 * saying plainly rather than implying a cancel that did not happen. Giving
 * `aiApi.generate` a signal parameter — `runNode` already has one — is the fix,
 * and is a change to portfolioService rather than to this file.
 */
const raceAbort = <T>(work: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) {
    return work;
  }
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException(CANCELLED_MESSAGE, "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => reject(new DOMException(CANCELLED_MESSAGE, "AbortError")),
        { once: true }
      );
    }),
  ]);
};

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const TIMEOUT_MESSAGE = /timeout|timed out|abort/i;

/**
 * A service failure, turned into something actionable.
 *
 * The endpoint's own messages are already written for a person — "Image
 * generation is not configured. Set FAL_API_KEY on the project.", "The model
 * returned no image" — so they are passed through rather than replaced with a
 * generic sentence that throws away the useful one.
 */
const serviceFailure = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message.trim() : "";
  if (!message) {
    return failed("network", "The generator could not be reached.", {
      cause,
      hint: "Check your connection and try again.",
    });
  }
  const timedOut = TIMEOUT_MESSAGE.test(message);
  return failed("service", message, {
    cause,
    ...(timedOut
      ? { hint: "It took too long. Running it again often works." }
      : {}),
  });
};

const sourceUrlOf = (invocation: ToolInvocation): string | null => {
  const { item } = invocation.target;
  return item.result?.url ?? item.imageUrl ?? null;
};

/** Injectable so the contract can be tested without spending anything. */
export interface AiDeps {
  generate: (
    prompt: string,
    sourceImageUrl: string | null,
    model: string | null
  ) => Promise<GeneratedImage>;
  now: () => number;
}

const DEFAULTS: AiDeps = {
  generate: (prompt, sourceImageUrl, model) =>
    aiApi.generate(prompt, sourceImageUrl, model),
  now: () => Date.now(),
};

/**
 * The prompt, from the invocation or from the tool's own setting.
 *
 * Two places because two surfaces: the bar collects settings, and a slash
 * command types the words straight in. Whichever arrived is trimmed and cut to
 * the endpoint's ceiling here, so an over-long prompt is shortened knowingly
 * rather than by the server without telling anyone.
 */
const promptFrom = (invocation: ToolInvocation): string => {
  const typed = invocation.prompt ?? invocation.config.prompt;
  return (typeof typed === "string" ? typed : "").trim().slice(0, MAX_PROMPT);
};

const refuse = (invocation: ToolInvocation) => {
  const { tool } = invocation;
  const blocked = BLOCKED_ON_ENDPOINT[tool.id];
  if (blocked) {
    return failed("unsupported", blocked);
  }
  if (!IMPLEMENTED.has(tool.id)) {
    return failed("unsupported", `${tool.label} is not built yet.`, {
      hint: "It is listed so you can see it is coming.",
    });
  }
  if (invocation.maskUrl) {
    // A mask on a tool that never declared it needs one still cannot be
    // honoured, and silently ignoring it is the failure this whole branch is
    // about. Refuse, and say which it is.
    return failed(
      "unsupported",
      `${tool.label} cannot paint into part of an image.`,
      { hint: "Clear the mask, or use a Generate node on the board." }
    );
  }
  return null;
};

const run = async (
  invocation: ToolInvocation,
  deps: AiDeps
): Promise<ToolOutcome> => {
  const { target, tool } = invocation;
  const startedAt = deps.now();

  const refusal = refuse(invocation);
  if (refusal) {
    return refusal;
  }

  const prompt = promptFrom(invocation);
  if (!prompt) {
    return failed(
      "missing-input",
      `${tool.label} needs a description of what you want.`
    );
  }

  const wantsImage = USES_SOURCE_IMAGE.has(tool.id);
  const sourceImageUrl = wantsImage ? sourceUrlOf(invocation) : null;
  if (wantsImage && !sourceImageUrl) {
    return failed(
      "missing-input",
      `${tool.label} works from an existing image, and this item has none.`,
      { hint: "Use Generate to make one from the description alone." }
    );
  }

  if (invocation.signal?.aborted) {
    return failed("cancelled", CANCELLED_MESSAGE);
  }

  // No fraction: waiting on a model has no measurable extent, and a bar that
  // creeps to 90% and sits there is a lie told slowly.
  invocation.onProgress?.({
    fraction: null,
    message: wantsImage ? "Sending the image…" : "Sending the prompt…",
    phase: "preparing",
  });

  let image: GeneratedImage;
  try {
    invocation.onProgress?.({
      fraction: null,
      message: "Waiting on the model…",
      phase: "running",
    });
    image = await raceAbort(
      deps.generate(prompt, sourceImageUrl, modelOf(invocation)),
      invocation.signal
    );
  } catch (cause) {
    if (isAbort(cause)) {
      return failed("cancelled", CANCELLED_MESSAGE);
    }
    return serviceFailure(cause);
  }

  if (!image?.url) {
    return failed("service", "The model finished but produced no image.", {
      hint: "Running it again with a different description often works.",
    });
  }

  // Nothing to upload: the endpoint already persisted the result to our own
  // blob store, precisely because fal's links expire under the board.
  invocation.onProgress?.({ fraction: 1, message: "Done", phase: "storing" });

  const ranAt = new Date().toISOString();
  const variation = {
    description: image.description,
    height: image.height,
    isVector: false,
    url: image.url,
    width: image.width,
  };

  return {
    durationMs: deps.now() - startedAt,
    ok: true,
    ranAt,
    result: appendVariation(target.item.result, variation, {
      itemImageUrl: target.item.imageUrl,
      ranAt,
    }),
    toolId: tool.id,
    variation,
  };
};

export const createAiExecutor = (
  overrides: Partial<AiDeps> = {}
): ToolExecutor => {
  const deps: AiDeps = { ...DEFAULTS, ...overrides };
  return async (invocation) => {
    try {
      return await run(invocation, deps);
    } catch (cause) {
      return failed(
        "internal",
        `${invocation.tool.label} failed unexpectedly.`,
        { cause }
      );
    }
  };
};

export const aiExecutor: ToolExecutor = createAiExecutor();
