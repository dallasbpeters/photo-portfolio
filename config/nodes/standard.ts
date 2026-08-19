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
      /* Classic is one ink on paper; cmyk separates into four screens at four
         angles, which is what a printed halftone actually is. */
      default: "classic",
      key: "style",
      kind: "select",
      label: "Style",
      options: ["classic", "cmyk"],
    },
    {
      /* Dots across the frame. The most visible control by far: low reads as a
         pattern that happens to be a picture, high as a photograph. */
      default: 100,
      key: "frequency",
      kind: "number",
      label: "Frequency",
      max: 600,
      min: 4,
    },
    {
      default: 45,
      key: "angle",
      kind: "number",
      label: "Angle",
      max: 360,
      min: 0,
    },
    {
      /*
       * How the picture sits in the frame.
       *
       * `cover` rather than the library's own `fill`. Fill stretches, which on
       * a halftone reads as a squeezed subject rather than as a choice — and
       * cover fills the frame, which is what "use my whole picture" means to
       * anyone who has not read the shader.
       */
      default: "cover",
      key: "objectFit",
      kind: "select",
      label: "Fit",
      options: ["cover", "contain", "fill"],
    },
    { default: "#ffffff", key: "paperColor", kind: "color", label: "Paper" },
    { default: "#000000", key: "blackColor", kind: "color", label: "Ink" },
    {
      /* Nudges the screens out of register, the way a real press does. */
      default: 0,
      key: "misprint",
      kind: "number",
      label: "Misprint",
      max: 1,
      min: 0,
    },
    {
      default: 0,
      key: "misprintAngle",
      kind: "number",
      label: "Misprint angle",
      max: 360,
      min: 0,
    },
    { default: "#00ffff", key: "cyanColor", kind: "color", label: "Cyan" },
    {
      default: "#ff00ff",
      key: "magentaColor",
      kind: "color",
      label: "Magenta",
    },
    { default: "#ffff00", key: "yellowColor", kind: "color", label: "Yellow" },
    {
      default: 15,
      key: "cyanAngle",
      kind: "number",
      label: "Cyan angle",
      max: 360,
      min: 0,
    },
    {
      default: 75,
      key: "magentaAngle",
      kind: "number",
      label: "Magenta angle",
      max: 360,
      min: 0,
    },
    {
      default: 0,
      key: "yellowAngle",
      kind: "number",
      label: "Yellow angle",
      max: 360,
      min: 0,
    },
    {
      default: 45,
      key: "blackAngle",
      kind: "number",
      label: "Black angle",
      max: 360,
      min: 0,
    },
  ],
};
