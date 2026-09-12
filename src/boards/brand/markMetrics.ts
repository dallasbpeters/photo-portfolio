/**
 * Measuring a logo, rather than asking a model about it.
 *
 * A brand kit already declares two numbers about every mark — `minWidth`,
 * "below this width the mark stops being legible", and `clearSpace` — and
 * nothing has ever checked either. They are typed once, used to reserve room
 * in a prompt, and never tested against the actual artwork.
 *
 * They do not need a model. Both are arithmetic over pixels, which makes them
 * exact, free, instant, and impossible to hallucinate. That is worth saying
 * out loud on a page full of "generate this for me" buttons: the right helper
 * for a measurable field is a ruler, not a guess.
 *
 * Everything here takes the shape `ImageData` has and nothing more, so it runs
 * anywhere a canvas can be read and can be tested without one.
 */

/** The three numbers per pixel we never use, plus the one we do. */
const ALPHA_OFFSET = 3;
const CHANNELS = 4;

/** Below this, a pixel is background rather than part of the mark. */
const INK_ALPHA = 8;

export interface Pixels {
  data: Uint8ClampedArray | number[];
  height: number;
  width: number;
}

export interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

const alphaAt = (image: Pixels, x: number, y: number): number => {
  const { data, width } = image;
  return data[(y * width + x) * CHANNELS + ALPHA_OFFSET] ?? 0;
};

/**
 * The tight box around the mark's ink.
 *
 * Null when the image is empty, which is a real answer rather than an error: a
 * logo saved with its artwork on a hidden layer exports as a transparent
 * rectangle, and the proof sheet should say "there is nothing here" rather
 * than divide by zero on its way to a confident wrong number.
 */
export const inkBounds = (image: Pixels): Box | null => {
  const { height, width } = image;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(image, x, y) > INK_ALPHA) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < 0
    ? null
    : {
        height: bottom - top + 1,
        width: right - left + 1,
        x: left,
        y: top,
      };
};

/**
 * How much of the file the mark actually occupies, as a fraction of its area.
 *
 * The commonest fault in a supplied logo, and an invisible one: artwork
 * exported with a wide transparent margin looks correct on its own and then
 * lands two thirds of the size everywhere it is placed, because every layout
 * sizes the file rather than the mark inside it.
 */
export const inkCoverage = (image: Pixels): number => {
  const { height, width } = image;
  const area = width * height;
  if (area === 0) {
    return 0;
  }
  let inked = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(image, x, y) > INK_ALPHA) {
        inked += 1;
      }
    }
  }
  return inked / area;
};

/**
 * The padding already baked into the file, as a fraction of the mark's width.
 *
 * The same unit `LogoEntry.clearSpace` is written in, so the two can be
 * compared directly. The *smallest* of the four margins, because clear space
 * is a guarantee and a guarantee is only as good as its worst side.
 *
 * Null for an empty image, for the reason inkBounds gives.
 */
export const bakedClearSpace = (image: Pixels): number | null => {
  const box = inkBounds(image);
  if (!box || box.width === 0) {
    return null;
  }
  const margins = [
    box.x,
    box.y,
    image.width - (box.x + box.width),
    image.height - (box.y + box.height),
  ];
  return Math.min(...margins) / box.width;
};

/**
 * Whether a mark still reads once it is this wide, and by how much it is off.
 *
 * Compared against the number the kit already declares rather than an opinion
 * about what is legible: the brand said the limit, so the test is whether the
 * artwork honours the brand's own claim.
 *
 * `shrinksTo` is where the mark's *ink* ends up — a file that is mostly margin
 * arrives smaller than the size it was placed at, which is exactly the fault
 * inkCoverage names and the one nobody looks for.
 */
export interface LegibilityCheck {
  /** The declared floor, echoed back so a finding can quote it. */
  declaredMinWidth: number;
  /** True when the ink still clears the floor at the size being tested. */
  passes: boolean;
  /** The ink's width once the whole file is drawn at `atWidth`. */
  shrinksTo: number;
}

export const legibilityAt = (
  image: Pixels,
  atWidth: number,
  declaredMinWidth: number
): LegibilityCheck | null => {
  const box = inkBounds(image);
  if (!box || image.width === 0) {
    return null;
  }
  const shrinksTo = (box.width / image.width) * atWidth;
  return {
    declaredMinWidth,
    passes: shrinksTo >= declaredMinWidth,
    shrinksTo,
  };
};

/**
 * The ratio between two colours' relative luminance, as WCAG defines it.
 *
 * Included because contrast is the other thing on a proof sheet that is
 * arithmetic rather than taste, and because a brand palette's own pairs are
 * exactly what nobody checks: a mark that is legible on white and invisible on
 * the brand's second colour is a fault in the palette, not in the mark.
 *
 * Returns 1 for a colour it cannot read, which reads as "no contrast" — the
 * safe direction, since it fails rather than passing silently.
 */
const CHANNEL_MAX = 255;
const SRGB_KNEE = 0.039_28;
const LUMA = { b: 0.0722, g: 0.7152, r: 0.2126 };

const linear = (channel: number): number => {
  const value = channel / CHANNEL_MAX;
  return value <= SRGB_KNEE ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const HEX_SIX = /^#?([0-9a-f]{6})$/i;

export const relativeLuminance = (hex: string): number | null => {
  const [, digits] = HEX_SIX.exec(hex.trim()) ?? [];
  if (!digits) {
    return null;
  }
  // Read as three pairs rather than shifted out of one integer: the same
  // answer, and it says what a hex triplet is.
  const channel = (at: number) => Number.parseInt(digits.slice(at, at + 2), 16);
  return (
    LUMA.r * linear(channel(0)) +
    LUMA.g * linear(channel(2)) +
    LUMA.b * linear(channel(4))
  );
};

export const contrastRatio = (a: string, b: string): number => {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === null || second === null) {
    return 1;
  }
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};
