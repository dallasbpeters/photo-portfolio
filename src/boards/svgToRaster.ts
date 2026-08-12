/**
 * An SVG dropped on the board, rasterised so it can be stored and generated from.
 *
 * The upload path takes JPEG, PNG, WebP, AVIF and GIF, and an SVG is none of
 * them — so dragging a logo onto a board simply failed. Nothing downstream
 * wants the vector either: fal fetches a bitmap, and an <img> holding an SVG
 * cannot be read back as pixels once it has been through a canvas.
 *
 * WebP because it is the smallest of the raster formats we accept and this is
 * working material rather than a deliverable. The original vector is not kept:
 * the board is a place to think with pictures, and a drawing that has to be
 * exported as art is exported from wherever it was authored.
 */

/**
 * The longest edge of the raster, in pixels.
 *
 * Large enough that a logo dropped on a board is still crisp when a node is
 * zoomed into, and large enough to be a usable reference image for a model,
 * which generally works at 1024. Beyond this a flat vector is paying for
 * detail it does not have.
 */
const MAX_EDGE = 1600;

/** Fallback square for an SVG that declares no size at all. */
const FALLBACK = 512;

/** Matches "1024", "1024px", "32pt" — a leading number is all this needs. */
const LEADING_NUMBER = /^\s*([\d.]+)/;

/** viewBox values are separated by spaces, commas, or both. */
const VIEWBOX_SEPARATOR = /[\s,]+/;

/** The extension, so a rasterised file is not named "logo.svg.webp". */
const SVG_EXTENSION = /\.svg$/i;

const numberFrom = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const found = LEADING_NUMBER.exec(value);
  const parsed = found ? Number.parseFloat(found[1] ?? "") : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * How big the SVG says it is.
 *
 * width/height first, then the viewBox, because a great many icon sets ship
 * width="100%" or omit the attributes entirely and describe their geometry only
 * in the viewBox. Rasterising one of those at its "declared" size gives a 1×1
 * image, or an exception.
 */
const intrinsicSize = (svg: string): { height: number; width: number } => {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;

  const width = numberFrom(root.getAttribute("width"));
  const height = numberFrom(root.getAttribute("height"));
  if (width && height) {
    return { height, width };
  }

  const box =
    root.getAttribute("viewBox")?.trim().split(VIEWBOX_SEPARATOR) ?? [];
  const boxWidth = Number.parseFloat(box[2] ?? "");
  const boxHeight = Number.parseFloat(box[3] ?? "");
  if (Number.isFinite(boxWidth) && Number.isFinite(boxHeight) && boxWidth > 0) {
    return { height: boxHeight, width: boxWidth };
  }

  return { height: FALLBACK, width: FALLBACK };
};

/** The size to draw at: proportional, and filling MAX_EDGE on its longest side. */
const rasterSize = (size: { height: number; width: number }) => {
  // Scaled up as well as down. A 24px icon rasterised at 24px is unusable both
  // as a picture on the board and as an input to a model, and a vector has no
  // "native resolution" to be faithful to.
  const scale = MAX_EDGE / Math.max(size.width, size.height);
  return {
    height: Math.max(1, Math.round(size.height * scale)),
    width: Math.max(1, Math.round(size.width * scale)),
  };
};

/** True for the files this module handles — by type, or by extension when the
 *  drop gave us no type at all, which happens with some file managers. */
export const isSvgFile = (file: File): boolean =>
  file.type === "image/svg+xml" ||
  (!file.type && file.name.toLowerCase().endsWith(".svg"));

/**
 * Worth treating as an image when dropped or pasted.
 *
 * An SVG counts, since it is rasterised on the way in. The extension is
 * consulted only when the drop carried no type at all — some file managers and
 * some remote sources give none, and an .svg discarded silently at the filter
 * looks exactly like a board that ignores drops.
 */
export const isImageDrop = (file: File): boolean =>
  file.type.startsWith("image/") || isSvgFile(file);

/**
 * Rasterises an SVG file to a WebP one, keeping its aspect and its name.
 *
 * Drawn on a transparent canvas rather than a white one: logos and icons are
 * usually meant to sit on something, and flattening them onto white is a
 * decision that cannot be undone later. WebP keeps the alpha.
 *
 * Rejects rather than falling back to the original file. An SVG that cannot be
 * rasterised — one referencing a font or an image we cannot fetch — would
 * otherwise be uploaded as an SVG and fail further along, where the reason is
 * much harder to see.
 */
export const svgToWebp = async (file: File): Promise<File> => {
  const source = await file.text();
  const size = rasterSize(intrinsicSize(source));

  // Served as its own blob URL rather than a data: URI. Base64 of a large SVG
  // runs into URL length limits in some browsers, and the object URL is revoked
  // as soon as the image has decoded.
  const url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml;charset=utf-8" })
  );

  try {
    const image = new Image();
    // Same-origin blob URL, so the canvas is not tainted and toBlob is allowed.
    // An SVG pulling in a remote font or image will simply draw without it.
    image.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("That SVG could not be read as an image"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("This browser cannot convert SVGs");
    }
    context.drawImage(image, 0, 0, size.width, size.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/webp", 0.92);
    });
    if (!blob) {
      throw new Error("That SVG could not be converted");
    }

    return new File([blob], `${file.name.replace(SVG_EXTENSION, "")}.webp`, {
      type: "image/webp",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};
