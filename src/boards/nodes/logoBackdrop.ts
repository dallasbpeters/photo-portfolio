/**
 * Whether a logo file has a solid plate baked into it.
 *
 * A brand's logo folder usually holds several lockups, and one of them is the
 * app icon: the mark on a filled square. Composited onto a photograph that
 * reads as a sticker — which is exactly what it looked like, and the natural
 * conclusion was that the model had added a background. It had not. The blue
 * came out of the file:
 *
 *     <rect width="1024" height="1024" fill="#2A83F7"/>
 *
 * Nothing is wrong with such a file, and it must not be rejected — an icon is a
 * legitimate thing to stamp. But it is worth *saying*, before a generation is
 * paid for, because the three sibling files in the same folder were transparent
 * and any of them would have been the intended choice.
 *
 * Done in the browser because the answer is only needed while somebody is
 * looking at the picker. The blob host sends `access-control-allow-origin: *`,
 * so the canvas is not tainted and the pixels can be read back; a host that did
 * not would leave `readBackdrop` answering "unknown", which the caller treats as
 * "say nothing" rather than as a warning.
 */

/** What could be learned about a logo's edges. */
export type Backdrop = "opaque" | "transparent" | "unknown";

/**
 * How opaque a corner has to be to count as a plate.
 *
 * Not 255: an anti-aliased rounded corner is partly transparent at the very
 * pixel, and a rounded app icon would otherwise read as clean. Well above zero,
 * so a mark with a soft shadow bleeding to the edge does not raise a warning.
 */
const OPAQUE_ENOUGH = 128;

/**
 * The size the file is rasterised to for the test.
 *
 * Small deliberately: this is a question about the corners, not about detail,
 * and a 1024² icon decoded at full size for four pixels is work nobody needs.
 */
const SAMPLE = 64;

/**
 * Reads the four corners of a logo and reports whether they are filled.
 *
 * The corners rather than a histogram: "does this have a background" is a
 * question about the edges. A mark that fills its own canvas edge to edge — a
 * full-bleed photograph used as a logo — would read as opaque here, which is the
 * right answer for the purpose.
 *
 * Never throws. Every failure — a blocked canvas, a file that will not decode, a
 * host without CORS — answers "unknown", because a warning that might be wrong
 * is worse than no warning on a screen somebody is trying to work on.
 */
export const readBackdrop = (url: string): Promise<Backdrop> =>
  new Promise((resolve) => {
    const image = new Image();
    // Required before the canvas can be read back, and harmless where the host
    // allows it. Without this the draw succeeds and getImageData throws.
    image.crossOrigin = "anonymous";
    image.onerror = () => resolve("unknown");
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const context = canvas.getContext("2d", { willReadFrequently: false });
        if (!context) {
          resolve("unknown");
          return;
        }
        context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
        const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
        const alphaAt = (x: number, y: number) =>
          data[(y * SAMPLE + x) * 4 + 3] ?? 0;
        const last = SAMPLE - 1;
        const corners = [
          alphaAt(0, 0),
          alphaAt(last, 0),
          alphaAt(0, last),
          alphaAt(last, last),
        ];
        /*
         * Two corners, not four.
         *
         * The icon that started this measured 235, 0, 235, 0 — its blue square
         * is 1024 wide inside a 1025-wide canvas, so the right-hand column falls
         * outside the rect and reads as transparent. Requiring all four would
         * have called that file clean.
         */
        const filled = corners.filter((alpha) => alpha >= OPAQUE_ENOUGH).length;
        resolve(filled >= 2 ? "opaque" : "transparent");
      } catch {
        // A tainted canvas, most likely. Not worth distinguishing.
        resolve("unknown");
      }
    };
    image.src = url;
  });
