import { portfolioService } from "../../services/portfolioService.js";
import type { BoardItem } from "../../types.js";
import { maskOf, naturalSizeOf, rasterizeMask } from "../mask.js";
import { imageOf } from "./itemContext.js";

/**
 * The painted mask, as a bitmap a generator can fetch.
 *
 * Rendered here rather than as the strokes are painted. A stroke is one of
 * many, and uploading a bitmap per stroke would spend a request on every brush
 * movement — a run is the first moment the mask has to exist as a picture. The
 * same reasoning, and the same cache, as `flushBeforeRun` on the graph-run
 * path; this is the tool-bar half of it.
 *
 * Sized to the picture the mask was painted over, which is `imageOf` — the
 * newest version, not the original. The strokes are stored in unit space
 * exactly so this can be done at whatever size the source turns out to be, and
 * a mask built at the wrong size is either rejected by fal or silently
 * stretched across the picture.
 */

/**
 * A bitmap already rendered for this item, when it is still the right one.
 *
 * `config.maskUrl` is cleared by BoardEditor on every mask edit, so it always
 * matches the strokes. It does not always match the *picture*: it is rendered
 * against `item.imageUrl` on the graph-run path, while a tool works from the
 * newest result. Reused across that difference it is a mask at the original's
 * pixel size laid over a result of another, which fal either rejects or
 * silently stretches — and a stretched mask reads as a tool that repainted the
 * wrong part of the picture.
 */
const cachedUrl = (item: BoardItem, source: string): string | null => {
  if (source !== item.imageUrl) {
    return null;
  }
  const stored = item.config?.maskUrl;
  return typeof stored === "string" && stored ? stored : null;
};

/**
 * The URL to send, or null when this item has no mask to send.
 *
 * Rejects rather than resolving null when a mask exists but cannot be built:
 * the two mean opposite things to the runner, which reads "no mask" as grounds
 * to refuse a tool that needs one, and would report that a mask was never
 * painted when in truth the upload failed.
 */
export const maskBitmapUrl = async (
  item: BoardItem
): Promise<string | null> => {
  const mask = maskOf(item.config);
  if (!mask) {
    return null;
  }
  const source = imageOf(item);
  if (!source) {
    return null;
  }
  const cached = cachedUrl(item, source);
  if (cached) {
    return cached;
  }
  const size = await naturalSizeOf(source);
  const blob = await rasterizeMask(mask, size);
  const { url } = await portfolioService.uploadImageFile(
    new File([blob], "mask.png", { type: "image/png" })
  );
  return url;
};
