import type { BoardItem } from "../types";

/**
 * Snapping and alignment guides for dragging on the board.
 *
 * Works in canvas units throughout, and the threshold is converted from screen
 * pixels by the caller: at a fit-to-screen zoom a few screen pixels is a very
 * large distance on the canvas, so a fixed canvas-unit threshold would snap
 * from what looks like miles away when zoomed out, and refuse to snap at all
 * when zoomed in.
 */

export interface Guide {
  /** How far the line extends, so it spans the items it relates. */
  from: number;
  /** Canvas coordinate of the line. */
  position: number;
  to: number;
}

export interface Guides {
  horizontal: Guide[];
  vertical: Guide[];
}

export interface SnapResult {
  guides: Guides;
  x: number;
  y: number;
}

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** The three interesting positions on each axis: both edges and the centre. */
const edgesX = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
const edgesY = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];

/**
 * Finds the closest alignment on one axis.
 *
 * Returns the offset to apply to the moving box, plus the coordinate the guide
 * should be drawn at — which is the *target's* edge, not the moved one, since
 * that is the line the user is aligning to.
 */
const closest = (
  moving: number[],
  targets: number[],
  threshold: number
): { delta: number; line: number } | null => {
  let best: { delta: number; line: number } | null = null;

  for (const m of moving) {
    for (const t of targets) {
      const distance = Math.abs(m - t);
      if (distance > threshold) {
        continue;
      }
      if (!best || distance < Math.abs(best.delta)) {
        best = { delta: t - m, line: t };
      }
    }
  }
  return best;
};

/**
 * Snaps a dragged item to the items around it.
 *
 * Only the nearest alignment on each axis is taken. Applying every match at
 * once would fight itself — two targets a pixel apart would pull in opposite
 * directions and the item would judder.
 */
export const snapToGuides = (
  moving: Box,
  others: BoardItem[],
  threshold: number
): SnapResult => {
  const guides: Guides = { horizontal: [], vertical: [] };

  if (others.length === 0 || threshold <= 0) {
    return { guides, x: moving.x, y: moving.y };
  }

  const targetsX = others.flatMap((o) =>
    edgesX({ height: o.height, width: o.width, x: o.x, y: o.y })
  );
  const targetsY = others.flatMap((o) =>
    edgesY({ height: o.height, width: o.width, x: o.x, y: o.y })
  );

  const matchX = closest(edgesX(moving), targetsX, threshold);
  const matchY = closest(edgesY(moving), targetsY, threshold);

  const x = matchX ? moving.x + matchX.delta : moving.x;
  const y = matchY ? moving.y + matchY.delta : moving.y;

  // The guide spans from the moved item to whatever it lined up with, so it
  // reads as a relationship rather than an arbitrary line across the board.
  if (matchX) {
    const related = others.filter((o) =>
      edgesX({ height: o.height, width: o.width, x: o.x, y: o.y }).some(
        (e) => Math.abs(e - matchX.line) < 0.5
      )
    );
    const tops = [y, ...related.map((o) => o.y)];
    const bottoms = [y + moving.height, ...related.map((o) => o.y + o.height)];
    guides.vertical.push({
      from: Math.min(...tops),
      position: matchX.line,
      to: Math.max(...bottoms),
    });
  }

  if (matchY) {
    const related = others.filter((o) =>
      edgesY({ height: o.height, width: o.width, x: o.x, y: o.y }).some(
        (e) => Math.abs(e - matchY.line) < 0.5
      )
    );
    const lefts = [x, ...related.map((o) => o.x)];
    const rights = [x + moving.width, ...related.map((o) => o.x + o.width)];
    guides.horizontal.push({
      from: Math.min(...lefts),
      position: matchY.line,
      to: Math.max(...rights),
    });
  }

  return { guides, x, y };
};

export const NO_GUIDES: Guides = { horizontal: [], vertical: [] };
