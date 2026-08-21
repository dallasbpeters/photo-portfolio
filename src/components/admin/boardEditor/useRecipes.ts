import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type Recipe,
  type RecipeUse,
  recipesApi,
} from "../../../services/recipes";
import type { Board, BoardItem, BoardWire } from "../../../types";

/**
 * Saving a way of working, and putting it back on a board.
 *
 * Two halves of one idea. Saving hands the server a list of item ids and lets it
 * read the arrangement off the board; placing gets back real nodes and real
 * wires and adds them to what is already there.
 *
 * **The board is flushed before either.** The server reads the *stored* graph,
 * and the canvas saves on a debounce — so without forcing a save first, saving a
 * recipe captures a board up to a second and a bit out of date, and quietly
 * keeps the wrong wiring. That is the same reason a run flushes, and the failure
 * is worse here: a recipe is meant to be used again.
 *
 * Placed nodes are merged into the current list rather than triggering a
 * reload. A reload would discard anything dragged while the request was in
 * flight, which on a two-second round trip is easy to do.
 */

export interface BoardRecipeDeps {
  /** The loaded board. Its recipeUses are the server's list for this board. */
  board: Board | null;
  boardId: string;
  /** Where a recipe lands when it is placed from the library. */
  dropPoint: (
    list: BoardItem[],
    width: number,
    height: number
  ) => { x: number; y: number };
  /** Flushes unsaved work — the server reads the stored graph, not this one. */
  flush: () => Promise<void>;
  items: BoardItem[];
  setItems: React.Dispatch<React.SetStateAction<BoardItem[]>>;
  setWires: React.Dispatch<React.SetStateAction<BoardWire[]>>;
}

export const useRecipes = (deps: BoardRecipeDeps) => {
  const { board, boardId, dropPoint, flush, items, setItems, setWires } = deps;
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  /**
   * Groups placed in this session, not yet in the board's own list.
   *
   * Placing writes rows and returns them; it does not reload the board, because
   * a reload would discard anything dragged while the request was in flight. So
   * the outline has to come from both places until the next load.
   */
  const [placed, setPlaced] = useState<RecipeUse[]>([]);

  const uses = useMemo(() => {
    const fromBoard = board?.recipeUses ?? [];
    const known = new Set(fromBoard.map((use) => use.id));
    return [...fromBoard, ...placed.filter((use) => !known.has(use.id))];
  }, [board, placed]);

  const refresh = useCallback(async () => {
    try {
      setRecipes(await recipesApi.list());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load your recipes"
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveRecipe = useCallback(
    async (chosen: BoardItem[], name: string) => {
      // Flushed first: a recipe saved from a board the server has not seen yet
      // keeps whatever wiring was stored a second ago.
      await flush();
      try {
        const saved = await recipesApi.create({
          boardId,
          itemIds: chosen.map((item) => item.id),
          name,
        });
        await refresh();
        // Said out loud rather than left to be discovered on first use. An open
        // input is the thing you point at your new work, so how many there are
        // is the most useful fact about a recipe you have just saved.
        const open = saved.openInputs;
        const inputs =
          open === 0
            ? "no open inputs"
            : `${open} open input${open === 1 ? "" : "s"}`;
        toast.success(
          saved.unverified
            ? `Saved “${saved.name}” with ${inputs} — it has not been run yet`
            : `Saved “${saved.name}” with ${inputs}`
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not save that recipe"
        );
      }
    },
    [boardId, flush, refresh]
  );

  const placeRecipe = useCallback(
    async (recipeId: string) => {
      // Flushed for the same reason: placing writes rows against this board,
      // and the server must be looking at the same board the canvas is.
      await flush();
      const at = dropPoint(items, 640, 480);
      try {
        const result = await recipesApi.place(recipeId, {
          boardId,
          x: at.x,
          y: at.y,
        });
        setItems((current) => [...current, ...result.items]);
        setWires((current) => [...current, ...result.wires]);
        setPlaced((current) => [...current, result.recipeUse]);
        const open = result.declaredInputs.length;
        toast.success(
          open === 0
            ? `Placed “${result.recipeUse.recipeName}” — ready to run`
            : `Placed “${result.recipeUse.recipeName}” — wire ${open} input${
                open === 1 ? "" : "s"
              } to run it`
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not place that recipe"
        );
      }
    },
    [boardId, dropPoint, flush, items, setItems, setWires]
  );

  return { placeRecipe, recipes, refresh, saveRecipe, uses };
};
