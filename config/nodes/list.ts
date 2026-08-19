import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/**
 * A list of prompts you can actually edit.
 *
 * An Iterate node writes many prompts and shows none of them: its output is a
 * function of a template and a value list, computed on every read. That is the
 * right shape for generating fifty variations and the wrong one the moment
 * three of them are not what you wanted, because there is nowhere to change
 * just those three — the only edit available is to the rule that produced all
 * fifty.
 *
 * So this holds the prompts themselves. Each is a row that can be rewritten or
 * removed on its own, the count is on the node, and what it hands downstream is
 * exactly what is written on it.
 *
 * No capability, so it never runs and never costs anything — the same as Prompt
 * and Palette. What it feeds is where the money goes, and a list of fifty is a
 * bill worth seeing the length of before pressing Run.
 */
export const LIST: NodeType = {
  id: "list",
  inputs: [
    {
      /*
       * Many, and flattened. Wiring an Iterate node in fills the list with what
       * it wrote, which is the point: generate the fifty, then fix the three.
       * Wiring several sources appends them in wire order.
       */
      arity: "many",
      key: "text",
      label: "Fill from",
      required: false,
      type: "text",
    },
  ],
  label: "List",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Text", type: "text" }],
  settings: [
    {
      /*
       * The rows, one per line.
       *
       * Stored as a single string rather than an array because every other node
       * setting is a string and the whole validation, save and history path is
       * built for that — a bespoke array would need its own of each. The node's
       * own editor splits and joins it; this is what it is written down as.
       */
      key: "items",
      kind: "text",
      label: "Items",
      maxLength: 20_000,
      placeholder: "One per line…",
    },
  ],
};
