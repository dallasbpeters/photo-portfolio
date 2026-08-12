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
export type NodeCapability = "fal.describe" | "fal.image" | "magnific.icon";

export type NodeTypeId =
  | "describe"
  | "generate"
  | "icon"
  | "iterate"
  | "join"
  | "palette"
  | "prompt";

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
  /**
   * Both, and both required — the image as `image_url`, singular.
   *
   * Distinct from "prompt-or-image", which sends `image_urls` as an array and
   * is happy without one. Ideogram's image-to-image endpoint lists prompt and
   * image_url as required and takes neither in the other shape, so sending it
   * the wrong one is a request that fails after it has been billed.
   */
  | "prompt-and-image"
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
   * A LoRA to load, for the models that are a style rather than an endpoint.
   *
   * These all run on the same fal endpoint — fal-ai/flux-lora — and differ only
   * in the weights it loads, so they are listed as models here because that is
   * what they are to whoever is picking one. `path` is a URL to a safetensors
   * file, ours or Hugging Face's.
   *
   * `trigger` is not optional in practice: a LoRA is trained against a token,
   * and a prompt without it gets the base model. It is prepended for you.
   */
  lora?: { path: string; scale: number; trigger: string };
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
    // The one model that takes a colour palette as a parameter rather than as
    // a request buried in the prompt — see PALETTE.
    id: "fal-ai/ideogram/v3",
    input: "prompt-or-image",
    label: "Ideogram v3 · Palette",
    vector: false,
  },
  {
    id: "ideogram/v4/instant",
    input: "prompt",
    label: "Ideogram v4 Instant",
    vector: false,
  },
  {
    // Verified against fal's schema: prompt and image_url are both required,
    // and it takes image_url rather than the image_urls array the nano-banana
    // edit endpoint wants.
    id: "ideogram/v4/image-to-image",
    input: "prompt-and-image",
    label: "Ideogram v4 Image-to-Image",
    vector: false,
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
  {
    id: "lora/rolemodel-style",
    input: "prompt-or-image",
    label: "RoleModel style",
    lora: {
      path: "https://ftxhendy6jwk0sx5.public.blob.vercel-storage.com/boards/loras/rmstyle-v1.safetensors",
      scale: 1,
      trigger: "rmstyle",
    },
    vector: false,
  },
  {
    id: "lora/rolemodel-design",
    input: "prompt-or-image",
    label: "RoleModel design",
    lora: {
      path: "https://ftxhendy6jwk0sx5.public.blob.vercel-storage.com/boards/loras/rmdesign-v1.safetensors",
      scale: 1,
      trigger: "rmdesign",
    },
    vector: false,
  },
  {
    id: "lora/text-poster",
    input: "prompt-or-image",
    label: "Typography poster",
    lora: {
      path: "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-Text-Poster/resolve/main/FLUX-dev-lora-Text-Poster.safetensors",
      // The card recommends 0.8-1.0; the lower end leaves room for the prompt.
      scale: 0.9,
      trigger: "text poster",
    },
    vector: false,
  },
  {
    id: "lora/logo-design",
    input: "prompt-or-image",
    label: "Logo / mark",
    lora: {
      path: "https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design/resolve/main/FLUX-dev-lora-Logo-Design.safetensors",
      scale: 0.8,
      trigger: "wablogo, logo, Minimalist",
    },
    vector: false,
  },
] as const satisfies readonly FalModelDef[];

/** The fal endpoint every LoRA style runs on. */
export const FLUX_LORA_ENDPOINT = "fal-ai/flux-lora";

/**
 * The same weights, applied to a picture rather than to a blank canvas.
 *
 * A LoRA is a style, and a style is as useful for reworking a photograph as for
 * inventing one — so an image wired into a style model switches endpoint rather
 * than being ignored, which is what "input: prompt" used to mean here.
 */
export const FLUX_LORA_IMAGE_ENDPOINT = "fal-ai/flux-lora/image-to-image";

export const falModelLora = (
  value: unknown
): { path: string; scale: number; trigger: string } | null =>
  falModelFor(value)?.lora ?? null;

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

/**
 * Looks at a picture and writes down how it looks.
 *
 * The output is a *prompt*, not a caption: comma-separated phrases about
 * medium, palette, light, composition and rendering, with the subject
 * deliberately left out. That distinction is the whole point — "a woman in a
 * field" tells a generator what to draw, whereas "muted greens, soft overcast
 * light, shallow depth of field, 35mm" tells it how to draw anything.
 *
 * It emits text, so it wires into the prompt of a Generate node exactly as a
 * Prompt node does. Point it at a reference you like and the style travels
 * down the wire.
 */
const DESCRIBE: NodeType = {
  capability: "fal.describe",
  id: "describe",
  inputs: [
    {
      // Many, and read together rather than one at a time. Describing a style
      // from a single picture describes that picture; several references are
      // how the description lands on what they have in common. Unlike a batch
      // on a Generate node, these do not fan out into separate runs — they go
      // into one call and come back as one description.
      arity: "many",
      key: "image",
      label: "Images",
      required: true,
      type: "image",
    },
    {
      // Optional, and the reason this is a node rather than a button: wire a
      // Prompt node in to say what you want noticed — "the colour palette",
      // "how the type is set" — instead of accepting one fixed reading.
      arity: "one",
      key: "prompt",
      label: "What to look for",
      required: false,
      type: "text",
    },
  ],
  label: "Analyse",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
  settings: [
    {
      default: "style",
      key: "focus",
      kind: "select",
      label: "Describe",
      options: ["style", "subject", "both"],
    },
    {
      key: "prompt",
      kind: "text",
      label: "What to look for",
      maxLength: GENERATE_PROMPT_MAX,
      placeholder: "the colour palette and how the type is set…",
    },
  ],
};

/**
 * Joins several pieces of text into one.
 *
 * The node that makes the others compose. A description off an Analyse node
 * plus a subject line off a Prompt node is the common case: one says how it
 * should look, the other says what it is, and a generation wants both in a
 * single prompt.
 *
 * No capability, so it never runs and never costs anything. Unlike a Prompt
 * node, though, its value is not what is typed on it — it is a function of
 * whatever is wired in, resolved wherever the output is read.
 */
const JOIN: NodeType = {
  id: "join",
  inputs: [
    {
      // Order follows the wires, so rewiring is how you reorder.
      arity: "many",
      key: "text",
      label: "Text",
      required: true,
      type: "text",
    },
  ],
  label: "Combine",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
  settings: [
    {
      default: ", ",
      key: "separator",
      kind: "select",
      label: "Joined with",
      options: [", ", ". ", " ", "\n"],
    },
  ],
};

/** Where a value is dropped into the template, unless another is chosen. */
export const DEFAULT_PLACEHOLDER = "{}";

/**
 * One prompt, written many times over.
 *
 * A template with a hole in it, and a list of things to put in the hole. Wire
 * "a {} chair, studio lit" to a list of "oak, steel, moulded plastic" and three
 * prompts come out. Whatever consumes them runs three times.
 *
 * This is the one node whose output is deliberately plural. A frame already
 * emits every image on it, so the wire model has always carried lists — this
 * puts text on the same footing, and the batching that already fans a Generate
 * node out over several references now fans it out over several prompts too.
 *
 * No capability: it composes strings, and composing strings should not cost
 * anything or need a round trip.
 */
const ITERATE: NodeType = {
  id: "iterate",
  inputs: [
    {
      arity: "one",
      key: "template",
      label: "Template",
      required: true,
      type: "text",
    },
    {
      // Many, because the list may arrive as several wires or as one node
      // holding several lines — both should mean the same thing.
      arity: "many",
      key: "values",
      label: "Values",
      required: true,
      type: "text",
    },
  ],
  label: "Iterate",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
  settings: [
    {
      // Typed here or wired in, exactly like a Generate node's prompt. Without
      // this the only text field on the node was the 40-character placeholder,
      // so a template pasted onto the node came back cut to 40 characters —
      // and with nothing wired the node emitted nothing at all, which reached
      // the Generate node downstream as "this node needs a prompt".
      key: "template",
      kind: "text",
      label: "Template — put {} where a value goes",
      maxLength: GENERATE_PROMPT_MAX,
      placeholder: "a {} chair, studio lit…",
    },
    {
      key: "values",
      kind: "text",
      label: "Values — one per line, or one row per line for several slots",
      // Roomier than a prompt: this is a list, and a list of forty words is
      // ordinary where a forty-sentence prompt is not.
      maxLength: GENERATE_PROMPT_MAX * 2,
      placeholder: "Orange, Brainstorm\nYellow, Reflect\nPurple, Approach",
    },
    {
      key: "placeholder",
      kind: "text",
      label: "Insert at",
      maxLength: 40,
      placeholder: DEFAULT_PLACEHOLDER,
    },
    {
      // A list is usually written as lines, which is unambiguous — a value may
      // legitimately contain a comma, but rarely a newline. Commas are offered
      // because a list written inline is just as natural, and "whole" is there
      // for when each wire is already exactly one value.
      default: "lines",
      key: "split",
      kind: "select",
      label: "Split values by",
      options: ["lines", "commas", "whole"],
    },
  ],
};

/** Hex colours, however they were separated when written down. */
export const HEX_COLOUR = /#[0-9a-f]{6}\b/gi;

/**
 * The colours a generation is allowed to use.
 *
 * Emits a line of text naming them, which is what makes one node serve two very
 * different mechanisms. Most models can only be *asked* for a palette, and a
 * sentence naming the hex codes is the best that can be done. Ideogram v3 takes
 * a real colour palette as a parameter, so for that model the same line is read
 * back into an actual constraint — see paletteFrom in api/_lib/fal.ts.
 *
 * Writing the colours into the prompt rather than inventing a second kind of
 * wire is what keeps that possible: one text output, understood loosely by
 * everything and precisely by what can.
 */
const PALETTE: NodeType = {
  id: "palette",
  inputs: [],
  label: "Palette",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
  settings: [
    {
      key: "colors",
      kind: "text",
      label: "Colours",
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
  ],
};

export const NODE_TYPES: Record<NodeTypeId, NodeType> = {
  describe: DESCRIBE,
  generate: GENERATE,
  icon: ICON,
  iterate: ITERATE,
  join: JOIN,
  palette: PALETTE,
  prompt: PROMPT,
};

export const isNodeTypeId = (value: unknown): value is NodeTypeId =>
  value === "describe" ||
  value === "generate" ||
  value === "icon" ||
  value === "iterate" ||
  value === "join" ||
  value === "palette" ||
  value === "prompt";

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
