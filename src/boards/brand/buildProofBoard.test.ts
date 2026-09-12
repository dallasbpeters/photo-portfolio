import { describe, expect, it } from "vitest";
import { EMPTY_KIT } from "../../../config/brandKit.js";
import { drawProofSheet, proofBoardTitle, proofItems } from "./buildProofBoard";
import { TILE } from "./drawTile";

/**
 * Turning a sheet into a board.
 *
 * The layout and the naming, which are the parts somebody lives with. A grid
 * that overlaps is a sheet you cannot read, and a title that does not say
 * which version of the kit it was made against is two sheets of the same name
 * showing different marks with nothing to explain it.
 */

const markOf = (width = 120, height = 80): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#9100ff";
    ctx.fillRect(20, 15, width - 40, height - 30);
  }
  return canvas;
};

const placed = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    caption: `claim ${index}`,
    label: `Tile ${index}`,
    url: `https://ours/${index}.png`,
  }));

describe("proofItems", () => {
  it("lays the tiles out in a grid that does not overlap", () => {
    const items = proofItems(placed(8));
    const boxes = items.map((item) => ({
      x: item.x,
      y: item.y,
    }));
    // Four across, then a second row below the first.
    expect(boxes[0]).toEqual({ x: 0, y: 0 });
    expect(boxes[3].x).toBeGreaterThan(boxes[0].x + TILE);
    expect(boxes[4]).toEqual({ x: 0, y: boxes[0].y + TILE + 88 });
  });

  it("keeps the claim on the item, not just on the picture", () => {
    // A tile dragged onto another board has to carry what it was asserting.
    // A picture with no claim is decoration, and decoration is the one thing
    // a proof sheet must not be.
    const [first] = proofItems(placed(1));
    expect(first.body).toContain("Tile 0");
    expect(first.body).toContain("claim 0");
  });

  it("gives every tile its own id", () => {
    const ids = proofItems(placed(6)).map((item) => item.id);
    expect(new Set(ids).size).toBe(6);
  });

  it("stacks them in reading order", () => {
    const zs = proofItems(placed(4)).map((item) => item.z);
    expect(zs).toEqual([1, 2, 3, 4]);
  });
});

describe("proofBoardTitle", () => {
  it("says which version of the kit it was made against", () => {
    // Kits are versioned and a version is never rewritten, so the sheet has
    // to say which one it is showing or two sheets disagree silently.
    expect(proofBoardTitle("Imprint", "Primary", 4)).toBe(
      "Imprint — Primary proof v4"
    );
  });

  it("leaves the version off a kit that has none yet", () => {
    expect(proofBoardTitle("Imprint", "Primary", null)).toBe(
      "Imprint — Primary proof"
    );
  });

  it("falls back when the logo was never labelled", () => {
    expect(proofBoardTitle("Imprint", "   ", 2)).toBe(
      "Imprint — logo proof v2"
    );
  });
});

describe("drawProofSheet", () => {
  const logo = {
    clearSpace: 0.5,
    label: "Primary",
    minWidth: 24,
    rules: "",
    url: "https://ours/mark.png",
  };

  it("draws a picture for every tile the plan produced", async () => {
    const sheet = await drawProofSheet(markOf(), EMPTY_KIT, logo, "Imprint");
    expect(sheet.length).toBeGreaterThanOrEqual(10);
    for (const tile of sheet) {
      expect(tile.blob.size, tile.label).toBeGreaterThan(0);
      expect(tile.blob.type).toBe("image/png");
      expect(tile.caption.length).toBeGreaterThan(20);
    }
  });

  it("uses a sane floor when the kit never declared one", async () => {
    // A minWidth of zero would put the scale ramp's line at the left edge,
    // which reads as "every size passes" rather than "nobody said".
    const sheet = await drawProofSheet(
      markOf(),
      EMPTY_KIT,
      { ...logo, minWidth: 0 },
      "Imprint"
    );
    expect(sheet.length).toBeGreaterThan(0);
  });
});
