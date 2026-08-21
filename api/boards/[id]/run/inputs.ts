import { incomingByPort } from "../../../../config/graph.js";
import { nodeTypeFor } from "../../../../config/nodeTypes.js";
import type { BoardItemRow, BoardWireRow } from "../../../_lib/boards.js";
import { outputsOf } from "./outputs.js";
import { asObject, toGraphWires } from "./rows.js";

/**
 * What is actually wired into a node, and what it comes to.
 *
 * The step between "the graph says these wires exist" and "this is the prompt,
 * this is the picture". Kept apart from the request plumbing in run.ts because
 * it resolves URLs that are then handed to a third party to go and fetch — the
 * one place in the run path where getting the source wrong is a security
 * question rather than a correctness one.
 */

export interface RunnableItem {
  config: Record<string, unknown>;
  id: string;
  nodeType: string;
  result: { fingerprint?: string; url?: string } | null;
  runState: string | null;
}

export interface ResolvedInputs {
  /**
   * Each port's values grouped by the wire they arrived on.
   *
   * Kept alongside the flattened form because who sent what matters for the
   * prompt: one wire's five prompts are five runs, while two wires are two
   * parts of each run. Flattening loses the difference.
   */
  lists: Record<string, string[][] | undefined>;
  /** Missing required port, if any — reported without spending anything. */
  missingPort: string | null;
  /**
   * Every value wired to each port, in wire order.
   *
   * Undefined for a port nothing feeds — not an empty array. A total index
   * signature would claim every port key is present and make the callers'
   * guards look redundant when they are not.
   */
  values: Record<string, string[] | undefined>;
}

/**
 * Reads each input port's value out of the stored graph.
 *
 * Deliberately not taken from the request. This resolves a URL that is then
 * handed to a third party to go and fetch, and trusting the caller for it would
 * reopen exactly the hole api/ai/generate.ts closes by insisting on an explicit
 * scheme before forwarding anything.
 */
export const resolveInputs = (
  item: RunnableItem,
  rows: BoardItemRow[],
  wires: BoardWireRow[]
): ResolvedInputs => {
  const type = nodeTypeFor(item.nodeType);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const graphWires = toGraphWires(wires);
  const incoming = incomingByPort(graphWires, item.id);

  const values: Record<string, string[] | undefined> = {};
  const lists: Record<string, string[][] | undefined> = {};
  let missingPort: string | null = null;

  for (const port of type?.inputs ?? []) {
    // Grouped by wire, because arity counts wires rather than values. One wire
    // can legitimately carry several — a frame hands over every image on it,
    // and an Iterate node hands over every prompt it wrote — and slicing those
    // down to one would silently discard most of a batch.
    const perWire: string[][] = [];
    for (const wire of incoming.get(port.key) ?? []) {
      const source = byId.get(wire.sourceItemId);
      // A wire from a node that has not run yet resolves to nothing. Those are
      // dropped rather than treated as jobs, so a half-built graph runs the
      // part that is ready instead of failing whole.
      perWire.push(source ? outputsOf(source, rows, graphWires) : []);
    }
    // A single-value input keeps only the last wire, matching what the canvas
    // does when a new wire is dropped on an occupied port.
    const kept = port.arity === "many" ? perWire : perWire.slice(-1);
    const resolved = kept.flat();
    values[port.key] = resolved;
    lists[port.key] = kept.filter((list) => list.length > 0);
    if (port.required && resolved.length === 0 && !missingPort) {
      missingPort = port.key;
    }
  }

  return { lists, missingPort, values };
};

/**
 * A wired prompt beats a typed one.
 *
 * Wiring is the more deliberate act — you went and connected something — and
 * the node says on its face that the typed field is unused while a wire is
 * attached, so the precedence is visible rather than surprising.
 */
export const promptFor = (
  item: RunnableItem,
  values: Record<string, string[] | undefined>
): string => {
  const wired = values.prompt?.[0]?.trim();
  if (wired) {
    return wired;
  }
  // A Prompt node keeps its text under `text`; Generate and Icon under
  // `prompt`. Both are read so either can be the typed fallback.
  const typed = item.config.prompt ?? item.config.text;
  return typeof typed === "string" ? typed.trim() : "";
};

/**
 * Every masked picture on the board, as image URL to rendered-mask URL.
 *
 * Keyed by URL because that is all a resolved image input carries: outputsOf
 * hands back addresses, not the items they came from. The alternative was to
 * thread the source item through every port resolution, which would change a
 * great deal to answer one question.
 *
 * A mask without a rendered bitmap is skipped rather than guessed at — the
 * canvas renders it before the run, and one that has not been rendered is one
 * that has changed since, so the old bitmap would mask the wrong region.
 */
export const maskByUrl = (rows: BoardItemRow[]): Map<string, string> => {
  const masks = new Map<string, string>();
  for (const row of rows) {
    const config = asObject(row.config);
    const url = row.image_url;
    if (url && typeof config.maskUrl === "string" && config.maskUrl) {
      masks.set(url, config.maskUrl);
    }
  }
  return masks;
};
