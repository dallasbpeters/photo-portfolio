import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";
import { GENERATE_PROMPT_MAX } from "./limits.js";

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
export const DESCRIBE: NodeType = {
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
