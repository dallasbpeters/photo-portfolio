/**
 * How big a picture is, which only the browser can answer reliably.
 *
 * Needed because a photograph cannot be opened in a vector editor as it
 * stands: the bridge round trip is built on one file staying one file, an
 * .svg out and the same .svg back, and a PNG cannot take part in that. The
 * picture is wrapped in a one-element SVG instead — which needs its size, or
 * the viewBox crops it.
 *
 * Measured here rather than in the bridge because doing it from the bytes
 * means a decoder per format — PNG's IHDR, JPEG's SOF markers, WebP's chunks
 * — and getting one wrong crops the picture silently. `Image` already knows,
 * for every format the browser can show, which is every format that reaches
 * a board.
 *
 * The bytes are the bridge's job. It downloads them and embeds them, so the
 * two ends split along the only line that makes sense: the browser can
 * measure and cannot carry megabytes through a JSON body, and the bridge can
 * carry anything and cannot measure.
 */

export type MeasureRaster = (url: string) => Promise<{
  height: number;
  width: number;
}>;

export const measureRaster: MeasureRaster = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    /*
     * Deliberately not crossOrigin.
     *
     * Asking for CORS looks free and is not: an image served without an
     * Access-Control-Allow-Origin header *fails to load at all* once the
     * attribute is set, and plenty of what lands on a board is served that
     * way — a Pinterest reference answers 200 with no CORS header on it. The
     * first version of this set it "in case a canvas ever needs it", which
     * turned every one of those pictures into "could not be read".
     *
     * Nothing here needs a clean canvas. Width and height are readable from a
     * tainted image, and the pixels are never touched on this side.
     */
    img.onload = () => {
      const { naturalHeight: height, naturalWidth: width } = img;
      if (width > 0 && height > 0) {
        resolve({ height, width });
        return;
      }
      // Zero is what a decode failure looks like on some browsers: the load
      // reports success and the image has no area. Writing that out gives the
      // editor an empty document, which reads as the bridge being broken.
      reject(new Error("That picture could not be read"));
    };
    img.onerror = () => reject(new Error("That picture could not be read"));
    img.src = url;
  });
