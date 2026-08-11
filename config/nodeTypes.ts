/**
 * What an operation node is, and what may be wired to what.
 *
 * A board is a graph: items are nodes, and a wire runs from an output port on
 * one to an input port on another. The canvas draws those ports and refuses an
 * invalid drop; the API refuses an invalid wire on save and dispatches a run.
 * All three need the same answer, so the definition lives here once — the same
 * reasoning config/canvas.ts gives for the canvas dimensions.
 *
 * The moodboard item kinds get their output ports from SOURCE_PORTS, which is
 * what makes a photograph already pinned to a board a valid input to a
 * generation with no conversion step and no wrapper node.
 *
 * Like config/canvas.ts and config/iconStyles.ts, this module stays
 * dependency-free and free of browser and Node globals so every layer can
 * import it.
 */

import { ICON_STYLES } from "./iconStyles.js";

/**
 * What can travel down a wire.
 *
 * Two is enough for the nodes that exist. Adding a third is an entry here plus
 * a colour on the handle — the wire model itself does not change.
 */
export type PortType = "image" | "text";

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

export type SettingDef =
  | {
      key: string;
      kind: "text";
      label: string;
      maxLength: number;
      placeholder: string;
    }
  | {
      default: string;
      key: string;
      kind: "select";
      label: string;
      options: readonly string[];
    }
  | {
      default: number;
      key: string;
      kind: "number";
      label: string;
      max: number;
      min: number;
    };

/**
 * Which server-side generator a run dispatches to.
 *
 * A node type with no capability never runs at all — it is a *source*, and its
 * output is whatever its settings hold. The Prompt node is the only one so far.
 */
export type NodeCapability = "fal.image" | "magnific.icon";

export type NodeTypeId = "generate" | "icon" | "prompt";

export interface NodeType {
  /** Absent on source nodes, which produce their value without spending. */
  capability?: NodeCapability;
  id: NodeTypeId;
  inputs: readonly InputPort[];
  label: string;
  outputs: readonly Port[];
  settings: readonly SettingDef[];
}

/** Every node has exactly one output, and this is its key. */
export const OUTPUT_PORT_KEY = "out";

/**
 * Matches MAX_PROMPT in api/ai/generate.ts.
 *
 * Written down again rather than imported because that module pulls in the
 * Vercel runtime, and this one must stay importable from the browser.
 */
const GENERATE_PROMPT_MAX = 1200;

/**
 * What a model consumes.
 *
 * Not cosmetic: fal rejects a request whose body does not match the endpoint,
 * and it does so after the call has been made. Encoding the shape per model is
 * what lets a run be refused *before* it is billed when the wiring cannot
 * satisfy it — a vectoriser with no image, or a text-to-vector with no prompt.
 */
export type FalModelInput =
  /** A prompt, and an image only if one happens to be wired. */
  | "prompt-or-image"
  /** A prompt. Any wired image is ignored. */
  | "prompt"
  /** An image, and nothing else. Refused when none is wired. */
  | "image";

export interface FalModelDef {
  /** The exact fal.ai model id, or "auto". */
  id: string;
  input: FalModelInput;
  /** Shown on the node — model ids are too long and too alike to read. */
  label: string;
  /**
   * True when this model returns vector art rather than a raster.
   *
   * It decides what a result claims to be, which is not cosmetic: the node
   * warns when an image came back as a raster, and a mislabelled SVG would
   * either raise that warning wrongly or hide it when it mattered.
   * persistGenerated already stores an SVG with the right extension and
   * content type, so nothing else has to change.
   */
  vector: boolean;
}

/**
 * The fal.ai models a Generate node may ask for.
 *
 * "auto" is the default and reproduces the behaviour api/_lib/fal.ts has always
 * had: an image wired in means the edit model, no image means text-to-image.
 * That stays the sensible choice, so it stays first.
 *
 * This is an allowlist, not a free-text field, for the same reason
 * config/iconStyles.ts is one: the value is handed to a third party, and a
 * typo'd model id fails *after* the call has been made and billed.
 *
 * ADDING A MODEL: add one entry here with its exact fal id. Nothing else
 * changes — the node offers it, the API accepts it, an unknown value falls back
 * to "auto" rather than reaching fal, and `vector: true` makes the result
 * describe itself correctly.
 */
export const FAL_MODELS = [
  {
    id: "auto",
    input: "prompt-or-image",
    label: "Auto",
    vector: false,
  },
  {
    id: "fal-ai/nano-banana-pro",
    input: "prompt",
    label: "Nano Banana Pro",
    vector: false,
  },
  {
    id: "fal-ai/nano-banana/edit",
    input: "prompt-or-image",
    label: "Nano Banana Edit",
    vector: false,
  },
  {
    id: "fal-ai/recraft/v4.1/text-to-vector",
    input: "prompt",
    label: "Recraft v4.1 · Vector",
    vector: true,
  },
  {
    id: "fal-ai/recraft/v4/pro/text-to-vector",
    input: "prompt",
    label: "Recraft v4 Pro · Vector",
    vector: true,
  },
  {
    // Traces an existing image into vector art rather than inventing one, so it
    // is the only model here that needs an image and has no use for a prompt.
    id: "fal-ai/recraft/vectorize",
    input: "image",
    label: "Recraft · Vectorize",
    vector: true,
  },
] as const satisfies readonly FalModelDef[];

export const FAL_MODEL_IDS: readonly string[] = FAL_MODELS.map(
  (model) => model.id
);

export const isFalModel = (value: unknown): value is string =>
  typeof value === "string" && FAL_MODEL_IDS.includes(value);

export const falModelFor = (value: unknown): FalModelDef | null =>
  FAL_MODELS.find((model) => model.id === value) ?? null;

/** Whether a chosen model returns vector art. Unknown ids are not vector. */
export const isVectorModel = (value: unknown): boolean =>
  falModelFor(value)?.vector ?? false;

/** What a chosen model consumes; unknown ids behave like "auto". */
export const falModelInput = (value: unknown): FalModelInput =>
  falModelFor(value)?.input ?? "prompt-or-image";

/** Labels for the node's model picker, keyed by id. */
export const FAL_MODEL_LABELS: Record<string, string> = Object.fromEntries(
  FAL_MODELS.map((model) => [model.id, model.label])
);

export const MAX_BATCH_COUNT = 8;

const GENERATE: NodeType = {
  capability: "fal.image",
  id: "generate",
  inputs: [
    {
      // "many" is what makes this a batch node: every wired image is its own
      // job, so one Generate can treat four references as four runs.
      arity: "many",
      // Optional on purpose: with no image at all the node invents from the
      // prompt instead, which is the same switch api/_lib/fal.ts already makes.
      key: "image",
      label: "Image",
      required: false,
      type: "image",
    },
    {
      arity: "one",
      // Also optional, because a prompt may instead be typed on the node. The
      // run is refused when neither is present — see promptFor().
      key: "prompt",
      label: "Prompt",
      required: false,
      type: "text",
    },
  ],
  label: "Generate",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Image", type: "image" }],
  settings: [
    {
      key: "prompt",
      kind: "text",
      label: "Prompt",
      maxLength: GENERATE_PROMPT_MAX,
      placeholder: "Describe the image…",
    },
    {
      default: FAL_MODELS[0].id,
      key: "model",
      kind: "select",
      label: "Model",
      options: FAL_MODEL_IDS,
    },
    {
      // Variations per input. With three images wired in and a count of two,
      // the node runs six times.
      default: 1,
      key: "count",
      kind: "number",
      label: "Variations",
      max: MAX_BATCH_COUNT,
      min: 1,
    },
  ],
};

/** Matches MAX_PROMPT in api/ai/icon.ts: an icon is a few words, not a paragraph. */
const ICON_PROMPT_MAX = 300;

const ICON: NodeType = {
  capability: "magnific.icon",
  id: "icon",
  inputs: [
    {
      arity: "one",
      key: "prompt",
      label: "Prompt",
      required: false,
      type: "text",
    },
  ],
  label: "Icon",
  // An icon is an image as far as the graph is concerned, so it can feed a
  // Generate node's image input like anything else.
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Icon", type: "image" }],
  settings: [
    {
      key: "prompt",
      kind: "text",
      label: "Prompt",
      maxLength: ICON_PROMPT_MAX,
      placeholder: "Describe an icon…",
    },
    {
      default: ICON_STYLES[0],
      key: "style",
      kind: "select",
      label: "Style",
      options: ICON_STYLES,
    },
  ],
};

/**
 * A prompt, as a first-class node.
 *
 * Distinct from a Note or a Text item, which are moodboard furniture that
 * happen to expose a text port. This is part of the graph: it reads as a node,
 * it sits in the node palette, and one of them can feed several generations at
 * once so a shared style line is written in exactly one place.
 *
 * No capability, so it never runs and never costs anything — its output is
 * simply what is typed on it.
 */
const PROMPT: NodeType = {
  id: "prompt",
  inputs: [],
  label: "Prompt",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
  settings: [
    {
      key: "text",
      kind: "text",
      label: "Prompt",
      maxLength: GENERATE_PROMPT_MAX,
      placeholder: "shot on 35mm, overcast, muted greens…",
    },
  ],
};

export const NODE_TYPES: Record<NodeTypeId, NodeType> = {
  generate: GENERATE,
  icon: ICON,
  prompt: PROMPT,
};

export const isNodeTypeId = (value: unknown): value is NodeTypeId =>
  value === "generate" || value === "icon" || value === "prompt";

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
