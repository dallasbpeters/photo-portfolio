/**
 * A photograph, wrapped so a vector editor will open it.
 *
 * The bridge round trip is built on one file staying one file: an .svg goes
 * out, the editor saves the same .svg, and the changed bytes come back as a
 * new version. A PNG cannot take part in that — hand it to an SVG editor and
 * there is nothing to save back — so "open in the editor" was offered only for
 * vector results, which is a small fraction of what a board makes.
 *
 * Wrapping fixes it without touching the round trip. The file is a real SVG
 * whichever way it started, so everything downstream is unchanged; it just
 * happens to contain a picture. In Boxy SVG that is exactly the shape its
 * Vectorize generator wants — place a bitmap, trace it, save — so the wrap is
 * not a workaround so much as the first step of the job.
 *
 * The picture is referenced rather than embedded. A data URI would make the
 * file self-contained, at the cost of turning a two megabyte JPEG into three
 * megabytes of base64 travelling through a JSON body on every open. These URLs
 * are public blob storage and the editor is a desktop app with a network, so
 * the reference costs nothing and stays small. What comes back after a trace
 * has no <image> in it at all.
 */

/**
 * The pixel size of a picture, which only the browser can answer reliably.
 *
 * Parsing it out of the bytes would mean a decoder per format — PNG's IHDR,
 * JPEG's SOF markers, WebP's chunks — and getting one wrong is an SVG with a
 * viewBox that crops the picture. `Image` already knows, for every format the
 * browser can show, which is every format that can be on a board.
 */
export type MeasureImage = (url: string) => Promise<{
  height: number;
  width: number;
}>;

const measureInBrowser: MeasureImage = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    // The blob store is a different origin, and without this the load is
    // tainted — harmless for reading dimensions, but it costs nothing to ask
    // and keeps the element usable if this ever needs a canvas.
    img.crossOrigin = "anonymous";
    img.onload = () =>
      resolve({ height: img.naturalHeight, width: img.naturalWidth });
    img.onerror = () => reject(new Error("That picture could not be read"));
    img.src = url;
  });

/** `&`, `<` and `"` in a URL, which would otherwise break the attribute. */
const escapeAttribute = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/**
 * A picture as a one-element SVG document.
 *
 * Sized to the picture's own pixels so the editor opens it at its true size
 * rather than scaling it into some default page. A picture that measures zero
 * — which is what a broken load looks like — is refused rather than written
 * out as a document with no area, because an editor opening an empty canvas
 * reads as the bridge being broken.
 */
export const rasterAsSvg = async (
  url: string,
  measure: MeasureImage = measureInBrowser
): Promise<string> => {
  const { height, width } = await measure(url);
  if (!(width > 0 && height > 0)) {
    throw new Error("That picture could not be read");
  }
  const href = escapeAttribute(url);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${href}" xlink:href="${href}" width="${width}" height="${height}"/></svg>`;
};
