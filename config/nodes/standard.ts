import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/**
 * A picture, dithered into brand dots.
 *
 * The renderer has always been a halftone of a texture: it samples one at three
 * scales, adds spiral trails, dithers the result against an ordered matrix and
 * paints two colours. Given the brand mark it draws the brand mark. Given a
 * photograph it draws the photograph, which is all this node is.
 *
 * **A node type, deliberately not a shader item.** A `kind: "shader"` item is a
 * dead end and the registry says so: SOURCE_PORTS has no entry for one, so the
 * canvas draws no port to wire out of, and singleOutputOf finds no node_type on
 * one, so even a wire would resolve to nothing. An op node with a capability
 * gets an output port from `outputs` below and a readable value from
 * `result.url`, which is what lets the picture it makes feed a Generate, a
 * Composite or a Deliver like anything else.
 *
 * The capability is `board.shader`, which does no work of its own: only the
 * browser can run a shader, so it renders and uploads, and the run stores what
 * it produced. The same division `board.composite` already uses, and for the
 * same reason.
 *
 * Nothing here animates. The renderer can, and a still is what a downstream
 * node can consume — so `t` is frozen and breathing and rotation fall out of
 * the picture rather than being options that quietly do nothing to the export.
 */
export const STANDARD: NodeType = {
  capability: "board.shader",
  id: "standard",
  inputs: [
    {
      // One, and optional. Without a picture it draws the brand mark, which is
      // what the renderer did before it took one — so an unwired node is a
      // usable node rather than an error.
      arity: "one",
      key: "image",
      label: "Image",
      required: false,
      type: "image",
    },
  ],
  label: "Halftone",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Image", type: "image" }],
  settings: [
    {
      /*
       * The halftone cell, in pixels. The single most visible control: at 2 it
       * reads as a photograph, at 12 as a pattern that happens to be a picture.
       */
      default: 4.5,
      key: "dotSize",
      kind: "number",
      label: "Dot size",
      max: 24,
      min: 1,
    },
    { default: "#27444D", key: "dots", kind: "color", label: "Dots" },
    {
      default: "#FFFFFF",
      key: "background",
      kind: "color",
      label: "Background",
    },
    {
      /*
       * How strongly the picture drives the dots. Low leaves an even field with
       * the image faintly in it; high makes the image the only thing there.
       */
      default: 1,
      key: "fieldStrength",
      kind: "number",
      label: "Detail",
      max: 3,
      min: 0,
    },
    {
      /* Dots in the parts of the picture that have nothing in them. Zero is a
         clean cut-out; raised, the mark sits in a field rather than on blank. */
      default: 0.012,
      key: "baseDensity",
      kind: "number",
      label: "Floor",
      max: 1,
      min: 0,
    },
    {
      /* The trailing arms — the part that reads as the brand rather than as a
         generic halftone. Zero is a plain dithered picture. */
      default: 1,
      key: "spiralAmount",
      kind: "number",
      label: "Spiral",
      max: 3,
      min: 0,
    },
    {
      /* How much of the frame the picture fills, before the dots are counted. */
      default: 1,
      key: "fieldSize",
      kind: "number",
      label: "Zoom",
      max: 4,
      min: 0.1,
    },
  ],
};
