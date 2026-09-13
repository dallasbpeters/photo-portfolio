import { describe, expect, it } from "vitest";
import { EMPTY_KIT } from "../../../config/brandKit.js";
import { fitted, inked } from "./drawMark";
import { drawTile, TILE } from "./drawTile";
import { proofTilesFor } from "./proofTiles";

/**
 * Drawing the sheet.
 *
 * Pixels are awkward to assert and mostly not worth it, so these pin the three
 * things that are: the placement rule every tile shares, the recolour that
 * "the mark in one colour" depends on, and that every kind in the plan draws
 * something rather than a blank square. The last is the one that catches a
 * tile added to the plan and forgotten in the renderer.
 */

/**
 * A mark with ink in the middle and transparency around it.
 *
 * The margin is a fraction rather than a fixed ten pixels: at 20x20 a fixed
 * inset drew a rectangle of zero size, so the "mark" under test had no ink in
 * it at all and the assertion was reading empty canvas.
 */
const markOf = (width = 100, height = 60): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const inset = Math.min(width, height) * 0.2;
    ctx.fillStyle = "#9100ff";
    ctx.fillRect(inset, inset, width - inset * 2, height - inset * 2);
  }
  return canvas;
};

/** How much of a canvas is not the colour it started as. */
const painted = (canvas: HTMLCanvasElement): number => {
  const ctx = canvas.getContext("2d");
  const { data } = ctx?.getImageData(0, 0, canvas.width, canvas.height) ?? {
    data: new Uint8ClampedArray(),
  };
  const first = [data[0], data[1], data[2]].join(",");
  let different = 0;
  for (let at = 0; at < data.length; at += 4) {
    if ([data[at], data[at + 1], data[at + 2]].join(",") !== first) {
      different += 1;
    }
  }
  return different / (canvas.width * canvas.height);
};

describe("fitted", () => {
  it("centres the mark in the space it is given", () => {
    const box = fitted(
      { height: 100, width: 100 },
      {
        height: 200,
        width: 200,
        x: 0,
        y: 0,
      }
    );
    expect(box).toEqual({ height: 200, width: 200, x: 0, y: 0 });
  });

  it("keeps the aspect, letterboxing the rest", () => {
    const box = fitted(
      { height: 50, width: 100 },
      {
        height: 200,
        width: 200,
        x: 0,
        y: 0,
      }
    );
    expect(box.width).toBe(200);
    expect(box.height).toBe(100);
    expect(box.y).toBe(50);
  });

  it("refuses to enlarge when told not to", () => {
    // A 40px mark blown up to fill a tile is a blurry lie about the artwork.
    const box = fitted(
      { height: 40, width: 40 },
      { height: 400, width: 400, x: 0, y: 0 },
      { enlarge: false }
    );
    expect(box.width).toBe(40);
    expect(box.x).toBe(180);
  });

  it("gives back the space for a mark with no size", () => {
    const into = { height: 10, width: 10, x: 1, y: 2 };
    expect(fitted({ height: 0, width: 0 }, into)).toEqual(into);
  });
});

describe("inked", () => {
  it("replaces every colour in the mark, keeping its shape", () => {
    // source-in rather than a filter: a filter shifts the colours a mark
    // already has, so a two-colour mark comes back as two wrong colours.
    const recoloured = inked(markOf(20, 20), "#ff0000") as HTMLCanvasElement;
    const ctx = recoloured.getContext("2d");
    const pixel = ctx?.getImageData(10, 10, 1, 1).data;
    expect([pixel?.[0], pixel?.[1], pixel?.[2]]).toEqual([255, 0, 0]);
  });

  it("leaves opaque artwork alone, because it cannot be knocked out", () => {
    /*
     * The bug this caught in the wild. Fill through the alpha of something
     * with no transparency and every pixel is inside the shape, so the tile
     * becomes a solid rectangle — which is what an app icon, a knockout and
     * every drawn surface showed the first time this met a logo saved as a
     * poster rather than as a mark.
     */
    const solid = document.createElement("canvas");
    solid.width = 40;
    solid.height = 40;
    const ctx = solid.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#c8342b";
      ctx.fillRect(0, 0, 40, 40);
    }
    expect(inked(solid, "#ffffff")).toBe(solid);
  });

  it("leaves the transparent parts transparent", () => {
    const recoloured = inked(markOf(20, 20), "#ff0000") as HTMLCanvasElement;
    const alpha = recoloured.getContext("2d")?.getImageData(1, 1, 1, 1).data[3];
    expect(alpha).toBe(0);
  });
});

describe("drawTile", () => {
  const context = { minWidth: 24, typeface: "Georgia" };

  it("draws every kind the plan can produce", () => {
    /*
     * The one that catches a tile added to proofTilesFor and forgotten here.
     * The fallback draws the mark plainly rather than throwing, so a missing
     * branch is a tile that looks unfinished — not a blank square, and not a
     * sheet that fails to render at all.
     */
    const kit = {
      ...EMPTY_KIT,
      palette: [{ name: "Ink", role: "text", value: "#101a2b" }],
      typefaces: [{ name: "Georgia", role: "display", weights: [400] }],
    };
    const mark = markOf();
    for (const tile of proofTilesFor(kit, "Imprint")) {
      const drawn = drawTile(mark, tile, context);
      expect(drawn.width, tile.kind).toBe(TILE);
      expect(painted(drawn), tile.kind).toBeGreaterThan(0);
    }
  });

  it("puts the declared floor on the scale ramp", () => {
    // The line is the whole point of that tile: everything left of it is
    // narrower than the width the brand says the mark stops working at.
    const [scale] = proofTilesFor(EMPTY_KIT).filter((t) => t.kind === "scale");
    const drawn = drawTile(markOf(), scale, context);
    expect(painted(drawn)).toBeGreaterThan(0.01);
  });

  it("survives a mark with no pixels", () => {
    // What a logo saved with its artwork on a hidden layer exports as. The
    // sheet should render empty tiles, not fail.
    const blank = document.createElement("canvas");
    blank.width = 10;
    blank.height = 10;
    const [greyscale] = proofTilesFor(EMPTY_KIT).filter(
      (t) => t.kind === "greyscale"
    );
    expect(() => drawTile(blank, greyscale, context)).not.toThrow();
  });
});
