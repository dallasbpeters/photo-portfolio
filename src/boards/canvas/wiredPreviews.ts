import type { BoardItem, BoardWire } from "../../types";
import {
  iteratedTextOf,
  outputImageOf,
  outputImagesOf,
  outputListOf,
  outputTextOf,
} from "../itemOutput";

/**
 * What a node is about to send, shown before it is run.
 *
 * Lifted out of BoardCanvas.tsx, which had no room left to grow. These four
 * read the graph rather than change it, and they exist for one reason: seeing
 * "3 prompts" and what they say is the only way to know a batch is set up right
 * before paying for it.
 *
 * The graph arrives as an argument rather than being closed over, which is what
 * makes them testable without a canvas — and what makes it obvious that they
 * only ever read.
 */

export interface Graph {
  items: BoardItem[];
  wires: BoardWire[];
}

/**
 * What a node that composes text will send, read before it runs. Combine
 * answers with one string, Iterate with one per value — seeing "3 prompts"
 * and what they say is the only way to know a batch is set up right.
 */
/** The pictures a Batch node holds. Only that node: resolving every image
 * behind every node on every render walks the graph once per node. */
export const previewImagesFor = (
  item: BoardItem,
  graph: Graph
): string[] | undefined =>
  item.nodeType === "batch" ? outputImagesOf(item, graph) : undefined;

export const previewTextFor = (
  item: BoardItem,
  graph: Graph
): string | null => {
  if (item.nodeType === "join" || item.nodeType === "palette") {
    return outputTextOf(item, graph);
  }
  if (item.nodeType !== "iterate") {
    return null;
  }
  const prompts = iteratedTextOf(item, graph);
  if (prompts.length === 0) {
    return null;
  }
  return prompts.map((text, index) => `${index + 1}. ${text}`).join("\n");
};

/**
 * The words arriving on an item's prompt input, so the node can show them.
 *
 * Resolved here because only the canvas holds the graph.wires; the node itself
 * knows nothing about what feeds it.
 */
export const wiredTextFor = (itemId: string, graph: Graph): string | null => {
  // Every wire on the prompt port, kept apart: each contributes a part of
  // each run, and a wire carrying several values makes several runs. Mirrors
  // jobsFor, so what the node shows is what the node will send.
  const perWire = graph.wires
    .filter((w) => w.targetItemId === itemId && w.targetPort === "prompt")
    .map((w) => graph.items.find((i) => i.id === w.sourceItemId))
    .map((source) => outputListOf(source ?? null, graph))
    .map((list) => list.filter((text) => text.trim()))
    .filter((list) => list.length > 0);

  if (perWire.length === 0) {
    return null;
  }
  const rows = Math.max(...perWire.map((list) => list.length));
  const prompts = Array.from({ length: rows }, (_, row) =>
    perWire.map((list) => list[row % list.length] ?? "").join(", ")
  );
  return rows === 1
    ? (prompts[0] ?? null)
    : prompts.map((text, index) => `${index + 1}. ${text}`).join("\n");
};

/**
 * The picture feeding an item's image input, for the kinds that render one
 * themselves rather than being run on the server.
 *
 * A shader restyles its input live in the browser, so the URL has to reach
 * the component; nothing is written to the item, which keeps the wire the
 * single source of truth for what is being shown.
 */
export const wiredImageFor = (itemId: string, graph: Graph): string | null => {
  const wire = graph.wires.find(
    (candidate) =>
      candidate.targetItemId === itemId && candidate.targetPort === "image"
  );
  if (!wire) {
    return null;
  }
  const source = graph.items.find((item) => item.id === wire.sourceItemId);
  return source ? outputImageOf(source, graph.items) : null;
};
