import { describe, expect, it } from "vitest";
import { CANVAS_WIDTH, MIN_ITEM_SIZE } from "../../config/canvas.js";
import type { BoardItem, BoardItemKind } from "../types";
import {
  DEFAULT_SNAP_PX,
  type ResizeHandle,
  type SnapOptions,
  snapMove,
  snapResize,
  snapToGuides,
} from "./alignmentGuides";
import {
  type Box,
  buildSnapIndex,
  forEachEdgeNear,
  rowNeighbours,
  unionBounds,
} from "./snapIndex";

/**
 * The geometry is the product here, so these assert coordinates rather than
 * "something happened". Every case is arranged so the expected snap is the only
 * one within reach: a test that passes because two rules both fire proves
 * neither. Offsets are 4 canvas units (inside the 6-pixel default at scale 1)
 * or 10 (outside it), so "did it snap" is never a question of rounding.
 */

let counter = 0;

const box = (
  x: number,
  y: number,
  width: number,
  height: number,
  kind: BoardItemKind = "photo"
): BoardItem => {
  counter += 1;
  return {
    body: null,
    config: null,
    creditName: null,
    creditUrl: null,
    fontSize: null,
    height,
    id: `item-${counter}`,
    imageUrl: null,
    kind,
    nodeType: null,
    photoId: null,
    result: null,
    runError: null,
    runState: null,
    thumbUrl: null,
    width,
    x,
    y,
    z: 0,
  };
};

/**
 * An index of the given items and nothing else.
 *
 * The canvas rectangle is left out of most of these: its own edges and centre
 * lines are targets, and every test would otherwise have to be placed to dodge
 * them. It has tests of its own below.
 */
const indexOf = (items: BoardItem[]) =>
  buildSnapIndex(items, { includeCanvas: false });

/** One screen pixel per canvas unit, so the threshold reads as 6 units. */
const AT_1X: SnapOptions = { scale: 1 };

const move = (moving: Box, items: BoardItem[], options: SnapOptions = AT_1X) =>
  snapMove(moving, indexOf(items), options);

const resize = (b: Box, handle: ResizeHandle, items: BoardItem[]) =>
  snapResize(b, handle, indexOf(items), AT_1X);

describe("snapMove — edge alignment", () => {
  it("pulls a left edge onto another item's left edge", () => {
    const result = move({ height: 100, width: 100, x: 104, y: 400 }, [
      box(100, 0, 100, 100),
    ]);
    expect(result.x).toBe(100);
    expect(result.y).toBe(400);
    // The line is drawn at the target's edge and spans both boxes, so it reads
    // as a relationship rather than an arbitrary stripe across the board.
    expect(result.guides.vertical).toEqual([
      { from: 0, position: 100, to: 500 },
    ]);
    expect(result.guides.horizontal).toEqual([]);
  });

  it("pulls a right edge onto a left edge", () => {
    const result = move({ height: 100, width: 100, x: 97, y: 400 }, [
      box(200, 0, 100, 100),
    ]);
    expect(result.x).toBe(100);
    expect(result.guides.vertical[0]?.position).toBe(200);
  });

  it("aligns a top edge, which is a horizontal guide", () => {
    const result = move({ height: 100, width: 100, x: 900, y: 104 }, [
      box(0, 100, 100, 100),
    ]);
    expect(result.y).toBe(100);
    expect(result.guides.horizontal).toEqual([
      { from: 0, position: 100, to: 1000 },
    ]);
  });

  it("aligns centres, not only edges", () => {
    // The target's centre is at x=150. A 200-wide box whose centre sits at 154
    // has no edge anywhere near an edge of the target.
    const result = move({ height: 100, width: 200, x: 54, y: 400 }, [
      box(100, 0, 100, 100),
    ]);
    expect(result.x).toBe(50);
    expect(result.x + 100).toBe(150);
    expect(result.guides.vertical[0]?.position).toBe(150);
  });

  it("takes the nearest alignment when several are in reach", () => {
    const result = move({ height: 100, width: 100, x: 103, y: 400 }, [
      box(100, 0, 10, 100),
      box(105, 0, 10, 100),
    ]);
    expect(result.x).toBe(105);
  });

  it("does not fire beyond the threshold", () => {
    const result = move({ height: 100, width: 100, x: 110, y: 400 }, [
      box(100, 0, 100, 100),
    ]);
    expect(result.x).toBe(110);
    expect(result.guides.vertical).toEqual([]);
    expect(result.guides.horizontal).toEqual([]);
    expect(result.guides.spacing).toEqual([]);
  });

  it("does nothing at all when the threshold is zero", () => {
    const result = move(
      { height: 100, width: 100, x: 104, y: 400 },
      [box(100, 0, 100, 100)],
      { scale: 1, thresholdPx: 0 }
    );
    expect(result.x).toBe(104);
  });
});

describe("snapMove — the threshold is in screen pixels", () => {
  const target = () => [box(100, 0, 100, 100)];
  /** Ten canvas units away: outside six screen pixels at 1x, inside at 0.5x. */
  const moving = { height: 100, width: 100, x: 110, y: 400 };

  it("reaches further in canvas units when zoomed out", () => {
    const result = move(moving, target(), { scale: 0.5 });
    expect(result.x).toBe(100);
  });

  it("reaches less far when zoomed in", () => {
    const result = move(moving, target(), { scale: 2 });
    expect(result.x).toBe(110);
  });

  it("snaps from the same screen distance at every zoom", () => {
    for (const scale of [0.25, 1, 3]) {
      // Three screen pixels away, whatever the scale.
      const nudged = { height: 100, width: 100, x: 100 + 3 / scale, y: 400 };
      const result = move(nudged, target(), {
        scale,
        thresholdPx: DEFAULT_SNAP_PX,
      });
      expect(result.x).toBe(100);
    }
  });
});

describe("snapMove — equal spacing", () => {
  /** 0..100 and 400..500, leaving 300 of space between them. */
  const pair = () => [box(0, 0, 100, 100), box(400, 0, 100, 100)];

  it("centres a third box between two others", () => {
    // A 100-wide box in that space sits at 200, with a gap of 100 either side.
    const result = move({ height: 100, width: 100, x: 196, y: 0 }, pair());
    expect(result.x).toBe(200);
    expect(result.guides.spacing).toEqual([
      {
        axis: "x",
        cross: 50,
        gap: 100,
        spans: [
          { from: 100, to: 200 },
          { from: 300, to: 400 },
        ],
      },
    ]);
  });

  it("continues a run of evenly spaced items", () => {
    // 0..100 and 200..300 are 100 apart; the next place in that run is 400.
    const result = move({ height: 100, width: 100, x: 397, y: 0 }, [
      box(0, 0, 100, 100),
      box(200, 0, 100, 100),
    ]);
    expect(result.x).toBe(400);
    expect(result.guides.spacing[0]?.gap).toBe(100);
    expect(result.guides.spacing[0]?.spans).toEqual([
      { from: 100, to: 200 },
      { from: 300, to: 400 },
    ]);
  });

  it("spaces vertically as well, in a column", () => {
    const result = move({ height: 100, width: 100, x: 0, y: 196 }, [
      box(0, 0, 100, 100),
      box(0, 400, 100, 100),
    ]);
    expect(result.y).toBe(200);
    expect(result.guides.spacing[0]?.axis).toBe("y");
  });

  it("ignores boxes that share no row", () => {
    // The same two boxes, but the moving one is 500 below them: they are not a
    // row, and an equal-gap indicator between them would mean nothing.
    const result = move({ height: 100, width: 100, x: 196, y: 500 }, pair());
    expect(result.x).toBe(196);
    expect(result.guides.spacing).toEqual([]);
  });

  it("does not fire when the equal position is out of reach", () => {
    const result = move({ height: 100, width: 100, x: 185, y: 0 }, pair());
    expect(result.x).toBe(185);
    expect(result.guides.spacing).toEqual([]);
  });

  it("prefers a shared edge to a matching gap when both are in reach", () => {
    // Equal spacing would put the box at 200; an item's left edge sits at 198,
    // which is nearer. The edge wins and no spacing indicator is drawn.
    const result = move({ height: 100, width: 100, x: 197, y: 0 }, [
      ...pair(),
      box(198, 300, 100, 100),
    ]);
    expect(result.x).toBe(198);
    expect(result.guides.spacing).toEqual([]);
    expect(result.guides.vertical[0]?.position).toBe(198);
  });
});

describe("snapMove — a multi-selection moves as one box", () => {
  const first = { height: 100, width: 100, x: 204, y: 0 };
  const second = { height: 60, width: 100, x: 204, y: 300 };
  const boundsOf = (boxes: Box[]): Box => {
    const bounds = unionBounds(boxes);
    if (!bounds) {
      throw new Error("a non-empty selection must have bounds");
    }
    return bounds;
  };

  it("encloses the whole set", () => {
    expect(unionBounds([first, second])).toEqual({
      height: 360,
      width: 100,
      x: 204,
      y: 0,
    });
    expect(unionBounds([])).toBeNull();
  });

  it("snaps the bounding box, and every item shifts by the same amount", () => {
    const bounds = boundsOf([first, second]);
    const result = move(bounds, [box(100, 0, 100, 100)]);
    expect(result.x).toBe(200);

    const dx = result.x - bounds.x;
    const dy = result.y - bounds.y;
    expect([first.x + dx, second.x + dx]).toEqual([200, 200]);
    // The arrangement inside the selection is untouched: only the set moved.
    expect(second.y + dy - (first.y + dy)).toBe(300);
  });

  it("aligns on the far edge of the set, which no member sits on", () => {
    // The bounding box runs 204..404; its right edge lands on a target at 400.
    const bounds = boundsOf([first, { ...first, x: 304 }]);
    const result = move(bounds, [box(400, 600, 100, 100)]);
    expect(result.x).toBe(200);
    expect(result.x + bounds.width).toBe(400);
  });
});

describe("frames and canvas edges are targets too", () => {
  it("snaps to a frame", () => {
    const index = indexOf([box(100, 0, 600, 600, "frame")]);
    expect(index.targets[0]?.kind).toBe("frame");
    const result = snapMove(
      { height: 100, width: 100, x: 104, y: 800 },
      index,
      AT_1X
    );
    expect(result.x).toBe(100);
  });

  it("snaps to the left edge of the canvas", () => {
    const moving = { height: 100, width: 100, x: 4, y: 4000 };
    expect(snapMove(moving, buildSnapIndex([]), AT_1X).x).toBe(0);
    // ...and not when the canvas is excluded, which is what the legacy path
    // relies on to behave exactly as it used to.
    expect(move(moving, []).x).toBe(4);
  });

  it("snaps to the centre line of the canvas", () => {
    const centre = CANVAS_WIDTH / 2;
    const result = snapMove(
      { height: 100, width: 100, x: centre - 50 + 4, y: 4000 },
      buildSnapIndex([]),
      AT_1X
    );
    expect(result.x + 50).toBe(centre);
  });

  it("never offers the dragged items as their own targets", () => {
    const moving = box(104, 0, 100, 100);
    const index = buildSnapIndex([moving, box(100, 0, 100, 100)], {
      exclude: [moving.id],
      includeCanvas: false,
    });
    expect(index.targets).toHaveLength(1);
    expect(snapMove(moving, index, AT_1X).x).toBe(100);
  });
});

describe("snapResize", () => {
  const target = () => [box(100, 0, 100, 100)];

  it("snaps the dragged right edge and leaves the left alone", () => {
    const r = resize({ height: 100, width: 196, x: 0, y: 400 }, "e", target());
    expect([r.x, r.width]).toEqual([0, 200]);
    expect(r.height).toBe(100);
    expect(r.guides.vertical[0]?.position).toBe(200);
  });

  it("snaps the dragged left edge and leaves the right alone", () => {
    const r = resize(
      { height: 100, width: 100, x: 204, y: 400 },
      "w",
      target()
    );
    expect([r.x, r.width]).toEqual([200, 104]);
    // The edge that was not dragged has not moved.
    expect(r.x + r.width).toBe(304);
  });

  it("snaps both edges of a corner handle", () => {
    const r = resize({ height: 96, width: 196, x: 0, y: 0 }, "se", target());
    expect([r.x, r.y]).toEqual([0, 0]);
    expect([r.width, r.height]).toEqual([200, 100]);
    expect(r.guides.vertical).toHaveLength(1);
    expect(r.guides.horizontal).toHaveLength(1);
  });

  it("only touches the axis the handle owns", () => {
    // The north handle is a hair from an alignment on x, and must ignore it.
    const r = resize(
      { height: 100, width: 100, x: 104, y: 104 },
      "n",
      target()
    );
    expect([r.x, r.width]).toEqual([104, 100]);
    expect([r.y, r.height]).toEqual([100, 104]);
    expect(r.guides.vertical).toEqual([]);
  });

  it("does not fire beyond the threshold", () => {
    const r = resize({ height: 100, width: 190, x: 0, y: 400 }, "e", target());
    expect(r.width).toBe(190);
    expect(r.guides.vertical).toEqual([]);
  });

  it("declines a snap that would take the box below the minimum size", () => {
    const tiny = MIN_ITEM_SIZE + 4;
    const r = resize({ height: 100, width: tiny, x: 0, y: 400 }, "e", [
      box(MIN_ITEM_SIZE - 1, 400, 100, 100),
    ]);
    // Snapping would have left it a unit under the minimum, so nothing
    // happened — clamping would have dragged the fixed left edge along.
    expect([r.x, r.width]).toEqual([0, tiny]);
    expect(r.guides.vertical).toEqual([]);
  });
});

describe("candidates are culled rather than scanned", () => {
  /** 500 items in a 25-wide grid, 400 apart. */
  const crowd = (): BoardItem[] => {
    const items: BoardItem[] = [];
    for (let i = 0; i < 500; i += 1) {
      items.push(box((i % 25) * 400, Math.floor(i / 25) * 400, 100, 100));
    }
    return items;
  };

  it("visits only the edges within the radius, not the whole board", () => {
    const index = indexOf(crowd());
    expect(index.xEdges).toHaveLength(1500);
    let visited = 0;
    forEachEdgeNear(index.xEdges, 4000, 6, () => {
      visited += 1;
    });
    // The 20 items in the column at x=4000 contribute one left edge each, and
    // nothing else on the board is within six units of it.
    expect(visited).toBe(20);
  });

  it("offers only the row for spacing, not every item", () => {
    const row = rowNeighbours(indexOf(crowd()), {
      height: 100,
      width: 100,
      x: 0,
      y: 0,
    });
    expect(row).toHaveLength(25);
    expect(row.every((t) => t.y === 0)).toBe(true);
    // Sorted along the axis, which is what makes "nearest neighbour" cheap.
    const xs = row.map((t) => t.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("still finds the right alignment on a crowded board", () => {
    const result = move({ height: 100, width: 100, x: 4004, y: 3600 }, crowd());
    expect(result.x).toBe(4000);
    expect(result.y).toBe(3600);
  });
});

describe("snapToGuides — the legacy entry point", () => {
  it("still snaps in canvas units, as the canvas calls it", () => {
    const result = snapToGuides(
      { height: 100, width: 100, x: 104, y: 400 },
      [box(100, 0, 100, 100)],
      6
    );
    expect(result.x).toBe(100);
    expect(result.guides.vertical[0]?.position).toBe(100);
  });

  it("declines a non-positive threshold", () => {
    const result = snapToGuides(
      { height: 100, width: 100, x: 104, y: 400 },
      [box(100, 0, 100, 100)],
      0
    );
    expect(result.x).toBe(104);
  });
});
