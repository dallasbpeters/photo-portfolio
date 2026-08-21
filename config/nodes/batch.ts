import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/**
 * A batch, made visible.
 *
 * A frame already hands over every picture on it and a Generate node treats
 * each as its own run, so this adds no capability. What it adds is sight of
 * the thing: the pictures about to be processed, listed and counted, before
 * anything is spent. A batch that silently resolved to nothing, or to forty
 * images when five were meant, looked exactly like one that worked — and the
 * only way to tell was to run it and read the bill.
 *
 * No capability: it passes its inputs along and should not cost anything.
 */
export const BATCH: NodeType = {
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
