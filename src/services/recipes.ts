import type { BoardItem, BoardWire } from "../types";
import { apiBase, jsonHeaders } from "./portfolioService";

/**
 * The recipe library, as the canvas talks to it.
 *
 * Its own module rather than another entry in portfolioService.ts, following
 * comments.ts and canva.ts. That file is already 1815 lines and at the
 * check-file-size ceiling, so it may only shrink — and a service that stands on
 * its own has no reason to be in it anyway.
 *
 * Nothing here sends a graph. Saving a recipe posts the ids of the selected
 * items and the server reads the arrangement off the board itself: a template
 * accepted from the browser would be expanded into real rows on a later
 * request, which is exactly the shape of thing not to take on trust.
 */

/** An input the recipe leaves open for whoever uses it. */
export interface DeclaredInput {
  key: string;
  label: string;
  /** Which node in the template this feeds, by its local key. */
  nodeKey: string;
  port: string;
  required: boolean;
  type: string;
}

export interface Recipe {
  createdAt: string;
  currentVersion: number | null;
  declaredInputs: DeclaredInput[];
  description: string | null;
  id: string;
  name: string;
  nodeCount: number;
  /** Saved from a selection that had never run successfully. */
  unverified: boolean;
  updatedAt: string;
}

export interface RecipeUse {
  id: string;
  /** Null once the recipe has been deleted — the board keeps working. */
  latestVersion: number | null;
  pinnedVersion: number;
  recipeId: string | null;
  recipeName: string | null;
}

export interface PlacedRecipe {
  declaredInputs: (DeclaredInput & { itemId: string | null })[];
  items: BoardItem[];
  recipeUse: RecipeUse;
  wires: BoardWire[];
}

const recipesUrl = (path = ""): string => `${apiBase()}/api/recipes${path}`;

const readError = async (res: Response, fallback: string): Promise<string> => {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || `${fallback} (${res.status})`;
};

export const recipesApi = {
  /**
   * Saves a selection as a recipe.
   *
   * Sends item ids, never the graph. `openInputs` comes back so the panel can
   * say how many wires were left open rather than letting someone discover it
   * the first time they place it.
   */
  create: async (input: {
    boardId: string;
    description?: string;
    itemIds: string[];
    name: string;
  }): Promise<Recipe & { openInputs: number }> => {
    const res = await fetch(recipesUrl(), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not save that recipe"));
    }
    return (await res.json()) as Recipe & { openInputs: number };
  },

  list: async (): Promise<Recipe[]> => {
    const res = await fetch(recipesUrl(), { headers: jsonHeaders() });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not load your recipes"));
    }
    return (await res.json()) as Recipe[];
  },

  /**
   * Drops a recipe onto a board, as real nodes and real wires.
   *
   * The response carries what was created so the canvas can add it without
   * reloading the board — a reload would discard anything dragged while the
   * request was in flight.
   */
  place: async (
    id: string,
    input: { boardId: string; x: number; y: number }
  ): Promise<PlacedRecipe> => {
    const res = await fetch(recipesUrl(`/${id}/place`), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not place that recipe"));
    }
    return (await res.json()) as PlacedRecipe;
  },

  remove: async (id: string): Promise<void> => {
    const res = await fetch(recipesUrl(`/${id}`), {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not delete that recipe"));
    }
  },

  rename: async (
    id: string,
    input: { description?: string; name?: string }
  ): Promise<Recipe> => {
    const res = await fetch(recipesUrl(`/${id}`), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not rename that recipe"));
    }
    return (await res.json()) as Recipe;
  },
};
