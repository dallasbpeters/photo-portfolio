import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../../config/canvas.js";
import type { BoardItem } from "../types";

/**
 * The set of things a drag can snap to, arranged so a frame of dragging does
 * not have to look at all of them.
 *
 * The old guide code rebuilt two 3n-element arrays on every pointermove and
 * then compared every moving edge against every one of them. On a board of a
 * few hundred items that is tens of thousands of comparisons per frame, for an
 * answer that only ever involves the handful of edges within a few pixels.
 *
 * So targets are indexed once, when the gesture starts:
 *
 *   - `xEdges` / `yEdges` hold every left/centre/right (and top/middle/bottom)
 *     coordinate, sorted. Finding the candidates near a moving edge is a binary
 *     search plus a walk over only what is actually within the snap radius.
 *   - `rows` / `columns` bucket targets into bands across the board, so the
 *     spacing pass can ask "what else is in this horizontal strip?" without
 *     filtering the whole board.
 *
 * Nothing here knows about guides or snapping; it is only the lookup structure.
 */

export interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * What a snap target is.
 *
 * Frames are distinguished from ordinary items because they are backdrops:
 * a caller may want to line up with one without treating it as a sibling. The
 * canvas rectangle is a target too, so items can be pushed against the edges
 * and centre lines of the board itself.
 */
export type TargetKind = "canvas" | "frame" | "item";

export interface Target extends Box {
  id: string;
  kind: TargetKind;
}

/** One of the three interesting coordinates of a target on one axis. */
export interface Edge {
  coord: number;
  target: Target;
}

/**
 * Reads one axis of a box, so a single piece of geometry serves both.
 *
 * `min`/`max`/`size` are along the axis; `crossMin`/`crossMax` are across it.
 */
export interface AxisSpec {
  crossMax: (b: Box) => number;
  crossMin: (b: Box) => number;
  max: (b: Box) => number;
  min: (b: Box) => number;
  size: (b: Box) => number;
}

export const AXIS_X: AxisSpec = {
  crossMax: (b) => b.y + b.height,
  crossMin: (b) => b.y,
  max: (b) => b.x + b.width,
  min: (b) => b.x,
  size: (b) => b.width,
};

export const AXIS_Y: AxisSpec = {
  crossMax: (b) => b.x + b.width,
  crossMin: (b) => b.x,
  max: (b) => b.y + b.height,
  min: (b) => b.y,
  size: (b) => b.height,
};

export interface SnapIndex {
  /** Targets bucketed by vertical band, sorted by y within each. */
  readonly columns: ReadonlyMap<number, Target[]>;
  /** Targets bucketed by horizontal band, sorted by x within each. */
  readonly rows: ReadonlyMap<number, Target[]>;
  readonly targets: readonly Target[];
  /** Every left/centre/right coordinate, ascending. */
  readonly xEdges: readonly Edge[];
  /** Every top/middle/bottom coordinate, ascending. */
  readonly yEdges: readonly Edge[];
}

export interface SnapIndexOptions {
  /** Ids of the items being dragged: they must not be their own targets. */
  exclude?: Iterable<string>;
  /** Whether the board rectangle is a target. Default true. */
  includeCanvas?: boolean;
}

/** The id given to the canvas pseudo-target, which is not a real item. */
export const CANVAS_TARGET_ID = "__canvas__";

/**
 * Band height for the spacing buckets, in canvas units.
 *
 * A little larger than a default image (320 tall) and smaller than a default
 * frame (900), which keeps a typical item in one or two bands while still
 * cutting a full-width board into fifteen strips. Cost of a wrong guess is only
 * a few extra overlap tests, never a wrong answer — the band is a cull, and
 * every candidate it yields is checked for real overlap afterwards.
 */
const BAND = 600;

/** Every band a span touches. */
const bandsFor = (min: number, size: number): number[] => {
  const first = Math.floor(min / BAND);
  const last = Math.floor((min + Math.max(size, 0)) / BAND);
  const out: number[] = [];
  for (let band = first; band <= last; band += 1) {
    out.push(band);
  }
  return out;
};

const bucket = (map: Map<number, Target[]>, key: number, target: Target) => {
  const list = map.get(key);
  if (list) {
    list.push(target);
  } else {
    map.set(key, [target]);
  }
};

/** The two edges and the centre: the three positions worth aligning to. */
const pushEdges = (into: Edge[], target: Target, min: number, size: number) => {
  into.push(
    { coord: min, target },
    { coord: min + size / 2, target },
    { coord: min + size, target }
  );
};

/**
 * Builds the index for one gesture.
 *
 * Call this when the drag begins, not on every move: it is O(n log n), which is
 * exactly the cost the per-frame path is trying to avoid paying repeatedly.
 */
export const buildSnapIndex = (
  items: readonly BoardItem[],
  options: SnapIndexOptions = {}
): SnapIndex => {
  const skip = new Set(options.exclude ?? []);
  const targets: Target[] = [];
  const columns = new Map<number, Target[]>();
  const rows = new Map<number, Target[]>();
  const xEdges: Edge[] = [];
  const yEdges: Edge[] = [];

  for (const item of items) {
    if (skip.has(item.id)) {
      continue;
    }
    const target: Target = {
      height: item.height,
      id: item.id,
      kind: item.kind === "frame" ? "frame" : "item",
      width: item.width,
      x: item.x,
      y: item.y,
    };
    targets.push(target);
    pushEdges(xEdges, target, target.x, target.width);
    pushEdges(yEdges, target, target.y, target.height);
    for (const band of bandsFor(target.y, target.height)) {
      bucket(rows, band, target);
    }
    for (const band of bandsFor(target.x, target.width)) {
      bucket(columns, band, target);
    }
  }

  if (options.includeCanvas !== false) {
    const canvas: Target = {
      height: CANVAS_HEIGHT,
      id: CANVAS_TARGET_ID,
      kind: "canvas",
      width: CANVAS_WIDTH,
      x: 0,
      y: 0,
    };
    targets.push(canvas);
    pushEdges(xEdges, canvas, 0, CANVAS_WIDTH);
    pushEdges(yEdges, canvas, 0, CANVAS_HEIGHT);
    // Deliberately not bucketed. It overlaps every band on the board, so it
    // would double the spacing pass's work to offer "an equal gap to the
    // canvas", which is not a relationship anyone is reaching for.
  }

  const byCoord = (a: Edge, b: Edge) => a.coord - b.coord;
  xEdges.sort(byCoord);
  yEdges.sort(byCoord);
  for (const list of rows.values()) {
    list.sort((a, b) => a.x - b.x);
  }
  for (const list of columns.values()) {
    list.sort((a, b) => a.y - b.y);
  }

  return { columns, rows, targets, xEdges, yEdges };
};

/** Index of the first edge at or after `coord`. */
const lowerBound = (edges: readonly Edge[], coord: number): number => {
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((edges[mid]?.coord ?? 0) < coord) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
};

/**
 * Visits every edge within `radius` of `coord`, nearest ones included in
 * whatever order they are stored.
 *
 * A callback rather than a returned array: this runs several times per frame
 * and the caller only ever reduces the result to one best match, so there is
 * nothing to be gained by allocating a list to throw away.
 */
export const forEachEdgeNear = (
  edges: readonly Edge[],
  coord: number,
  radius: number,
  visit: (edge: Edge) => void
): void => {
  const limit = coord + radius;
  for (let i = lowerBound(edges, coord - radius); i < edges.length; i += 1) {
    const edge = edges[i];
    if (!edge || edge.coord > limit) {
      return;
    }
    visit(edge);
  }
};

const overlaps = (
  aMin: number,
  aSize: number,
  bMin: number,
  bSize: number
): boolean => aMin < bMin + bSize && bMin < aMin + aSize;

/**
 * Targets sharing a horizontal strip with `box`, left to right.
 *
 * This is the set that can take part in horizontal spacing: two items on
 * opposite sides of the board with no vertical overlap are not a row, and
 * showing an equal-gap indicator between them would be noise.
 */
export const rowNeighbours = (index: SnapIndex, box: Box): Target[] => {
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const band of bandsFor(box.y, box.height)) {
    for (const target of index.rows.get(band) ?? []) {
      if (seen.has(target.id)) {
        continue;
      }
      seen.add(target.id);
      if (overlaps(box.y, box.height, target.y, target.height)) {
        out.push(target);
      }
    }
  }
  out.sort((a, b) => a.x - b.x);
  return out;
};

/** Targets sharing a vertical strip with `box`, top to bottom. */
export const columnNeighbours = (index: SnapIndex, box: Box): Target[] => {
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const band of bandsFor(box.x, box.width)) {
    for (const target of index.columns.get(band) ?? []) {
      if (seen.has(target.id)) {
        continue;
      }
      seen.add(target.id);
      if (overlaps(box.x, box.width, target.x, target.width)) {
        out.push(target);
      }
    }
  }
  out.sort((a, b) => a.y - b.y);
  return out;
};

/** The box enclosing several, for snapping a multi-selection as one thing. */
export const unionBounds = (boxes: readonly Box[]): Box | null => {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }
  if (left === Number.POSITIVE_INFINITY) {
    return null;
  }
  return { height: bottom - top, width: right - left, x: left, y: top };
};

/** One space in a gap indicator, measured along the axis the gaps run on. */
export interface Span {
  from: number;
  to: number;
}

export interface GapCandidate {
  gap: number;
  involved: Target[];
  /** Where the moving box's leading edge would land. */
  min: number;
  spans: Span[];
}

/** Neighbours wholly before and wholly after the moving box, nearest first. */
const split = (
  box: Box,
  neighbours: readonly Target[],
  axis: AxisSpec,
  threshold: number
): { after: Target[]; before: Target[] } => {
  const before: Target[] = [];
  const after: Target[] = [];
  for (const target of neighbours) {
    if (axis.max(target) <= axis.min(box) + threshold) {
      before.push(target);
    } else if (axis.min(target) >= axis.max(box) - threshold) {
      after.push(target);
    }
  }
  before.sort((a, b) => axis.max(b) - axis.max(a));
  after.sort((a, b) => axis.min(a) - axis.min(b));
  return { after, before };
};

/**
 * Equal-gap candidates on one axis.
 *
 * Three shapes, which between them cover what people actually do:
 *
 *   1. centring between the nearest neighbour on each side — dropping a third
 *      item between two others so the spaces match;
 *   2. continuing a run rightwards, from two items already evenly spaced;
 *   3. continuing that run leftwards, from two items on the far side.
 *
 * `neighbours` has already been culled to boxes overlapping the moving one
 * across the axis, so "nearest" means nearest in the same row or column rather
 * than nearest anywhere on the board.
 */
export const gapCandidates = (
  box: Box,
  neighbours: readonly Target[],
  axis: AxisSpec,
  threshold: number
): GapCandidate[] => {
  const size = axis.size(box);
  const { after, before } = split(box, neighbours, axis, threshold);
  const [b1, b2] = before;
  const [a1, a2] = after;
  const out: GapCandidate[] = [];

  if (b1 && a1) {
    const gap = (axis.min(a1) - axis.max(b1) - size) / 2;
    const min = axis.max(b1) + gap;
    if (gap >= 0) {
      out.push({
        gap,
        involved: [b1, a1],
        min,
        spans: [
          { from: axis.max(b1), to: min },
          { from: min + size, to: axis.min(a1) },
        ],
      });
    }
  }

  if (b1 && b2) {
    const gap = axis.min(b1) - axis.max(b2);
    const min = axis.max(b1) + gap;
    if (gap > 0) {
      out.push({
        gap,
        involved: [b2, b1],
        min,
        spans: [
          { from: axis.max(b2), to: axis.min(b1) },
          { from: axis.max(b1), to: min },
        ],
      });
    }
  }

  if (a1 && a2) {
    const gap = axis.min(a2) - axis.max(a1);
    const min = axis.min(a1) - gap - size;
    if (gap > 0) {
      out.push({
        gap,
        involved: [a1, a2],
        min,
        spans: [
          { from: min + size, to: axis.min(a1) },
          { from: axis.max(a1), to: axis.min(a2) },
        ],
      });
    }
  }
  return out;
};
