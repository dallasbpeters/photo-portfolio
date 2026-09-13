import { caption, fitted, ground, inked } from "./drawMark";
import { MOCKUPS } from "./mockups";
import type { ProofTile } from "./proofTiles";

/**
 * One tile, drawn.
 *
 * Each branch is a test rather than a picture: it puts the mark in a place it
 * will really be met and lets the mark fail there. The captions are written in
 * proofTiles.ts; this is only the pixels.
 *
 * Everything draws at one size so the tiles compare cleanly on a board, and
 * nothing here is generated — no model, no cost, no waiting. That is the whole
 * reason the sheet can be re-run every time a mark changes.
 */

export const TILE = 640;

/** Loaded artwork, with its own pixel size. */
export type Mark = CanvasImageSource & { height: number; width: number };

const PAD = 80;
const inner = () => ({
  height: TILE - PAD * 2,
  width: TILE - PAD * 2,
  x: PAD,
  y: PAD,
});

type Draw = (
  ctx: CanvasRenderingContext2D,
  mark: Mark,
  tile: ProofTile,
  context: TileContext
) => void;

const drawScale: Draw = (ctx, mark, tile, { minWidth }) => {
  const sizes = tile.sizes ?? [];
  let x = PAD;
  const baseline = TILE - PAD;
  for (const size of sizes) {
    const box = fitted(mark, {
      height: size.px,
      width: size.px,
      x,
      y: baseline - size.px,
    });
    ctx.drawImage(mark, box.x, box.y, box.width, box.height);
    ctx.fillStyle = "#8a8a8a";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(`${size.px}`, x, baseline + 16);
    x += size.px + 20;
  }
  /*
   * The line the kit drew itself.
   *
   * Everything left of it is narrower than the width the brand declares the
   * mark stops working at — so a sheet where the line sits past the first two
   * sizes is the kit admitting it has no favicon.
   */
  const at = PAD + minWidth;
  ctx.strokeStyle = "#d1453f";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(at, PAD);
  ctx.lineTo(at, baseline + 4);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#d1453f";
  ctx.fillText(`min ${minWidth}px`, at + 6, PAD);
};

const drawPattern: Draw = (ctx, mark) => {
  const step = TILE / 5;
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const offset = row % 2 === 0 ? 0 : step / 2;
      const box = fitted(mark, {
        height: step * 0.55,
        width: step * 0.55,
        x: column * step + offset - step / 2,
        y: row * step - step / 2,
      });
      ctx.globalAlpha = 0.85;
      ctx.drawImage(mark, box.x, box.y, box.width, box.height);
    }
  }
  ctx.globalAlpha = 1;
};

/**
 * The mark at the resolution a stitch or a bulb gives it.
 *
 * Drawn small and blown back up with smoothing off, which is exactly what
 * embroidery, a receipt printer and an LED board each do in their own way.
 * Cheaper than three separate mockups and it fails in the same place they do.
 */
const drawDotMatrix: Draw = (ctx, mark) => {
  const coarse = 28;
  const small = document.createElement("canvas");
  small.width = coarse;
  small.height = coarse;
  const smallCtx = small.getContext("2d");
  if (!smallCtx) {
    return;
  }
  const box = fitted(mark, { height: coarse, width: coarse, x: 0, y: 0 });
  smallCtx.drawImage(mark, box.x, box.y, box.width, box.height);
  ctx.imageSmoothingEnabled = false;
  const out = inner();
  ctx.drawImage(small, out.x, out.y, out.width, out.height);
  ctx.imageSmoothingEnabled = true;
};

/** Two copies offset and tinted: the shape read as depth rather than as ink. */
const drawEmboss: Draw = (ctx, mark) => {
  const box = fitted(mark, inner(), { enlarge: false });
  ctx.globalAlpha = 0.55;
  ctx.drawImage(
    inked(mark, "#ffffff"),
    box.x,
    box.y - 2,
    box.width,
    box.height
  );
  ctx.drawImage(
    inked(mark, "#9a9a9a"),
    box.x,
    box.y + 2,
    box.width,
    box.height
  );
  ctx.globalAlpha = 1;
};

const drawCard: Draw = (ctx, mark, tile) => {
  const words = tile.words ?? "";
  // 3.5 x 2 inches, the one physical size everybody already knows.
  const cardWidth = TILE - PAD * 2;
  const cardHeight = (cardWidth / 3.5) * 2;
  const top = (TILE - cardHeight) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(PAD, top, cardWidth, cardHeight);
  ctx.strokeStyle = "#e4e4e4";
  ctx.strokeRect(PAD, top, cardWidth, cardHeight);
  const box = fitted(mark, {
    height: 44,
    width: 44,
    x: PAD + 28,
    y: top + 28,
  });
  ctx.drawImage(mark, box.x, box.y, box.width, box.height);
  if (words) {
    ctx.fillStyle = "#101a2b";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(words, PAD + 28, top + cardHeight - 34);
  }
};

const drawAppIcon: Draw = (ctx, mark, tile) => {
  const side = TILE - PAD * 2;
  const radius = side * 0.22;
  ctx.beginPath();
  ctx.roundRect(PAD, PAD, side, side, radius);
  ctx.fillStyle = tile.background ?? "#101a2b";
  ctx.fill();
  ctx.save();
  ctx.clip();
  const box = fitted(mark, {
    height: side * 0.56,
    width: side * 0.56,
    x: PAD + side * 0.22,
    y: PAD + side * 0.22,
  });
  ctx.drawImage(
    inked(mark, tile.ink ?? "#ffffff"),
    box.x,
    box.y,
    box.width,
    box.height
  );
  ctx.restore();
};

const drawLockup: Draw = (ctx, mark, tile, { typeface }) => {
  const box = fitted(mark, {
    height: 96,
    width: 96,
    x: PAD,
    y: TILE / 2 - 48,
  });
  ctx.drawImage(mark, box.x, box.y, box.width, box.height);
  ctx.fillStyle = "#101a2b";
  ctx.font = `40px ${typeface}, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(tile.words ?? "", PAD + 120, TILE / 2);
};

/**
 * The mark on a surface, in a scene.
 *
 * Drawn rather than generated, which is the point: a sheet that asks "does
 * this survive a real sign" while showing a sign a model invented is not
 * evidence. Four numbers describe the surface and four more the mark's place
 * on it, so a real photograph can replace the drawing later without touching
 * this.
 */
const drawMockup: Draw = (ctx, mark, tile) => {
  const mockup = MOCKUPS.find((entry) => entry.label === tile.label);
  if (!mockup) {
    return;
  }
  ground(ctx, mockup.backdrop, { height: TILE, width: TILE });
  const face = {
    height: mockup.surface.h * TILE,
    width: mockup.surface.w * TILE,
    x: mockup.surface.x * TILE,
    y: mockup.surface.y * TILE,
  };
  ctx.fillStyle = mockup.surface.colour;
  ctx.fillRect(face.x, face.y, face.width, face.height);

  const box = fitted(
    mark,
    {
      height: mockup.mark.h * face.height,
      width: mockup.mark.w * face.width,
      x: face.x + mockup.mark.x * face.width,
      y: face.y + mockup.mark.y * face.height,
    },
    { enlarge: true }
  );
  ctx.drawImage(inked(mark, mockup.ink), box.x, box.y, box.width, box.height);

  /*
   * A band of shade over everything, mark included.
   *
   * The difference between a mockup and a sticker: light falls on the surface
   * *and* on what is printed on it. Drawn last and over both so the mark sits
   * in the scene rather than on top of it.
   */
  if (mockup.shade) {
    const gradient = ctx.createLinearGradient(
      face.x,
      face.y,
      face.x + face.width,
      face.y + face.height
    );
    gradient.addColorStop(0, `rgba(0,0,0,${mockup.shade})`);
    gradient.addColorStop(0.6, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(face.x, face.y, face.width, face.height);
  }
};

/**
 * The mark, as it is, on whatever ground the tile asked for.
 *
 * Serves the tiles whose whole test is the ground or a filter — greyscale,
 * squint, on black, on a palette colour — and stands in for any kind the
 * table does not know. A tile added to the plan and forgotten here draws
 * something honest rather than a blank square or an exception that takes the
 * rest of the sheet with it.
 */
const drawPlainly: Draw = (ctx, mark, tile) => {
  const size = { height: TILE, width: TILE };
  if (tile.kind === "negative") {
    ground(ctx, tile.ink ?? "#101a2b", size);
  }
  if (tile.kind === "greyscale") {
    ctx.filter = "grayscale(1)";
  }
  if (tile.kind === "squint") {
    ctx.filter = `blur(${tile.blur ?? 6}px)`;
  }
  const box = fitted(mark, inner(), { enlarge: false });
  const drawn = tile.kind === "negative" ? inked(mark, "#ffffff") : mark;
  ctx.drawImage(drawn, box.x, box.y, box.width, box.height);
  ctx.filter = "none";
};

/**
 * Which function draws which kind.
 *
 * A table rather than a chain of branches: the chain was one `else if` per
 * tile and grew past the complexity ceiling the moment the sheet did. Every
 * kind absent from here falls to drawPlainly, which is right for the ones
 * whose test *is* the ground.
 */
const DRAWS: Partial<Record<ProofTile["kind"], Draw>> = {
  appicon: drawAppIcon,
  card: drawCard,
  dotmatrix: drawDotMatrix,
  emboss: drawEmboss,
  lockup: drawLockup,
  pattern: drawPattern,
  scale: drawScale,
  surface: drawMockup,
};

export interface TileContext {
  /** The declared floor, drawn as a line on the scale ramp. */
  minWidth: number;
  /** The kit's first typeface, for the lockup. */
  typeface: string;
}

/**
 * Draws one tile and hands back the canvas.
 *
 * A kind it does not know draws the mark plainly rather than throwing: a tile
 * added to the plan and not yet to the renderer should look unfinished, not
 * take the whole sheet down with it.
 */
export const drawTile = (
  mark: Mark,
  tile: ProofTile,
  context: TileContext
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const size = { height: TILE, width: TILE };
  ground(ctx, tile.background ?? "#f7f7f7", size);
  (DRAWS[tile.kind] ?? drawPlainly)(ctx, mark, tile, context);

  caption(
    ctx,
    tile.label,
    size,
    tile.background === "#000000" || tile.kind === "negative"
      ? "#9a9a9a"
      : "#8a8a8a"
  );
  return canvas;
};
