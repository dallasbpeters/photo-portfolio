import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  WIRE_HIT_PX,
  WIRE_STROKE_PX,
} from "../../config/canvas.js";
import type { BoardItem, BoardWire } from "../types";
import {
  inputPointFor,
  outputPointFor,
  type Point,
  wirePath,
} from "./portGeometry";

/** The wire currently being dragged out of a port, before it lands. */
export interface DraftWire {
  from: Point;
  /** False while the pointer is over something the wire cannot connect to. */
  isValid: boolean;
  to: Point;
}

interface WireLayerProps {
  draft: DraftWire | null;
  items: BoardItem[];
  onDelete?: (wireId: string) => void;
  readOnly: boolean;
  /** Current zoom, so wires stay a constant thickness on screen. */
  scale: number;
  wires: BoardWire[];
}

/**
 * The wires, drawn on the board itself.
 *
 * This SVG lives *inside* the canvas's `translate(...) scale(...)` wrapper, so
 * wire coordinates are canvas coordinates — the same numbers already stored on
 * every item. Nothing has to be projected into screen space, nothing has to be
 * recomputed when the board is panned or zoomed, and a wire can never drift out
 * of register with the node it connects.
 *
 * The trade is that stroke widths scale too, which is wrong: a wire should look
 * the same weight at every zoom. So they are divided by the current scale, the
 * same correction the alignment guides in BoardCanvas already apply.
 *
 * `pointer-events: none` on the SVG matters more than it looks. A transparent
 * element covering the whole 4000×3000 canvas would otherwise swallow every
 * background press, and the board could no longer be panned or deselected. Only
 * the strokes themselves take the pointer.
 */
export function WireLayer({
  draft,
  items,
  onDelete,
  readOnly,
  scale,
  wires,
}: WireLayerProps) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const stroke = WIRE_STROKE_PX / scale;
  const hit = WIRE_HIT_PX / scale;

  return (
    <svg
      aria-hidden={wires.length === 0}
      className="pointer-events-none absolute inset-0"
      fill="none"
      height={CANVAS_HEIGHT}
      role={wires.length === 0 ? undefined : "list"}
      width={CANVAS_WIDTH}
    >
      <title>Connections between items on this board</title>

      {wires.map((wire) => {
        const source = byId.get(wire.sourceItemId);
        const target = byId.get(wire.targetItemId);
        if (!(source && target)) {
          return null;
        }
        const from = outputPointFor(source, wire.sourcePort);
        const to = inputPointFor(target, wire.targetPort);
        if (!(from && to)) {
          return null;
        }
        const d = wirePath(from, to);

        return (
          <g key={wire.id}>
            <title>{`${source.kind} → ${target.kind}`}</title>
            <path d={d} stroke="rgb(56 189 248 / 0.55)" strokeWidth={stroke} />
            {/* A 2px curve is nearly impossible to hit with a pointer and
                hopeless with a thumb, so a wide invisible band carries the
                interaction. Only present when the board can be edited. */}
            {readOnly ? null : (
              <path
                className="pointer-events-stroke cursor-pointer"
                d={d}
                onPointerDown={(e) => {
                  // The surface would otherwise read this as a background
                  // press and start panning the board.
                  e.stopPropagation();
                  onDelete?.(wire.id);
                }}
                stroke="transparent"
                strokeWidth={hit}
              />
            )}
          </g>
        );
      })}

      {draft ? (
        <path
          d={wirePath(draft.from, draft.to)}
          // Dashed and red while the pointer is somewhere this cannot land, so
          // the refusal is visible during the drag rather than at the drop.
          stroke={
            draft.isValid ? "rgb(56 189 248 / 0.9)" : "rgb(248 113 113 / 0.9)"
          }
          strokeDasharray={draft.isValid ? undefined : `${hit / 2} ${hit / 2}`}
          strokeWidth={stroke * 1.5}
        />
      ) : null}
    </svg>
  );
}
