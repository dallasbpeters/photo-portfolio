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
