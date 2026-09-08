import { describe, expect, it } from "vitest";
import { placeInViewport } from "./placeInViewport";

/**
 * A laptop window, because that is where menus were being clipped: the canvas
 * menu grows a row per applicable action, and a tall one opened halfway down a
 * 900px window lost its bottom rows entirely.
 */
const VIEWPORT = { height: 900, width: 1400 };

/** A canvas menu with most of its rows showing. */
const TALL = { height: 700, width: 240 };
const SMALL = { height: 120, width: 240 };

describe("placing a menu at the cursor", () => {
  it("sits just below and right of the cursor when there is room", () => {
    const at = placeInViewport({ x: 100, y: 100 }, SMALL, VIEWPORT);
    expect(at).toEqual({ left: 110, top: 92 });
  });

  it("never needs a height cap when it fits", () => {
    expect(
      placeInViewport({ x: 100, y: 100 }, SMALL, VIEWPORT).maxHeight
    ).toBeUndefined();
  });
});

describe("a menu that would run off the bottom", () => {
  it("flips above the cursor", () => {
    // 700 tall opened at y=800 would reach 1492 in a 900 window.
    const at = placeInViewport({ x: 100, y: 800 }, TALL, VIEWPORT);
    // The invariant, not a magic number: it ends above the cursor and inside
    // the window. Asserting the exact pixel is how the first version of this
    // test agreed with the arithmetic bug it was meant to catch.
    expect(at.top).toBeLessThan(800);
    expect(at.top).toBeGreaterThanOrEqual(8);
    expect(at.top + TALL.height).toBeLessThanOrEqual(VIEWPORT.height - 8);
  });

  it("stays fully on screen when opened at the very bottom", () => {
    const at = placeInViewport({ x: 100, y: 895 }, SMALL, VIEWPORT);
    expect(at.top).toBeGreaterThanOrEqual(8);
    expect(at.top + SMALL.height).toBeLessThanOrEqual(VIEWPORT.height - 8);
  });

  it("is the case from the screenshot: mid-window and tall", () => {
    // Opened at y=430 with 700 of rows: it fits neither below (462 of room)
    // nor above (422), which is precisely the clipping that was reported.
    const at = placeInViewport({ x: 200, y: 430 }, TALL, VIEWPORT);
    expect(at.top).toBeGreaterThanOrEqual(8);
    expect(at.maxHeight).toBeDefined();
    expect(at.top + (at.maxHeight ?? 0)).toBeLessThanOrEqual(VIEWPORT.height);
  });
});

describe("a menu taller than the window", () => {
  it("is capped so it can scroll rather than being cut off", () => {
    const at = placeInViewport(
      { x: 100, y: 400 },
      { height: 2000, width: 240 },
      VIEWPORT
    );
    expect(at.maxHeight).toBeLessThanOrEqual(VIEWPORT.height - 16);
    expect(at.maxHeight).toBeGreaterThan(0);
  });

  it("starts at the top margin, so the first rows are the visible ones", () => {
    const at = placeInViewport(
      { x: 100, y: 400 },
      { height: 2000, width: 240 },
      VIEWPORT
    );
    expect(at.top).toBe(8);
  });
});

describe("a menu that would run off the right", () => {
  it("flips to the left of the cursor", () => {
    const at = placeInViewport({ x: 1380, y: 100 }, SMALL, VIEWPORT);
    expect(at.left).toBe(1130);
    expect(at.left + SMALL.width).toBeLessThanOrEqual(VIEWPORT.width - 8);
  });

  it("clamps inside the edge when neither side fits", () => {
    const narrow = { height: 120, width: 1390 };
    const at = placeInViewport({ x: 700, y: 100 }, narrow, VIEWPORT);
    expect(at.left).toBeGreaterThanOrEqual(8);
    expect(at.left + narrow.width).toBeLessThanOrEqual(VIEWPORT.width);
  });
});

describe("before the menu has been measured", () => {
  it("uses the naive spot rather than guessing at a size", () => {
    // Zero-sized is the first render. Placing it from a guessed height would
    // make it visibly jump once measured.
    const at = placeInViewport(
      { x: 500, y: 500 },
      { height: 0, width: 0 },
      VIEWPORT
    );
    expect(at).toEqual({ left: 510, top: 492 });
  });
});
