import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/**
 * A picture, halftoned.
 *
 * Built on the shader library's own Halftone and ImageTexture rather than on a
 * hand-written renderer. The bespoke one was a halftone of the brand mark that
 * had been taught to accept a photograph, and it never stopped behaving like
 * one: it sampled a window instead of the whole picture, punched the lockup's
 * clear space out of the middle, and its spiral only read as a spiral over a
 * sparse shape. The library's does this one job properly, and every control
 * below is its own rather than a translation of it.
 *
 * **A node type, deliberately not a shader item.** A `kind: "shader"` item is a
 * dead end and the registry says so: SOURCE_PORTS has no entry for one, so the
 * canvas draws no port to wire out of, and singleOutputOf finds no node_type on
 * one, so even a wire would resolve to nothing. An op node with a capability
 * gets an output port from `outputs` below and a readable value from
 * `result.url` — which is what lets the picture it makes feed a Generate, a
 * Composite or a Deliver like anything else.
 *
 * The capability is `board.shader`, which does no work of its own: only the
 * browser can run a shader, so it renders and uploads, and the run stores what
 * it produced. The same division `board.composite` already uses.
 */
export const STANDARD: NodeType = {
  capability: "board.shader",
  id: "standard",
  inputs: [
    {
      // Required: a halftone of nothing is a blank sheet.
      arity: "one",
      key: "image",
      label: "Image",
      required: true,
      type: "image",
    },
  ],
  label: "Halftone",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Image", type: "image" }],
  settings: [
    {
      /*
       * The dark end. Both ends are chosen here, which is what makes the
       * halftone invertible: swap the two and the picture turns over.
       */
      default: "#27444D",
      key: "ink",
      kind: "color",
      label: "Ink",
    },
    {
      /* The ground the ink is printed on. */
      default: "#FAFAFA",
      key: "paper",
      kind: "color",
      label: "Paper",
    },
    {
      /*
       * Dot pitch, in pixels of the picture being drawn.
       *
       * A screen ruling rather than a count: the pitch is fixed, so a larger
       * sheet carries more dots rather than bigger ones, and the same setting
       * means the same thing at every size. Measured in cells-across-the-frame
       * — which is what the shader library did — the same number aliased into
       * a moiré on a small node and read as a fine screen on a large one.
       */
      default: 3,
      key: "dot",
      kind: "number",
      label: "Dot size",
      max: 40,
      min: 1,
    },
    {
      /*
       * The tone curve. Above 1 lightens the midtones, below 1 darkens them —
       * the difference between a photograph that reads as grey and one that
       * reads as ink.
       */
      default: 1.25,
      key: "gamma",
      kind: "number",
      label: "Tone",
      max: 3,
      min: 0.2,
      step: 0.05,
    },
  ],
};
