import { withinFrame } from "../../config/graph.js";
import type { BoardItem } from "../types";
import type { Point } from "./drawing";

/**
 * What is under a point, and how big the board is.
 *
 * Pure arithmetic over the item list, in canvas units. Extracted from
 * BoardCanvas for the same reason viewportModel and resizeBox were: none of it
 * needs React, a pointer event or the DOM, so none of it should only be
 * reachable by rendering a canvas and dragging on it.
 */

/** True when a canvas point falls inside an item's box. */
export const covers = (item: BoardItem, point: Point): boolean =>
  point.x >= item.x &&
  point.x <= item.x + item.width &&
  point.y >= item.y &&
  point.y <= item.y + item.height;

/**
 * The topmost item under a point that satisfies `wanted`.
 *
 * Searched from the end because later items sit above earlier ones, so the one
 * drawn last is the one a pointer is aiming at.
 */
export const topmostAt = (
  items: BoardItem[],
  point: Point,
  wanted: (item: BoardItem) => boolean
): BoardItem | null => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item && wanted(item) && covers(item, point)) {
      return item;
    }
  }
  return null;
};

/**
 * The rectangle the items occupy, or null for an empty board.
 *
 * This is what the view is framed on: the arrangement usually fills a small
 * part of the 4000×3000 canvas, so framing the canvas itself leaves the board
 * off to one side and too small to read.
 */
export const contentBounds = (items: BoardItem[]) => {
  if (items.length === 0) {
    return null;
  }
  const left = Math.min(...items.map((i) => i.x));
  const top = Math.min(...items.map((i) => i.y));
  const right = Math.max(...items.map((i) => i.x + i.width));
  const bottom = Math.max(...items.map((i) => i.y + i.height));
  return { height: bottom - top, width: right - left, x: left, y: top };
};

/**
 * Where a frame's contents sit in the item list.
 *
 * Indices rather than items because the callers reorder and rewrite by
 * position: dragging a frame moves everything on it, and an id would have to be
 * looked up again for each. Membership is computed from geometry, never stored —
 * see withinFrame for why.
 */
export const containedIndices = (
  frame: BoardItem,
  items: BoardItem[]
): number[] => {
  const inside = new Set(withinFrame(frame, items).map((item) => item.id));
  return items.reduce<number[]>((acc, item, index) => {
    if (inside.has(item.id)) {
      acc.push(index);
    }
    return acc;
  }, []);
};
