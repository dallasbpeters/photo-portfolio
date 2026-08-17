import type { Bounds, Viewport, ViewRect } from "./viewportModel";
import { boundsToScreen } from "./viewportModel";

/**
 * Where the contextual bar sits, in screen pixels.
 *
 * The bar is anchored to the selected item but lives in screen space, not on
 * the canvas: it must not scale with the zoom, or it would be unreadable at 20%
 * and enormous at 400%. So its position is recomputed from the viewport rather
 * than being a child of the transformed layer.
 *
 * That recomputation cannot go through React. After Wave 0 the viewport lives
 * in a ref and a pan writes `style.transform` directly, without re-rendering —
 * a bar positioned from React state would therefore be a frame behind the item
 * it points at, and would visibly swim during a drag. This module is the
 * arithmetic; the caller writes the result to the DOM on the same frame as the
 * layer transform.
 *
 * Pure, and separate from the component, because "does the bar flip below when
 * the item is near the top" is a question worth answering in a test rather than
 * by dragging something to the top of a real board.
 */

/** Gap between the item's edge and the bar, in screen pixels. */
export const BAR_GAP = 12;

/** How close to the viewport edge the bar may sit before it is pulled back. */
export const BAR_MARGIN = 8;

export type BarPlacement = "above" | "below";

export interface BarPosition {
  /** Which side of the item the bar ended up on, for the caller's arrow. */
  placement: BarPlacement;
  /** Screen pixels from the viewport's left edge. */
  x: number;
  /** Screen pixels from the viewport's top edge. */
  y: number;
}

export interface BarSize {
  height: number;
  width: number;
}

/**
 * Places the bar above the item, or below it when there is no room.
 *
 * Above is the default because a bar below an item covers whatever the item is
 * sitting on top of, which on a moodboard is usually the thing being compared
 * against. It flips only when flipping is the difference between visible and
 * not.
 *
 * Both axes are then clamped into the viewport. A selected item can be mostly
 * off-screen — panning does not deselect — and an unclamped bar would follow it
 * out of view, leaving no way to act on a selection that is still live.
 */
export const anchorBar = (
  bounds: Bounds,
  viewport: Viewport,
  rect: ViewRect,
  size: BarSize
): BarPosition => {
  const screen = boundsToScreen(viewport, bounds, rect);
  const centred = screen.left + screen.width / 2 - size.width / 2;

  const above = screen.top - size.height - BAR_GAP;
  const below = screen.top + screen.height + BAR_GAP;
  // Only the top edge decides. Flipping because the *bottom* is off-screen
  // would move the bar further out of view, not less.
  const placement: BarPlacement = above >= BAR_MARGIN ? "above" : "below";

  const maxX = Math.max(BAR_MARGIN, rect.width - size.width - BAR_MARGIN);
  const maxY = Math.max(BAR_MARGIN, rect.height - size.height - BAR_MARGIN);

  return {
    placement,
    x: clamp(centred, BAR_MARGIN, maxX),
    y: clamp(placement === "above" ? above : below, BAR_MARGIN, maxY),
  };
};

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/**
 * The box enclosing several items, in canvas units.
 *
 * A multi-selection gets one bar over the whole group rather than one bar per
 * item. Returns null for an empty selection, which is the caller's cue to hide
 * the bar rather than to draw it at the origin.
 */
export const boundsOfAll = (
  items: readonly { height: number; width: number; x: number; y: number }[]
): Bounds | null => {
  const [first] = items;
  if (!first) {
    return null;
  }
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;
  for (const item of items.slice(1)) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }
  return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
};

/** The style a caller writes to the bar element. Screen-space, never scaled. */
export const barTransform = (position: BarPosition): string =>
  `translate(${Math.round(position.x)}px, ${Math.round(position.y)}px)`;
