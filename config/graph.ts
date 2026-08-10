/**
 * The graph a board describes: what may connect to what, and in what order it
 * runs.
 *
 * Pure functions over plain data — no React, no database, no fetch. That is
 * deliberate rather than incidental: the canvas imports this to decide whether
 * a wire being dragged can be dropped, the save imports it to refuse a wire the
 * canvas should never have sent, and the run endpoint imports it to decide what
 * to execute first. Three callers, one answer, no chance of them disagreeing.
 *
 * It lives in config/ rather than api/_lib/ because the browser imports it, and
 * under `vercel dev` every /api/* path is routed to the serverless handler —
 * so a browser module served from there 404s and takes the whole board route
 * down with it. Production builds hid this: Rollup resolves the import at build
 * time, and only the dev server ever asks for it over HTTP.
 *
 * Being here also means it obeys the same rules as its neighbours: no
 * dependencies, no browser globals, no Node globals.
 *
 * It also means the branching logic most worth testing has no I/O to stand in
 * the way of testing it, the day this project grows a test runner.
 */

import {
  FRAME_INPUTS,
  type InputPort,
  isSourceItemKind,
  nodeTypeFor,
  type Port,
  SOURCE_PORTS,
} from "./nodeTypes.js";

/** The little an item has to expose for the graph to reason about it. */
export interface GraphItem {
  id: string;
  kind: string;
  nodeType?: string | null;
}

export interface GraphWire {
  id: string;
  sourceItemId: string;
  sourcePort: string;
  targetItemId: string;
  targetPort: string;
}

/** A wire being considered, before it has an id. */
export type WireCandidate = Omit<GraphWire, "id">;

const NO_PORTS: readonly Port[] = [];
const NO_INPUTS: readonly InputPort[] = [];

/**
 * What this item offers downstream.
 *
 * A moodboard item's output comes from SOURCE_PORTS, which is what lets a
 * photograph pinned to a board long before this feature existed be wired
 * straight into a generation.
 */
export const outputPortsFor = (item: GraphItem): readonly Port[] => {
  if (item.kind === "op") {
    return nodeTypeFor(item.nodeType)?.outputs ?? NO_PORTS;
  }
  return isSourceItemKind(item.kind) ? SOURCE_PORTS[item.kind] : NO_PORTS;
};

/** Operation nodes consume, and so does a frame — it collects. */
export const inputPortsFor = (item: GraphItem): readonly InputPort[] => {
  if (item.kind === "frame") {
    return FRAME_INPUTS;
  }
  if (item.kind !== "op") {
    return NO_INPUTS;
  }
  return nodeTypeFor(item.nodeType)?.inputs ?? NO_INPUTS;
};

/** Enough geometry to say what sits on what. */
export interface GraphBox {
  height: number;
  id: string;
  kind: string;
  width: number;
  x: number;
  y: number;
}

/**
 * The items sitting on a frame.
 *
 * Containment is computed from geometry rather than stored, so dropping
 * something onto a frame is all it takes to be part of it — there is no
 * membership to keep in sync as items are dragged around.
 *
 * Shared rather than duplicated because both halves need the same answer: the
 * canvas moves a frame's contents with it, and the server resolves a frame's
 * output port to the images inside it. Two implementations of "inside" would
 * mean a frame that carries one set of images and emits another.
 *
 * An item counts as inside when its *centre* is: overlapping a corner should
 * not capture something that visibly belongs elsewhere. Frames never contain
 * other frames — nesting would make containment ambiguous and the drag
 * recursive.
 */
export const containedBy = <T extends GraphBox>(
  frame: GraphBox,
  items: readonly T[]
): T[] =>
  items.filter((item) => {
    if (item.id === frame.id || item.kind === "frame") {
      return false;
    }
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    return (
      cx >= frame.x &&
      cx <= frame.x + frame.width &&
      cy >= frame.y &&
      cy <= frame.y + frame.height
    );
  });

export const findOutputPort = (item: GraphItem, key: string): Port | null =>
  outputPortsFor(item).find((port) => port.key === key) ?? null;

export const findInputPort = (item: GraphItem, key: string): InputPort | null =>
  inputPortsFor(item).find((port) => port.key === key) ?? null;

const byId = <T extends GraphItem>(items: readonly T[]): Map<string, T> => {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
};

/**
 * Whether adding this wire would close a loop.
 *
 * A cycle appears exactly when the target can already reach the source, so this
 * walks forward from the target and looks for it. Checked while a wire is being
 * dragged as well as on save: a graph that can be drawn should be a graph that
 * can run.
 */
export const wouldCreateCycle = (
  wires: readonly GraphWire[],
  candidate: WireCandidate
): boolean => {
  if (candidate.sourceItemId === candidate.targetItemId) {
    return true;
  }

  const outgoing = new Map<string, string[]>();
  for (const wire of wires) {
    const list = outgoing.get(wire.sourceItemId);
    if (list) {
      list.push(wire.targetItemId);
    } else {
      outgoing.set(wire.sourceItemId, [wire.targetItemId]);
    }
  }

  const seen = new Set<string>();
  const stack = [candidate.targetItemId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === candidate.sourceItemId) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const next = outgoing.get(current);
    if (next) {
      stack.push(...next);
    }
  }
  return false;
};

export type WireCheck =
  | { ok: true }
  | {
      ok: false;
      /** Phrased for a person: this is shown on the canvas and returned by the API. */
      reason: string;
    };

/**
 * The six rules a wire has to satisfy, applied in the order that produces the
 * most useful message when one fails.
 */
export const checkWire = (
  items: readonly GraphItem[],
  wires: readonly GraphWire[],
  candidate: WireCandidate
): WireCheck => {
  const index = byId(items);
  const source = index.get(candidate.sourceItemId);
  const target = index.get(candidate.targetItemId);

  if (!(source && target)) {
    return { ok: false, reason: "Both ends must be on this board" };
  }
  if (source.id === target.id) {
    return { ok: false, reason: "A node cannot feed itself" };
  }

  const from = findOutputPort(source, candidate.sourcePort);
  if (!from) {
    return { ok: false, reason: "That is not an output" };
  }

  const to = findInputPort(target, candidate.targetPort);
  if (!to) {
    return { ok: false, reason: "That is not an input" };
  }

  // Refused here rather than at run time, so a type error is never discovered
  // after two minutes of generation.
  if (from.type !== to.type) {
    return {
      ok: false,
      reason: `${from.label} is ${from.type}, but ${to.label} takes ${to.type}`,
    };
  }

  if (wouldCreateCycle(wires, candidate)) {
    return { ok: false, reason: "That would make a loop, which cannot run" };
  }

  return { ok: true };
};

export const isValidWire = (
  items: readonly GraphItem[],
  wires: readonly GraphWire[],
  candidate: WireCandidate
): boolean => checkWire(items, wires, candidate).ok;

/**
 * Adds a wire, replacing what was there only when the input takes one value.
 *
 * A single-arity input means "use this one instead", so the old wire goes. A
 * many-arity input accumulates — that is what turns a Generate node into a
 * batch, where four wired references are four jobs rather than three
 * overwrites.
 */
export const withWire = (
  items: readonly GraphItem[],
  wires: readonly GraphWire[],
  wire: GraphWire
): GraphWire[] => {
  const target = items.find((item) => item.id === wire.targetItemId);
  const port = target ? findInputPort(target, wire.targetPort) : null;
  if (port?.arity === "many") {
    return [...wires, wire];
  }
  return [
    ...wires.filter(
      (existing) =>
        !(
          existing.targetItemId === wire.targetItemId &&
          existing.targetPort === wire.targetPort
        )
    ),
    wire,
  ];
};

export type TopologicalResult =
  | { cycle: string[]; order: null }
  | { cycle: null; order: string[] };

/** How many dependencies each item is still waiting on, and what it unblocks. */
const dependencyGraph = (
  items: readonly GraphItem[],
  wires: readonly GraphWire[]
): { indegree: Map<string, number>; outgoing: Map<string, string[]> } => {
  const present = new Set(items.map((item) => item.id));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const item of items) {
    indegree.set(item.id, 0);
  }

  for (const wire of wires) {
    // A wire to or from something that is not on the board constrains nothing.
    // The database cascades these away; a payload mid-save may still carry one.
    if (present.has(wire.sourceItemId) && present.has(wire.targetItemId)) {
      indegree.set(
        wire.targetItemId,
        (indegree.get(wire.targetItemId) ?? 0) + 1
      );
      const list = outgoing.get(wire.sourceItemId);
      if (list) {
        list.push(wire.targetItemId);
      } else {
        outgoing.set(wire.sourceItemId, [wire.targetItemId]);
      }
    }
  }

  return { indegree, outgoing };
};

/**
 * Dependency order for a run, by Kahn's algorithm.
 *
 * Returns the order, or the ids caught in a cycle. One pass gives both: if
 * fewer items came out than went in, whatever is left still has an unsatisfied
 * dependency, which at that point can only be a loop.
 */
export const topologicalOrder = (
  items: readonly GraphItem[],
  wires: readonly GraphWire[]
): TopologicalResult => {
  const { indegree, outgoing } = dependencyGraph(items, wires);

  const ready: string[] = [];
  for (const [id, degree] of indegree) {
    if (degree === 0) {
      ready.push(id);
    }
  }

  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.pop() as string;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        ready.push(next);
      }
    }
  }

  if (order.length === items.length) {
    return { cycle: null, order };
  }

  const settled = new Set(order);
  return {
    cycle: items.map((item) => item.id).filter((id) => !settled.has(id)),
    order: null,
  };
};

export const hasCycle = (
  items: readonly GraphItem[],
  wires: readonly GraphWire[]
): boolean => topologicalOrder(items, wires).order === null;

/**
 * Every item feeding this one, by the input port it arrives on.
 *
 * A list per port rather than a single wire: a many-arity input legitimately
 * has several, and collapsing them here would silently turn a four-image batch
 * back into one job.
 */
export const incomingByPort = (
  wires: readonly GraphWire[],
  itemId: string
): Map<string, GraphWire[]> => {
  const map = new Map<string, GraphWire[]>();
  for (const wire of wires) {
    if (wire.targetItemId === itemId) {
      const list = map.get(wire.targetPort);
      if (list) {
        list.push(wire);
      } else {
        map.set(wire.targetPort, [wire]);
      }
    }
  }
  return map;
};

/** Everything reachable downstream of an item — what a failure invalidates. */
export const descendantsOf = (
  wires: readonly GraphWire[],
  itemId: string
): Set<string> => {
  const outgoing = new Map<string, string[]>();
  for (const wire of wires) {
    const list = outgoing.get(wire.sourceItemId);
    if (list) {
      list.push(wire.targetItemId);
    } else {
      outgoing.set(wire.sourceItemId, [wire.targetItemId]);
    }
  }

  const found = new Set<string>();
  const stack = [...(outgoing.get(itemId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (found.has(current)) {
      continue;
    }
    found.add(current);
    stack.push(...(outgoing.get(current) ?? []));
  }
  return found;
};
