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

/**
 * Connections per board.
 *
 * Twice the item ceiling, which is the shape a real graph takes: most items
 * carry one wire, a few fan out to several. Guards a runaway client the way
 * MAX_ITEMS does — a board past this is already unreadable.
 */
export const MAX_WIRES = 600;

/**
 * Port handle radius, in screen pixels.
 *
 * Screen rather than canvas units, like SNAP_PX: a handle must stay the same
 * size to the hand at every zoom, or it becomes untappable zoomed out and
 * absurd zoomed in. The canvas divides by the current scale to hold it there.
 */
export const PORT_RADIUS_PX = 7;

/**
 * Wire thickness, and the wider invisible band that catches the pointer.
 *
 * Also screen pixels, and for the same reason the alignment guides are drawn at
 * `1 / scale`: a wire that scaled would be a hairline zoomed out and a ribbon
 * zoomed in. The hit band is deliberately far wider than the stroke — a 2px
 * curve is very hard to hit with a pointer and impossible with a thumb.
 */
export const WIRE_STROKE_PX = 2;
export const WIRE_HIT_PX = 14;

/** Radius of the remove button that appears on a hovered wire, in screen pixels. */
export const WIRE_BADGE_PX = 9;

/** Default size for a newly dropped image and note, in canvas units. */
export const DEFAULT_IMAGE_WIDTH = 480;
export const DEFAULT_IMAGE_HEIGHT = 320;
export const DEFAULT_NOTE_WIDTH = 300;
export const DEFAULT_NOTE_HEIGHT = 160;

/** Plain text has no card, so it starts wider and shallower than a note. */
export const DEFAULT_TEXT_WIDTH = 420;
export const DEFAULT_TEXT_HEIGHT = 90;

/**
 * An operation node starts taller than it is wide.
 *
 * It has to hold a prompt field, a result image and a run control at once, and
 * a node that arrives too small to show its own prompt has to be resized before
 * it can be used.
 */
export const DEFAULT_NODE_WIDTH = 380;
export const DEFAULT_NODE_HEIGHT = 460;

/**
 * A frame arrives big enough to drop several things into.
 *
 * One that has to be resized before anything fits inside is a frame you have
 * to think about before you can use it.
 */
/**
 * A shader arrives at a size worth looking at.
 *
 * Wider than tall because most of the library is backdrops and gradients,
 * which read as bands rather than as squares.
 */
export const DEFAULT_SHADER_WIDTH = 640;
export const DEFAULT_SHADER_HEIGHT = 400;

export const DEFAULT_FRAME_WIDTH = 1200;
export const DEFAULT_FRAME_HEIGHT = 900;

/**
 * Text size bounds, in canvas units.
 *
 * Generous at the top end: a heading on a 4000-unit canvas is legitimately
 * enormous compared with body text on a page.
 */
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 400;

/** Defaults when an item has no explicit size. */
export const DEFAULT_NOTE_FONT_SIZE = 15;
export const DEFAULT_TEXT_FONT_SIZE = 22;

export const clampScale = (scale: number): number =>
  Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
