import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/**
 * A style from the library, on the board.
 *
 * An element is a handful of references that share a look, the words for what
 * they share, and a name — kept outside any board so it outlives the one it was
 * found on. This node spends it: it hands over its key image, wiring into a
 * Generate node exactly as a picture does, and the words ride the same wire
 * into the prompt. See elementTextOf in api/boards/[id]/run.ts.
 *
 * One wire, one job, one charge. Keeping the element's other pictures off the
 * canvas is the entire reason it exists rather than six pinned references.
 *
 * No capability, so it never runs and never costs anything. No settings either:
 * a name and picture typed over here would be a second copy of the library,
 * free to disagree with it.
 */
export const ELEMENT: NodeType = {
  id: "element",
  inputs: [],
  label: "Element",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Image", type: "image" }],
  settings: [],
};
