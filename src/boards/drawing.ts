/**
 * Marks made by hand on the board: freehand strokes and simple shapes.
 *
 * All one item kind. A pen stroke, a rectangle and an ellipse differ in how
 * they are drawn and what they store, but each is a coloured mark occupying a
 * box — so geometry lives in the item's own x/y/width/height and a drawing is
 * dragged, resized, snapped, framed and z-ordered by the code that already does
 * that for a photograph. Nothing about drawing had to be taught to the canvas.
 *
 * Freehand points are stored in unit space, 0–1 across the item's box, for the
 * same reason: resizing then scales the stroke instead of clipping it, and the
 * points survive a drag without being rewritten.
 */

export const DRAW_TOOLS = [
  "pen",
  "brush",
  "rect",
  "rounded",
  "ellipse",
  "mask",
] as const;

export type DrawTool = (typeof DRAW_TOOLS)[number];

/** Freehand tools collect a path; the rest are defined by their box alone. */
export const isFreehand = (tool: DrawTool): boolean =>
  tool === "pen" || tool === "brush" || tool === "mask";

/**
 * The mask brush, which is a drawing tool that makes no drawing.
 *
 * It is here rather than in mask.ts because it is picked from the same toolbar
 * and uses the same gesture as the pen — but its stroke is painted onto the
 * image it lands on instead of becoming a mark of its own. Everything that
 * treats a tool as "the thing the next drag makes" has to know the difference.
 */
export const isMaskTool = (tool: DrawTool | null): boolean => tool === "mask";

export interface Point {
  x: number;
  y: number;
}

export interface DrawingConfig {
  fill: string | null;
  /** Unit-space path, only for the freehand tools. */
  points?: Point[];
  stroke: string;
  strokeWidth: number;
  tool: DrawTool;
}

export const DEFAULT_STROKE = "#ffffff";
/** An 8-digit hex whose alpha is zero: the value meaning "do not fill". */
export const NO_FILL = "#00000000";
export const DEFAULT_STROKE_WIDTH = 4;

/**
 * True when a colour is fully transparent, and so means "no paint".
 *
 * Tested on the alpha pair specifically. The obvious shortcut — does the string
 * end in "00" — is wrong for every colour with a zero blue channel, so pure red
 * counted as transparent and a red-filled shape came out hollow.
 */
export const isTransparent = (color: string | null | undefined): boolean =>
  !color || (color.length === 9 && color.slice(7).toLowerCase() === "00");

/** Corner radius for the rounded tool, in canvas units. */
export const CORNER_RADIUS = 18;

const isTool = (value: unknown): value is DrawTool =>
  DRAW_TOOLS.includes(value as DrawTool);

export const isDrawingConfig = (value: unknown): value is DrawingConfig => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { stroke, strokeWidth, tool } = value as DrawingConfig;
  return (
    isTool(tool) &&
    typeof stroke === "string" &&
    typeof strokeWidth === "number"
  );
};

/**
 * The bounding box of a set of canvas-space points.
 *
 * Padded by the stroke width: a stroke is centred on its path, so half of it
 * falls outside the points and a box drawn tight to them would clip the mark
 * along every edge.
 */
export const boundsOf = (
  points: Point[],
  strokeWidth: number
): { height: number; width: number; x: number; y: number } => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const pad = strokeWidth;
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  return {
    // Never zero: a perfectly straight line or a single dot has no extent on
    // one axis, and a zero-width item cannot be grabbed or resized.
    height: Math.max(Math.max(...ys) + pad - top, strokeWidth * 2),
    width: Math.max(Math.max(...xs) + pad - left, strokeWidth * 2),
    x: left,
    y: top,
  };
};

/** Canvas-space points expressed as 0–1 across the given box. */
export const toUnitSpace = (
  points: Point[],
  box: { height: number; width: number; x: number; y: number }
): Point[] =>
  points.map((point) => ({
    x: (point.x - box.x) / box.width,
    y: (point.y - box.y) / box.height,
  }));

/**
 * An SVG path through the points, smoothed for the brush and straight for the
 * pen.
 *
 * The brush curves through the midpoint between each pair of samples, which is
 * the cheapest way to lose the faceted look of raw pointer samples without
 * fitting anything. The pen keeps its segments, because a pen is for marking
 * exactly where you went.
 */
export const pathFor = (points: Point[], smooth: boolean): string => {
  const [first] = points;
  if (!first) {
    return "";
  }
  if (points.length === 1) {
    // A single tap still deserves a mark: a zero-length line with a round cap
    // renders as a dot.
    return `M ${first.x} ${first.y} L ${first.x} ${first.y}`;
  }
  if (!smooth) {
    return points
      .map((point, index) =>
        index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
      )
      .join(" ");
  }

  let path = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (!(previous && current)) {
      continue;
    }
    const { x: px, y: py } = previous;
    path += ` Q ${px} ${py} ${(px + current.x) / 2} ${(py + current.y) / 2}`;
  }
  const last = points.at(-1);
  return last ? `${path} L ${last.x} ${last.y}` : path;
};
