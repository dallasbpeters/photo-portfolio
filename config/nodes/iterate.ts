import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";
import { GENERATE_PROMPT_MAX } from "./limits.js";

/** Where a value is dropped into the template, unless another is chosen. */
export const DEFAULT_PLACEHOLDER = "{}";

/**
 * One prompt, written many times over.
 *
 * A template with a hole in it, and a list of things to put in the hole. Wire
 * "a {} chair, studio lit" to "oak, steel, moulded plastic" and three prompts
 * come out; whatever consumes them runs three times.
 *
 * The one node whose output is deliberately plural. A frame already emits every
 * image on it, so the wire model has always carried lists — this puts text on
 * the same footing, and the batching that fans a Generate node out over several
 * references now fans it out over several prompts too.
 *
 * No capability: composing strings should not cost anything or need a trip.
 */
export const ITERATE: NodeType = {
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
