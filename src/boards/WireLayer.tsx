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
      <defs>
        <filter height="140%" id="wire-glow" width="140%" x="-20%" y="-20%">
          <feGaussianBlur result="blur" stdDeviation={stroke * 2} />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

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

            {/* GLOW PATH */}
            {isWireSending && (
              <motion.path
                animate={{
                  opacity: [0.3, 0.8, 0.3],
                }}
                d={d}
                stroke="oklch(67.2% 0.22 241.99 / 0.5)"
                strokeWidth={stroke * 4}
                style={{
                  filter: "url(#wire-glow)",
                  pointerEvents: "none",
                }}
                transition={{
                  duration: 2,
                  ease: "easeInOut",
                  repeat: Number.POSITIVE_INFINITY,
                }}
              />
            )}

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
                The travelling dash, on a path of its own.

                It cannot live on the core path above: `pathLength` is
                implemented *with* stroke-dasharray and stroke-dashoffset — motion
                normalises the path to a length of 1 and draws it in by moving the
                dash — so anything else animating those two is overwritten the
                moment the reveal runs. That is why the dash never moved. One path
                reveals, one path flows.

                Offset by exactly two dashes so the loop is seamless: the pattern
                lands back where it started and there is no visible jump.
             */}
            {isWireSending && (
              <motion.path
                animate={{ strokeDashoffset: [0, -(stroke * 8)] }}
                d={d}
                stroke={WIRE_SENDING}
                strokeDasharray={`${stroke * 4} ${stroke * 4}`}
                strokeLinecap="round"
                strokeWidth={stroke * 1.25}
                style={{ pointerEvents: "none" }}
                transition={{
                  duration: 1,
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
