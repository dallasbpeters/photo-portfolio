import type { NodeType } from "../nodeTypes.js";

/**
 * What several wired pictures mean on one Generate node.
 *
 * Here rather than inline because three places have to agree about the two
 * words: the setting, the run that reads it, and the note on the node that
 * explains which one is about to happen.
 */
export const MULTI_IMAGE_SEPARATE = "separate";
export const MULTI_IMAGE_BLEND = "blend";
export const MULTI_IMAGE_MODES = [
  MULTI_IMAGE_SEPARATE,
  MULTI_IMAGE_BLEND,
] as const;
export const MULTI_IMAGE_LABELS: Record<string, string> = {
  [MULTI_IMAGE_BLEND]: "Blended into one",
  [MULTI_IMAGE_SEPARATE]: "One run each",
};

/** Whether this node's settings ask for a blend. Absent means separate. */
export const wantsBlend = (config: Record<string, unknown>): boolean =>
  config.multiImage === MULTI_IMAGE_BLEND;

import { OUTPUT_PORT_KEY } from "../ports.js";
import {
  IMAGE_SIZE_LABELS,
  IMAGE_SIZES,
  MAX_LOOPS,
  OUTPUT_FORMAT_LABELS,
  OUTPUT_FORMATS,
  QUALITIES,
  QUALITY_LABELS,
} from "./generation.js";
import {
  DEFAULT_RESTYLE,
  GENERATE_PROMPT_MAX,
  MAX_BATCH_COUNT,
  MAX_RESTYLE,
  MIN_RESTYLE,
} from "./limits.js";

/**
 * An image, invented from words or reworked from a picture.
 *
 * The node the rest of the graph was built around. Types come from
 * nodeTypes.js as `import type`, which is erased at build time and so cannot
 * take part in the load-order cycle config/ports.ts exists to avoid.
 */
export const GENERATE: NodeType = {
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
      //
      // In the panel rather than on the node. It was the widest control on the
      // card and the least often touched — a thirty-item menu of long labels,
      // set once per node and then left alone while the prompt is worked on.
      default: "auto",
      key: "model",
      kind: "model",
      label: "Model",
      panel: true,
    },
    {
      // Variations per input. With three images wired in and a count of two,
      // the node runs six times.
      default: 1,
      key: "count",
      kind: "number",
      label: "Iterations",
      max: MAX_BATCH_COUNT,
      min: 1,
      panel: true,
    },
    {
      /*
       * How many times the node feeds its own output back in and runs again.
       *
       * One is a single generation and is the default. Two runs, takes the
       * picture that came back, and runs again with it as the source image —
       * which is how a look gets pushed further than one pass will take it.
       *
       * Distinct from Iterations, which is breadth: iterations are variations
       * of the same starting point, loops are one line of descent. Together
       * they multiply, so the panel says what a pair of them will cost.
       */
      default: 1,
      key: "loops",
      kind: "number",
      label: "Loops",
      max: MAX_LOOPS,
      min: 1,
      panel: true,
    },
    {
      /*
       * How far a trained style repaints a wired picture.
       *
       * Only bites when the chosen model carries a LoRA and a picture is
       * wired — every other model ignores it, because `strength` is a field
       * only fal's image-to-image endpoints have.
       *
       * A setting rather than the constant it used to be. There is no correct
       * value: it depends on the LoRA and on the picture, so "this restyle
       * came back identical to what I wired in" needs an answer on the node
       * rather than in a source file.
       */
      default: DEFAULT_RESTYLE,
      key: "restyle",
      kind: "number",
      label: "Restyle %",
      max: MAX_RESTYLE,
      min: MIN_RESTYLE,
      panel: true,
      step: 5,
    },
    {
      /*
       * What several wired pictures mean: a batch, or one picture to build.
       *
       * Separate is the default and the older meaning. Wiring a frame of
       * twenty references into a Generate node is how a batch is run here —
       * twenty runs, one per picture, filling the variation strip — and that
       * is load-bearing work, not a nicety.
       *
       * Blending was added for the endpoints that take a list of pictures and
       * combine them, and added *automatically*, which quietly turned every
       * one of those batches into a single blended run. A board that had been
       * producing twenty pictures started producing one, with nothing on the
       * node to say why. So the behaviour is named on the node now, and the
       * default is the one boards were built against.
       *
       * Ignored with fewer than two pictures, and by every model that takes a
       * single image — a LoRA, or anything under a mask. The node says so
       * rather than letting it be discovered; see multiImageNote.
       */
      default: MULTI_IMAGE_SEPARATE,
      key: "multiImage",
      kind: "select",
      label: "Several pictures",
      optionLabels: MULTI_IMAGE_LABELS,
      options: [...MULTI_IMAGE_MODES],
      panel: true,
    },
    {
      default: "auto",
      key: "size",
      kind: "select",
      label: "Size",
      optionLabels: IMAGE_SIZE_LABELS,
      options: IMAGE_SIZES,
      panel: true,
    },
    {
      default: "auto",
      key: "quality",
      kind: "select",
      label: "Quality",
      optionLabels: QUALITY_LABELS,
      options: QUALITIES,
      panel: true,
    },
    {
      default: "auto",
      key: "outputFormat",
      kind: "select",
      label: "Output format",
      optionLabels: OUTPUT_FORMAT_LABELS,
      options: OUTPUT_FORMATS,
      panel: true,
    },
  ],
};
