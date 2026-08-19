/**
 * Asking for an image at roughly the size it will be drawn.
 *
 * A board item is resized freely, so there is no stable width to request — which
 * is why the canvas has always asked for the original and let the browser scale
 * it. That is cheap to write and expensive to run: a board measured at 17 images
 * pulled 34 MB to fill about 5 megapixels of boxes, because the sources are
 * 1930×1889 and drawn at roughly 550×550. Thirteen times more pixels than are
 * shown, decoded and held in memory for every one of them.
 *
 * Two rules make a stable request out of an unstable size.
 *
 * **Buckets.** A width is rounded up to the next rung of the ladder that
 * `vercel.json` already declares, so dragging a corner changes the number by a
 * few pixels a frame and changes the *request* not at all. Only crossing a rung
 * asks for anything new.
 *
 * **The ratchet.** A bucket only ever grows. Shrinking an item keeps the larger
 * image it already has, because re-requesting a smaller one would swap a decoded
 * image for a pending one and flicker — the exact objection that kept the canvas
 * on originals. Growing is the only direction that can look wrong if ignored,
 * and it is the direction that costs a request.
 *
 * Together they make mipmapping, which is what a renderer that does this
 * properly has always done: keep a few sizes, pick the nearest one above.
 */

/**
 * The widths the image optimizer is configured to emit.
 *
 * Mirrors `images.sizes` in vercel.json. Asking for a width that is not on this
 * list is served, but as a separate cache entry — so a canvas that asked for
 * whatever a drag happened to land on would fill the cache with near-duplicates
 * and hit a cold miss on nearly every one.
 */
export const IMAGE_WIDTHS = [
  256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
] as const;

/** The largest rung. Anything past it is served at the source's own size. */
const LARGEST = IMAGE_WIDTHS.at(-1) as number;

/**
 * The rung at or above a wanted width.
 *
 * Rounded up rather than to the nearest: a picture drawn larger than the pixels
 * it was given is soft, and softness is the one artefact nobody accepts on a
 * design surface.
 */
export const bucketWidth = (wanted: number): number => {
  // Nonsense — NaN, Infinity, a negative from a half-initialised layout — takes
  // the smallest rung rather than the largest. Answering garbage with a 2048px
  // request would spend exactly what this module exists to save.
  if (!Number.isFinite(wanted) || wanted <= 0) {
    return IMAGE_WIDTHS[0];
  }
  return IMAGE_WIDTHS.find((rung) => rung >= wanted) ?? LARGEST;
};

/**
 * How wide to ask for an item drawn at this width on this display.
 *
 * The canvas zoom is deliberately *not* folded in. Zooming is continuous and
 * two-directional, so following it would re-request on every wheel notch and
 * undo the whole point; an item is requested for the size it occupies on the
 * board, and the browser scales within a zoom like it always has.
 */
export const wantedWidth = (
  boxWidth: number,
  devicePixelRatio: number
): number => {
  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? Math.min(devicePixelRatio, 2)
      : 1;
  return bucketWidth(Math.ceil(boxWidth * dpr));
};

/**
 * The bucket to actually use, given the one already loaded.
 *
 * The ratchet: never smaller than what is on screen. Returning the previous
 * value unchanged is what lets a caller compare by identity and skip the swap
 * entirely.
 */
export const grownBucket = (previous: number | null, next: number): number =>
  previous === null ? next : Math.max(previous, next);
