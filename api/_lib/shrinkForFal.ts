import sharp from "sharp";
import { FAL_MAX_BYTES, overFalLimit, SHRINK_STEPS } from "./falLimits.js";
import { persistBytes } from "./persistGenerated.js";

/**
 * A picture small enough for fal to fetch.
 *
 * fal refuses a source over five megabytes — "File size exceeds the maximum
 * allowed size of 5242880 bytes" — and refuses it as a failed generation
 * rather than as a rejected input, so it reads as the model breaking. Nothing
 * on a board hints at the cause either: the picture looks the same at four
 * megabytes and at six.
 *
 * It is not a rare shape. A high-resolution PNG straight out of a generator
 * clears it easily, and three of the twenty-five most recent pictures on these
 * boards are over — every one of them a PNG, because PNG is where the size
 * goes.
 *
 * So an oversized source is re-encoded on the way out. Only on the way out:
 * what is stored stays exactly as it was, because the full-size picture is the
 * one worth keeping and the shrink is a fact about one API's limit rather than
 * about the work.
 */

/** The content-length at a URL, or null when the server does not say. */
const sizeOf = async (url: string): Promise<number | null> => {
  try {
    const head = await fetch(url, { method: "HEAD" });
    const length = Number(head.headers.get("content-length"));
    return Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  }
};

/**
 * One rung of the ladder, encoded.
 *
 * Transparency decides the format, and it decides it rather than a preference
 * for size. JPEG is far smaller and has no alpha channel, so a cut-out
 * re-encoded as JPEG comes back with a black rectangle behind it — which would
 * turn a fixed size limit into a silently ruined picture, a worse bug than the
 * one being fixed. A picture with alpha stays a PNG and pays for it in pixels
 * instead.
 */
const encoded = async (
  input: Buffer,
  step: { quality: number; side: number },
  hasAlpha: boolean
): Promise<{ bytes: Buffer; type: string }> => {
  const resized = sharp(input).resize({
    fit: "inside",
    height: step.side,
    width: step.side,
    withoutEnlargement: true,
  });
  if (hasAlpha) {
    return {
      bytes: await resized.png({ compressionLevel: 9 }).toBuffer(),
      type: "image/png",
    };
  }
  return {
    bytes: await resized.jpeg({ quality: step.quality }).toBuffer(),
    type: "image/jpeg",
  };
};

/**
 * Remembered per process, like the SVG rasteriser's.
 *
 * A batch wires the same frame into several runs and an Iterate node runs the
 * same picture many times over; without this, one oversized reference is
 * downloaded and re-encoded once per job.
 */
export const SHRUNK_CACHE = new Map<string, string>();

/**
 * The same picture at a size fal will accept, or the original URL untouched.
 *
 * Never throws. A picture that cannot be measured, downloaded or re-encoded is
 * handed on as it came: the run then fails at fal exactly as it does today,
 * which is no worse, whereas failing here would break every run that merely
 * could not be checked.
 */
export const shrinkForFal = async (url: string): Promise<string> => {
  const cached = SHRUNK_CACHE.get(url);
  if (cached) {
    return cached;
  }
  if (!overFalLimit(await sizeOf(url))) {
    return url;
  }
  try {
    const fetched = await fetch(url);
    if (!fetched.ok) {
      return url;
    }
    const original = Buffer.from(await fetched.arrayBuffer());
    const { hasAlpha } = await sharp(original).metadata();

    for (const step of SHRINK_STEPS) {
      // Sequential on purpose: each rung is only tried because the one above
      // it did not fit, so there is nothing here to run in parallel.
      // biome-ignore lint/performance/noAwaitInLoops: each rung depends on the last not fitting
      const { bytes, type } = await encoded(original, step, Boolean(hasAlpha));
      if (bytes.byteLength <= FAL_MAX_BYTES) {
        const stored = await persistBytes(bytes, "boards/ai", type);
        SHRUNK_CACHE.set(url, stored);
        return stored;
      }
    }
    return url;
  } catch {
    return url;
  }
};
