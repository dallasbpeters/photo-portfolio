import {
  CORNER_RADIUS,
  type DrawingConfig,
  isFreehand,
  isTransparent,
  pathFor,
} from "./drawing";

/**
 * A drawn mark, rendered as SVG inside its own item box.
 *
 * The SVG uses a 0–1 viewBox and non-scaling geometry so the drawing fills
 * whatever size the item has been dragged to. That is what makes a stroke
 * resizable at all: the points were stored in unit space precisely so this
 * could happen without rewriting them.
 *
 * `preserveAspectRatio="none"` on purpose — stretching a drawing when its box
 * is stretched is what a person dragging a corner means. Refusing to stretch
 * would leave the mark floating inside a box that no longer fits it.
 */

interface DrawingViewProps {
  config: DrawingConfig;
  /** Item size in canvas units, so the stroke keeps a constant weight. */
  height: number;
  width: number;
}

export function DrawingView({ config, height, width }: DrawingViewProps) {
  const { fill, stroke, strokeWidth, tool } = config;
  // A fully transparent fill is the default and means "no fill"; passing it to
  // SVG as a colour would work but "none" is what it actually is.
  const paint = isTransparent(fill) ? "none" : (fill ?? "none");

  if (isFreehand(tool)) {
    const unitPoints = config.points ?? [];
    if (unitPoints.length === 0) {
      return null;
    }
    // Scaled back into canvas units rather than drawn in a 0–1 viewBox. The
    // unit box seemed tidier, but it forced the stroke width to be divided by
    // the item's size to stay constant — and combining that with
    // non-scaling-stroke corrected the same thing twice in opposite
    // directions, rendering every mark about three hundred times too thin.
    //
    // In canvas units the width is simply the width, identical to the value the
    // live preview draws with, which is the only way the two can agree.
    const points = unitPoints.map((point) => ({
      x: point.x * width,
      y: point.y * height,
    }));
    return (
      <svg
        className="pointer-events-none h-full w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`}
      >
        <title>Drawing</title>
        <path
          d={pathFor(points, tool === "brush")}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  const inset = strokeWidth / 2;
  return (
    <svg
      className="pointer-events-none h-full w-full overflow-visible"
      viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`}
    >
      <title>Drawing</title>
      {tool === "ellipse" ? (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          fill={paint}
          // Inset by half the stroke so the outline sits inside the box rather
          // than straddling its edge and being clipped.
          rx={Math.max(width / 2 - inset, 0)}
          ry={Math.max(height / 2 - inset, 0)}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : (
        <rect
          fill={paint}
          height={Math.max(height - strokeWidth, 0)}
          rx={tool === "rounded" ? CORNER_RADIUS : 0}
          stroke={stroke}
          strokeWidth={strokeWidth}
          width={Math.max(width - strokeWidth, 0)}
          x={inset}
          y={inset}
        />
      )}
    </svg>
  );
}
