import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../../config/canvas.js";
import { isNodeTypeId, type PortType } from "../../config/nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../../config/ports.js";
import {
  type DeclaredInput,
  MAX_RECIPE_INPUTS,
  MAX_RECIPE_NODES,
  type RecipeGraph,
  type RecipeNode,
  type RecipeWire,
  recipeExtent,
} from "../../config/recipes.js";

/**
 * Turning a selection into a stencil, and a stencil back into nodes.
 *
 * Both halves are pure functions over plain data — no sql, no request, no
 * `crypto` — which is the shape the constitution asks for when correctness
 * rests on branching logic. The endpoint does the reading and the writing; this
 * decides what the rows should say.
 *
 * The direction of travel matters and is easy to get backwards. **Extraction**
 * turns absolute board positions into offsets and turns wires that leave the
 * selection into declared inputs. **Expansion** does the reverse, against a drop
 * point, minting fresh ids. A round trip through both must land the same shape
 * somewhere else on the canvas, which is what the tests pin down.
 */

/** The part of a board item this module needs. Deliberately not BoardItemRow. */
export interface TemplateItem {
  config: unknown;
  height: number;
  id: string;
  kind: string;
  nodeType: string | null;
  recipeUseId?: string | null;
  runState?: string | null;
  width: number;
  x: number;
  y: number;
}

export interface TemplateWire {
  sourceItemId: string;
  sourcePort: string;
  targetItemId: string;
  targetPort: string;
}

export interface ExtractedRecipe {
  declaredInputs: DeclaredInput[];
  graph: RecipeGraph;
  /** Wires dropped because their source sat outside the selection, by port. */
  openPorts: number;
  /** True when nothing in the selection has ever run successfully. */
  unverified: boolean;
}

export type ExtractFailure =
  | { reason: "empty"; detail: string }
  | { reason: "nested"; detail: string }
  | { reason: "too-many"; detail: string }
  | { reason: "too-many-inputs"; detail: string }
  | { reason: "no-nodes"; detail: string };

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * A stencil read off a selection.
 *
 * Positions become offsets from the selection's own top-left corner, so the
 * arrangement survives being dropped anywhere — the constitution's geometry rule
 * applied to something that has no board yet.
 *
 * A wire whose target is inside the selection and whose source is outside
 * becomes a **declared input**: that is precisely the shape of "this is the bit
 * you point at your new thing". A wire leaving the selection in the other
 * direction is simply dropped — what consumed the old output is not part of the
 * move.
 */
export const extractRecipeGraph = (
  items: TemplateItem[],
  wires: TemplateWire[],
  selectedIds: readonly string[],
  portTypeOf: (nodeType: string | null, port: string) => PortType | null
): ExtractedRecipe | ExtractFailure => {
  const selected = new Set(selectedIds);
  const chosen = items.filter((item) => selected.has(item.id));
  if (chosen.length === 0) {
    return { detail: "Select something to save first.", reason: "empty" };
  }
  // FR-008. Checked here rather than at expansion because a nested stencil is
  // wrong the moment it is written down, and refusing later would mean storing
  // something that can never be placed.
  const nested = chosen.find((item) => item.recipeUseId);
  if (nested) {
    return {
      detail: "A recipe cannot contain a recipe.",
      reason: "nested",
    };
  }
  if (chosen.length > MAX_RECIPE_NODES) {
    return {
      detail: `A recipe holds at most ${MAX_RECIPE_NODES} nodes; this selection has ${chosen.length}.`,
      reason: "too-many",
    };
  }
  const nodes = chosen.filter(
    (item) => item.kind === "op" && isNodeTypeId(item.nodeType)
  );
  if (nodes.length === 0) {
    return {
      detail: "A recipe needs at least one node; this selection has none.",
      reason: "no-nodes",
    };
  }

  // The selection's own corner, so the stencil starts at (0, 0).
  const originX = Math.min(...nodes.map((item) => item.x));
  const originY = Math.min(...nodes.map((item) => item.y));

  const keyById = new Map<string, string>();
  const graphNodes: RecipeNode[] = nodes.map((item, index) => {
    const key = `n${index + 1}`;
    keyById.set(item.id, key);
    return {
      config: asObject(item.config),
      dx: item.x - originX,
      dy: item.y - originY,
      height: item.height,
      key,
      // Narrowed by the isNodeTypeId filter above.
      nodeType: item.nodeType as RecipeNode["nodeType"],
      width: item.width,
    };
  });

  const graphWires: RecipeWire[] = [];
  const declaredInputs: DeclaredInput[] = [];
  for (const wire of wires) {
    const to = keyById.get(wire.targetItemId);
    if (!to) {
      // Target outside the selection: whatever consumed this is not moving.
      continue;
    }
    const from = keyById.get(wire.sourceItemId);
    if (from) {
      graphWires.push({
        from,
        fromPort: wire.sourcePort,
        to,
        toPort: wire.targetPort,
      });
      continue;
    }
    // Source outside the selection — this is the seam the recipe leaves open.
    const node = nodes.find((item) => item.id === wire.targetItemId);
    const type = portTypeOf(node?.nodeType ?? null, wire.targetPort);
    if (!type) {
      continue;
    }
    declaredInputs.push({
      key: `${to}.${wire.targetPort}`,
      label: wire.targetPort,
      nodeKey: to,
      port: wire.targetPort,
      required: true,
      type,
    });
  }

  if (declaredInputs.length > MAX_RECIPE_INPUTS) {
    return {
      detail: `A recipe takes at most ${MAX_RECIPE_INPUTS} inputs; this selection leaves ${declaredInputs.length} open.`,
      reason: "too-many-inputs",
    };
  }

  return {
    declaredInputs,
    graph: { nodes: graphNodes, wires: graphWires },
    openPorts: declaredInputs.length,
    // T036: saved anyway, and said so. The work is real; refusing loses it.
    unverified: !nodes.some((item) => item.runState === "succeeded"),
  };
};

export interface ExpandedItem {
  config: Record<string, unknown>;
  height: number;
  id: string;
  nodeType: string;
  recipeUseId: string;
  width: number;
  x: number;
  y: number;
}

export interface ExpandedWire {
  id: string;
  sourceItemId: string;
  sourcePort: string;
  targetItemId: string;
  targetPort: string;
}

/**
 * A stencil laid down at a point, as real rows.
 *
 * `newId` is injected rather than reached for, so a test can assert the exact
 * wiring instead of matching UUIDs. The drop point is clamped so the whole
 * group lands on the canvas: half a recipe hanging off the right-hand edge is a
 * placement nobody meant, and config/canvas.ts owns those bounds.
 *
 * Results are deliberately **not** carried over. A placed recipe has run
 * nothing; copying the results of the board it was saved from would show
 * pictures this board never paid for.
 */
export const expandRecipeGraph = (
  graph: RecipeGraph,
  recipeUseId: string,
  drop: { x: number; y: number },
  newId: () => string
): { items: ExpandedItem[]; wires: ExpandedWire[] } => {
  const extent = recipeExtent(graph);
  const x = Math.max(0, Math.min(drop.x, CANVAS_WIDTH - extent.width));
  const y = Math.max(0, Math.min(drop.y, CANVAS_HEIGHT - extent.height));

  const idByKey = new Map<string, string>();
  const items = graph.nodes.map((node) => {
    const id = newId();
    idByKey.set(node.key, id);
    return {
      config: node.config,
      height: node.height,
      id,
      nodeType: node.nodeType,
      recipeUseId,
      width: node.width,
      x: x + node.dx,
      y: y + node.dy,
    };
  });

  const wires: ExpandedWire[] = [];
  for (const wire of graph.wires) {
    const source = idByKey.get(wire.from);
    const target = idByKey.get(wire.to);
    // A stencil naming a node it does not hold is malformed; the wire is
    // dropped rather than written against an id that does not exist.
    if (!(source && target)) {
      continue;
    }
    wires.push({
      id: newId(),
      sourceItemId: source,
      sourcePort: wire.fromPort || OUTPUT_PORT_KEY,
      targetItemId: target,
      targetPort: wire.toPort,
    });
  }
  return { items, wires };
};
