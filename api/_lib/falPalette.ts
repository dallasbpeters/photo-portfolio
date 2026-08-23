import { HEX_COLOUR } from "../../config/nodes/palette.js";

/**
 * The one endpoint quirk that is about colour, kept apart from the request.
 *
 * Split out of fal.ts on size, and it is the right seam: everything here is
 * about reading hex codes back out of a prompt, and nothing about it knows that
 * a request is being built. The generation-parameter policy left for the same
 * reason — see config/nodes/falParams.ts.
 */

/** Models that accept a color palette as a parameter rather than as prose. */
export const PALETTE_MODELS = new Set(["fal-ai/ideogram/v3"]);

/** The shape Ideogram wants: RGB triplets, unweighted. */
type FalPalette = { members: { rgb: { b: number; g: number; r: number } }[] };

/** One hex as a triplet, or null if it is not a six-digit hex. */
const triplet = (hex: string): { b: number; g: number; r: number } | null => {
  const clean = hex.trim();
  if (!/^#[0-9a-f]{6}$/i.test(clean)) {
    return null;
  }
  return {
    b: Number.parseInt(clean.slice(5, 7), 16),
    g: Number.parseInt(clean.slice(3, 5), 16),
    r: Number.parseInt(clean.slice(1, 3), 16),
  };
};

/**
 * A palette from values handed to us, rather than scraped out of a prompt.
 *
 * The preferred source now: the prompt describes colours in words, because a
 * hex code in a prompt gets lettered onto the picture, so the numbers travel
 * beside it instead. Null for an empty list so the caller can fall back.
 *
 * Weights are left at the default, for the reason paletteFrom gives: an even
 * palette is what a brand palette usually means, and inferring a weighting from
 * the order they happen to be listed in would be inventing intent.
 */
export const paletteOf = (hexes: readonly string[]): FalPalette | null => {
  const members = hexes
    .map(triplet)
    .filter((rgb): rgb is NonNullable<typeof rgb> => rgb !== null)
    // Ideogram takes at most eight, the same cap paletteFrom applies.
    .slice(0, 8)
    .map((rgb) => ({ rgb }));
  return members.length > 0 ? { members } : null;
};

/**
 * The hex codes in a prompt, as the palette parameter Ideogram expects.
 *
 * Lifted back out of the prompt rather than carried on a wire of their own.
 * A palette node writes its colors into the text so that every model gets
 * something to go on — most can only be asked — and this turns the same line
 * into an actual constraint for the one model that can honour it.
 *
 * Weights are left at the default: an even palette is what a brand palette
 * usually means, and guessing a weighting from the order they were typed in
 * would be inventing intent.
 */
export const paletteFrom = (
  prompt: string
): { members: { rgb: { b: number; g: number; r: number } }[] } | null => {
  const found = prompt.match(HEX_COLOUR);
  if (!found || found.length === 0) {
    return null;
  }
  return {
    members: found.slice(0, 8).map((hex) => ({
      rgb: {
        b: Number.parseInt(hex.slice(5, 7), 16),
        g: Number.parseInt(hex.slice(3, 5), 16),
        r: Number.parseInt(hex.slice(1, 3), 16),
      },
    })),
  };
};
