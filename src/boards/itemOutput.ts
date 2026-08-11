import type { BoardItem, BoardItemVariation } from "../types";

/**
 * Drag-and-drop type for an image pulled off a node.
 *
 * Board-specific so the canvas can tell it apart from a file dropped in from
 * the desktop, which is a different act with a different cost — one uploads,
 * the other already lives in our own storage and only needs pinning.
 */
export const BOARD_IMAGE_TYPE = "application/x-board-image";

/**
 * What an item shows, and what it hands down a wire.
 *
 * Shared rather than kept inside the node view, because two places now need it
 * — the node draws its gallery, and the canvas resolves what a wire is carrying
 * — and the fallback chain below is exactly the sort of thing that goes wrong
 * when it is written twice. It already did once: a node that read only the
 * newest shape stranded every result saved before that shape existed.
 */

/**
 * Every image a node has to show, newest shape first.
 *
 * `history` is everything it has made. `variations` covers a run that finished
 * before history existed, and the bare `url` covers results saved before either
 * did — an image already paid for should never be stranded in the database
 * because the shape around it moved on.
 */
export const pickImages = (
  stored: BoardItem["result"]
): BoardItemVariation[] => {
  if (stored?.history?.length) {
    return stored.history;
  }
  if (stored?.variations?.length) {
    return stored.variations;
  }
  return stored?.url ? [stored as BoardItemVariation] : [];
};

/** Which stored version the node is showing; the first until one is picked. */
export const selectedIndex = (config: Record<string, unknown>): number =>
  typeof config.selectedVersion === "number" ? config.selectedVersion : 0;

/**
 * The single image this item sends downstream, or null if it has none yet.
 *
 * A generated node offers the version currently chosen on it, so picking a
 * different one in the gallery re-styles whatever it feeds without any further
 * action — the selection is the answer to "which of these did you mean", and it
 * should mean the same thing everywhere. Mirrors what the run endpoint does
 * server-side when it resolves an upstream node's output.
 */
export const outputImageOf = (item: BoardItem): string | null => {
  if (item.kind === "photo" || item.kind === "reference") {
    return item.imageUrl ?? null;
  }
  if (item.kind !== "op") {
    return null;
  }
  const images = pickImages(item.result).filter((image) => Boolean(image?.url));
  if (images.length === 0) {
    return null;
  }
  const chosen = images[selectedIndex(item.config ?? {})] ?? images[0];
  return chosen?.url ?? null;
};
