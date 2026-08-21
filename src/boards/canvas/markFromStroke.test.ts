import { describe, expect, it } from "vitest";
import type { DrawStyle } from "../drawing/DrawToolbar";
import { markFromStroke } from "./markFromStroke";

/**
 * What a drag on the canvas turns into.
 *
 * Pinned because two of these decisions are silent when they go wrong: a drag
 * made upwards produces a box with a negative height that renders as nothing,
 * and a click on an armed tool leaves an invisible speck on the board that can
 * still be selected and moved.
 */

const style: DrawStyle = {
  fill: "#ff0000",
  stroke: "#000000",
  strokeWidth: 4,
};

describe("markFromStroke", () => {
  it("takes a rectangle from where the drag began and ended", () => {
    const mark = markFromStroke(
      [
        { x: 10, y: 20 },
        { x: 110, y: 140 },
      ],
      "rect",
      style
    );
    expect(mark?.box).toEqual({ height: 120, width: 100, x: 10, y: 20 });
  });

  it("reads a drag up and to the left the same as one down and right", () => {
    // Subtracting in drag order would give a negative width and height here,
    // and the shape would render as nothing at all.
    const mark = markFromStroke(
      [
        { x: 110, y: 140 },
        { x: 10, y: 20 },
      ],
      "rect",
      style
    );
    expect(mark?.box).toEqual({ height: 120, width: 100, x: 10, y: 20 });
  });

  it("refuses a drag too small to have been meant", () => {
    // A click on an armed tool. Without this it leaves a speck on the board
    // that is invisible and still selectable.
    expect(
      markFromStroke(
        [
          { x: 10, y: 10 },
          { x: 12, y: 11 },
        ],
        "rect",
        style
      )
    ).toBeNull();
  });

  it("refuses a stroke with no points", () => {
    expect(markFromStroke([], "rect", style)).toBeNull();
  });

  it("carries the style onto the shape", () => {
    const mark = markFromStroke(
      [
        { x: 0, y: 0 },
        { x: 200, y: 200 },
      ],
      "rect",
      style
    );
    expect(mark?.config).toMatchObject({
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 4,
      tool: "rect",
    });
  });

  it("gives a freehand line the box its path swept", () => {
    const mark = markFromStroke(
      [
        { x: 50, y: 50 },
        { x: 150, y: 90 },
        { x: 90, y: 200 },
      ],
      "pen",
      style
    );
    // Padded by the stroke width, which is drawn centred on the path and would
    // otherwise be clipped by the item's own edge.
    expect(mark?.box.x).toBeLessThanOrEqual(50);
    expect(mark?.box.y).toBeLessThanOrEqual(50);
    expect(mark?.box.width).toBeGreaterThanOrEqual(100);
    expect(mark?.box.height).toBeGreaterThanOrEqual(150);
  });

  it("stores a freehand path relative to its own box", () => {
    // So the mark scales with the item rather than staying at board
    // coordinates the moment it is dragged or resized.
    const mark = markFromStroke(
      [
        { x: 50, y: 50 },
        { x: 150, y: 90 },
        { x: 90, y: 200 },
      ],
      "pen",
      style
    );
    const points = mark?.config.points ?? [];
    expect(points).toHaveLength(3);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it("leaves a freehand line unfilled", () => {
    // A pen stroke is a line. Filling the area between its ends would close a
    // shape nobody drew.
    const mark = markFromStroke(
      [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      "pen",
      style
    );
    expect(mark?.config.fill).toBeNull();
  });

  it("keeps a freehand line however short it is", () => {
    // The minimum-size rule is about shapes: a short deliberate pen mark is a
    // dot, and refusing it would make the pen feel broken.
    const mark = markFromStroke(
      [
        { x: 10, y: 10 },
        { x: 12, y: 11 },
      ],
      "pen",
      style
    );
    expect(mark).not.toBeNull();
  });
});
