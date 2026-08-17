import type { BoardItemVariation } from "../types";

/**
 * Telling a clip from a picture.
 *
 * Two questions, because two places ask it with different things in hand: a
 * node's result carries what it is, and an item pinned to the canvas carries
 * only an address.
 */

/** Suffixes worth treating as video. Hoisted so it is compiled once. */
const VIDEO_EXTENSION = /\.(mp4|webm|mov|m4v)$/i;

/**
 * Whether an address points at a clip, for the places that have only the URL.
 *
 * An item dragged onto the canvas becomes a `reference` holding an `imageUrl`
 * and nothing else — the `kind: "video"` a result carries does not survive the
 * drag. So this reads the address instead.
 *
 * Keyed first on where the file is stored, the same trick `isIcon` uses in
 * BoardItemView and for the same reason: our own blobs are filed by purpose,
 * and that is more dependable than a suffix a signed or proxied URL may not
 * carry. The extension is checked as well, for a clip adopted from elsewhere,
 * where the path means nothing to us.
 */
export const isVideoUrl = (url: string | null | undefined): boolean => {
  if (!url) {
    return false;
  }
  if (url.includes("/boards/video/")) {
    return true;
  }
  // A query string is ordinary on a signed URL, so only the path is tested.
  return VIDEO_EXTENSION.test(url.split("?")[0] ?? "");
};

/**
 * Whether a stored version is a clip rather than a picture.
 *
 * Prefers what the result says it is: api/boards/[id]/video.ts writes
 * `kind: "video"` onto both the result and every variation for exactly this
 * read, and guessing wrong renders an mp4 into an `<img>` — a broken-image
 * icon for a generation that worked and was paid for.
 */
export const isVideo = (variation: BoardItemVariation): boolean =>
  (variation as { kind?: unknown }).kind === "video" ||
  isVideoUrl(variation.url);
