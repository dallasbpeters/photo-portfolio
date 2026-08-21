import { MIN_ITEM_SIZE } from "../../../config/canvas.js";
import type { DrawStyle } from "../drawing/DrawToolbar";
import {
  boundsOf,
  type DrawingConfig,
  type DrawTool,
  isFreehand,
  type Point,
  toUnitSpace,
} from "../drawing/drawing";

/**
 * The mark a drag just described: what to draw, and the box it occupies.
 *
 * Pure geometry, lifted out of BoardCanvas so it can be checked without a
 * canvas, a pointer or a React tree. Everything here is a decision about
 * coordinates — whether a drag was long enough to have meant anything, which
 * corner it started from — and none of it needs to know that a board exists.
 *
 * Mask strokes are not here. Those are stored against the *image* they were
 * drawn on rather than as an item of their own, so they need the graph to find
 * their target and belong with the canvas that holds it.
 */

export interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface Mark {
  box: Box;
  config: DrawingConfig;
}

export const markFromStroke = (
  points: Point[],
  tool: DrawTool,
  style: DrawStyle
): Mark | null => {
  const [first] = points;
  const last = points.at(-1);
  if (!(first && last)) {
    return null;
  }

  // A freehand line is its own shape: the box is whatever the path swept, and
  // the points are kept relative to it so the mark scales with the item.
  if (isFreehand(tool)) {
    const box = boundsOf(points, style.strokeWidth);
    return {
      box,
      config: {
        fill: null,
        points: toUnitSpace(points, box),
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        tool,
      },
    };
  }

  // A shape is defined by where the drag began and ended, in either direction —
  // dragging up and left is as natural as down and right.
  const box = {
    height: Math.abs(last.y - first.y),
    width: Math.abs(last.x - first.x),
    x: Math.min(first.x, last.x),
    y: Math.min(first.y, last.y),
  };
  if (box.width < MIN_ITEM_SIZE || box.height < MIN_ITEM_SIZE) {
    // A click rather than a drag. Nothing was asked for, so nothing is made —
    // otherwise every stray click on an armed tool leaves a speck on the board.
    return null;
  }
  return {
    box,
    config: {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      tool,
    },
  };
};
