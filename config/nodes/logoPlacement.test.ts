import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOGO_WIDTH,
  LOGO_WIDTH_MAX,
  logoBox,
} from "./logoPlacement.js";

/**
 * The arithmetic that decides whether a brand mark arrives intact.
 *
 * All of it fails quietly: a logo half a pixel off the corner looks fine, one
 * that ignores clear space looks *nearly* fine, and one drawn below the brand's
 * minimum width looks fine until somebody who owns the brand sees it. None of
 * that throws.
 */

const base = {
  clearSpace: 0.5,
  imageHeight: 1000,
  imageWidth: 1000,
  logoHeight: 100,
  logoWidth: 400,
  minWidth: 0,
  placement: "bottom-right" as const,
  widthPercent: DEFAULT_LOGO_WIDTH,
};

describe("logoBox", () => {
  it("keeps the logo's aspect ratio", () => {
    // 12% of 1000 = 120 wide; a 4:1 mark is therefore 30 tall.
    const box = logoBox(base);
    expect(box).toMatchObject({ height: 30, width: 120 });
  });

  it("places each corner inside its own clear space", () => {
    // clearSpace 0.5 of a 120px mark = 60px margin.
    expect(logoBox({ ...base, placement: "bottom-right" })).toMatchObject({
      left: 1000 - 120 - 60,
      top: 1000 - 30 - 60,
    });
    expect(logoBox({ ...base, placement: "top-left" })).toMatchObject({
      left: 60,
      top: 60,
    });
    expect(logoBox({ ...base, placement: "top-center" })).toMatchObject({
      left: (1000 - 120) / 2,
      top: 60,
    });
    expect(logoBox({ ...base, placement: "center" })).toMatchObject({
      left: (1000 - 120) / 2,
      top: (1000 - 30) / 2,
    });
  });

  it("raises a request that falls below the brand's minimum width", () => {
    /*
     * The rule worth having a test for. `minWidth` is the width at which the
     * brand says the mark stops being legible, so it is a floor and not a
     * preference — a 2% request on a small picture must not quietly produce an
     * illegible logo.
     */
    const box = logoBox({ ...base, minWidth: 300, widthPercent: 2 });
    expect(box?.width).toBe(300);
    // And the height follows, so the mark is not squashed to fit.
    expect(box?.height).toBe(75);
  });

  it("clamps a width beyond the allowed share", () => {
    expect(logoBox({ ...base, widthPercent: 500 })?.width).toBe(
      (1000 * LOGO_WIDTH_MAX) / 100
    );
  });

  it("refuses when the mark and its clear space will not fit", () => {
    // Better to leave the picture alone and say so than to crop the logo or
    // break the margin the brand set.
    expect(
      logoBox({ ...base, imageHeight: 40, imageWidth: 100, minWidth: 400 })
    ).toBeNull();
    expect(logoBox({ ...base, imageHeight: 50, widthPercent: 45 })).toBeNull();
  });

  it("refuses a degenerate picture or logo rather than dividing by zero", () => {
    expect(logoBox({ ...base, imageWidth: 0 })).toBeNull();
    expect(logoBox({ ...base, logoWidth: 0 })).toBeNull();
    expect(logoBox({ ...base, logoHeight: 0 })).toBeNull();
  });

  it("treats no clear space as flush to the edge", () => {
    expect(logoBox({ ...base, clearSpace: 0 })).toMatchObject({
      left: 1000 - 120,
      top: 1000 - 30,
    });
  });

  it("never lets the box leave the picture", () => {
    // Exhaustive over every placement, at the widest allowed share.
    for (const placement of [
      "bottom-right",
      "bottom-left",
      "bottom-center",
      "top-right",
      "top-left",
      "top-center",
      "center",
    ] as const) {
      const box = logoBox({ ...base, placement, widthPercent: LOGO_WIDTH_MAX });
      if (!box) {
        continue;
      }
      expect(box.left, placement).toBeGreaterThanOrEqual(0);
      expect(box.top, placement).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width, placement).toBeLessThanOrEqual(
        base.imageWidth
      );
      expect(box.top + box.height, placement).toBeLessThanOrEqual(
        base.imageHeight
      );
    }
  });
});
