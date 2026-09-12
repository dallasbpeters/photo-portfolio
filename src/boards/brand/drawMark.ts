/**
 * Drawing one mark onto one canvas, the same way every time.
 *
 * The shared half of the tile renderer. Every tile puts the mark somewhere and
 * the placement rules never change: fit inside, never enlarge past its own
 * pixels, centre what is left. Written once because a tile that sizes the mark
 * differently from its neighbours is comparing two things and calling it one.
 *
 * Everything here works on a 2D context and an already-loaded image, so the
 * caller owns loading and the caller owns what to do with the result.
 */

export interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** The largest box of the mark's aspect that fits, centred, never enlarged. */
export const fitted = (
  mark: { height: number; width: number },
  into: Box,
  { enlarge = true } = {}
): Box => {
  if (mark.width <= 0 || mark.height <= 0) {
    return { ...into };
  }
  const scale = Math.min(into.width / mark.width, into.height / mark.height);
  const used = enlarge ? scale : Math.min(scale, 1);
  const width = mark.width * used;
  const height = mark.height * used;
  return {
    height,
    width,
    x: into.x + (into.width - width) / 2,
    y: into.y + (into.height - height) / 2,
  };
};

/** Fills the whole canvas, which is how every tile starts. */
export const ground = (
  ctx: CanvasRenderingContext2D,
  colour: string,
  size: { height: number; width: number }
): void => {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, size.width, size.height);
};

/**
 * The mark, recoloured to a single ink.
 *
 * Drawn through its own alpha rather than by filtering: `source-in` keeps the
 * shape and replaces every colour in it, which is what "the mark in one
 * colour" means. A CSS filter would shift the colours it already has, and a
 * two-colour mark would come back as two different wrong colours.
 *
 * Composited on an offscreen canvas so the recolour cannot reach the tile
 * behind it.
 */
export const inked = (
  mark: CanvasImageSource & { height: number; width: number },
  colour: string
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = mark.width;
  canvas.height = mark.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  ctx.drawImage(mark, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
};

/** A label in the corner, so a tile lifted out of the board still says what it is. */
export const caption = (
  ctx: CanvasRenderingContext2D,
  text: string,
  size: { height: number; width: number },
  colour = "#8a8a8a"
): void => {
  ctx.fillStyle = colour;
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.textBaseline = "top";
  ctx.fillText(text.toUpperCase(), 16, 14, size.width - 32);
};
