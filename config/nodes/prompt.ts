import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";
import { GENERATE_PROMPT_MAX } from "./limits.js";

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
export const PROMPT: NodeType = {
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
