import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/**
 * Several pictures flattened into one.
 *
 * A frame groups images but is not itself an image — it has no pixels to hand
 * on, so an arrangement you had already made could not be used as a single
 * reference. This renders it.
 *
 * Layout comes from the board rather than from settings: images are drawn where
 * they sit, at the size they were dragged to, scaled into the box they occupy.
 * Overlap them and they layer, in the z-order you see — so "bring to front" is
 * how a composite is reordered.
 *
 * Rendered in the browser, the only place that knows the geometry, and the run
 * stores what it produced. It costs nothing beyond storing the file.
 */
export const COMPOSITE: NodeType = {
  capability: "board.composite",
  id: "composite",
  inputs: [
    {
      // Many, and every wire contributes its pictures — a frame hands over
      // everything on it, so one wire is usually enough.
      arity: "many",
      key: "image",
      label: "Images",
      required: true,
      type: "image",
    },
  ],
  label: "Composite",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Image", type: "image" }],
  settings: [
    {
      /*
       * Transparent by default, and deliberately so: the commonest reason to
       * composite here is to put a cut-out onto something, and flattening onto
       * white throws away an alpha channel that cannot be recovered.
       */
      default: "transparent",
      key: "background",
      kind: "select",
      label: "Background",
      options: ["transparent", "white", "black"],
    },
  ],
};
