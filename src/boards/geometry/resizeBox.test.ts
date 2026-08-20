import { describe, expect, it } from "vitest";
import { anchorOf, resizeBox } from "./resizeBox";

const ORIGIN = { height: 100, width: 200, x: 50, y: 40 };
const MIN = 24;

const resize = (
  handle: Parameters<typeof resizeBox>[0]["handle"],
  dx: number,
  dy: number,
  lockAspect = false
) => resizeBox({ dx, dy, handle, lockAspect, minSize: MIN, origin: ORIGIN });

describe("resizeBox — which corner stays put", () => {
  /**
   * The bug this exists for: every resize used to behave as though the
   * south-east handle had been dragged, so pulling the top-left of an item
   * grew it downward instead of moving its origin.
   */
  it("moves the origin when the north-west handle is dragged", () => {
    const box = resize("nw", 20, 10);
    expect(box).toEqual({ height: 90, width: 180, x: 70, y: 50 });
  });

  it("pins the origin when the south-east handle is dragged", () => {
    const box = resize("se", 20, 10);
    expect(box).toEqual({ height: 110, width: 220, x: 50, y: 40 });
  });

  it("moves x but not y for the south-west handle", () => {
    const box = resize("sw", 20, 10);
    expect(box).toEqual({ height: 110, width: 180, x: 70, y: 40 });
  });

  it("moves y but not x for the north-east handle", () => {
    const box = resize("ne", 20, 10);
    expect(box).toEqual({ height: 90, width: 220, x: 50, y: 50 });
  });

  it("holds the opposite corner still, whichever handle is used", () => {
    for (const handle of ["nw", "ne", "sw", "se"] as const) {
      const before = anchorOf(ORIGIN, handle);
      const after = anchorOf(resize(handle, 17, -11), handle);
      expect(after).toEqual(before);
    }
  });
});

describe("resizeBox — edge handles move one axis", () => {
  it("east changes width only", () => {
    expect(resize("e", 30, 999)).toEqual({
      height: 100,
      width: 230,
      x: 50,
      y: 40,
    });
  });

  it("north changes height and y only", () => {
    expect(resize("n", 999, 25)).toEqual({
      height: 75,
      width: 200,
      x: 50,
      y: 65,
    });
  });
});

describe("resizeBox — the minimum", () => {
  it("stops at the minimum rather than inverting", () => {
    const box = resize("se", -1000, -1000);
    expect(box.width).toBe(MIN);
    expect(box.height).toBe(MIN);
  });

  it("keeps the pinned corner still when the minimum is hit", () => {
    // Dragging the north-west handle far past the minimum must not walk the
    // box away under the pointer — the south-east corner is what is held.
    const box = resize("nw", 1000, 1000);
    expect(box.x + box.width).toBe(ORIGIN.x + ORIGIN.width);
    expect(box.y + box.height).toBe(ORIGIN.y + ORIGIN.height);
    expect(box.width).toBe(MIN);
  });
});

describe("resizeBox — aspect lock", () => {
  it("preserves the original ratio", () => {
    const box = resize("se", 100, 5, true);
    expect(box.width / box.height).toBeCloseTo(ORIGIN.width / ORIGIN.height, 6);
  });

  it("still holds the pinned corner while locked", () => {
    const box = resize("nw", 40, 5, true);
    expect(box.x + box.width).toBeCloseTo(ORIGIN.x + ORIGIN.width, 6);
    expect(box.y + box.height).toBeCloseTo(ORIGIN.y + ORIGIN.height, 6);
  });

  it("lets the axis that moved further win", () => {
    // dx is proportionally larger, so width leads and height follows it.
    const box = resize("se", 100, 1, true);
    expect(box.width).toBe(300);
    expect(box.height).toBeCloseTo(150, 6);
  });
});
