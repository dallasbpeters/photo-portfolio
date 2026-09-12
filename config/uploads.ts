/**
 * What may be uploaded, decided once.
 *
 * There were two lists — one in the browser to fail early with a readable
 * message, one on the server to actually refuse — and a comment on each asking
 * the next person to keep them in step. That is not a mechanism. A type added
 * to one and not the other is an upload that either dies at the handler with a
 * worse message or is turned away by the browser for no reason the server
 * agrees with.
 *
 * In config/ because it is the one place both halves already import from.
 */
export const UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  // SVG, so a vector dropped onto a board can be kept as a vector rather than
  // always being rasterised. Nothing downstream minds: the run endpoint
  // rasterises an SVG the moment a model needs pixels.
  "image/svg+xml",
  /*
   * Photoshop documents, so a PSD can sit on a board as the thing somebody
   * actually works in. The board never renders one — it uploads a flattened
   * PNG beside it and shows that; see src/boards/io/psdPreview.ts — so nothing
   * downstream has to learn a new format.
   *
   * Every spelling browsers use, because they disagree: the type comes from
   * the operating system's own table, and one machine's
   * "image/vnd.adobe.photoshop" is another's "application/x-photoshop".
   */
  "application/x-photoshop",
  "image/vnd.adobe.photoshop",
  "image/x-photoshop",
] as const;

/** What to say when a file is turned away. Named formats, not MIME types. */
export const UPLOAD_REFUSAL = "Choose an image, an SVG or a Photoshop file";

export const isUploadType = (type: string): boolean =>
  (UPLOAD_TYPES as readonly string[]).includes(type);
