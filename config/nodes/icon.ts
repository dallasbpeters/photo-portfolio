import { ICON_STYLES } from "../iconStyles.js";
import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/** Matches MAX_PROMPT in api/ai/icon.ts: an icon is a few words, not a paragraph. */
const ICON_PROMPT_MAX = 300;

export const ICON: NodeType = {
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
