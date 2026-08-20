import {
  HalftoneError,
  type HalftoneOptions,
  halftoneOptionsFrom,
  loadImage,
  paintHalftone,
} from "./halftoneGl";

/**
 * Rendering a Halftone node to a file.
 *
 * Draws the same shader the brand site's `<halftone-image>` draws — see
 * halftoneGl — into an offscreen canvas at export size, and reads it back.
 * Reading it back is the whole reason this is WebGL: the shader library draws
 * through WebGPU, whose canvas returns a fully transparent image to `toBlob`,
 * `drawImage` and `createImageBitmap` alike.
 *
 * The frame takes the picture's own aspect, so the whole of it fills the whole
 * of the output rather than being letterboxed into a column. The shader
 * cover-fits inside that anyway, so a mismatch crops rather than squashes.
 */

/** The long edge of an export. Large enough to print from. */
const LONG_EDGE = 2400;

export type HalftoneSettings = Record<string, unknown>;

export interface HalftoneFrame {
  height: number;
  width: number;
}

/**
 * The frame a picture of this shape should be rendered into.
 *
 * Landscape fills the width, portrait the height, so the long edge is the long
 * edge either way and no orientation is quietly given fewer pixels.
 */
export const halftoneFrame = (
  naturalWidth: number,
  naturalHeight: number,
  longEdge = LONG_EDGE
): HalftoneFrame => {
  const aspect =
    naturalHeight > 0 && naturalWidth > 0 ? naturalWidth / naturalHeight : 1;
  return aspect >= 1
    ? { height: Math.round(longEdge / aspect), width: longEdge }
    : { height: longEdge, width: Math.round(longEdge * aspect) };
};

/**
 * A PNG of the picture, halftoned.
 *
 * No polling and no timeout. The draw is synchronous once the picture has
 * loaded, so there is nothing to wait for and no window in which a capture can
 * land early and come back blank.
 */
export const renderHalftone = async (
  config: HalftoneSettings,
  imageUrl: string | null,
  longEdge = LONG_EDGE
): Promise<Blob> => {
  if (!imageUrl) {
    throw new HalftoneError("Wire a picture into this node to halftone it.");
  }
  const image = await loadImage(imageUrl);
  const frame = halftoneFrame(
    image.naturalWidth,
    image.naturalHeight,
    longEdge
  );

  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  paintHalftone(canvas, image, halftoneOptionsFrom(config) as HalftoneOptions);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) {
    throw new HalftoneError("The halftone could not be saved as a picture.");
  }
  return blob;
};
