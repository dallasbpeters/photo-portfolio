import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

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
export const JOIN: NodeType = {
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
