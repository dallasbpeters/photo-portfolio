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
import { OUTPUT_PORT_KEY } from "./ports.js";
import { VIDEO } from "./videoNode.js";
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
      default: string;
      key: string;
      kind: "model";
      label: string;
      /** Offer only video endpoints; an image one refuses after billing. */
      video?: boolean;
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
export type NodeCapability =
  | "board.composite"
  | "fal.describe"
  | "fal.image"
  | "fal.video"
  | "magnific.icon";

export type NodeTypeId =
  | "batch"
  | "composite"
  | "describe"
  | "element"
  | "generate"
  | "icon"
  | "iterate"
  | "join"
  | "palette"
  | "prompt"
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

export interface FalLora {
  /**
   * The endpoint these weights were trained against, when it is not Flux.
   *
   * A LoRA only loads on the base model it was trained on — a Krea-2 LoRA sent
   * to fal-ai/flux-lora returns a picture, but a picture in the base style,
   * which reads as the LoRA simply not being very strong. That silence is why
   * the base is declared here rather than assumed.
   *
   * Omitted means the Flux pair below.
   */
  endpoint?: string;
  /** The same base, applied to a picture rather than a blank canvas. */
  imageEndpoint?: string;
  path: string;
  scale: number;
  trigger: string;
}

export interface FalModelDef {
  /** The exact fal.ai model id, or "auto". */
  id: string;
  /**
   * What this endpoint calls its source image.
   *
   * Orthogonal to `input`, which says whether an image is required: these
   * endpoints disagree about the parameter's *name* as well as its necessity,
   * and nano-banana wants a list where Recraft and Ideogram want one URL.
   * Defaults to "image_url", which is the majority.
   */
  imageParam?: "image_url" | "image_urls";
  input: FalModelInput;
  /** Shown on the node — model ids are too long and too alike to read. */
  label: string;
  /**
   * A LoRA to load, for the models that are a style rather than an endpoint.
   *
   * Most run on fal-ai/flux-lora and differ only in the weights it loads, so
   * they are listed as models here because that is what they are to whoever is
   * picking one. `path` is a URL to a safetensors file, ours or Hugging Face's.
   *
   * `trigger` is not optional in practice: a LoRA is trained against a token,
   * and a prompt without it gets the base model. It is prepended for you.
   */
  lora?: FalLora;
  /**
   * What the endpoint returns, which is not the same question as `input`.
   *
   * A video is reached through fal's queue and polled for minutes where an
   * image is one synchronous call, so the run path dispatches on this and a
   * node's picker offers only the endpoints that make what it makes.
   */
  output: "image" | "video";
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
 *
 * These used to be a constant here, an allowlist rather than a free-text field,
 * for the same reason config/iconStyles.ts is one: the value is handed to a
 * third party, and a typo'd model id fails *after* the call has been made and
 * billed. The list now lives in the `models` table so it can be edited from the
 * admin without a code change; api/_lib/models.ts loads it per request. The
 * shape helpers below take the loaded list, so the run path checks the exact
 * ids that are actually offered.
 */
/** The fal endpoint a LoRA style runs on unless it names its own. */
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
  models: readonly FalModelDef[],
  value: unknown
): FalLora | null => falModelFor(models, value)?.lora ?? null;

/** Where a style's weights actually load, with or without a source image. */
export const falLoraEndpoint = (lora: FalLora, hasImage: boolean): string => {
  if (hasImage) {
    return lora.imageEndpoint ?? FLUX_LORA_IMAGE_ENDPOINT;
  }
  return lora.endpoint ?? FLUX_LORA_ENDPOINT;
};

/**
 * Repainting part of a picture and leaving the rest alone.
 *
 * A separate endpoint rather than a parameter, which is why a mask changes
 * where the request goes rather than only what it carries. The LoRA form takes
 * the same `loras` array as the others, so a mask and a custom style compose —
 * masking does not cost you the trained look.
 */
export const FLUX_INPAINT_ENDPOINT = "fal-ai/flux-general/inpainting";
export const FLUX_LORA_INPAINT_ENDPOINT = "fal-ai/flux-lora/inpainting";

/**
 * Whether this model can repaint part of an image rather than all of it.
 *
 * Only the Flux family, for now. A mask sent to a model without an inpainting
 * endpoint would be ignored silently and billed in full, so the run is refused
 * instead — see maskRefusal in the run endpoint.
 */
export const falModelMasks = (
  models: readonly FalModelDef[],
  value: unknown
): boolean => {
  const model = falModelFor(models, value);
  if (!model) {
    return false;
  }
  // A LoRA on a non-Flux base has its own endpoints and no inpainting one.
  if (model.lora) {
    return !model.lora.endpoint;
  }
  return model.id === "auto" || model.id.startsWith("fal-ai/flux");
};

/** Whether a chosen model is on the list at all. Unknown ids are not. */
export const isFalModel = (
  models: readonly FalModelDef[],
  value: unknown
): value is string => falModelFor(models, value) !== null;

export const falModelFor = (
  models: readonly FalModelDef[],
  value: unknown
): FalModelDef | null => models.find((model) => model.id === value) ?? null;

/** Whether a chosen model returns vector art. Unknown ids are not vector. */
export const isVectorModel = (
  models: readonly FalModelDef[],
  value: unknown
): boolean => falModelFor(models, value)?.vector ?? false;

/** What a chosen model consumes; unknown ids behave like "auto". */
export const falModelInput = (
  models: readonly FalModelDef[],
  value: unknown
): FalModelInput => falModelFor(models, value)?.input ?? "prompt-or-image";

/** What to call the source image for this model. See FalModelDef.imageParam. */
export const falImageParam = (
  models: readonly FalModelDef[],
  value: unknown
): "image_url" | "image_urls" =>
  falModelFor(models, value)?.imageParam ?? "image_url";

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
      // Many, and joined rather than fanned out. Each wire contributes a part
      // of every prompt — an Iterate node supplying the subject and a Palette
      // node supplying the colors are both wanted at once, and with a single
      // wire allowed the second silently replaced the first.
      //
      // A wire carrying several values still makes several runs; the parts are
      // joined per run. See jobsFor.
      arity: "many",
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
      // The choices come from the `models` table, not from this registry: they
      // are data, edited in the admin. The registry declares the control, and
      // the control asks the ModelsProvider for what to offer.
      default: "auto",
      key: "model",
      kind: "model",
      label: "Model",
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
 * A style from the library, on the board.
 *
 * An element is a handful of references that share a look, the words for what
 * they share, and a name — kept outside any board so it outlives the one it was
 * found on. This node is how you spend it: it hands over its key image, so it
 * wires into a Generate node exactly as a picture does, and the words ride the
 * same wire into the prompt. See elementTextOf in api/boards/[id]/run.ts.
 *
 * One wire, one job, one charge. The other pictures in the element are what it
 * is made of and what you recognise it by in the panel; they are deliberately
 * not on the canvas, which is the entire reason an element exists rather than
 * six pinned references.
 *
 * No capability, so it never runs and never costs anything. No settings either:
 * a name and a picture that could be typed over here would be a second copy of
 * the library, free to disagree with it.
 */
const ELEMENT: NodeType = {
  id: "element",
  inputs: [],
  label: "Element",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Image", type: "image" }],
  settings: [],
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
      // Prompt node in to say what you want noticed — "the color palette",
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
      placeholder: "the color palette and how the type is set…",
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

/**
 * Several pictures flattened into one.
 *
 * A frame groups images but is not itself an image — it has no pixels to hand
 * on, so there was no way to take an arrangement you had already made and use
 * it as a single reference. This renders the arrangement.
 *
 * Layout comes from the board rather than from settings: the images are drawn
 * where they sit, at the size they were dragged to, scaled together into the
 * box they occupy. Overlap them and they layer; the order is the same z-order
 * you see, so "bring to front" is how you reorder a composite.
 *
 * The rendering happens in the browser, which is the only place that knows the
 * geometry, and the run stores what it produced — see board.composite in the
 * run endpoint. It costs nothing beyond storing the file.
 */
const COMPOSITE: NodeType = {
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

/**
 * A batch, made visible.
 *
 * A frame already hands over every picture on it, and a Generate node already
 * treats each as its own run — so this adds no capability. What it adds is
 * sight of the thing: the pictures about to be processed, listed and counted,
 * before anything is spent.
 *
 * That turned out to matter more than any feature. A batch that silently
 * resolved to nothing, or to forty images when five were meant, looked exactly
 * like a batch that worked — and the only way to tell was to run it and read
 * the bill.
 *
 * No capability: it passes its inputs along and should not cost anything.
 */
const BATCH: NodeType = {
  id: "batch",
  inputs: [
    {
      arity: "many",
      key: "image",
      label: "Images",
      required: true,
      type: "image",
    },
  ],
  label: "Batch",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Images", type: "image" }],
  settings: [
    {
      /*
       * How many to pass on, counting from the first. Zero means all of them.
       *
       * A frame of forty is forty paid runs, and wanting to try three before
       * committing to the rest is the commonest thing anyone does with a batch.
       */
      default: 0,
      key: "limit",
      kind: "number",
      label: "Only the first",
      max: 200,
      min: 0,
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
    {
      // Added to the end of every prompt this node writes. A palette belongs
      // to the prompts rather than to whatever consumes them, so it attaches
      // here and travels down one wire with them.
      arity: "one",
      key: "suffix",
      label: "Append to each",
      required: false,
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
const PALETTE: NodeType = {
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

export const NODE_TYPES: Record<NodeTypeId, NodeType> = {
  batch: BATCH,
  composite: COMPOSITE,
  describe: DESCRIBE,
  element: ELEMENT,
  generate: GENERATE,
  icon: ICON,
  iterate: ITERATE,
  join: JOIN,
  palette: PALETTE,
  prompt: PROMPT,
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
