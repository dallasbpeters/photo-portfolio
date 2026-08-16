import { MIN_ITEM_SIZE } from "../../config/canvas.js";
import type { BoardItem } from "../types";
import {
  AXIS_X,
  AXIS_Y,
  type AxisSpec,
  type Box,
  buildSnapIndex,
  columnNeighbours,
  type Edge,
  forEachEdgeNear,
  type GapCandidate,
  gapCandidates,
  rowNeighbours,
  type SnapIndex,
  type Span,
  type Target,
} from "./snapIndex";

/**
 * Smart guides: what a drag lines up with, and where it lands.
 *
 * Geometry is in canvas units, but the snap radius arrives in SCREEN pixels and
 * is divided by the viewport scale here. A fixed canvas-unit threshold snaps
 * from what looks like miles away when zoomed out and refuses to snap at all
 * when zoomed in; six screen pixels is six screen pixels at every zoom, which
 * is the only thing the hand can judge.
 *
 * Three relationships are recognised — edges lining up, centres lining up, and
 * equal gaps, which is dropping an item between two others so the space either
 * side matches, or continuing a run of evenly spaced ones.
 *
 * Only the nearest match on each axis is applied. Taking every match at once
 * would fight itself: two targets a unit apart pull in opposite directions and
 * the item judders.
 *
 * The targets themselves live in `snapIndex.ts`: build one index when a gesture
 * starts and hand it to every frame of that gesture.
 */

/** A single alignment line. `from`/`to` span the items it relates. */
export interface Guide {
  from: number;
  /** Canvas coordinate of the line. */
  position: number;
  to: number;
}

/**
 * An equal-gap indicator: the matching spaces drawn as the little end-capped
 * bars Figma puts between evenly spaced items.
 */
export interface SpacingGuide {
  /** "x" when the gaps run left to right, "y" when they run top to bottom. */
  axis: "x" | "y";
  /** Cross-axis coordinate the bars are centred on. */
  cross: number;
  /** The gap being matched, in canvas units. */
  gap: number;
  spans: Span[];
}

export interface Guides {
  horizontal: Guide[];
  spacing: SpacingGuide[];
  vertical: Guide[];
}

export interface SnapOptions {
  /** Viewport scale: screen pixels per canvas unit. */
  scale: number;
  /** Snap radius in SCREEN pixels. Defaults to DEFAULT_SNAP_PX. */
  thresholdPx?: number;
}

export interface SnapResult {
  guides: Guides;
  x: number;
  y: number;
}

export interface ResizeResult extends Box {
  guides: Guides;
}

/** Which handle is being dragged; only the edges it owns may move. */
export type ResizeHandle = "e" | "n" | "ne" | "nw" | "s" | "se" | "sw" | "w";

/** Close enough to be the same line, in canvas units. */
const EPSILON = 0.5;

export const DEFAULT_SNAP_PX = 6;

export const NO_GUIDES: Guides = { horizontal: [], spacing: [], vertical: [] };

const emptyGuides = (): Guides => ({
  horizontal: [],
  spacing: [],
  vertical: [],
});

/**
 * The snap radius in canvas units.
 *
 * A non-positive scale would turn the threshold into nonsense, and a
 * non-positive threshold means the caller wants snapping off.
 */
const canvasThreshold = (options: SnapOptions): number => {
  const px = options.thresholdPx ?? DEFAULT_SNAP_PX;
  return options.scale > 0 ? px / options.scale : 0;
};

interface EdgeMatch {
  delta: number;
  line: number;
  /** Everything sitting on that line, so the guide can span them. */
  related: Target[];
}

/**
 * The nearest alignment for any of `coords`.
 *
 * The guide is drawn at the *target's* coordinate rather than the moved one:
 * that is the line being aligned to, and after the snap they are the same
 * number anyway.
 */
const matchEdges = (
  coords: readonly number[],
  edges: readonly Edge[],
  threshold: number
): EdgeMatch | null => {
  let best = Number.POSITIVE_INFINITY;
  let delta = 0;
  let line = 0;
  for (const coord of coords) {
    forEachEdgeNear(edges, coord, threshold, (edge) => {
      const distance = Math.abs(edge.coord - coord);
      if (distance < best) {
        best = distance;
        delta = edge.coord - coord;
        line = edge.coord;
      }
    });
  }
  if (best === Number.POSITIVE_INFINITY) {
    return null;
  }
  const related: Target[] = [];
  forEachEdgeNear(edges, line, EPSILON, (edge) => {
    if (!related.includes(edge.target)) {
      related.push(edge.target);
    }
  });
  return { delta, line, related };
};

interface SpacingMatch extends GapCandidate {
  delta: number;
}

const matchSpacing = (
  box: Box,
  neighbours: readonly Target[],
  axis: AxisSpec,
  threshold: number
): SpacingMatch | null => {
  let best: SpacingMatch | null = null;
  for (const candidate of gapCandidates(box, neighbours, axis, threshold)) {
    const delta = candidate.min - axis.min(box);
    if (Math.abs(delta) > threshold) {
      continue;
    }
    if (!best || Math.abs(delta) < Math.abs(best.delta)) {
      best = { ...candidate, delta };
    }
  }
  return best;
};

/** Where the gap bars sit: the middle of the strip everything shares. */
const crossCentre = (
  box: Box,
  involved: readonly Target[],
  axis: AxisSpec
): number => {
  let from = axis.crossMin(box);
  let to = axis.crossMax(box);
  for (const target of involved) {
    from = Math.max(from, axis.crossMin(target));
    to = Math.min(to, axis.crossMax(target));
  }
  return (from + to) / 2;
};

interface AxisSnap {
  delta: number;
  edge: EdgeMatch | null;
  spacing: SpacingMatch | null;
}

/**
 * One snap per axis. Alignment wins a tie: a shared edge is the stronger, more
 * legible relationship, and it is the one the eye checks.
 */
const preferred = (
  edge: EdgeMatch | null,
  spacing: SpacingMatch | null
): AxisSnap | null => {
  if (edge && (!spacing || Math.abs(edge.delta) <= Math.abs(spacing.delta))) {
    return { delta: edge.delta, edge, spacing: null };
  }
  if (spacing) {
    return { delta: spacing.delta, edge: null, spacing };
  }
  return null;
};

/** A vertical line, spanning the moved box and everything it lined up with. */
const verticalGuide = (match: EdgeMatch, box: Box): Guide => ({
  from: Math.min(box.y, ...match.related.map((t) => t.y)),
  position: match.line,
  to: Math.max(box.y + box.height, ...match.related.map((t) => t.y + t.height)),
});

const horizontalGuide = (match: EdgeMatch, box: Box): Guide => ({
  from: Math.min(box.x, ...match.related.map((t) => t.x)),
  position: match.line,
  to: Math.max(box.x + box.width, ...match.related.map((t) => t.x + t.width)),
});

/** Adds whichever guide an axis's chosen snap calls for. */
const describe = (
  snap: AxisSnap | null,
  box: Box,
  axis: AxisSpec,
  guides: Guides
) => {
  const horizontal = axis === AXIS_Y;
  if (snap?.edge) {
    if (horizontal) {
      guides.horizontal.push(horizontalGuide(snap.edge, box));
    } else {
      guides.vertical.push(verticalGuide(snap.edge, box));
    }
  }
  if (snap?.spacing) {
    guides.spacing.push({
      axis: horizontal ? "y" : "x",
      cross: crossCentre(box, snap.spacing.involved, axis),
      gap: snap.spacing.gap,
      spans: snap.spacing.spans,
    });
  }
};

/**
 * Snaps a box being dragged, and says what it lined up with.
 *
 * For a multi-selection this box is the bounding box of everything moving — see
 * `unionBounds` in snapIndex.ts. The caller applies the returned offset to every
 * item in the set, which keeps their arrangement relative to one another exact
 * while the set as a whole lines up with the board.
 */
export const snapMove = (
  moving: Box,
  index: SnapIndex,
  options: SnapOptions
): SnapResult => {
  const guides = emptyGuides();
  const threshold = canvasThreshold(options);
  if (threshold <= 0) {
    return { guides, x: moving.x, y: moving.y };
  }

  const xSnap = preferred(
    matchEdges(
      [moving.x, moving.x + moving.width / 2, moving.x + moving.width],
      index.xEdges,
      threshold
    ),
    matchSpacing(moving, rowNeighbours(index, moving), AXIS_X, threshold)
  );
  const ySnap = preferred(
    matchEdges(
      [moving.y, moving.y + moving.height / 2, moving.y + moving.height],
      index.yEdges,
      threshold
    ),
    matchSpacing(moving, columnNeighbours(index, moving), AXIS_Y, threshold)
  );

  const x = moving.x + (xSnap?.delta ?? 0);
  const y = moving.y + (ySnap?.delta ?? 0);
  const settled: Box = { height: moving.height, width: moving.width, x, y };
  describe(xSnap, settled, AXIS_X, guides);
  describe(ySnap, settled, AXIS_Y, guides);
  return { guides, x, y };
};

/**
 * The alignment for the one edge a handle owns on an axis, or null when it owns
 * neither — the north handle has nothing to say about x.
 */
const matchHandleEdge = (
  low: boolean,
  high: boolean,
  lowCoord: number,
  highCoord: number,
  edges: readonly Edge[],
  threshold: number
): EdgeMatch | null =>
  low || high
    ? matchEdges([low ? lowCoord : highCoord], edges, threshold)
    : null;

/**
 * One axis of a resize. `low` means the handle owns the leading edge, which
 * moves the origin as well as the size; otherwise the origin stays put.
 *
 * Null when the snap would take the box below the minimum size: declining is
 * right where clamping would silently drag the fixed edge along.
 */
const resizedAxis = (
  start: number,
  size: number,
  delta: number,
  low: boolean
): { size: number; start: number } | null => {
  const next = low ? size - delta : size + delta;
  return next < MIN_ITEM_SIZE
    ? null
    : { size: next, start: low ? start + delta : start };
};

/**
 * Snaps the edge or corner being dragged during a resize.
 *
 * Only the edges the handle owns move: dragging the east handle changes the
 * right edge and the width and leaves x alone. The opposite edge staying put is
 * the whole meaning of a resize, so a snap that shifted it would be a move
 * wearing a resize's clothes.
 */
export const snapResize = (
  box: Box,
  handle: ResizeHandle,
  index: SnapIndex,
  options: SnapOptions
): ResizeResult => {
  const guides = emptyGuides();
  const result: Box = {
    height: box.height,
    width: box.width,
    x: box.x,
    y: box.y,
  };
  const threshold = canvasThreshold(options);
  if (threshold <= 0) {
    return { ...result, guides };
  }

  const west = handle.includes("w");
  const north = handle.includes("n");
  const matchX = matchHandleEdge(
    west,
    handle.includes("e"),
    box.x,
    box.x + box.width,
    index.xEdges,
    threshold
  );
  const matchY = matchHandleEdge(
    north,
    handle.includes("s"),
    box.y,
    box.y + box.height,
    index.yEdges,
    threshold
  );
  const nextX = matchX
    ? resizedAxis(box.x, box.width, matchX.delta, west)
    : null;
  const nextY = matchY
    ? resizedAxis(box.y, box.height, matchY.delta, north)
    : null;
  if (nextX) {
    result.width = nextX.size;
    result.x = nextX.start;
  }
  if (nextY) {
    result.height = nextY.size;
    result.y = nextY.start;
  }

  // Drawn from the settled box, so the line spans where the item ended up —
  // and only when the snap was actually taken.
  if (matchX && nextX) {
    guides.vertical.push(verticalGuide(matchX, result));
  }
  if (matchY && nextY) {
    guides.horizontal.push(horizontalGuide(matchY, result));
  }
  return { ...result, guides };
};

/**
 * The original one-shot entry point, kept so the canvas keeps compiling while
 * integration catches up.
 *
 * @deprecated Build a `SnapIndex` once when the gesture starts and call
 * `snapMove`. This rebuilds the index on every call, which is the O(n) cost per
 * frame the index exists to remove. `threshold` here is in canvas units, as it
 * always was, and the canvas rectangle is not a target — both to keep the old
 * behaviour exactly.
 */
export const snapToGuides = (
  moving: Box,
  others: BoardItem[],
  threshold: number
): SnapResult =>
  snapMove(moving, buildSnapIndex(others, { includeCanvas: false }), {
    scale: 1,
    thresholdPx: threshold,
  });
