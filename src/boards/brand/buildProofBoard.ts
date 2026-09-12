import type { BrandKitDoc, LogoEntry } from "../../../config/brandKit.js";
import type { BoardItem } from "../../types";
import { newItemId } from "../io/newItemId";
import { drawTile, type Mark, TILE } from "./drawTile";
import { proofTilesFor } from "./proofTiles";

/**
 * A proof sheet, as items on a board.
 *
 * The last link in a chain that was otherwise complete: markMetrics measures a
 * mark, proofTiles says what a sheet contains, drawTile draws one. None of it
 * could be looked at until something put the results somewhere.
 *
 * A board rather than an export, which is the whole reason this is cheap.
 * Dragging, zooming, deleting a tile you do not care about, publishing, and
 * handing somebody a link are all things a board already does — so the feature
 * is "make the pictures", and everything around them comes for free.
 */

/** Room between tiles, so the sheet reads as a grid rather than a wall. */
const GAP = 48;
const COLUMNS = 4;

/** How the caption under each tile is worded, for the item's own label. */
export interface ProofItem {
  blob: Blob;
  caption: string;
  label: string;
}

/**
 * Every tile, drawn.
 *
 * Sequential rather than parallel: each draw allocates a full-size canvas and
 * a browser asked for fifteen at once is a browser deciding which to keep. The
 * whole sheet is a second or so of work, all of it local.
 */
export const drawProofSheet = async (
  mark: Mark,
  doc: BrandKitDoc,
  logo: LogoEntry,
  name: string
): Promise<ProofItem[]> => {
  const context = {
    minWidth: logo.minWidth > 0 ? logo.minWidth : 24,
    typeface: doc.typefaces[0]?.name ?? "system-ui",
  };
  const drawn: ProofItem[] = [];
  for (const tile of proofTilesFor(doc, name)) {
    const canvas = drawTile(mark, tile, context);
    // biome-ignore lint/performance/noAwaitInLoops: one full-size canvas at a time — see above
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png");
    });
    if (blob) {
      drawn.push({ blob, caption: tile.caption, label: tile.label });
    }
  }
  return drawn;
};

/**
 * The items a sheet becomes, laid out in a grid.
 *
 * The caption rides on `body`, which is the item's own words — so a tile
 * dragged off this board onto another one keeps the claim it was making. A
 * picture with no claim is decoration, and decoration is what a proof sheet
 * must not be.
 */
export const proofItems = (
  placed: { caption: string; label: string; url: string }[]
): BoardItem[] =>
  placed.map((tile, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      body: `${tile.label} — ${tile.caption}`,
      config: null,
      creditName: null,
      creditUrl: null,
      fontSize: null,
      height: TILE,
      id: newItemId(),
      imageUrl: tile.url,
      kind: "reference",
      nodeType: null,
      photoId: null,
      result: null,
      runError: null,
      runState: null,
      thumbUrl: tile.url,
      width: TILE,
      x: column * (TILE + GAP),
      y: row * (TILE + GAP + 40),
      z: index + 1,
    } as BoardItem;
  });

/**
 * What the board is called.
 *
 * The kit version is in the title on purpose. Kits are versioned and a version
 * is never rewritten, so a sheet made against version four should keep saying
 * four — otherwise two sheets of the same name show different marks and
 * neither says why.
 */
export const proofBoardTitle = (
  kitName: string,
  logoLabel: string,
  version: number | null
): string => {
  const mark = logoLabel.trim() || "logo";
  const at = version === null ? "" : ` v${version}`;
  return `${kitName} — ${mark} proof${at}`;
};
