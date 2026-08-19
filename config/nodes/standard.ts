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
 *
 * Every property of the shader is here except the four that cannot mean
 * anything on a still — animate, speed, breathing and rotation — the two that
 * are the export frame rather than the design, and the picture itself, which
 * arrives down a wire. Each default is read from the shader's own DEFAULT_PROPS
 * rather than restated, which is how the first version of this ended up
 * rendering a different picture entirely.
 *
 * Thirty-two controls is more than a node can hold, so they render in the
 * floating panel beside the board rather than inside the node — the same reason
 * the shader settings moved there, and the same argument MaskControls makes.
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
    { default: "#131415", key: "ink", kind: "color", label: "Ink" },
    { default: "#3A70B3", key: "blue", kind: "color", label: "Mark" },
    {
      default: "yes",
      key: "reversed",
      kind: "select",
      label: "Reversed",
      options: ["yes", "no"],
    },
    {
      default: "#EEF3F4",
      key: "reverseDots",
      kind: "color",
      label: "Dots (reversed)",
    },
    {
      default: "#27444D",
      key: "reverseBackground",
      kind: "color",
      label: "Background (reversed)",
    },
    {
      default: "#FFFFFF",
      key: "reverseInk",
      kind: "color",
      label: "Ink (reversed)",
    },
    {
      default: 1,
      key: "fieldStrength",
      kind: "number",
      label: "Detail",
      max: 3,
      min: 0,
    },
    {
      default: 0.012,
      key: "baseDensity",
      kind: "number",
      label: "Floor",
      max: 1,
      min: 0,
    },
    {
      default: 1,
      key: "fieldSize",
      kind: "number",
      label: "Zoom",
      max: 4,
      min: 0.1,
    },
    {
      default: 0.35,
      key: "spiralAmount",
      kind: "number",
      label: "Swirl",
      max: 3,
      min: 0,
    },
    {
      default: 18,
      key: "spiralTightness",
      kind: "number",
      label: "Swirl tightness",
      max: 60,
      min: 0,
    },
    {
      default: 3,
      key: "spiralArms",
      kind: "number",
      label: "Swirl arms",
      max: 12,
      min: 1,
    },
    {
      default: 0.58,
      key: "spiralOverlap",
      kind: "number",
      label: "Swirl overlap",
      max: 1,
      min: 0,
    },
    {
      default: 0.27,
      key: "clearSize",
      kind: "number",
      label: "Centre clear",
      max: 1,
      min: 0,
    },
    {
      default: 0.12,
      key: "clearFeather",
      kind: "number",
      label: "Clear softness",
      max: 1,
      min: 0,
    },
    {
      key: "wordmark",
      kind: "text",
      label: "Wordmark",
      maxLength: 120,
      placeholder: "Standard",
    },
    {
      key: "description",
      kind: "text",
      label: "Description",
      maxLength: 120,
      placeholder: "Standard",
    },
    {
      default: "yes",
      key: "showDescription",
      kind: "select",
      label: "Show description",
      options: ["yes", "no"],
    },
    {
      default: 17,
      key: "descriptionSize",
      kind: "number",
      label: "Description size",
      max: 120,
      min: 6,
    },
    {
      default: 92,
      key: "typeSize",
      kind: "number",
      label: "Type size",
      max: 300,
      min: 8,
    },
    {
      default: 700,
      key: "typeWeight",
      kind: "number",
      label: "Type weight",
      max: 900,
      min: 100,
    },
    {
      default: -0.035,
      key: "tracking",
      kind: "number",
      label: "Tracking",
      max: 0.5,
      min: -0.2,
    },
    {
      default: "no",
      key: "iconOnly",
      kind: "select",
      label: "Mark only",
      options: ["yes", "no"],
    },
    {
      default: 180,
      key: "iconSize",
      kind: "number",
      label: "Mark size (icon)",
      max: 600,
      min: 20,
    },
    {
      default: 104,
      key: "markSize",
      kind: "number",
      label: "Mark size",
      max: 400,
      min: 20,
    },
    {
      default: 10,
      key: "lockupGap",
      kind: "number",
      label: "Lockup gap",
      max: 120,
      min: 0,
    },
    {
      default: 20,
      key: "verticalGap",
      kind: "number",
      label: "Vertical gap",
      max: 120,
      min: 0,
    },
    {
      default: 8,
      key: "padding",
      kind: "number",
      label: "Padding",
      max: 120,
      min: 0,
    },
    {
      default: 16,
      key: "cornerRadius",
      kind: "number",
      label: "Corner radius",
      max: 120,
      min: 0,
    },
  ],
};
