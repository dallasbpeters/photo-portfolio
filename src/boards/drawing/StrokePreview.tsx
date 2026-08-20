import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../../../config/canvas.js";
import {
  CORNER_RADIUS,
  type DrawTool,
  isFreehand,
  isMaskTool,
  isTransparent,
  type Point,
  pathFor,
} from "./drawing";
import { MASK_OPACITY, MASK_PAINT } from "./mask";

/**
 * The mark as it is being made, drawn in canvas space.
 *
 * Rendered inside the canvas transform so it occupies the same coordinates it
 * will have once it becomes an item — there is no jump when the pointer is
 * released.
 *
 * Above the items, which is the point of the z-index: items carry one and this
 * did not, so a stroke drawn over a picture was painted over by it. Invisible
 * drawing was survivable on bare canvas and fatal for the mask brush, which is
 * only ever used on top of an image.
 */

interface StrokePreviewProps {
  /** The stroke so far, or null when nothing is being drawn. */
  points: Point[] | null;
  style?: { fill: string; stroke: string; strokeWidth: number };
  tool: DrawTool | null;
}

export function StrokePreview({ points, style, tool }: StrokePreviewProps) {
  if (!(points && tool && style)) {
    return null;
  }
  const masking = isMaskTool(tool);
  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      height={CANVAS_HEIGHT}
      style={{ zIndex: 9998 }}
      width={CANVAS_WIDTH}
    >
      <title>Drawing in progress</title>
      {isFreehand(tool) ? (
        <path
          d={pathFor(points, tool === "brush")}
          fill="none"
          // The mask brush previews in the color the finished mask is drawn
          // in, not in the pen color: it is not making a mark in that color,
          // and a white "mask" over a pale photograph is invisible whatever
          // the z-index.
          stroke={masking ? MASK_PAINT : style.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={masking ? MASK_OPACITY : 1}
          strokeWidth={style.strokeWidth}
        />
      ) : (
        <PreviewShape points={points} style={style} tool={tool} />
      )}
    </svg>
  );
}

/**
 * The outline of a shape while it is still being dragged out.
 *
 * Separate from DrawingView because that renders a finished item inside its own
 * box, whereas this lives in canvas space and has no box yet — the box is what
 * the drag is deciding.
 */
function PreviewShape({
  points,
  style,
  tool,
}: {
  points: Point[];
  style: { fill: string; stroke: string; strokeWidth: number };
  tool: DrawTool;
}) {
  const [first] = points;
  const last = points.at(-1);
  if (!(first && last)) {
    return null;
  }
  const x = Math.min(first.x, last.x);
  const y = Math.min(first.y, last.y);
  const width = Math.abs(last.x - first.x);
  const height = Math.abs(last.y - first.y);
  const fill = isTransparent(style.fill) ? "none" : style.fill;

  if (tool === "ellipse") {
    return (
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        fill={fill}
        rx={width / 2}
        ry={height / 2}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
      />
    );
  }
  return (
    <rect
      fill={fill}
      height={height}
      rx={tool === "rounded" ? CORNER_RADIUS : 0}
      stroke={style.stroke}
      strokeWidth={style.strokeWidth}
      width={width}
      x={x}
      y={y}
    />
  );
}
