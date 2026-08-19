import { describe, expect, it } from "vitest";
import { containRect } from "./containRect";

/**
 * The rule that stops a wired picture being squashed into the texture square.
 *
 * Worth pinning because the failure looks like a rendering choice rather than a
 * bug: a portrait dithered into a square reads as a subject who has been
 * squeezed, and nothing about it says the aspect ratio was thrown away.
 */

describe("containRect", () => {
  it("fills the box exactly when the source is already square", () => {
    expect(containRect(800, 800, 512)).toEqual({
      height: 512,
      width: 512,
      x: 0,
      y: 0,
    });
  });

  it("letterboxes a landscape picture rather than stretching it", () => {
    const rect = containRect(1000, 500, 512);
    expect(rect.width).toBe(512);
    expect(rect.height).toBe(256);
    // Centred vertically: half the leftover above, half below.
    expect(rect.y).toBe(128);
    expect(rect.x).toBe(0);
  });

  it("pillarboxes a portrait picture", () => {
    const rect = containRect(500, 1000, 512);
    expect(rect.height).toBe(512);
    expect(rect.width).toBe(256);
    expect(rect.x).toBe(128);
    expect(rect.y).toBe(0);
  });

  it("keeps the source aspect ratio, which is the whole point", () => {
    for (const [w, h] of [
      [1930, 1889],
      [2500, 1667],
      [1080, 1920],
      [3, 7],
    ]) {
      const rect = containRect(w, h, 512);
      expect(rect.width / rect.height).toBeCloseTo(w / h, 6);
    }
  });

  it("never draws outside the box", () => {
    for (const [w, h] of [
      [4000, 100],
      [100, 4000],
      [512, 513],
    ]) {
      const rect = containRect(w, h, 512);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(512.0001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(512.0001);
    }
  });

  it("scales a small picture up to fill the box", () => {
    // The texture is a fixed size, so a 64px source still has to fill it —
    // contained means "not cropped", not "never enlarged".
    const rect = containRect(64, 32, 512);
    expect(rect.width).toBe(512);
    expect(rect.height).toBe(256);
  });

  it("fills the box for a source that has not decoded yet", () => {
    for (const [w, h] of [
      [0, 0],
      [0, 100],
      [Number.NaN, 100],
    ]) {
      expect(containRect(w, h, 512)).toEqual({
        height: 512,
        width: 512,
        x: 0,
        y: 0,
      });
    }
  });
});
