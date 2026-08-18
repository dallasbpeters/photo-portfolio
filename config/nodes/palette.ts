import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/** Hex colors, however they were separated when written down. */
export const HEX_COLOUR = /#[0-9a-f]{6}\b/gi;

/**
 * The colors a generation is allowed to use.
 *
 * Emits a line of text naming them, which is what makes one node serve two very
 * different mechanisms. Most models can only be *asked* for a palette, and a
 * sentence naming the hex codes is the best that can be done. Ideogram v3 takes
 * a real color palette as a parameter, so for that model the same line is read
 * back into an actual constraint — see paletteFrom in api/_lib/fal.ts.
 *
 * Writing the colors into the prompt rather than inventing a second kind of
 * wire is what keeps that possible: one text output, understood loosely by
 * everything and precisely by what can.
 */
export const PALETTE: NodeType = {
  id: "palette",
  inputs: [],
  label: "Palette",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
  settings: [
    {
      key: "colors",
      kind: "text",
      label: "Colors",
      maxLength: 400,
      placeholder: "#0a2540, #f5f0e8, #c8102e",
    },
    {
      // How hard to push. "only" is a flat restriction, which is what a brand
      // palette usually means; "mostly" leaves room for shadow and skin.
      default: "only",
      key: "strictness",
      kind: "select",
      label: "Use",
      options: ["only", "mostly"],
    },
    {
      /*
       * Whether the palette is one constraint or a list to work through.
       *
       * "together" names every color in a single line, which is a restriction
       * on one image. "one at a time" emits each color separately, so an
       * Iterate node can fill a slot with them and make one image per color.
       * The same swatches, meaning two quite different things.
       */
      default: "together",
      key: "output",
      kind: "select",
      label: "Send",
      options: ["together", "one at a time"],
    },
  ],
};
