/**
 * The moodboard canvas, shared by the browser and the API.
 *
 * Item positions are stored in *canvas units* against this fixed space rather
 * than in pixels. The viewport scales to fit whatever screen is looking at it,
 * so a board arranged on a laptop is the same arrangement on a phone instead of
 * reflowing into a different picture.
 *
 * Both sides must agree on these numbers — the API clamps incoming geometry to
 * them and the canvas renders against them — so they live here rather than
 * being written down twice.
 *
 * Like config/sites.ts, this module stays dependency-free and free of browser
 * and Node globals so every layer can import it.
 */

export const CANVAS_WIDTH = 4000;
export const CANVAS_HEIGHT = 3000;

/** Small enough to sit alongside others, large enough to still grab. */
export const MIN_ITEM_SIZE = 40;

/** Zoom bounds. Below the floor items are unreadable; above it, unusable. */
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 3;

/** Default size for a newly dropped image and note, in canvas units. */
export const DEFAULT_IMAGE_WIDTH = 480;
export const DEFAULT_IMAGE_HEIGHT = 320;
export const DEFAULT_NOTE_WIDTH = 300;
export const DEFAULT_NOTE_HEIGHT = 160;

/** Plain text has no card, so it starts wider and shallower than a note. */
export const DEFAULT_TEXT_WIDTH = 420;
export const DEFAULT_TEXT_HEIGHT = 90;

export const clampScale = (scale: number): number =>
  Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
