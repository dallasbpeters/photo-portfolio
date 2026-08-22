/** biome-ignore-all lint/a11y/useSemanticElements: <explanation> */
import { useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  WIRE_BADGE_PX,
  WIRE_HIT_PX,
  WIRE_STROKE_PX,
} from "../../config/canvas.js";
import type { BoardItem, BoardWire } from "../types";
import {
  inputPointFor,
  outputPointFor,
  type Point,
  wirePath,
} from "./geometry/portGeometry";
import "./WireLayer.css";
import { motion } from "motion/react";

/*
 * The three states a wire is drawn in.
 *
 * Named here because two of them have to agree with something else. The hover
 * red is now literally the delete badge's red — one constant, used by the wire
 * and by the badge drawn on it, so the two cannot drift into almost-matching
 * reds. And the sending blue is the resting blue lifted rather than a new hue: a
 * wire that changes colour while it works reads as a different wire.
 *
 * Hover was previously the resting blue at 0.8 alpha, which over this canvas is
 * the resting blue. That is why hovering appeared to do nothing.
 */
/*
 * How much of a wire the travelling mark covers, as a fraction of its length.
 *
 * A fraction rather than a distance so it reads the same on a wire between
 * touching nodes and one spanning the canvas. Small enough to be a light moving
 * along the line rather than a dash pattern crawling down it.
 */
const COMET = 0.09;

const WIRE_REST = "oklch(67.2% 0.22 241.99)";
const WIRE_SENDING = "oklch(80% 0.25 241.99)";
const WIRE_HOVER = "oklch(50.1% 0.16 31.5)";

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
 * Whether this wire is carrying something right now.
 *
 * Derived from the nodes at both ends rather than stored on the wire: a wire
 * given state of its own is state to keep in sync, and `runState` already says
 * everything needed — it is set the moment Run is pressed and cleared when the
 * node settles, so the animation starts and stops with nothing telling it to.
 *
 * Both ends, because asking only the source was wrong and looked broken. Half
 * the things that feed a wire never run at all: Iterate, List, Prompt and a
 * pinned reference hold a value rather than producing one, and the run endpoint
 * rightly refuses to run one. On this board that left three wires out of five
 * unable to animate under any circumstances.
 *
 * So a wire is live while either end is working — the source producing, or the
 * target pulling its inputs in. A fan-out animates on all of its wires at once,
 * which is right: one node running is one node feeding every wire out of it.
 */
const isSending = (source: BoardItem, target: BoardItem): boolean =>
  source.runState === "running" || target.runState === "running";

function calculatePathGeometry(
  source: BoardItem,
  target: BoardItem,
  sourcePort: string,
  targetPort: string
) {
  const from = outputPointFor(source, sourcePort);
  const to = inputPointFor(target, targetPort);

  if (!(from && to)) {
    return null;
  }

  const { x: fromX, y: fromY } = from;
  const { x: toX, y: toY } = to;
  const d = wirePath(from, to);
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;

  return { d, midX, midY };
}

export function WireLayer({
  draft,
  items,
  onDelete,
  readOnly,
  scale,
  wires,
}: WireLayerProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const byId = new Map(items.map((item) => [item.id, item]));
  const stroke = WIRE_STROKE_PX / scale;
  const hit = WIRE_HIT_PX / scale;
  const badge = WIRE_BADGE_PX / scale;

  return (
    <motion.svg
      aria-hidden={wires.length === 0}
      className="wire-layer"
      fill="none"
      height={CANVAS_HEIGHT}
      role={wires.length === 0 ? undefined : "list"}
      width={CANVAS_WIDTH}
    >
      <title>Connections between items on this board</title>

      {wires.map((wire) => {
        const {
          id: wireId,
          sourceItemId,
          targetItemId,
          sourcePort,
          targetPort,
        } = wire;
        const source = byId.get(sourceItemId);
        const target = byId.get(targetItemId);

        if (!(source && target)) {
          return null;
        }

        const { kind: sourceKind } = source;
        const { kind: targetKind } = target;

        const isWireSending = isSending(source, target);
        const geometry = calculatePathGeometry(
          source,
          target,
          sourcePort,
          targetPort
        );

        if (!geometry) {
          return null;
        }
        const { d, midX, midY } = geometry;

        const isHovered = hovered === wireId;

        // Determine wire color state dynamically
        let strokeColor = WIRE_REST;
        if (isWireSending) {
          strokeColor = WIRE_SENDING;
        } else if (isHovered) {
          strokeColor = WIRE_HOVER;
        }

        return (
          <g key={wireId}>
            <title>{`${sourceKind} → ${targetKind}`}</title>

            {/* CORE PATH */}
            <motion.path
              animate={{
                opacity: 1,
                pathLength: 1,
                stroke: strokeColor,
              }}
              className="wire-layer__wire"
              d={d}
              initial={{ opacity: 0, pathLength: 0 }}
              stroke={isHovered ? "red" : "oklch(67.2% 0.22 241.99 / 0.8)"}
              strokeWidth={isHovered ? stroke * 1.5 : stroke}
              style={{ zIndex: 1000 }}
              transition={{
                opacity: { duration: 0.5, ease: "easeOut" },
                pathLength: { duration: 0.5, ease: "easeOut" },
                // Quick, so hovering feels like pointing rather than waiting.
                stroke: { duration: 0.2 },
              }}
            />

            {/*
                One small glow, travelling from the source to the target.

                `pathLength={1}` is the native SVG attribute, not motion's
                animated property — it renormalises the path so dash lengths are
                fractions of it. That is what makes this work on a wire of any
                length: `COMET` of the wire is lit, the gap behind it is the whole
                wire, so exactly one mark is ever visible and it is the same
                proportion whether the nodes are touching or a screen apart.

                It must stay off motion's `animate`, for the reason the core path
                above documents: animating `pathLength` there is implemented *with*
                dasharray and dashoffset, which would overwrite these.

                The offset runs to -(1 + COMET) rather than -1 so the mark clears
                the end completely before the loop restarts, instead of being
                clipped mid-flight at the target.

                The bloom is a CSS `drop-shadow`, not an SVG `<filter>`, and that
                is a correctness fix rather than a preference. An SVG filter's
                region defaults to `objectBoundingBox` units, so a percentage
                region is a percentage *of the path's bounding box* — and a wire
                between two nodes at the same height has a box of zero height. A
                zero-area filter region does not render, so on any level wire the
                mark vanished completely. Measured: one of five wires on a real
                board had a 120x0 box. `drop-shadow` applies to the rendered
                element and has no such dependency.

                Its lengths scale with the stroke, so the bloom holds its size on
                screen at any zoom — the same reasoning as the stroke itself.
             */}
            {isWireSending && (
              <motion.path
                animate={{ strokeDashoffset: [0, -(1 + COMET)] }}
                d={d}
                pathLength={1}
                stroke={WIRE_SENDING}
                strokeDasharray={`${COMET} 1`}
                strokeLinecap="round"
                strokeWidth={stroke * 1.75}
                style={{
                  // Two stacked shadows: a tight core and a wider halo. See the
                  // note above on why this is not an SVG filter.
                  filter: `drop-shadow(0 0 ${stroke}px ${WIRE_SENDING}) drop-shadow(0 0 ${stroke * 3}px ${WIRE_SENDING})`,
                  pointerEvents: "none",
                }}
                transition={{
                  duration: 1.4,
                  ease: "linear",
                  repeat: Number.POSITIVE_INFINITY,
                }}
              />
            )}

            {readOnly ? null : (
              <path
                d={d}
                onPointerEnter={() => setHovered(wireId)}
                onPointerLeave={() => setHovered(null)}
                stroke="transparent"
                strokeWidth={hit}
                style={{ pointerEvents: "stroke", zIndex: 1000 }}
              />
            )}
            {isHovered && !readOnly ? (
              <g
                className="wire-layer__hit"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onDelete?.(wireId);
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onDelete?.(wireId);
                }}
                onPointerEnter={() => setHovered(wireId)}
                onPointerLeave={() => setHovered(null)}
                role="button"
                style={{
                  cursor: "pointer",
                  pointerEvents: "all",
                  zIndex: 1000,
                }}
                tabIndex={0}
              >
                <title>Remove this connection</title>
                <circle
                  cx={midX}
                  cy={midY}
                  fill="rgb(24 24 27)"
                  r={badge}
                  stroke={WIRE_HOVER}
                  strokeWidth={stroke}
                />
                <motion.path
                  animate={{ opacity: 1, pathLength: 1 }}
                  d={`M ${midX - badge / 3} ${midY - badge / 3} L ${midX + badge / 3} ${midY + badge / 3} M ${midX + badge / 3} ${midY - badge / 3} L ${midX - badge / 3} ${midY + badge / 3}`}
                  initial={{ opacity: 0, pathLength: 0 }}
                  stroke={WIRE_HOVER}
                  strokeLinecap="round"
                  strokeWidth={stroke}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </g>
            ) : null}
          </g>
        );
      })}

      {draft
        ? (() => {
            const { from, to, isValid } = draft;
            return (
              <path
                d={wirePath(from, to)}
                stroke={
                  isValid ? "rgb(56 189 248 / 0.9)" : "rgb(248 113 113 / 0.9)"
                }
                strokeDasharray={isValid ? undefined : `${hit / 2} ${hit / 2}`}
                strokeWidth={stroke * 1.5}
              />
            );
          })()
        : null}
    </motion.svg>
  );
}
