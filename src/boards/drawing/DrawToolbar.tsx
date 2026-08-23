import { HugeiconsIcon } from "@hugeicons/react";
import {
  BucketIcon,
  CircleIcon,
  CursorMagicSelection02Icon,
  PaintBrush02Icon,
  PenTool01Icon,
  SquareIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { ColorWell } from "../ColorWell";
import {
  DEFAULT_STROKE_WIDTH,
  type DrawTool,
  isTransparent,
  NO_FILL,
} from "./drawing";
import "./DrawToolbar.css";

/**
 * The drawing tools, and the colors the next mark is made in.
 *
 * Colors are chosen before drawing rather than after, because that is how
 * every drawing tool works and because a mark that appears in the wrong color
 * and has to be corrected is a worse experience than picking first. Both
 * colors stay visible while drawing so there is never a question of what the
 * next stroke will look like.
 *
 * "Select" is a tool too, not an escape hatch. Without it on the same row there
 * is no obvious way back to dragging things around, and a canvas you cannot
 * stop drawing on is a trap.
 */

export interface DrawStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

interface DrawToolbarProps {
  onStyle: (style: DrawStyle) => void;
  onTool: (tool: DrawTool | null) => void;
  style: DrawStyle;
  tool: DrawTool | null;
}

const TOOLS: { icon: typeof SquareIcon; label: string; tool: DrawTool }[] = [
  { icon: PenTool01Icon, label: "Pen", tool: "pen" },
  { icon: PaintBrush02Icon, label: "Brush", tool: "brush" },
  { icon: SquareIcon, label: "Square", tool: "rect" },
  { icon: SquareIcon, label: "Rounded rectangle", tool: "rounded" },
  { icon: CircleIcon, label: "Circle", tool: "ellipse" },
  // Last, and separated below, because it is not a drawing tool: it paints
  // onto a picture instead of leaving a mark of its own.
  { icon: BucketIcon, label: "Mask an image", tool: "mask" },
];

/** Widths worth having, rather than a slider nobody wants to aim at. */
const WIDTHS = [2, 4, 8, 16];

/**
 * The same idea for the mask brush, an order of magnitude larger.
 *
 * A mask covers regions — a face, a sky, a card someone is holding — where a
 * pen marks lines. Painting a sky out at four canvas units is a hundred strokes
 * of work, so the mask brush gets its own scale rather than sharing one that
 * was chosen for drawing.
 */
const MASK_WIDTHS = [24, 48, 96, 160];

/** The width a brush adopts when it is picked and the current one is unusable. */
const MASK_DEFAULT_WIDTH = 48;
const WIDEST_PEN = 16;

const buttonClass = (isActive: boolean): string =>
  `draw-toolbar__button ${isActive ? "draw-toolbar__button--on" : ""}`;

export function DrawToolbar({
  onStyle,
  onTool,
  style,
  tool,
}: DrawToolbarProps) {
  const hasFill = !isTransparent(style.fill);

  return (
    <div className="draw-toolbar">
      <button
        aria-label="Select"
        aria-pressed={tool === null}
        className={buttonClass(tool === null)}
        onClick={() => onTool(null)}
        title="Select — esc"
        type="button"
      >
        <HugeiconsIcon icon={CursorMagicSelection02Icon} size={22} />
      </button>

      {/* Said out loud while a tool is on, because that is exactly when a
          person is wondering why nothing can be dragged any more. */}
      {tool === null ? null : (
        <span className="draw-toolbar__hint">esc to select</span>
      )}

      <span aria-hidden className="draw-toolbar__divider" />

      {TOOLS.map((entry) => (
        <button
          aria-label={entry.label}
          aria-pressed={tool === entry.tool}
          className={buttonClass(tool === entry.tool)}
          key={entry.tool}
          onClick={() => {
            onTool(entry.tool);
            // The two brushes work at different scales, so switching between
            // them carries a width the other cannot use — a mask painted at a
            // pen's weight covers almost nothing, and looks like the brush not
            // working rather than like a setting to change.
            if (entry.tool === "mask" && style.strokeWidth <= WIDEST_PEN) {
              onStyle({ ...style, strokeWidth: MASK_DEFAULT_WIDTH });
            }
            if (entry.tool !== "mask" && style.strokeWidth > WIDEST_PEN) {
              onStyle({ ...style, strokeWidth: DEFAULT_STROKE_WIDTH });
            }
          }}
          title={entry.label}
          type="button"
        >
          {/* The rounded rectangle borrows the square's glyph with its own
              corners, which reads more clearly than a third similar outline. */}
          <HugeiconsIcon
            className={
              entry.tool === "rounded"
                ? "draw-toolbar__icon--rounded"
                : undefined
            }
            icon={entry.icon}
            size={entry.tool === "rounded" ? 18 : 20}
          />
        </button>
      ))}

      <span aria-hidden className="draw-toolbar__divider" />

      {/* Stroke and fill as separate wells, labelled, because "which color am
          I setting" is the question a single swatch always raises. */}
      <span className="draw-toolbar__well">
        Line
        <ColorWell
          label="Stroke color"
          onChange={(stroke) => onStyle({ ...style, stroke })}
          value={style.stroke}
        />
      </span>

      <span className="draw-toolbar__well">
        Fill
        <ColorWell
          label="Fill color"
          onChange={(fill) => onStyle({ ...style, fill })}
          value={style.fill}
        />
      </span>

      {/* Filling is off by default: a shape drawn over a photograph is usually
          meant to mark it, not cover it. */}
      <button
        aria-label={hasFill ? "Remove fill" : "Add fill"}
        aria-pressed={hasFill}
        className={`draw-toolbar__fill ${
          hasFill ? "draw-toolbar__fill--on" : "draw-toolbar__fill--off"
        }`}
        onClick={() =>
          onStyle({ ...style, fill: hasFill ? NO_FILL : "#ffffff" })
        }
        type="button"
      >
        {hasFill ? "On" : "Off"}
      </button>

      <span aria-hidden className="draw-toolbar__divider" />

      <div className="draw-toolbar__weights">
        {(tool === "mask" ? MASK_WIDTHS : WIDTHS).map((width) => (
          <button
            aria-label={`Line weight ${width}`}
            aria-pressed={style.strokeWidth === width}
            className={`draw-toolbar__weight ${
              style.strokeWidth === width ? "draw-toolbar__weight--on" : ""
            }`}
            key={width}
            onClick={() => onStyle({ ...style, strokeWidth: width })}
            type="button"
          >
            <span
              className="draw-toolbar__dot"
              style={{
                height: Math.min(width, 10),
                width: Math.min(width, 10),
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
