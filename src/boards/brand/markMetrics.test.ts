import { describe, expect, it } from "vitest";
import {
  bakedClearSpace,
  contrastRatio,
  inkBounds,
  inkCoverage,
  legibilityAt,
  type Pixels,
} from "./markMetrics";

/**
 * Measuring a mark, which is the half of a proof sheet that is arithmetic.
 *
 * Every number here is one a brand kit already declares and has never had
 * tested. Getting them wrong is quiet in the worst way: a confident figure
 * next to a picture, agreeing with the number somebody typed, both wrong.
 */

/** An image with a solid rectangle of ink in it, and transparency elsewhere. */
const withInk = (
  width: number,
  height: number,
  ink: { h: number; w: number; x: number; y: number }
): Pixels => {
  const data = new Uint8ClampedArray(width * height * 4);
  const { h, w, x: left, y: top } = ink;
  for (let y = top; y < top + h; y += 1) {
    for (let x = left; x < left + w; x += 1) {
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { data, height, width };
};

describe("inkBounds", () => {
  it("finds the tight box around the artwork", () => {
    const box = inkBounds(withInk(100, 100, { h: 20, w: 40, x: 10, y: 30 }));
    expect(box).toEqual({ height: 20, width: 40, x: 10, y: 30 });
  });

  it("says nothing rather than nonsense for an empty file", () => {
    // A logo saved with its artwork on a hidden layer exports as a
    // transparent rectangle. The sheet should say so, not divide by zero on
    // the way to a confident wrong number.
    expect(inkBounds(withInk(50, 50, { h: 0, w: 0, x: 0, y: 0 }))).toBeNull();
  });

  it("counts a single pixel as a box of one", () => {
    expect(inkBounds(withInk(10, 10, { h: 1, w: 1, x: 4, y: 6 }))).toEqual({
      height: 1,
      width: 1,
      x: 4,
      y: 6,
    });
  });
});

describe("inkCoverage", () => {
  it("reports how much of the file the mark occupies", () => {
    // A quarter of a 100x100 file.
    expect(
      inkCoverage(withInk(100, 100, { h: 50, w: 50, x: 0, y: 0 }))
    ).toBeCloseTo(0.25, 5);
  });

  it("is zero for an empty file", () => {
    expect(inkCoverage(withInk(10, 10, { h: 0, w: 0, x: 0, y: 0 }))).toBe(0);
  });
});

describe("bakedClearSpace", () => {
  it("measures the padding already in the file, in the kit's own unit", () => {
    // 20px of margin around a 40px-wide mark is half its width.
    const image = withInk(80, 80, { h: 40, w: 40, x: 20, y: 20 });
    expect(bakedClearSpace(image)).toBeCloseTo(0.5, 5);
  });

  it("takes the worst side, because clear space is a guarantee", () => {
    // Generous on three sides, tight on the left. The guarantee is the 5.
    const image = withInk(100, 100, { h: 40, w: 40, x: 5, y: 30 });
    expect(bakedClearSpace(image)).toBeCloseTo(5 / 40, 5);
  });

  it("is zero when the mark touches the edge", () => {
    expect(bakedClearSpace(withInk(40, 40, { h: 40, w: 40, x: 0, y: 0 }))).toBe(
      0
    );
  });
});

describe("legibilityAt", () => {
  it("passes a mark that fills its file", () => {
    const image = withInk(100, 100, { h: 100, w: 100, x: 0, y: 0 });
    const check = legibilityAt(image, 24, 24);
    expect(check?.shrinksTo).toBeCloseTo(24, 5);
    expect(check?.passes).toBe(true);
  });

  it("fails a mark that is mostly margin, which is the invisible fault", () => {
    /*
     * The commonest fault in a supplied logo. Exported with a wide transparent
     * border it looks right on its own, and then lands far smaller than the
     * size it was placed at — because every layout sizes the file, not the
     * mark inside it.
     */
    const image = withInk(100, 100, { h: 30, w: 30, x: 35, y: 35 });
    const check = legibilityAt(image, 24, 24);
    expect(check?.shrinksTo).toBeCloseTo(7.2, 5);
    expect(check?.passes).toBe(false);
  });

  it("says nothing for an empty file", () => {
    expect(
      legibilityAt(withInk(10, 10, { h: 0, w: 0, x: 0, y: 0 }), 16, 16)
    ).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("gives WCAG's extremes", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("does not care which way round the pair is given", () => {
    expect(contrastRatio("#2e84f5", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#2e84f5"),
      10
    );
  });

  it("tolerates a missing hash, because palettes are typed by hand", () => {
    expect(contrastRatio("ffffff", "000000")).toBeCloseTo(21, 2);
  });

  it("fails closed on a colour it cannot read", () => {
    // 1 reads as "no contrast", so an unreadable value is refused rather than
    // quietly passing.
    expect(contrastRatio("rebeccapurple", "#ffffff")).toBe(1);
    expect(contrastRatio("#fff", "#000000")).toBe(1);
  });
});
