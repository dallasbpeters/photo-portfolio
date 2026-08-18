import type { NodeTypeId, PortType } from "./nodeTypes.js";

/**
 * What a recipe may hold, and what it hands over when it is used.
 *
 * Shared by the endpoint that enforces these and the panel that has to say so
 * before anything is saved — the reasoning config/elements.ts states outright: a
 * limit only the server knows about is a limit the person hits by surprise.
 *
 * Placing a recipe **expands** it into ordinary board items and wires, so
 * nothing here describes a runtime. It describes a stencil: nodes at offsets,
 * wires between them, and the handful of ports left open for whoever uses it.
 *
 * Dependency-free and free of browser and Node globals, like every module in
 * this directory.
 */

/**
 * A recipe is a move you make often, not a whole board filed in the wrong place.
 *
 * Bounded because expansion writes every one of these as a real row, and because
 * a forty-node "recipe" is a board someone should have duplicated instead.
 */
export const MAX_RECIPE_NODES = 40;

/**
 * How many inputs a recipe may ask for.
 *
 * Past a handful, "point it at your new thing and run" stops being true and the
 * recipe becomes a form to fill in — at which point the graph itself was the
 * better interface.
 */
export const MAX_RECIPE_INPUTS = 8;

export const MAX_RECIPE_NAME = 120;
export const MAX_RECIPE_DESCRIPTION = 500;

/** A node in the stencil, positioned relative to wherever the recipe lands. */
export interface RecipeNode {
  /** The node's settings, copied from the item it was saved from. */
  config: Record<string, unknown>;
  /** Offsets in canvas units from the drop point — never absolute positions. */
  dx: number;
  dy: number;
  height: number;
  /** Local to this template. Wires below refer to nodes by this, not by id. */
  key: string;
  nodeType: NodeTypeId;
  width: number;
}

export interface RecipeWire {
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

export interface RecipeGraph {
  nodes: RecipeNode[];
  wires: RecipeWire[];
}

/**
 * An input the recipe leaves open.
 *
 * `type` is the port's own type, which is what lets the canvas refuse a text
 * wire dropped on an image input at the moment of the drop rather than at the
 * moment of the run.
 */
export interface DeclaredInput {
  key: string;
  label: string;
  /** Which node in the template this feeds, by its local key. */
  nodeKey: string;
  port: string;
  required: boolean;
  type: PortType;
}

/**
 * Whether a stencil is one this codebase can still place.
 *
 * Checked at placement rather than only at save, because a node type can be
 * removed from the registry between the two. A recipe naming a type that no
 * longer exists is refused with the type named — placed-and-broken is the one
 * outcome worse than refused.
 */
export const recipeGraphIsPlaceable = (
  graph: RecipeGraph,
  isKnownNodeType: (value: unknown) => boolean
): { missing: string[]; ok: boolean } => {
  const missing = [
    ...new Set(
      graph.nodes
        .filter((node) => !isKnownNodeType(node.nodeType))
        .map((node) => String(node.nodeType))
    ),
  ];
  return { missing, ok: missing.length === 0 };
};

/**
 * The bounding box of a stencil, in offset space.
 *
 * Used to keep a dropped recipe inside the logical canvas: the drop point is
 * clamped so the whole group lands on the board rather than half of it hanging
 * off the right-hand edge.
 */
export const recipeExtent = (
  graph: RecipeGraph
): { height: number; width: number } => {
  if (graph.nodes.length === 0) {
    return { height: 0, width: 0 };
  }
  return {
    height: Math.max(...graph.nodes.map((node) => node.dy + node.height)),
    width: Math.max(...graph.nodes.map((node) => node.dx + node.width)),
  };
};
