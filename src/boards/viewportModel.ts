/**
 * The board viewport, as pure maths.
 *
 * Every function here takes a viewport value and returns a new one. Nothing
 * reads the DOM, nothing writes it, and nothing imports React — the caller
 * measures the container once, passes the rectangle in, and decides where the
 * result lives. That is the whole point: `useCanvasViewport` keeps the viewport
 * in React state, so a pan gesture re-renders `BoardCanvas` and every
 * `BoardItemView` under it at pointer rate. The same maths driven from a ref can
 * write `style.transform` directly and re-render nothing.
 *
 * The semantics are lifted from `useCanvasViewport` unchanged — same zoom
 * clamps, same anchoring, same framing margins — so swapping the hook's
 * internals for these functions is a change of *where the state lives*, not of
 * how the canvas behaves.
 *
 * Coordinate spaces, named once so the rest of the file can be terse:
 *
 *   - **canvas units** — the fixed 12000x9000 board space items are stored in.
 *   - **client pixels** — what a PointerEvent reports: relative to the viewport
 *     of the page, so a container offset has to come out before they mean
 *     anything.
 *   - **container pixels** — client pixels with the container's origin removed.
 *     `tx`/`ty` are in this space.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clampScale,
  START_VIEW_HEIGHT,
  START_VIEW_WIDTH,
} from "../../config/canvas.js";

/** Canvas units per CSS pixel, plus the screen offset of the canvas origin. */
export interface Viewport {
  /** Canvas units per CSS pixel. */
  scale: number;
  /** Screen offset of the canvas origin, in CSS pixels. */
  tx: number;
  ty: number;
}

/** A rectangle in canvas units. */
export interface Bounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The measured container, in client pixels.
 *
 * Structurally a `DOMRect`, so `el.getBoundingClientRect()` can be passed
 * straight in — but declared here so the module never mentions the DOM and can
 * be tested with a literal.
 */
export interface ViewRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

/** A screen-space rectangle, in client pixels. */
export interface ScreenRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

/** The view a board starts from before anything has been measured or framed. */
export const IDENTITY_VIEWPORT: Viewport = { scale: 1, tx: 0, ty: 0 };

/**
 * How much one wheel notch zooms.
 *
 * Applied exponentially, so a notch is the same proportional change at every
 * zoom level — a fixed addition would crawl when zoomed out and lurch when
 * zoomed in.
 */
export const WHEEL_SENSITIVITY = 0.0015;

/**
 * Fraction of the container the content fills when framing items.
 *
 * The remainder is margin, so the outermost items are not flush against the
 * frame.
 */
export const CONTENT_FRAME_FILL = 0.85;

/** The same, for framing the opening screenful of an empty board. */
export const CANVAS_FRAME_FILL = 0.92;

/** Converts a client (screen) point to canvas units. */
export const toCanvas = (
  viewport: Viewport,
  clientX: number,
  clientY: number,
  rect: ViewRect
): Point => ({
  x: (clientX - rect.left - viewport.tx) / viewport.scale,
  y: (clientY - rect.top - viewport.ty) / viewport.scale,
});

/**
 * Converts a canvas point to client pixels — the exact inverse of `toCanvas`.
 *
 * Client rather than container pixels so the two compose: feeding a
 * `PointerEvent`'s coordinates through `toCanvas` and back returns them
 * unchanged. Subtract `rect.left`/`rect.top` for a position inside the
 * container.
 */
export const toScreen = (
  viewport: Viewport,
  point: Point,
  rect: ViewRect
): Point => ({
  x: point.x * viewport.scale + viewport.tx + rect.left,
  y: point.y * viewport.scale + viewport.ty + rect.top,
});

/**
 * Where a canvas-space box lands on screen, in client pixels.
 *
 * What anything anchored to an item needs — a contextual bar, a selection
 * outline drawn outside the transformed layer.
 */
export const boundsToScreen = (
  viewport: Viewport,
  bounds: Bounds,
  rect: ViewRect
): ScreenRect => {
  const origin = toScreen(viewport, { x: bounds.x, y: bounds.y }, rect);
  return {
    height: bounds.height * viewport.scale,
    left: origin.x,
    top: origin.y,
    width: bounds.width * viewport.scale,
  };
};

/**
 * Pans by a screen-pixel delta.
 *
 * Pixels rather than canvas units because that is what a drag produces: the
 * board should follow the pointer one-for-one at any zoom.
 */
export const panBy = (
  viewport: Viewport,
  dx: number,
  dy: number
): Viewport => ({
  scale: viewport.scale,
  tx: viewport.tx + dx,
  ty: viewport.ty + dy,
});

/**
 * Pans to an absolute offset — for a drag that remembers where it started.
 *
 * Accumulating deltas across a gesture drifts once the offset is rounded for
 * the transform; anchoring to the origin of the drag does not.
 */
export const panTo = (
  viewport: Viewport,
  tx: number,
  ty: number
): Viewport => ({
  scale: viewport.scale,
  tx,
  ty,
});

/**
 * Zooms to an absolute scale while keeping the given client point pinned to the
 * same canvas point.
 *
 * This is what makes the canvas feel like a physical board rather than a
 * slideshow: whatever is under the cursor stays under the cursor. The scale is
 * clamped *before* the offset is solved, so the anchor still holds when the
 * zoom has run into `MIN_SCALE` or `MAX_SCALE` — clamping afterwards would slide
 * the board sideways at the limits.
 */
export const zoomAt = (
  viewport: Viewport,
  nextScaleRaw: number,
  clientX: number,
  clientY: number,
  rect: ViewRect
): Viewport => {
  const scale = clampScale(nextScaleRaw);
  // A non-finite target (a pinch that divided by a zero starting distance, a
  // NaN out of storage) would poison tx and ty as well, leaving a board that
  // cannot be recovered by panning. Refuse the frame instead.
  if (!Number.isFinite(scale)) {
    return viewport;
  }
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  // The canvas point under the cursor before the zoom must land under it again
  // afterwards; solving for the new offset gives this.
  const canvasX = (px - viewport.tx) / viewport.scale;
  const canvasY = (py - viewport.ty) / viewport.scale;
  return {
    scale,
    tx: px - canvasX * scale,
    ty: py - canvasY * scale,
  };
};

/** Multiplies the zoom by a factor, anchored at a client point. */
export const zoomByAt = (
  viewport: Viewport,
  factor: number,
  clientX: number,
  clientY: number,
  rect: ViewRect
): Viewport =>
  zoomAt(viewport, viewport.scale * factor, clientX, clientY, rect);

/**
 * Multiplies the zoom by a factor about the container's centre.
 *
 * For the on-screen zoom buttons, which have no pointer position to anchor to.
 */
export const zoomByAtCentre = (
  viewport: Viewport,
  factor: number,
  rect: ViewRect
): Viewport =>
  zoomAt(
    viewport,
    viewport.scale * factor,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
    rect
  );

/**
 * One wheel event's worth of zoom, anchored at the pointer.
 *
 * A trackpad pinch arrives as ctrlKey+wheel with the same `deltaY`, so both
 * gestures take this path; deciding whether the wheel belongs to the canvas at
 * all is the caller's job, since it means walking the DOM.
 */
export const zoomByWheel = (
  viewport: Viewport,
  deltaY: number,
  clientX: number,
  clientY: number,
  rect: ViewRect
): Viewport =>
  zoomAt(
    viewport,
    viewport.scale * Math.exp(-deltaY * WHEEL_SENSITIVITY),
    clientX,
    clientY,
    rect
  );

/**
 * The scale a pinch has reached, from the distance between two pointers.
 *
 * Measured against where the pinch started rather than the previous frame, so
 * rounding does not accumulate over a long gesture. Returns the starting scale
 * unchanged when the pinch began with the two pointers on top of each other.
 */
export const pinchScale = (
  startScale: number,
  startDistance: number,
  distance: number
): number =>
  startDistance > 0 ? startScale * (distance / startDistance) : startScale;

/** The distance between two points, for pinch tracking. */
export const distanceBetween = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The viewport that frames a canvas-space box in the container.
 *
 * Returns null rather than a degenerate view when there is nothing to frame or
 * nowhere to frame it — a zero-sized container measured before layout has
 * settled is the usual case, and a caller that treats "did nothing" as "done"
 * never frames the board at all. That is why this reports failure instead of
 * silently returning the viewport unchanged.
 *
 * @param fill Fraction of the container the box fills, the rest being margin.
 */
export const frameBounds = (
  bounds: Bounds,
  rect: ViewRect,
  fill: number = CONTENT_FRAME_FILL
): Viewport | null => {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const scale = clampScale(
    Math.min(rect.width / bounds.width, rect.height / bounds.height) * fill
  );
  return {
    scale,
    tx: (rect.width - bounds.width * scale) / 2 - bounds.x * scale,
    ty: (rect.height - bounds.height * scale) / 2 - bounds.y * scale,
  };
};

/**
 * The opening screenful of an empty board, centred.
 *
 * Fitting the whole 12000x9000 canvas would open a new board at nine percent
 * zoom, where a dropped note is a speck. The board is a place to spread out
 * into, so a new one starts on `START_VIEW_WIDTH` x `START_VIEW_HEIGHT` in the
 * middle of the space — which is also where an item with nowhere else to go is
 * dropped.
 */
export const frameCanvas = (rect: ViewRect): Viewport | null =>
  frameBounds(
    {
      height: START_VIEW_HEIGHT,
      width: START_VIEW_WIDTH,
      x: (CANVAS_WIDTH - START_VIEW_WIDTH) / 2,
      y: (CANVAS_HEIGHT - START_VIEW_HEIGHT) / 2,
    },
    rect,
    CANVAS_FRAME_FILL
  );

/**
 * The region of the canvas currently on screen, in canvas units.
 *
 * The input to culling: an item whose bounds miss this does not need to exist
 * in the DOM.
 */
export const visibleBounds = (viewport: Viewport, rect: ViewRect): Bounds => ({
  height: rect.height / viewport.scale,
  width: rect.width / viewport.scale,
  x: -viewport.tx / viewport.scale,
  y: -viewport.ty / viewport.scale,
});

/**
 * The CSS transform for the canvas layer.
 *
 * A string rather than a DOM write, so the caller can set it on an element from
 * a rAF or hand it to React, and this module stays testable without a browser.
 * `translate` before `scale`, matching the order the offsets are solved for —
 * reversed, `tx` would be in canvas units and every conversion above would be
 * wrong.
 */
export const transformOf = (viewport: Viewport): string =>
  `translate(${viewport.tx}px, ${viewport.ty}px) scale(${viewport.scale})`;

/** Whether two viewports are the same view, for skipping needless work. */
export const sameViewport = (a: Viewport, b: Viewport): boolean =>
  a.scale === b.scale && a.tx === b.tx && a.ty === b.ty;

/**
 * A viewport read back from storage, or null when it is not one.
 *
 * The view is remembered per board so a reload does not throw the board back to
 * "fit everything" — which reads as the items having moved when all that moved
 * was the camera. Anything unparseable, half-written or non-finite is refused:
 * a NaN scale restored into the transform blanks the whole canvas, and no
 * gesture recovers it.
 */
export const parseViewport = (raw: string | null): Viewport | null => {
  if (!raw) {
    return null;
  }
  let parsed: Partial<Viewport>;
  try {
    parsed = JSON.parse(raw) as Partial<Viewport>;
  } catch {
    return null;
  }
  const { scale, tx, ty } = parsed;
  if (
    typeof scale !== "number" ||
    typeof tx !== "number" ||
    typeof ty !== "number" ||
    !(Number.isFinite(scale) && Number.isFinite(tx) && Number.isFinite(ty))
  ) {
    return null;
  }
  return { scale, tx, ty };
};
