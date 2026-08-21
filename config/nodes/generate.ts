import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";
import { GENERATE_PROMPT_MAX, MAX_BATCH_COUNT } from "./limits.js";

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
