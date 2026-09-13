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
 * Whether the artwork has anything to knock out.
 *
 * A mark is usually a shape on transparency, and several tiles depend on that:
 * recolouring, knocking out, printing in one ink. Plenty of real artwork is
 * not — a logo exported as a poster, a lockup saved with its own background —
 * and for those the whole rectangle is opaque.
 *
 * Sampled rather than counted. A full read of a large mark is a megabyte of
 * pixel data for a yes-or-no question, and a grid of a few hundred points
 * answers it just as well: anything with real negative space has some of it
 * near the edges.
 */
const SAMPLE = 24;
const OPAQUE_ENOUGH = 0.98;

export const hasTransparency = (
  mark: CanvasImageSource & { height: number; width: number }
): boolean => {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return true;
  }
  ctx.drawImage(mark, 0, 0, SAMPLE, SAMPLE);
  const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
  let opaque = 0;
  for (let at = 3; at < data.length; at += 4) {
    if ((data[at] ?? 0) > 250) {
      opaque += 1;
    }
  }
  return opaque / (SAMPLE * SAMPLE) < OPAQUE_ENOUGH;
};

/**
 * The mark, recoloured to a single ink — or left alone if it cannot be.
 *
 * Drawn through its own alpha rather than by filtering: `source-in` keeps the
 * shape and replaces every colour in it, which is what "the mark in one
 * colour" means. A CSS filter would shift the colours it already has, and a
 * two-colour mark would come back as two different wrong colours.
 *
 * Opaque artwork is returned untouched, and that is the important case. Fill
 * through the alpha of something with no transparency and every pixel is
 * inside the shape, so the tile becomes a solid rectangle — which is what an
 * app icon, a knockout and every drawn surface did the first time this met a
 * logo saved as a poster rather than as a mark. A block of colour is not a
 * failed recolour, it is a picture of nothing.
 *
 * Composited on an offscreen canvas so the recolour cannot reach the tile
 * behind it.
 */
export const inked = (
  mark: CanvasImageSource & { height: number; width: number },
  colour: string
): CanvasImageSource & { height: number; width: number } => {
  if (!hasTransparency(mark)) {
    return mark;
  }
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
