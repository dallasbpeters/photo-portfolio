/**
 * What an operation node is, and what may be wired to what.
 *
 * A board is a graph: items are nodes, and a wire runs from an output port on
 * one to an input port on another. The canvas draws those ports and refuses an
 * invalid drop; the API refuses an invalid wire on save and dispatches a run.
 * All three need the same answer, so it is defined here once.
 *
 * The moodboard item kinds get their output ports from SOURCE_PORTS, which is
 * what makes a photograph already pinned to a board a valid input to a
 * generation with no conversion step and no wrapper node.
 *
 * **A node definition lives in its own file, under config/nodes/.** This module
 * is the types, the registry and the guards; it is not where a node is
 * described. config/nodes/video.ts moved out first, when a node needed a file
 * of its own to explain a queue; the rest followed once this file was large
 * enough that adding a node type meant editing something nobody could read at a
 * sitting. A definition file imports its types from here with `import type`,
 * which is erased at build time and so cannot take part in the load-order cycle
 * config/ports.ts exists to avoid.
 *
 * The fal.ai model shapes that used to sit here — FalModelDef and the falModel*
 * helpers — are in config/falModels.ts. They describe the endpoints one node
 * happens to call, which is a different question from what a node is.
 *
 * Like config/canvas.ts, this module stays dependency-free and free of browser
 * and Node globals so every layer can import it.
 */

import { BATCH } from "./nodes/batch.js";
import { BRAND } from "./nodes/brand.js";
import { COMPOSITE } from "./nodes/composite.js";
import { DESCRIBE } from "./nodes/describe.js";
import { ELEMENT } from "./nodes/element.js";
import { GENERATE } from "./nodes/generate.js";
import { ICON } from "./nodes/icon.js";
import { ITERATE } from "./nodes/iterate.js";
import { JOIN } from "./nodes/join.js";
import { LIST } from "./nodes/list.js";
import { PALETTE } from "./nodes/palette.js";
import { PROMPT } from "./nodes/prompt.js";
import { STANDARD } from "./nodes/standard.js";
import { VIDEO } from "./nodes/video.js";
import { OUTPUT_PORT_KEY } from "./ports.js";

/** What travels down a wire. A new one is an entry here plus a handle colour. */
export type PortType = "image" | "text" | "video";

export interface Port {
  /**
   * Stored in board_wires.source_port / target_port, so renaming one orphans
   * every wire already saved against it. Treat these as permanent.
   */
  key: string;
  label: string;
  type: PortType;
}

export interface InputPort extends Port {
  /**
   * How many wires this input accepts.
   *
   * "one" — a second wire dropped on an occupied port replaces the first.
   * Dragging a new wire onto a taken input is someone changing their mind, not
   * making a mistake, and making them delete the old one first is friction for
   * nothing.
   *
   * "many" — every wire is kept, and the node runs once per input. This is what
   * makes a Generate node a batch: wire four references into it and it treats
   * them as four jobs rather than overwriting itself three times.
   */
  arity: "one" | "many";
  /** A run is refused, before spending anything, when this is unsatisfied. */
  required: boolean;
}

/**
 * A setting, and where it is edited.
 *
 * `panel` is the only cross-cutting field: it says a control belongs in the side
 * panel beside the board rather than on the node itself. Declared per setting
 * rather than decided by whoever renders it, for the same reason the rest of
 * this registry exists — the node and the panel both read one list, so a
 * setting cannot end up in both places or in neither.
 *
 * The model picker is the reason it exists. A model choice is a long label in a
 * menu of thirty, and on a node it was both the widest thing on the card and
 * the least often changed. The generation parameters that arrived with it —
 * size, output format, quality, how many passes — have the same shape: set once
 * for a node, then left alone while the prompt is worked on.
 */
export type SettingDef =
  | {
      key: string;
      kind: "text";
      label: string;
      maxLength: number;
      /** Edited in the side panel rather than on the node. See SettingDef. */
      panel?: boolean;
      placeholder: string;
    }
  | {
      default: string;
      key: string;
      kind: "select";
      label: string;
      /**
       * What each option is called, where the stored value is not presentable.
       *
       * fal's size vocabulary is the reason: `portrait_16_9` is the string the
       * endpoint requires and cannot be prettified on the way out, but it is
       * not what a control should say. Absent means the value is its own label,
       * which is true of every other select on the board.
       */
      optionLabels?: Readonly<Record<string, string>>;
      options: readonly string[];
      panel?: boolean;
    }
  | {
      default: string;
      key: string;
      kind: "model";
      label: string;
      panel?: boolean;
      /** Offer only video endpoints; an image one refuses after billing. */
      video?: boolean;
    }
  | {
      /**
       * A brand kit from the library, chosen by id.
       *
       * Data rather than options, exactly like `kind: "model"` — the choices are
       * rows in `brand_kits`, so the registry declares the control and the
       * control asks for what to offer.
       */
      default: string;
      key: string;
      kind: "brandKit";
      label: string;
      panel?: boolean;
    }
  | {
      default: number;
      key: string;
      kind: "number";
      label: string;
      max: number;
      min: number;
      panel?: boolean;
      /**
       * The smallest change worth making. Absent means whole numbers.
       *
       * Load-bearing on the way in as well as in the field: a value is rounded
       * to a whole number when this is absent, and a setting that lives between
       * 0 and 1 — a tint, a misprint — was being rounded to 0 or 1 and could
       * not be set to anything in between.
       */
      step?: number;
    }
  | {
      /** A six-digit hex. Rendered as a swatch, not a text field. */
      default: string;
      key: string;
      kind: "color";
      label: string;
      panel?: boolean;
    };

/**
 * Which server-side generator a run dispatches to.
 *
 * A node type with no capability never runs at all — it is a *source*, and its
 * output is whatever its settings hold. The Prompt node is the only one so far.
 */
export type NodeCapability =
  | "board.composite"
  | "board.shader"
  | "fal.describe"
  | "fal.image"
  | "fal.video"
  | "magnific.icon";

export type NodeTypeId =
  | "batch"
  | "brand"
  | "composite"
  | "describe"
  | "element"
  | "generate"
  | "icon"
  | "iterate"
  | "join"
  | "list"
  | "palette"
  | "prompt"
  | "standard"
  | "video";

export interface NodeType {
  /** Absent on source nodes, which produce their value without spending. */
  capability?: NodeCapability;
  id: NodeTypeId;
  inputs: readonly InputPort[];
  label: string;
  outputs: readonly Port[];
  settings: readonly SettingDef[];
}

export const NODE_TYPES: Record<NodeTypeId, NodeType> = {
  batch: BATCH,
  brand: BRAND,
  composite: COMPOSITE,
  describe: DESCRIBE,
  element: ELEMENT,
  generate: GENERATE,
  icon: ICON,
  iterate: ITERATE,
  join: JOIN,
  list: LIST,
  palette: PALETTE,
  prompt: PROMPT,
  standard: STANDARD,
  video: VIDEO,
};

/** Read off the registry: a restated list disagrees the moment one is added. */
export const isNodeTypeId = (value: unknown): value is NodeTypeId =>
  typeof value === "string" && Object.hasOwn(NODE_TYPES, value);

export const nodeTypeFor = (value: unknown): NodeType | null =>
  isNodeTypeId(value) ? NODE_TYPES[value] : null;

/** Source nodes hold a value; only the rest can be run. */
export const isRunnableNodeType = (value: unknown): boolean =>
  nodeTypeFor(value)?.capability !== undefined;

/**
 * The moodboard item kinds, and the one output each of them offers.
 *
 * This table is the whole of "built on top of the current moodboard": a
 * reference someone pinned months ago is a graph source the moment wires exist,
 * with nothing to migrate and nothing to convert.
 */
export type SourceItemKind = "note" | "photo" | "reference" | "text" | "frame";

export const SOURCE_PORTS: Record<SourceItemKind, readonly Port[]> = {
  // A frame emits everything sitting on it, so one wire out of a frame carries
  // a dozen images. That is what makes "feed all of these into one prompt" a
  // single gesture rather than a dozen.
  frame: [{ key: OUTPUT_PORT_KEY, label: "Contents", type: "image" }],
  note: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
  photo: [{ key: OUTPUT_PORT_KEY, label: "Image", type: "image" }],
  reference: [{ key: OUTPUT_PORT_KEY, label: "Image", type: "image" }],
  text: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
};

/**
 * A frame accepts wires too, and collecting is what it does with them.
 *
 * Anything a node produces while wired into a frame is placed inside that
 * frame's bounds, so a run tidies after itself instead of piling results on
 * top of the node that made them.
 */
export const FRAME_INPUTS: readonly InputPort[] = [
  {
    arity: "many",
    key: "collect",
    label: "Collect",
    required: false,
    type: "image",
  },
];

/**
 * A shader takes one picture and restyles it.
 *
 * Input only, and deliberately so: the effects run as WebGL on the client, so
 * there is no rendered file for a downstream node to consume without capturing
 * the canvas. A shader is somewhere a picture ends up, not something another
 * node reads from.
 *
 * Single-arity, because the stack has one source slot. Wiring a second image in
 * replaces the first, which is the behaviour withWire already gives "one".
 */
export const SHADER_INPUTS: readonly InputPort[] = [
  {
    arity: "one",
    key: "image",
    label: "Image",
    required: false,
    type: "image",
  },
];

export const isSourceItemKind = (value: unknown): value is SourceItemKind =>
  value === "note" ||
  value === "photo" ||
  value === "reference" ||
  value === "text" ||
  value === "frame";

/** Every state a node's last run can be in. */
export const RUN_STATES = [
  "idle",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const isRunState = (value: unknown): value is RunState =>
  typeof value === "string" &&
  (RUN_STATES as readonly string[]).includes(value);
