/**
 * Fitting a picture inside a square without squashing it.
 *
 * A texture is a fixed square — WebGL wants one, and the shader samples it in
 * unit space — but a photograph is whatever shape it was taken in. Drawing one
 * straight into the square stretches it, which on a halftone reads as a subject
 * that has been squeezed rather than as a rendering choice.
 *
 * Contained rather than cropped. A cover fit would keep the aspect and throw
 * away the edges, and for a picture someone deliberately wired in, silently
 * losing a third of it is the worse failure — the padding is transparent, and
 * the shader treats transparency as nothing to draw, so the surplus simply has
 * no dots in it.
 */

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * Where to draw a `sourceWidth × sourceHeight` picture inside a `box` square so
 * that all of it fits and none of it is distorted.
 *
 * A source with no dimensions yet — an image that has not decoded — fills the
 * box, which is what the caller would have done anyway and keeps this total.
 */
export const containRect = (
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  /** Square unless a second edge is given. */
  boxHeight: number = boxWidth
): Rect => {
  const usable =
    Number.isFinite(sourceWidth) &&
    Number.isFinite(sourceHeight) &&
    sourceWidth > 0 &&
    sourceHeight > 0;
  if (!usable) {
    return { height: boxHeight, width: boxWidth, x: 0, y: 0 };
  }
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    height,
    width,
    // Centred, so a wide picture sits in the middle of the field rather than
    // along one edge of it.
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
  };
};
