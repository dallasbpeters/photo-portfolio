import { type Point, toUnitSpace } from "../drawing";
import type { MaskStroke } from "../mask";

/**
 * A brush stroke, written in the target picture's own coordinates.
 *
 * Stored relative to the item rather than to the board so the mask scales with
 * the node: a mask painted at one size must still cover the same part of the
 * picture after the node is dragged or resized, which board coordinates cannot
 * promise. The width travels the same way, as a fraction of the item's width,
 * for the same reason the points do.
 *
 * Pure, and lifted out of BoardCanvas so it can be checked without a pointer.
 */
export interface MaskTarget {
  height: number;
  width: number;
  x: number;
  y: number;
}

export const maskStrokeIn = (
  points: Point[],
  target: MaskTarget,
  strokeWidth: number
): MaskStroke => ({
  points: toUnitSpace(points, target),
  width: strokeWidth / target.width,
});
