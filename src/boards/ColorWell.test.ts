import type { ColorResult } from "react-color";
import { describe, expect, it } from "vitest";
import { pickerSeed, toHex } from "./ColorWell";
import { isTransparent, NO_FILL } from "./drawing/drawing";

/**
 * Why a fill colour could be picked and never appear.
 *
 * NO_FILL is "#00000000" — a *sentinel* meaning "do not paint", not an alpha
 * anyone chose. Handing it to the picker started the alpha slider at zero, so
 * every colour picked came back as "#rrggbb00", which isTransparent() reads as
 * no paint. The shape stayed hollow and the well looked broken.
 *
 * The stroke well never showed it because its default is opaque. Pinned here
 * because the failure is completely silent: the swatch updates, the value is
 * stored, and nothing is drawn.
 */

const picked = (hex: string, alpha: number): ColorResult =>
  ({
    hex,
    hsl: { a: alpha, h: 0, l: 0, s: 0 },
    rgb: { a: alpha, b: 0, g: 0, r: 0 },
  }) as ColorResult;

describe("pickerSeed", () => {
  it("opens opaque when there is no fill yet", () => {
    expect(pickerSeed(NO_FILL)).toBe("#ffffff");
  });

  it("treats any fully transparent value as no fill", () => {
    expect(pickerSeed("#ff000000")).toBe("#ffffff");
  });

  it("leaves an existing colour exactly as it is", () => {
    expect(pickerSeed("#b8442a")).toBe("#b8442a");
    expect(pickerSeed("#b8442a80")).toBe("#b8442a80");
  });

  it("is what makes a picked colour paint at all", () => {
    // The whole bug in one assertion: seeded with the sentinel, the picker
    // returns alpha 0 and the shape stays hollow.
    const fromSentinel = toHex(picked("#b8442a", 0));
    expect(isTransparent(fromSentinel)).toBe(true);

    // Seeded opaque, the same pick paints.
    const fromSeed = toHex(picked("#b8442a", 1));
    expect(isTransparent(fromSeed)).toBe(false);
    expect(fromSeed).toBe("#b8442a");
  });
});

describe("toHex", () => {
  it("drops the alpha pair at full opacity, keeping the familiar six digits", () => {
    expect(toHex(picked("#b8442a", 1))).toBe("#b8442a");
  });

  it("carries alpha whenever it would otherwise be lost", () => {
    expect(toHex(picked("#b8442a", 0.5))).toBe("#b8442a80");
  });

  it("still allows a deliberately transparent colour", () => {
    // Turning fill off through the alpha slider must keep working — the seed
    // change must not make transparency unreachable.
    expect(isTransparent(toHex(picked("#b8442a", 0)))).toBe(true);
  });

  it("treats a missing alpha as opaque", () => {
    const noAlpha = {
      hex: "#b8442a",
      rgb: { b: 0, g: 0, r: 0 },
    } as ColorResult;
    expect(toHex(noAlpha)).toBe("#b8442a");
  });
});
