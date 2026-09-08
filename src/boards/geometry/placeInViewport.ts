/**
 * Keeping a menu on screen, wherever it was opened from.
 *
 * Every popover on the canvas was placed at the cursor and left there —
 * `left: point.x + 10, top: point.y - 8` and nothing else — so a menu opened
 * near an edge ran off it. The bottom was the one that bit: the canvas menu
 * grows a row per applicable action, so a selection with tools, Canva, a
 * frame, two saves, an arrange and a download is tall enough to be clipped
 * from halfway down the window, and the rows that fell off were simply
 * unreachable. Nothing scrolled and nothing flipped.
 *
 * Pure geometry, deliberately. This is where the off-by-one errors live, and
 * it can be checked exhaustively without a browser.
 *
 * Three rules, in order:
 *
 *   flip   — if it does not fit below the cursor but does fit above, put it
 *            above. Same for right and left. A flipped menu still touches the
 *            cursor, which is what keeps it feeling attached to the click.
 *   clamp  — if neither side fits, push it inside the edge. Better a menu
 *            slightly over its anchor than one half off screen.
 *   bound  — if it is taller than the window even so, cap it and let it
 *            scroll. A menu with thirty rows on a laptop has nowhere to go.
 */

/** The gap kept between a menu and the window's edge. */
const MARGIN = 8;

/** How far the menu sits from the cursor when there is room. */
const OFFSET_X = 10;
const OFFSET_Y = -8;

export interface Size {
  height: number;
  width: number;
}

export interface Viewport {
  height: number;
  width: number;
}

export interface Placement {
  left: number;
  /**
   * A cap, present only when the menu cannot fit at its natural height.
   *
   * Undefined rather than the viewport height when it does fit, so the common
   * case sets no max-height at all and a menu that grows a row is not
   * mysteriously scrollable.
   */
  maxHeight?: number;
  top: number;
}

/**
 * Where to put a popover of `size` opened at `point`, given the window.
 *
 * A zero-sized menu — the first render, before it has been measured — is
 * placed at the cursor untouched. Guessing at a height would make the menu
 * visibly jump once measured, which is worse than one frame in the naive spot.
 */
export const placeInViewport = (
  point: { x: number; y: number },
  size: Size,
  viewport: Viewport,
  margin = MARGIN
): Placement => {
  if (size.width === 0 || size.height === 0) {
    return { left: point.x + OFFSET_X, top: point.y + OFFSET_Y };
  }

  const room = {
    above: point.y - margin,
    below: viewport.height - point.y - margin,
    left: point.x - margin,
    right: viewport.width - point.x - margin,
  };

  // The height it may actually occupy. Only capped when neither direction can
  // hold it, so a menu that fits keeps its natural height.
  const fits = size.height <= Math.max(room.above, room.below);
  const height = fits
    ? size.height
    : Math.max(room.above, room.below, viewport.height - margin * 2);
  const maxHeight = fits ? undefined : height;

  /**
   * Keeps a value inside the window, whatever the preference was.
   *
   * Applied to every branch rather than trusted from each one. The first
   * version reasoned about the flip arithmetic per case and got it wrong by
   * exactly twice the cursor offset — a menu opened at the very bottom flipped
   * upward and still hung 11px past the edge. Clamping once afterwards makes
   * that class of mistake impossible instead of merely absent.
   */
  const clamp = (value: number, extent: number, limit: number): number =>
    Math.max(margin, Math.min(value, limit - margin - extent));

  const top = (() => {
    const below = point.y + OFFSET_Y;
    if (below + height <= viewport.height - margin) {
      return clamp(below, height, viewport.height);
    }
    // Above instead, with its bottom edge just short of the cursor's line —
    // the mirror of sitting just short of it on the way down. Clamped like
    // every other branch, so a cursor at the very edge cannot overshoot.
    return clamp(point.y - height + OFFSET_Y, height, viewport.height);
  })();

  const left = (() => {
    const right = point.x + OFFSET_X;
    if (right + size.width <= viewport.width - margin) {
      return clamp(right, size.width, viewport.width);
    }
    // To the left of the cursor, which is where a menu near the right edge
    // belongs — the same flip every desktop menu makes.
    return clamp(point.x - size.width - OFFSET_X, size.width, viewport.width);
  })();

  return maxHeight === undefined ? { left, top } : { left, maxHeight, top };
};
