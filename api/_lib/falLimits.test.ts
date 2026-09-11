import { describe, expect, it } from "vitest";
import { FAL_MAX_BYTES, overFalLimit, SHRINK_STEPS } from "./falLimits.js";

/**
 * The rule that decides whether a picture has to be re-encoded for fal.
 *
 * fal refuses a source over five megabytes and refuses it as a failed
 * generation rather than a rejected input, so getting this wrong is invisible
 * in both directions: too eager and every run pays for a download and a
 * re-encode, too shy and the run fails with a message about a file nobody
 * uploaded.
 */

describe("overFalLimit", () => {
  it("lets a picture under the limit through untouched", () => {
    expect(overFalLimit(1)).toBe(false);
    expect(overFalLimit(FAL_MAX_BYTES - 1)).toBe(false);
  });

  it("lets one exactly at the limit through", () => {
    // fal's wording is "exceeds", and a re-encode that was not needed costs a
    // download and loses detail for nothing.
    expect(overFalLimit(FAL_MAX_BYTES)).toBe(false);
  });

  it("catches one over it", () => {
    expect(overFalLimit(FAL_MAX_BYTES + 1)).toBe(true);
    // The real one that started this: a 7MB PNG sitting on a board.
    expect(overFalLimit(7 * 1024 * 1024)).toBe(true);
  });

  it("treats an unknown size as fine", () => {
    // A HEAD without content-length is common. Shrinking everything on the
    // chance it might be large would make every run pay for a minority.
    expect(overFalLimit(null)).toBe(false);
  });
});

describe("the ladder", () => {
  it("tries the largest first", () => {
    const sides = SHRINK_STEPS.map((step) => step.side);
    expect(sides).toEqual([...sides].sort((a, b) => b - a));
  });

  it("lowers quality as it lowers size", () => {
    const quality = SHRINK_STEPS.map((step) => step.quality);
    expect(quality).toEqual([...quality].sort((a, b) => b - a));
  });

  it("has a rung small enough to be a real fallback", () => {
    // A run that reaches the bottom has a picture that will not compress. A
    // thousand pixels of subject beats a generation refused.
    expect(SHRINK_STEPS.at(-1)?.side).toBeLessThanOrEqual(1024);
  });
});
