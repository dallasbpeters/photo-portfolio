import type { BoardItem, BoardWire } from "../../types";
import {
  iteratedTextOf,
  outputImagesOf,
  outputListOf,
  outputTextOf,
} from "../itemOutput";
import { itemsFromWire } from "../listItems";

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
 * The rows arriving on a List node's Fill input, in wire order.
 *
 * Flattened, because a single wire usually carries the whole list: an Iterate
 * node hands over fifty prompts as fifty entries, and a Prompt node hands over
 * one string that may itself be fifty lines. Both mean fifty rows.
 *
 * Answers only for a List node, guarding inside like previewImagesFor rather
 * than at the call site: resolving every upstream behind every node on every
 * render walks the graph once per node, and the guard belongs with the reason
 * for it.
 */
export const wiredItemsFor = (
  item: BoardItem,
  graph: Graph
): string[] | undefined => {
  if (item.nodeType !== "list") {
    return;
  }
  return itemsFromWire(
    graph.wires
      .filter((w) => w.targetItemId === item.id && w.targetPort === "text")
      .flatMap((w) =>
        outputListOf(
          graph.items.find((i) => i.id === w.sourceItemId) ?? null,
          graph
        )
      )
  );
};

/**
 * Every picture arriving on an item's image input, in wire order.
 *
 * Through outputImagesOf, which is the *only* client-side resolver that expands
 * a Batch node and a frame the way the server's outputsOf does. outputListOf,
 * which this reached for first, knows about Iterate, List and Palette and
 * nothing about pictures: a Batch of twenty-two wired into a halftone resolved
 * to one image here while the server resolved twenty-two and asked for
 * twenty-two variations. Twenty-one of them had nothing to hand back and the
 * whole run came home empty.
 *
 * The two sides must agree on the count or the run asks for a picture the
 * browser never drew. That is the invariant; this function exists to hold it.
 */
/**
 * How many pictures a node is about to work through.
 *
 * Asked only of the node that draws them itself, the same guard-inside shape
 * previewImagesFor and wiredItemsFor use: resolving every upstream behind every
 * node on every render walks the graph once per node.
 */
export const wiredImageCountFor = (
  item: BoardItem,
  graph: Graph
): number | undefined =>
  item.nodeType === "standard"
    ? wiredImagesFor(item.id, graph).length
    : undefined;

export const wiredImagesFor = (itemId: string, graph: Graph): string[] =>
  graph.wires
    .filter((w) => w.targetItemId === itemId && w.targetPort === "image")
    .flatMap((w) =>
      outputImagesOf(
        graph.items.find((i) => i.id === w.sourceItemId) ?? null,
        graph
      )
    )
    .filter((url) => Boolean(url?.trim()));

/**
 * The picture feeding an item's image input, for the kinds that render one
 * themselves rather than being run on the server.
 *
 * A shader restyles its input live in the browser, so the URL has to reach
 * the component; nothing is written to the item, which keeps the wire the
 * single source of truth for what is being shown.
 */
export const wiredImageFor = (itemId: string, graph: Graph): string | null =>
  /*
   * The first of everything wired in, through the resolver that knows about
   * batches.
   *
   * It used to read outputImageOf directly, which is given the items and not
   * the wires — so it cannot see what feeds a Batch node, and a Batch holds
   * nothing of its own to fall back on. It has no capability and never runs, so
   * reading its `result` answers null. A halftone fed by a batch therefore drew
   * nothing and said "wire a picture into this node" with a wire plainly
   * attached to it.
   *
   * The same resolver wiredImagesFor uses, taking one instead of all, so the
   * preview and the render can never disagree about what is feeding a node.
   */
  wiredImagesFor(itemId, graph)[0] ?? null;
