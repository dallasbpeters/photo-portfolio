/**
 * The local executor: deterministic pixel work, done in this browser.
 *
 * Nothing here asks a model for anything, so nothing here can be slow in an
 * interesting way, cost money, or come back different the second time. The one
 * network call is the upload at the end, which is not part of the operation —
 * it is where the operation's output is put so it outlives the tab. That is why
 * it gets its own progress phase rather than hiding inside "running".
 *
 * The geometry is `applyTransform` from src/editor/engine/export.ts, unchanged
 * and uncopied. It is the same code the photo editor's crop and rotate export
 * runs through, it has a regression test covering the axis transposition that
 * was wrong in it once already, and a second implementation of "rotate an
 * image" in this file would be a second chance to get that wrong.
 */

import {
  applyTransform,
  formatBytes,
  MAX_UPLOAD_BYTES,
} from "../../editor/engine/export.js";
import { portfolioService } from "../../services/portfolioService.js";
import { appendVariation } from "./history.js";
import {
  failed,
  type ToolExecutor,
  type ToolInvocation,
  type ToolOutcome,
  type ToolProgress,
} from "./types.js";

/**
 * Tools this executor actually implements.
 *
 * Checked by id rather than by `status`, so a tool marked "ready" in the
 * registry that has no branch here is refused loudly instead of falling
 * through to a silent no-op. The registry and the executor are edited by
 * different hands and this is where they are made to agree.
 */
const IMPLEMENTED = new Set(["rotate-right", "rotate-left"]);

/** Where a tool's output is filed in the blob store. */
const BLOB_PREFIX = "boards/tools";

/**
 * PNG only where transparency could be lost.
 *
 * A rotated JPEG re-encoded as PNG is several times the size for no gain, and
 * /api/upload refuses anything over 8MB — the same trade-off DEFAULT_EXPORT
 * makes in the photo editor, decided per image here because a board holds both
 * photographs and cut-out drawings.
 */
const ALPHA_FORMATS = /\.(png|webp|svg)($|\?)/i;

const JPEG_QUALITY = 0.92;

/** Injectable so the contract can be tested without a network or a real image. */
export interface TransformDeps {
  loadImage: (url: string) => Promise<HTMLImageElement>;
  now: () => number;
  persist: (blob: Blob, filename: string) => Promise<string>;
}

/**
 * `crossOrigin` matters: the blob store is a different origin, and without it
 * the canvas is tainted and `toBlob` throws a SecurityError several steps later
 * with nothing in the message about where it came from.
 */
const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The image could not be loaded from its address"));
    image.src = url;
  });

const persist = async (blob: Blob, filename: string): Promise<string> => {
  const { url } = await portfolioService.uploadImageFile(
    new File([blob], filename, { type: blob.type }),
    undefined,
    BLOB_PREFIX
  );
  return url;
};

const DEFAULTS: TransformDeps = { loadImage, now: () => Date.now(), persist };

const report = (invocation: ToolInvocation, progress: ToolProgress): void => {
  invocation.onProgress?.(progress);
};

/** The image a tool operates on: the newest version, or the item's own. */
const sourceUrlOf = (invocation: ToolInvocation): string | null => {
  const { item } = invocation.target;
  return item.result?.url ?? item.imageUrl ?? null;
};

const toCanvas = (image: HTMLImageElement): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot draw to a canvas");
  }
  context.drawImage(image, 0, 0);
  return canvas;
};

const encode = (
  canvas: HTMLCanvasElement,
  type: string
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, type, JPEG_QUALITY);
  });

/** Degrees from the tool's config, defaulted by `withDefaults` before it got here. */
const degreesFrom = (config: Readonly<Record<string, unknown>>): number => {
  const value = config.degrees;
  return typeof value === "number" && Number.isFinite(value) ? value : 90;
};

/**
 * Whether the run was called off.
 *
 * Checked at every phase boundary rather than only at the start: the load and
 * the upload are the two slow parts, and a cancel that only takes effect
 * before either of them is not a cancel.
 */
const cancelled = (invocation: ToolInvocation): boolean =>
  invocation.signal?.aborted === true;

const CANCELLED_MESSAGE = "Cancelled before it finished.";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the phases are sequential and each guards the next; splitting them would hide the ordering this whole contract is about
const run = async (
  invocation: ToolInvocation,
  deps: TransformDeps
): Promise<ToolOutcome> => {
  const { target, tool } = invocation;
  const startedAt = deps.now();

  if (!IMPLEMENTED.has(tool.id)) {
    return failed("unsupported", `${tool.label} is not built yet.`, {
      hint: "It is listed so you can see it is coming.",
    });
  }

  const sourceUrl = sourceUrlOf(invocation);
  if (!sourceUrl) {
    return failed(
      "missing-input",
      `${tool.label} needs an image, and this item has none.`
    );
  }

  if (cancelled(invocation)) {
    return failed("cancelled", CANCELLED_MESSAGE);
  }

  report(invocation, {
    fraction: 0,
    message: "Reading the image…",
    phase: "preparing",
  });

  let source: HTMLCanvasElement;
  try {
    source = toCanvas(await deps.loadImage(sourceUrl));
  } catch (cause) {
    return failed(
      "network",
      "The image could not be read. It may have moved, or the connection dropped.",
      { cause, hint: "Try again in a moment." }
    );
  }

  if (cancelled(invocation)) {
    return failed("cancelled", CANCELLED_MESSAGE);
  }

  report(invocation, {
    fraction: 0.35,
    message: `${tool.label}…`,
    phase: "running",
  });

  let blob: Blob | null;
  const type = ALPHA_FORMATS.test(sourceUrl) ? "image/png" : "image/jpeg";
  let output: HTMLCanvasElement;
  try {
    output = applyTransform(source, {
      crop: null,
      rotation: degreesFrom(invocation.config),
    });
    blob = await encode(output, type);
  } catch (cause) {
    return failed(
      "internal",
      `${tool.label} could not be applied to this image.`,
      { cause }
    );
  }

  if (!blob) {
    return failed(
      "internal",
      "The rotated image could not be encoded by this browser."
    );
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    return failed(
      "unsupported",
      `The result is ${formatBytes(blob.size)}, over the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit.`,
      { hint: "Use a smaller version of this image." }
    );
  }

  if (cancelled(invocation)) {
    return failed("cancelled", CANCELLED_MESSAGE);
  }

  report(invocation, {
    fraction: 0.7,
    message: "Saving…",
    phase: "storing",
  });

  let url: string;
  try {
    url = await deps.persist(
      blob,
      `${tool.id}.${type === "image/png" ? "png" : "jpg"}`
    );
  } catch (cause) {
    return failed(
      "network",
      cause instanceof Error && cause.message
        ? cause.message
        : "The result could not be saved.",
      { cause, hint: "The change was made but not kept. Try again." }
    );
  }

  report(invocation, {
    fraction: 1,
    message: "Done",
    phase: "storing",
  });

  const ranAt = new Date().toISOString();
  const variation = {
    description: target.item.result?.description ?? null,
    height: output.height,
    isVector: false,
    url,
    width: output.width,
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

/**
 * Builds an executor over the given dependencies.
 *
 * Exported so a test can supply a fake loader and a fake store and still run
 * the real geometry and the real contract. Nothing in the app calls this; it
 * calls `transformExecutor` below.
 */
export const createTransformExecutor = (
  overrides: Partial<TransformDeps> = {}
): ToolExecutor => {
  const deps: TransformDeps = { ...DEFAULTS, ...overrides };
  return async (invocation) => {
    try {
      return await run(invocation, deps);
    } catch (cause) {
      // The contract says an executor never throws. This is the net under it:
      // a bug here becomes a reported failure rather than an unhandled
      // rejection that leaves the bar spinning forever.
      return failed(
        "internal",
        `${invocation.tool.label} failed unexpectedly.`,
        {
          cause,
        }
      );
    }
  };
};

export const transformExecutor: ToolExecutor = createTransformExecutor();
