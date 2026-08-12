import { HugeiconsIcon } from "@hugeicons/react";
import {
  BucketIcon,
  CircleIcon,
  CursorMagicSelection02Icon,
  PaintBrush02Icon,
  PenTool01Icon,
  SquareIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { ColorWell } from "./ColorWell";
import {
  DEFAULT_STROKE_WIDTH,
  type DrawTool,
  isTransparent,
  NO_FILL,
} from "./drawing";

/**
 * The drawing tools, and the colours the next mark is made in.
 *
 * Colours are chosen before drawing rather than after, because that is how
 * every drawing tool works and because a mark that appears in the wrong colour
 * and has to be corrected is a worse experience than picking first. Both
 * colours stay visible while drawing so there is never a question of what the
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
  `grid size-8 place-items-center rounded transition-colors ${
    isActive ? "bg-white text-black" : "text-white/60 hover:bg-white/10"
  }`;

export function DrawToolbar({
  onStyle,
  onTool,
  style,
  tool,
}: DrawToolbarProps) {
  const hasFill = !isTransparent(style.fill);

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 backdrop-blur">
      <button
        aria-label="Select"
        aria-pressed={tool === null}
        className={buttonClass(tool === null)}
        onClick={() => onTool(null)}
        title="Select — esc"
        type="button"
      >
        <HugeiconsIcon icon={CursorMagicSelection02Icon} size={15} />
      </button>

      {/* Said out loud while a tool is on, because that is exactly when a
          person is wondering why nothing can be dragged any more. */}
      {tool === null ? null : (
        <span className="px-1 text-[9px] text-white/35 uppercase tracking-[0.14em]">
          esc to select
        </span>
      )}

      <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />

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
            className={entry.tool === "rounded" ? "rounded-[3px]" : undefined}
            icon={entry.icon}
            size={entry.tool === "rounded" ? 13 : 15}
          />
        </button>
      ))}

      <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />

      {/* Stroke and fill as separate wells, labelled, because "which colour am
          I setting" is the question a single swatch always raises. */}
      <span className="flex items-center gap-1 text-[9px] text-white/40 uppercase tracking-[0.14em]">
        Line
        <ColorWell
          label="Stroke colour"
          onChange={(stroke) => onStyle({ ...style, stroke })}
          value={style.stroke}
        />
      </span>

      <span className="flex items-center gap-1 text-[9px] text-white/40 uppercase tracking-[0.14em]">
        Fill
        <ColorWell
          label="Fill colour"
          onChange={(fill) => onStyle({ ...style, fill })}
          value={style.fill}
        />
      </span>

      {/* Filling is off by default: a shape drawn over a photograph is usually
          meant to mark it, not cover it. */}
      <button
        aria-label={hasFill ? "Remove fill" : "Add fill"}
        aria-pressed={hasFill}
        className={`rounded px-1.5 py-1 text-[9px] uppercase tracking-[0.14em] transition-colors ${
          hasFill
            ? "text-white/70 hover:text-white"
            : "text-white/30 hover:text-white/60"
        }`}
        onClick={() =>
          onStyle({ ...style, fill: hasFill ? NO_FILL : "#ffffff" })
        }
        type="button"
      >
        {hasFill ? "On" : "Off"}
      </button>

      <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />

      <div className="flex items-center gap-0.5">
        {(tool === "mask" ? MASK_WIDTHS : WIDTHS).map((width) => (
          <button
            aria-label={`Line weight ${width}`}
            aria-pressed={style.strokeWidth === width}
            className={`grid size-7 place-items-center rounded transition-colors ${
              style.strokeWidth === width ? "bg-white/15" : "hover:bg-white/10"
            }`}
            key={width}
            onClick={() => onStyle({ ...style, strokeWidth: width })}
            type="button"
          >
            <span
              className="block rounded-full bg-white"
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
