import { describe, expect, it } from "vitest";
import { applyTransform, rotatedSize } from "./export";

/**
 * A 400x200 source with four distinctly coloured quadrants.
 *
 * The colours matter more than the dimensions: a transposed canvas or an
 * off-centre draw still produces a plausible-looking image, and only sampling a
 * known quadrant catches it. The bug this file was written for returned a
 * correctly-sized-looking canvas full of the wrong pixels.
 */
const QUADRANTS = {
  bottomLeft: "#0000ff",
  bottomRight: "#ffff00",
  topLeft: "#ff0000",
  topRight: "#00ff00",
} as const;

const makeSource = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context — these tests need a real browser");
  }
  const cells: [string, number, number][] = [
    [QUADRANTS.topLeft, 0, 0],
    [QUADRANTS.topRight, 200, 0],
    [QUADRANTS.bottomLeft, 0, 100],
    [QUADRANTS.bottomRight, 200, 100],
  ];
  for (const [colour, x, y] of cells) {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, 200, 100);
  }
  return canvas;
};

/** The colour at the centre of a canvas, as `#rrggbb`. */
const centreColour = (canvas: HTMLCanvasElement): string => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context");
  }
  const { data } = ctx.getImageData(
    Math.floor(canvas.width / 2),
    Math.floor(canvas.height / 2),
    1,
    1
  );
  return `#${[data[0], data[1], data[2]]
    .map((v) => (v ?? 0).toString(16).padStart(2, "0"))
    .join("")}`;
};

describe("rotatedSize", () => {
  it("leaves an unrotated box alone", () => {
    expect(rotatedSize(400, 200, 0)).toEqual({ height: 200, width: 400 });
  });

  it("swaps the axes at 90 degrees", () => {
    expect(rotatedSize(400, 200, 90)).toEqual({ height: 400, width: 200 });
  });

  it("grows to the diagonal at 45 degrees", () => {
    const { height, width } = rotatedSize(100, 100, 45);
    expect(width).toBe(141);
    expect(height).toBe(141);
  });

  it("normalises negative and over-turned angles", () => {
    expect(rotatedSize(400, 200, -90)).toEqual({ height: 400, width: 200 });
    expect(rotatedSize(400, 200, 450)).toEqual({ height: 400, width: 200 });
  });
});

describe("applyTransform", () => {
  /**
   * The regression this file exists for: `rotatedSize`'s result was
   * destructured with the keys swapped, so a 400x200 source exported as a
   * 200x400 canvas with the image drawn off-centre inside it. The preview path
   * destructured it correctly, so the crop looked right while it was being made
   * and came out wrong in the saved file.
   */
  it("returns the source dimensions unchanged when there is nothing to do", () => {
    const out = applyTransform(makeSource(), { crop: null, rotation: 0 });
    expect([out.width, out.height]).toEqual([400, 200]);
  });

  it("crops the top-right quadrant, not some other one", () => {
    const out = applyTransform(makeSource(), {
      crop: { height: 0.5, width: 0.5, x: 0.5, y: 0 },
      rotation: 0,
    });
    expect([out.width, out.height]).toEqual([200, 100]);
    expect(centreColour(out)).toBe(QUADRANTS.topRight);
  });

  it("crops the bottom-left quadrant, not some other one", () => {
    const out = applyTransform(makeSource(), {
      crop: { height: 0.5, width: 0.5, x: 0, y: 0.5 },
      rotation: 0,
    });
    expect([out.width, out.height]).toEqual([200, 100]);
    expect(centreColour(out)).toBe(QUADRANTS.bottomLeft);
  });

  it("crops the bottom-right quadrant, not some other one", () => {
    const out = applyTransform(makeSource(), {
      crop: { height: 0.5, width: 0.5, x: 0.5, y: 0.5 },
      rotation: 0,
    });
    expect(centreColour(out)).toBe(QUADRANTS.bottomRight);
  });

  it("swaps the canvas dimensions for a quarter turn", () => {
    const out = applyTransform(makeSource(), { crop: null, rotation: 90 });
    expect([out.width, out.height]).toEqual([200, 400]);
  });

  it("takes the crop from the rotated image, not the original", () => {
    // A quarter turn clockwise puts the original top-left quadrant at the
    // rotated top-right. Cropping the rotated top-right must therefore return
    // red, which is the whole meaning of "normalised within the rotated image".
    const out = applyTransform(makeSource(), {
      crop: { height: 0.5, width: 0.5, x: 0.5, y: 0 },
      rotation: 90,
    });
    expect(centreColour(out)).toBe(QUADRANTS.topLeft);
  });

  it("never returns a zero-sized canvas for a vanishingly small crop", () => {
    const out = applyTransform(makeSource(), {
      crop: { height: 0.0001, width: 0.0001, x: 0, y: 0 },
      rotation: 0,
    });
    expect(out.width).toBeGreaterThanOrEqual(1);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });
});
