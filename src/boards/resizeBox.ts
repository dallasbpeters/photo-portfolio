import type { ResizeHandle } from "./alignmentGuides";
import type { Box } from "./snapIndex";

/**
 * The box a resize drag produces.
 *
 * Which corner is dragged decides which corner stays put: dragging the
 * north-west handle moves the box's origin and shrinks it, while the
 * south-east corner does not move at all. Before this, every resize behaved as
 * though the south-east handle had been dragged — the origin never moved — so
 * pulling the top-left of an item grew it downward instead.
 *
 * Kept apart from the canvas because it is arithmetic with several cases, and
 * arithmetic with several cases is worth testing. `MIN_ITEM_SIZE` is passed in
 * rather than imported so the module has no dependency on canvas config.
 */

export interface ResizeInput {
  /** Pointer travel in canvas units since the gesture began. */
  dx: number;
  dy: number;
  handle: ResizeHandle;
  /** Shift-drag: preserve the original aspect ratio. */
  lockAspect: boolean;
  minSize: number;
  /** The box as it was when the drag began. */
  origin: Box;
}

/** Which edges a handle is allowed to move. A corner moves two. */
const edgesOf = (handle: ResizeHandle) => ({
  east: handle.includes("e"),
  north: handle.includes("n"),
  south: handle.includes("s"),
  west: handle.includes("w"),
});

/**
 * One axis of the resize.
 *
 * `start` only moves when the leading edge is dragged; otherwise the origin is
 * pinned and only the size changes. The minimum is applied by clamping the
 * size, then re-deriving the start, so a box driven past its minimum stops
 * rather than inverting and walking away under the pointer.
 */
const axis = (
  start: number,
  size: number,
  delta: number,
  leading: boolean,
  trailing: boolean,
  minSize: number
): { size: number; start: number } => {
  if (leading) {
    const next = Math.max(minSize, size - delta);
    return { size: next, start: start + size - next };
  }
  if (trailing) {
    return { size: Math.max(minSize, size + delta), start };
  }
  return { size, start };
};

/**
 * Applies the original aspect ratio to a resized box.
 *
 * Whichever axis moved proportionally further wins, and the other follows —
 * the standard shift-drag. The pinned corner has to be respected while doing
 * it, or locking the aspect would slide the box sideways.
 */
const withAspect = (
  box: Box,
  origin: Box,
  handle: ResizeHandle,
  minSize: number
): Box => {
  if (origin.width <= 0 || origin.height <= 0) {
    return box;
  }
  const ratio = origin.width / origin.height;
  const byWidth = box.width / origin.width >= box.height / origin.height;
  const width = byWidth ? box.width : Math.max(minSize, box.height * ratio);
  const height = byWidth ? Math.max(minSize, box.width / ratio) : box.height;

  const { north, west } = edgesOf(handle);
  return {
    height,
    // The pinned edge stays where it is; the moving edge absorbs the change.
    width,
    x: west ? box.x + box.width - width : box.x,
    y: north ? box.y + box.height - height : box.y,
  };
};

export const resizeBox = ({
  dx,
  dy,
  handle,
  lockAspect,
  minSize,
  origin,
}: ResizeInput): Box => {
  const { east, north, south, west } = edgesOf(handle);
  const x = axis(origin.x, origin.width, dx, west, east, minSize);
  const y = axis(origin.y, origin.height, dy, north, south, minSize);
  const box: Box = {
    height: y.size,
    width: x.size,
    x: x.start,
    y: y.start,
  };
  return lockAspect ? withAspect(box, origin, handle, minSize) : box;
};

/** The corner opposite the handle — the point a resize holds still. */
export const anchorOf = (
  box: Box,
  handle: ResizeHandle
): { x: number; y: number } => {
  const { north, west } = edgesOf(handle);
  return {
    x: west ? box.x + box.width : box.x,
    y: north ? box.y + box.height : box.y,
  };
};
