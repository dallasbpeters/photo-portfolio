import { describe, expect, it } from "vitest";
import {
  bucketWidth,
  grownBucket,
  IMAGE_WIDTHS,
  wantedWidth,
} from "./imageBucket";

/**
 * The two rules that turn a freely-resized item into a stable image request.
 *
 * Both failures are silent and expensive. Rounding down serves a soft image,
 * which is the one artefact nobody accepts on a design surface. Letting the
 * bucket shrink swaps a decoded image for a pending one mid-drag — the flicker
 * that kept this canvas on full-size originals in the first place.
 */

describe("bucketWidth", () => {
  it("rounds up to the next rung, never down", () => {
    // Soft beats slow is never the trade on a design surface.
    expect(bucketWidth(257)).toBe(384);
    expect(bucketWidth(639)).toBe(640);
    expect(bucketWidth(641)).toBe(750);
  });

  it("returns a rung exactly when the width is already one", () => {
    for (const rung of IMAGE_WIDTHS) {
      expect(bucketWidth(rung)).toBe(rung);
    }
  });

  it("never returns a width the optimizer is not configured for", () => {
    for (let w = 1; w <= 2200; w += 7) {
      expect(IMAGE_WIDTHS).toContain(bucketWidth(w) as never);
    }
  });

  it("caps at the largest rung rather than asking for something absurd", () => {
    expect(bucketWidth(50_000)).toBe(2048);
  });

  it("survives the numbers a layout actually produces", () => {
    // Real board geometry is fractional — 546.1736075725403 was measured.
    expect(bucketWidth(546.173_607_572_540_3)).toBe(640);
    expect(bucketWidth(0)).toBe(256);
    expect(bucketWidth(-10)).toBe(256);
    // Nonsense falls to the smallest rung rather than the largest. Infinity is
    // not a layout value, and answering garbage with a 2048px request would
    // spend exactly what this module exists to save.
    expect(bucketWidth(Number.NaN)).toBe(256);
    expect(bucketWidth(Number.POSITIVE_INFINITY)).toBe(256);
  });
});

describe("wantedWidth", () => {
  it("asks for twice the pixels on a retina display", () => {
    expect(wantedWidth(500, 1)).toBe(640);
    expect(wantedWidth(500, 2)).toBe(1080);
  });

  it("caps the pixel ratio at 2", () => {
    // A 3x phone would otherwise ask for the largest rung on a thumbnail.
    expect(wantedWidth(500, 3)).toBe(wantedWidth(500, 2));
  });

  it("treats a missing or nonsense ratio as 1", () => {
    expect(wantedWidth(500, Number.NaN)).toBe(640);
    expect(wantedWidth(500, 0)).toBe(640);
    expect(wantedWidth(500, -2)).toBe(640);
  });

  it("holds one request across a whole drag within a bucket", () => {
    // The point of the whole exercise: a corner drag moves the width a few
    // pixels a frame and must not move the request at all.
    const widths = [520, 523.4, 531, 544, 550.9, 560, 578, 600, 630];
    const asked = new Set(widths.map((w) => wantedWidth(w, 1)));
    expect(asked.size).toBe(1);
  });
});

describe("grownBucket", () => {
  it("takes the first bucket when there is nothing loaded", () => {
    expect(grownBucket(null, 640)).toBe(640);
  });

  it("grows when the item is enlarged past its rung", () => {
    expect(grownBucket(640, 1080)).toBe(1080);
  });

  it("refuses to shrink, so shrinking never costs a swap", () => {
    // Re-requesting smaller would replace a decoded image with a pending one.
    expect(grownBucket(1080, 640)).toBe(1080);
    expect(grownBucket(1080, 256)).toBe(1080);
  });

  it("returns the same number when nothing changed, so callers can skip", () => {
    expect(grownBucket(640, 640)).toBe(640);
  });

  it("is monotonic across a resize that goes up and back down", () => {
    const seen = [256, 640, 1080, 640, 384, 1080, 256];
    let bucket: number | null = null;
    const history: number[] = [];
    for (const next of seen) {
      bucket = grownBucket(bucket, next);
      history.push(bucket);
    }
    expect(history).toEqual([256, 640, 1080, 1080, 1080, 1080, 1080]);
    // Three requests for seven size changes, and never a downgrade.
    expect(new Set(history).size).toBe(3);
  });
});
