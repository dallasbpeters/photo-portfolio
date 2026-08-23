/**
 * Where a brand's logo goes on a picture, and how big.
 *
 * A brand mark is *composited*, not described. Asked to draw a logo, a model
 * redraws it — different letterforms, a warped mark, colours it liked better —
 * which is the exact failure a brand kit exists to prevent. The clear space and
 * minimum width stored against each logo are guidelines about an object that
 * must arrive intact, so the only faithful way to honour them is to place the
 * file itself, pixel for pixel, after the picture is made.
 *
 * That is why these live here rather than as words in a prompt: they are
 * arithmetic for a compositor, not instructions for a model.
 *
 * Kept in config/ and dependency-free so the node, the panel and the run path
 * all read one definition.
 */

/**
 * The nine placements, as a corner or an edge.
 *
 * Named rather than free coordinates: a logo on a generated picture goes in a
 * corner, and offering x/y in pixels would invite placements that break the
 * clear-space rule the kit already states.
 */
export const LOGO_PLACEMENTS = [
  "bottom-right",
  "bottom-left",
  "bottom-center",
  "top-right",
  "top-left",
  "top-center",
  "center",
] as const;

export type LogoPlacement = (typeof LOGO_PLACEMENTS)[number];

export const LOGO_PLACEMENT_LABELS: Readonly<Record<LogoPlacement, string>> = {
  "bottom-center": "Bottom centre",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
  center: "Centre",
  "top-center": "Top centre",
  "top-left": "Top left",
  "top-right": "Top right",
};

export const DEFAULT_LOGO_PLACEMENT: LogoPlacement = "bottom-right";

/**
 * How wide the logo is drawn, as a percentage of the picture's width.
 *
 * A percentage rather than pixels so one setting survives a change of output
 * size — the same node feeding a 1024 square and a 2048 landscape should put the
 * mark at the same *relative* size, which is how a brand actually specifies it.
 *
 * The floor is not arbitrary: below a few percent a wordmark stops being
 * readable at any output size, and the kit's own `minWidth` is the real backstop
 * (see logoBox, which will not draw one smaller than the brand allows).
 */
export const LOGO_WIDTH_MIN = 2;
export const LOGO_WIDTH_MAX = 50;
export const DEFAULT_LOGO_WIDTH = 12;

/** A box on the canvas, in pixels, ready for a compositor. */
export interface LogoBox {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * Where the logo lands, honouring the brand's own rules.
 *
 * Three things decide it and they are applied in this order, because each can
 * override the one before:
 *
 *   1. the requested width, as a share of the picture
 *   2. `minWidth` from the kit — the width below which the brand says the mark
 *      stops being legible, so a request under it is raised rather than obeyed
 *   3. `clearSpace` from the kit — the margin, expressed as a fraction of the
 *      logo's *own* width, which is how brand guidelines state it
 *
 * Returns null when the picture is too small to carry the mark and its clear
 * space at all. That is a real answer: drawing it anyway would either crop the
 * logo or violate the margin the brand set, and silently doing either is worse
 * than leaving the picture alone and saying so.
 */
export const logoBox = ({
  clearSpace,
  imageHeight,
  imageWidth,
  logoHeight,
  logoWidth,
  minWidth,
  placement,
  widthPercent,
}: {
  clearSpace: number;
  imageHeight: number;
  imageWidth: number;
  logoHeight: number;
  logoWidth: number;
  minWidth: number;
  placement: LogoPlacement;
  widthPercent: number;
}): LogoBox | null => {
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    logoWidth <= 0 ||
    logoHeight <= 0
  ) {
    return null;
  }

  const requested =
    (imageWidth * clamp(widthPercent, LOGO_WIDTH_MIN, LOGO_WIDTH_MAX)) / 100;
  // The brand's floor wins over the node's request: minWidth is a legibility
  // statement, not a preference.
  const width = Math.round(Math.max(requested, Math.max(minWidth, 1)));
  const height = Math.round((width * logoHeight) / logoWidth);

  // The margin is a fraction of the logo's own width — brand guidelines say
  // "half the mark's width", never "24 pixels".
  const margin = Math.round(width * Math.max(clearSpace, 0));

  // No room for the mark and its clear space. Reported rather than fudged.
  if (width + margin * 2 > imageWidth || height + margin * 2 > imageHeight) {
    return null;
  }

  const left = horizontal(placement, imageWidth, width, margin);
  const top = vertical(placement, imageHeight, height, margin);
  return { height, left, top, width };
};

const clamp = (value: number, low: number, high: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, low), high) : high;

const horizontal = (
  placement: LogoPlacement,
  imageWidth: number,
  width: number,
  margin: number
): number => {
  if (placement.endsWith("left")) {
    return margin;
  }
  if (placement.endsWith("right")) {
    return imageWidth - width - margin;
  }
  // Centred horizontally: the two "-center" placements and "center" itself.
  return Math.round((imageWidth - width) / 2);
};

const vertical = (
  placement: LogoPlacement,
  imageHeight: number,
  height: number,
  margin: number
): number => {
  if (placement.startsWith("top")) {
    return margin;
  }
  if (placement.startsWith("bottom")) {
    return imageHeight - height - margin;
  }
  return Math.round((imageHeight - height) / 2);
};

/**
 * What to tell the model when a logo is going to be stamped afterwards.
 *
 * The instruction is deliberately the *opposite* of "use this logo". The mark is
 * composited after generation, so anything the model draws in that corner will
 * be covered — or worse, will show through around the edges as a second, wrong
 * logo. What helps is asking it to leave the space alone and not to invent a
 * brand of its own, which is a thing image models do unprompted the moment a
 * picture looks like an advertisement.
 *
 * Kept beside the placement arithmetic because the two have to agree: the
 * corner named here is the corner logoBox will use.
 */
export const logoReservationText = (placement: LogoPlacement): string =>
  `leave the ${LOGO_PLACEMENT_LABELS[placement].toLowerCase()} of the frame clear and uncluttered for a logo to be placed there afterwards; do not draw any logo, wordmark, watermark or brand name`;
