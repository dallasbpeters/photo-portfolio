/**
 * A Photoshop file, made visible on a board.
 *
 * No browser can draw a PSD. Dropped on a board one uploads perfectly well —
 * its MIME type is `image/vnd.adobe.photoshop`, which passes the image filter
 * — and then shows as a broken picture, which reads as a failed upload rather
 * than as a format nothing can render.
 *
 * So a flattened preview is made on the way in, the same shape svgToRaster
 * makes one for a vector: the browser is where the canvas is, and doing it
 * here means the board stores an ordinary PNG that every other part of the app
 * already knows how to show, wire, restyle and export.
 *
 * The PSD is kept beside it rather than thrown away — it is the file somebody
 * actually works in, and the preview is only how it is looked at.
 */

/**
 * How large a PSD may be before it is shown without a preview.
 *
 * Reading one means holding the file, its parsed layers and a full-size canvas
 * in a browser tab at once, and a big layered document is measured in hundreds
 * of megabytes. Past this the tab does not fail cleanly — it stops responding,
 * which is worse than a picture that never appeared.
 *
 * Generous rather than cautious: an ordinary working PSD is well under this,
 * and refusing one somebody could have seen is its own kind of broken.
 */
export const MAX_PSD_BYTES = 250 * 1024 * 1024;

/** PSD and the large-document variant, which is the same format past 30k px. */
const PSD_EXTENSION = /\.psb?d$|\.psb$/i;
const PSD_TYPES = new Set([
  "application/x-photoshop",
  "image/psd",
  "image/vnd.adobe.photoshop",
  "image/x-photoshop",
]);

/**
 * Whether this drop is a Photoshop file.
 *
 * The type is consulted first and the name second, in that order and for the
 * reason isSvgFile does the same: some file managers and some remote sources
 * hand over a File with no type at all, and a .psd discarded silently at the
 * filter looks exactly like a board that ignores drops.
 */
export const isPsdFile = (file: File): boolean =>
  PSD_TYPES.has(file.type.toLowerCase()) || PSD_EXTENSION.test(file.name);

/** The preview's name, so it reads as the document rather than as a stray PNG. */
const previewName = (name: string): string =>
  `${name.replace(PSD_EXTENSION, "")}.png`;

/**
 * The flattened picture inside a PSD, as a PNG file.
 *
 * Layers are deliberately not read. Every PSD carries a composite — the
 * flattened result Photoshop keeps so other programs can show it — so this is
 * a read rather than a render, and skipping the layer data is the difference
 * between a document opening in a moment and a tab locking up on a two hundred
 * layer file.
 *
 * ag-psd is loaded only when a PSD actually arrives. It is a large library for
 * a format most boards never see, and making every visitor download a PSD
 * parser to look at a moodboard would be a poor trade.
 *
 * Throws rather than returning the PSD to be uploaded as-is. A file that
 * cannot be read here would otherwise be stored and shown broken later, where
 * the reason is much harder to find — the same choice svgToRaster makes.
 */
export const psdToPng = async (file: File): Promise<File> => {
  if (file.size > MAX_PSD_BYTES) {
    throw new Error("That Photoshop file is too large to preview");
  }
  const { readPsd } = await import("ag-psd");
  let psd: ReturnType<typeof readPsd>;
  try {
    psd = readPsd(await file.arrayBuffer(), {
      // The whole point: the flattened picture, and nothing else.
      skipCompositeImageData: false,
      skipLayerImageData: true,
      skipThumbnail: true,
    });
  } catch (cause) {
    // The reason is kept rather than swallowed: "could not be read" covers a
    // corrupt file, an unsupported colour mode and a truncated download, and
    // only the original says which.
    throw new Error("That Photoshop file could not be read", { cause });
  }

  const { canvas } = psd;
  if (!canvas) {
    // A PSD saved without "Maximize Compatibility" has no composite in it.
    // Photoshop asks about that on save, so it is a real state to meet, and
    // the only fix is on the author's side.
    throw new Error(
      "That PSD has no flattened preview saved in it. Re-save it from Photoshop with Maximize Compatibility on."
    );
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/png");
  });
  if (!blob) {
    throw new Error("That Photoshop file could not be drawn");
  }
  return new File([blob], previewName(file.name), { type: "image/png" });
};
