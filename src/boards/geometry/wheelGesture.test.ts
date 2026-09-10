import { describe, expect, it } from "vitest";
import {
  panByWheel,
  type Viewport,
  wheelIntent,
  wheelPixels,
  zoomByWheel,
} from "./viewportModel";

/**
 * What the wheel means on a board.
 *
 * Every wheel used to zoom, which read as a decision and was really an
 * omission: it left a trackpad unable to pan at all, so moving around a board
 * needed the other hand on the space bar. Getting the rule wrong is not a
 * crash — it is a board that feels wrong to everybody and is hard to name.
 */

describe("the wheel on a canvas", () => {
  const at = (scale: number, tx: number, ty: number): Viewport => ({
    scale,
    tx,
    ty,
  });

  it("moves the board when nothing is held", () => {
    // Two fingers on a trackpad. This is the whole point: before it, every
    // wheel zoomed and a trackpad could not pan at all.
    expect(wheelIntent({ ctrlKey: false, metaKey: false })).toBe("pan");
  });

  it("zooms for a pinch, which arrives as ctrl+wheel", () => {
    expect(wheelIntent({ ctrlKey: true, metaKey: false })).toBe("zoom");
  });

  it("zooms for cmd+wheel, which is what a mouse reaches for", () => {
    expect(wheelIntent({ ctrlKey: false, metaKey: true })).toBe("zoom");
  });

  it("moves the board the opposite way to the scroll", () => {
    // A wheel says how far the content should travel; the offset says where
    // the board has been put. Scrolling down moves the board up.
    const panned = panByWheel(at(1, 0, 0), 0, 100, 0);
    expect(panned.ty).toBe(-100);
    expect(panned.tx).toBe(0);
  });

  it("moves sideways too, unlike a page", () => {
    const panned = panByWheel(at(1, 0, 0), 40, 0, 0);
    expect(panned.tx).toBe(-40);
  });

  it("leaves the zoom alone while panning", () => {
    expect(panByWheel(at(2.5, 10, 10), 5, 5, 0).scale).toBe(2.5);
  });

  it("reads a line-mode wheel as pixels", () => {
    // Firefox with a real mouse reports lines. Treating three lines as three
    // pixels makes the board barely move; treating three pixels as three
    // lines would throw it across the screen.
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(3, 0)).toBe(3);
    expect(wheelPixels(1, 2)).toBe(800);
    expect(panByWheel(at(1, 0, 0), 0, 3, 1).ty).toBe(-48);
  });

  it("scales a line-mode wheel's zoom the same way", () => {
    const rect = { height: 200, left: 0, top: 0, width: 200 };
    const lines = zoomByWheel(at(1, 0, 0), 3, 100, 100, rect, 1);
    const pixels = zoomByWheel(at(1, 0, 0), 48, 100, 100, rect, 0);
    expect(lines.scale).toBeCloseTo(pixels.scale, 10);
  });
});
